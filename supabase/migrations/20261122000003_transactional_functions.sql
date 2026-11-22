-- ============================================================================
-- BLASTI - Migration 3: Fonctions Transactionnelles & Logique Métier
-- ============================================================================
-- Description: Réservation atomique (anti-surbooking), annulation, gestion
-- des passagers descendus, scan QR, recherche Haversine et cycle de vie.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Synchronisation automatique auth.users -> public.profiles
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_phone TEXT;
    v_full_name TEXT;
    v_role public.user_role;
BEGIN
    v_phone := NEW.raw_user_meta_data->>'phone';
    v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Passager BLASTI');
    
    -- Sécurité: le rôle est systématiquement forcé à 'passenger' pour un signup public
    v_role := 'passenger';
    IF NEW.raw_user_meta_data->>'role' = 'driver' THEN
        -- On note le souhait de devenir conducteur, mais le rôle reste passenger
        -- jusqu'à vérification de driver_profile
        v_role := 'passenger';
    END IF;

    INSERT INTO public.profiles (
        id,
        role,
        full_name,
        phone,
        avatar_url,
        preferred_language,
        is_active
    ) VALUES (
        NEW.id,
        v_role,
        v_full_name,
        v_phone,
        NEW.raw_user_meta_data->>'avatar_url',
        COALESCE(NEW.raw_user_meta_data->>'preferred_language', 'fr'),
        true
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
        avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url);

    -- Si l'utilisateur s'enregistre comme louagiste, créer le profil conducteur en attente
    IF NEW.raw_user_meta_data->>'is_driver' = 'true' OR NEW.raw_user_meta_data->>'role' = 'driver' THEN
        INSERT INTO public.driver_profiles (
            user_id,
            verification_status,
            license_number,
            is_online
        ) VALUES (
            NEW.id,
            'pending',
            COALESCE(NEW.raw_user_meta_data->>'license_number', 'EN-ATTENTE-' || SUBSTRING(NEW.id::text, 1, 8)),
            false
        ) ON CONFLICT (user_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 2. Génération de référence unique lisible (BL-YYMM-XXX)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_booking_reference()
RETURNS TEXT AS $$
DECLARE
    v_year_month TEXT;
    v_random_chars TEXT;
    v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    v_ref TEXT;
    v_exists BOOLEAN := true;
BEGIN
    v_year_month := to_char(timezone('utc', now()), 'YYMM');
    WHILE v_exists LOOP
        v_random_chars := '';
        FOR i IN 1..3 LOOP
            v_random_chars := v_random_chars || substr(v_chars, floor(random() * length(v_chars) + 1)::integer, 1);
        END LOOP;
        v_ref := 'BL-' || v_year_month || '-' || v_random_chars;
        SELECT EXISTS (SELECT 1 FROM public.reservations WHERE booking_reference = v_ref) INTO v_exists;
    END LOOP;
    RETURN v_ref;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- ----------------------------------------------------------------------------
-- 3. Réservation atomique et prévention du surbooking (ACID)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_reservation_atomic(
    p_journey_id UUID,
    p_seat_count INTEGER,
    p_preferred_seats INTEGER[] DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID;
    v_journey RECORD;
    v_assigned_seats INTEGER[];
    v_seat RECORD;
    v_booking_ref TEXT;
    v_raw_qr_token TEXT;
    v_qr_hash TEXT;
    v_total_price NUMERIC(7, 3);
    v_reservation_id UUID;
    v_passenger_name TEXT;
    v_driver_user_id UUID;
BEGIN
    -- Vérification de l'utilisateur authentifié
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = 'P0001';
    END IF;

    IF p_seat_count <= 0 OR p_seat_count > 8 THEN
        RAISE EXCEPTION 'Nombre de places invalide (1 à 8 requis)' USING ERRCODE = 'P0002';
    END IF;

    -- Verrouillage exclusif du trajet pour sérialiser les réservations simultanées
    SELECT * INTO v_journey
    FROM public.journeys
    WHERE id = p_journey_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Trajet non trouvé' USING ERRCODE = 'P0003';
    END IF;

    -- Vérification du statut du trajet
    IF v_journey.status NOT IN ('published', 'boarding') THEN
        RAISE EXCEPTION 'Ce trajet n''accepte plus de réservations (statut: %)', v_journey.status USING ERRCODE = 'P0004';
    END IF;

    -- Vérification de l'heure de départ
    IF v_journey.status = 'published' AND v_journey.departure_time < (timezone('utc', now()) - INTERVAL '15 minutes') THEN
        RAISE EXCEPTION 'L''heure de départ de ce trajet est dépassée' USING ERRCODE = 'P0005';
    END IF;

    -- Vérification stricte des places disponibles (empêche le surbooking)
    IF v_journey.available_seats < p_seat_count THEN
        RAISE EXCEPTION 'Places insuffisantes. Seulement % place(s) disponible(s)' , v_journey.available_seats USING ERRCODE = 'P0006';
    END IF;

    -- Sélection et verrouillage des sièges disponibles
    IF p_preferred_seats IS NOT NULL AND array_length(p_preferred_seats, 1) = p_seat_count THEN
        -- Essayer d'attribuer les sièges souhaités
        SELECT array_agg(seat_number) INTO v_assigned_seats
        FROM (
            SELECT seat_number
            FROM public.reservation_seats
            WHERE journey_id = p_journey_id
              AND seat_number = ANY(p_preferred_seats)
              AND status = 'available'
            FOR UPDATE
        ) sub;

        IF array_length(v_assigned_seats, 1) <> p_seat_count THEN
            v_assigned_seats := NULL; -- Retomber sur l'attribution automatique
        END IF;
    END IF;

    IF v_assigned_seats IS NULL THEN
        SELECT array_agg(seat_number) INTO v_assigned_seats
        FROM (
            SELECT seat_number
            FROM public.reservation_seats
            WHERE journey_id = p_journey_id
              AND status = 'available'
            ORDER BY seat_number ASC
            LIMIT p_seat_count
            FOR UPDATE
        ) sub;
    END IF;

    IF v_assigned_seats IS NULL OR array_length(v_assigned_seats, 1) < p_seat_count THEN
        RAISE EXCEPTION 'Impossible d''allouer les sièges demandés' USING ERRCODE = 'P0007';
    END IF;

    -- Calcul du prix total recalculé CÔTÉ SERVEUR (confiance zéro au client)
    v_total_price := v_journey.price_per_seat * p_seat_count;

    -- Génération de la référence et du token QR sécurisé
    v_booking_ref := public.generate_booking_reference();
    v_raw_qr_token := 'BLASTI-' || gen_random_uuid()::text || '-' || EXTRACT(EPOCH FROM now())::bigint;
    v_qr_hash := encode(digest(v_raw_qr_token, 'sha256'), 'hex');

    -- Insertion de la réservation
    INSERT INTO public.reservations (
        booking_reference,
        journey_id,
        passenger_id,
        seat_count,
        price_per_seat,
        total_price,
        status,
        qr_token_hash,
        reserved_at,
        confirmed_at
    ) VALUES (
        v_booking_ref,
        p_journey_id,
        v_caller_id,
        p_seat_count,
        v_journey.price_per_seat,
        v_total_price,
        'confirmed',
        v_qr_hash,
        timezone('utc', now()),
        timezone('utc', now())
    ) RETURNING id INTO v_reservation_id;

    -- Mise à jour des sièges attribués
    UPDATE public.reservation_seats
    SET status = 'reserved',
        reservation_id = v_reservation_id,
        passenger_id = v_caller_id,
        updated_at = timezone('utc', now())
    WHERE journey_id = p_journey_id
      AND seat_number = ANY(v_assigned_seats);

    -- Décrémentation atomique des places disponibles
    UPDATE public.journeys
    SET available_seats = available_seats - p_seat_count,
        updated_at = timezone('utc', now())
    WHERE id = p_journey_id;

    -- Informations pour les notifications
    SELECT full_name INTO v_passenger_name FROM public.profiles WHERE id = v_caller_id;
    SELECT user_id INTO v_driver_user_id FROM public.driver_profiles WHERE id = v_journey.driver_id;

    -- Notification passager
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
        v_caller_id,
        'booking_confirmed',
        'Réservation confirmée !',
        'Votre réservation ' || v_booking_ref || ' pour ' || p_seat_count || ' place(s) est validée.',
        jsonb_build_object('reservation_id', v_reservation_id, 'booking_reference', v_booking_ref, 'journey_id', p_journey_id)
    );

    -- Notification conducteur
    IF v_driver_user_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, type, title, body, data)
        VALUES (
            v_driver_user_id,
            'new_booking',
            'Nouvelle réservation',
            v_passenger_name || ' a réservé ' || p_seat_count || ' place(s) (' || v_booking_ref || ').',
            jsonb_build_object('reservation_id', v_reservation_id, 'booking_reference', v_booking_ref, 'seat_count', p_seat_count)
        );
    END IF;

    -- Retour de la réservation avec le token QR brut une seule fois
    RETURN jsonb_build_object(
        'success', true,
        'reservation_id', v_reservation_id,
        'booking_reference', v_booking_ref,
        'seat_count', p_seat_count,
        'seats', v_assigned_seats,
        'price_per_seat', v_journey.price_per_seat,
        'total_price', v_total_price,
        'raw_qr_token', v_raw_qr_token,
        'departure_time', v_journey.departure_time,
        'message', 'Réservation effectuée avec succès'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 4. Annulation sécurisée d'une réservation
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_reservation(
    p_reservation_id UUID,
    p_cancellation_reason TEXT DEFAULT 'Annulé par le passager'
)
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID;
    v_res RECORD;
    v_journey RECORD;
    v_driver_user_id UUID;
    v_waiting RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = 'P0001';
    END IF;

    -- Verrouillage de la réservation
    SELECT * INTO v_res
    FROM public.reservations
    WHERE id = p_reservation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Réservation introuvable' USING ERRCODE = 'P0008';
    END IF;

    -- Vérifier que l'utilisateur est le propriétaire ou le conducteur du trajet
    IF v_res.passenger_id <> v_caller_id THEN
        SELECT user_id INTO v_driver_user_id
        FROM public.driver_profiles dp
        JOIN public.journeys j ON j.driver_id = dp.id
        WHERE j.id = v_res.journey_id;

        IF v_driver_user_id <> v_caller_id AND NOT public.is_admin() THEN
            RAISE EXCEPTION 'Action non autorisée sur cette réservation' USING ERRCODE = 'P0009';
        END IF;
    END IF;

    -- Vérifier que l'annulation est autorisée
    IF v_res.status NOT IN ('pending', 'confirmed') THEN
        RAISE EXCEPTION 'Cette réservation ne peut plus être annulée (statut: %)', v_res.status USING ERRCODE = 'P0010';
    END IF;

    -- Verrouillage du trajet
    SELECT * INTO v_journey
    FROM public.journeys
    WHERE id = v_res.journey_id
    FOR UPDATE;

    -- Libération des sièges dans reservation_seats
    UPDATE public.reservation_seats
    SET status = 'available',
        reservation_id = NULL,
        passenger_id = NULL,
        released_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    WHERE reservation_id = p_reservation_id;

    -- Réincrémentation des places disponibles sur le trajet (dans la limite de total_seats)
    UPDATE public.journeys
    SET available_seats = LEAST(total_seats, available_seats + v_res.seat_count),
        updated_at = timezone('utc', now())
    WHERE id = v_res.journey_id;

    -- Mise à jour du statut de la réservation
    UPDATE public.reservations
    SET status = 'cancelled',
        cancelled_at = timezone('utc', now()),
        cancellation_reason = p_cancellation_reason,
        updated_at = timezone('utc', now())
    WHERE id = p_reservation_id;

    -- Notification conducteur
    SELECT user_id INTO v_driver_user_id
    FROM public.driver_profiles
    WHERE id = v_journey.driver_id;

    IF v_driver_user_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, type, title, body, data)
        VALUES (
            v_driver_user_id,
            'passenger_cancelled',
            'Annulation de réservation',
            'La réservation ' || v_res.booking_reference || ' (' || v_res.seat_count || ' place(s)) a été annulée.',
            jsonb_build_object('journey_id', v_res.journey_id, 'booking_reference', v_res.booking_reference)
        );
    END IF;

    -- Vérifier et notifier la liste d'attente
    SELECT * INTO v_waiting
    FROM public.waiting_list
    WHERE journey_id = v_res.journey_id
      AND status = 'waiting'
      AND requested_seats <= v_res.seat_count
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        UPDATE public.waiting_list
        SET status = 'notified',
            notified_at = timezone('utc', now())
        WHERE id = v_waiting.id;

        INSERT INTO public.notifications (user_id, type, title, body, data)
        VALUES (
            v_waiting.passenger_id,
            'seat_available',
            'Place disponible !',
            'Une place vient de se libérer sur votre trajet BLASTI souhaité.',
            jsonb_build_object('journey_id', v_res.journey_id, 'available_seats', v_res.seat_count)
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Réservation annulée avec succès',
        'released_seats', v_res.seat_count,
        'new_available_seats', LEAST(v_journey.total_seats, v_journey.available_seats + v_res.seat_count)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 5. Gestion "Passager descendu" (release_journey_seat)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_journey_seat(
    p_journey_id UUID,
    p_seat_number INTEGER
)
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID;
    v_driver_id UUID;
    v_journey RECORD;
    v_seat RECORD;
    v_waiting RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = 'P0001';
    END IF;

    -- Obtenir le driver_id du caller
    SELECT id INTO v_driver_id
    FROM public.driver_profiles
    WHERE user_id = v_caller_id;

    IF v_driver_id IS NULL THEN
        RAISE EXCEPTION 'Seul un conducteur vérifié peut effectuer cette action' USING ERRCODE = 'P0011';
    END IF;

    -- Verrouiller le trajet et vérifier que le conducteur est le propriétaire
    SELECT * INTO v_journey
    FROM public.journeys
    WHERE id = p_journey_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Trajet introuvable' USING ERRCODE = 'P0003';
    END IF;

    IF v_journey.driver_id <> v_driver_id AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Vous n''êtes pas le conducteur de ce trajet' USING ERRCODE = 'P0012';
    END IF;

    IF v_journey.status NOT IN ('boarding', 'in_progress') THEN
        RAISE EXCEPTION 'Ce trajet n''est pas actif (statut: %)', v_journey.status USING ERRCODE = 'P0013';
    END IF;

    -- Verrouiller le siège
    SELECT * INTO v_seat
    FROM public.reservation_seats
    WHERE journey_id = p_journey_id
      AND seat_number = p_seat_number
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Siège introuvable' USING ERRCODE = 'P0014';
    END IF;

    IF v_seat.status = 'available' THEN
        RETURN jsonb_build_object(
            'success', true,
            'message', 'Le siège est déjà libre',
            'seat_number', p_seat_number,
            'available_seats', v_journey.available_seats
        );
    END IF;

    -- Libérer le siège
    UPDATE public.reservation_seats
    SET status = 'available',
        reservation_id = NULL,
        passenger_id = NULL,
        released_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    WHERE id = v_seat.id;

    -- Incrémenter les places disponibles du trajet
    UPDATE public.journeys
    SET available_seats = LEAST(total_seats, available_seats + 1),
        updated_at = timezone('utc', now())
    WHERE id = p_journey_id;

    -- Notifier la première personne en liste d'attente
    SELECT * INTO v_waiting
    FROM public.waiting_list
    WHERE journey_id = p_journey_id
      AND status = 'waiting'
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        UPDATE public.waiting_list
        SET status = 'notified',
            notified_at = timezone('utc', now())
        WHERE id = v_waiting.id;

        INSERT INTO public.notifications (user_id, type, title, body, data)
        VALUES (
            v_waiting.passenger_id,
            'seat_available',
            'Place libérée en cours de route !',
            'Une place vient de se libérer dans le louage. Réservez maintenant.',
            jsonb_build_object('journey_id', p_journey_id, 'seat_number', p_seat_number)
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Passager descendu: place libérée avec succès',
        'seat_number', p_seat_number,
        'new_available_seats', LEAST(v_journey.total_seats, v_journey.available_seats + 1)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 6. Vérification et validation QR Code à l'embarquement (scan_boarding_qr)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scan_boarding_qr(
    p_journey_id UUID,
    p_qr_token TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID;
    v_driver_id UUID;
    v_journey RECORD;
    v_hash TEXT;
    v_res RECORD;
    v_passenger RECORD;
    v_assigned_seats INTEGER[];
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = 'P0001';
    END IF;

    SELECT id INTO v_driver_id
    FROM public.driver_profiles
    WHERE user_id = v_caller_id;

    IF v_driver_id IS NULL AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Seul un conducteur peut valider les tickets' USING ERRCODE = 'P0011';
    END IF;

    -- Vérifier le trajet
    SELECT * INTO v_journey
    FROM public.journeys
    WHERE id = p_journey_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_JOURNEY', 'message', 'Trajet non trouvé');
    END IF;

    IF v_journey.driver_id <> v_driver_id AND NOT public.is_admin() THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED_DRIVER', 'message', 'Ce trajet ne vous appartient pas');
    END IF;

    -- Hacher le token fourni pour la comparaison
    v_hash := encode(digest(p_qr_token, 'sha256'), 'hex');

    -- Chercher la réservation correspondante
    SELECT * INTO v_res
    FROM public.reservations
    WHERE qr_token_hash = v_hash
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_TOKEN', 'message', 'Ticket QR invalide ou non reconnu');
    END IF;

    IF v_res.journey_id <> p_journey_id THEN
        RETURN jsonb_build_object('success', false, 'code', 'WRONG_JOURNEY', 'message', 'Ce ticket est pour un autre trajet de Louage');
    END IF;

    IF v_res.status = 'boarded' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'ALREADY_USED',
            'message', 'Ce ticket a déjà été scanné et utilisé',
            'boarded_at', v_res.boarded_at
        );
    END IF;

    IF v_res.status = 'cancelled' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'CANCELLED',
            'message', 'Cette réservation a été annulée',
            'cancellation_reason', v_res.cancellation_reason
        );
    END IF;

    IF v_res.status NOT IN ('confirmed', 'pending') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_STATUS',
            'message', 'Statut de réservation invalide (' || v_res.status || ')'
        );
    END IF;

    -- Valider l'embarquement
    UPDATE public.reservations
    SET status = 'boarded',
        boarded_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    WHERE id = v_res.id;

    -- Passer les sièges en 'occupied'
    UPDATE public.reservation_seats
    SET status = 'occupied',
        occupied_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    WHERE reservation_id = v_res.id;

    -- Récupérer les numéros de sièges
    SELECT array_agg(seat_number) INTO v_assigned_seats
    FROM public.reservation_seats
    WHERE reservation_id = v_res.id;

    -- Informations passager
    SELECT full_name, phone INTO v_passenger
    FROM public.profiles
    WHERE id = v_res.passenger_id;

    -- Notification passager
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
        v_res.passenger_id,
        'boarding_confirmed',
        'Embarquement confirmé',
        'Votre ticket a été scanné avec succès. Bon voyage vers votre destination !',
        jsonb_build_object('journey_id', p_journey_id, 'booking_reference', v_res.booking_reference)
    );

    RETURN jsonb_build_object(
        'success', true,
        'code', 'VALID',
        'message', 'Embarquement validé avec succès',
        'booking_reference', v_res.booking_reference,
        'passenger_name', v_passenger.full_name,
        'passenger_phone', v_passenger.phone,
        'seat_count', v_res.seat_count,
        'seats', v_assigned_seats,
        'boarded_at', timezone('utc', now())
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 7. Recherche géographique des Louages proches (Haversine)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_nearby_louages(
    p_lat DOUBLE PRECISION,
    p_lng DOUBLE PRECISION,
    p_radius_km DOUBLE PRECISION DEFAULT 50.0,
    p_destination_station_id UUID DEFAULT NULL,
    p_min_seats INTEGER DEFAULT 1
)
RETURNS TABLE (
    journey_id UUID,
    status public.journey_status,
    departure_time TIMESTAMPTZ,
    estimated_duration_minutes INTEGER,
    price_per_seat NUMERIC(6, 3),
    currency TEXT,
    available_seats INTEGER,
    total_seats INTEGER,
    departure_station_id UUID,
    departure_station_name TEXT,
    departure_station_city TEXT,
    departure_station_lat DOUBLE PRECISION,
    departure_station_lng DOUBLE PRECISION,
    destination_station_id UUID,
    destination_station_name TEXT,
    destination_station_city TEXT,
    driver_name TEXT,
    driver_rating NUMERIC(3, 2),
    driver_phone TEXT,
    vehicle_model TEXT,
    vehicle_registration TEXT,
    driver_current_lat DOUBLE PRECISION,
    driver_current_lng DOUBLE PRECISION,
    distance_km DOUBLE PRECISION
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        j.id AS journey_id,
        j.status,
        j.departure_time,
        j.estimated_duration_minutes,
        j.price_per_seat,
        j.currency,
        j.available_seats,
        j.total_seats,
        s_dep.id AS departure_station_id,
        s_dep.name AS departure_station_name,
        s_dep.city AS departure_station_city,
        s_dep.latitude AS departure_station_lat,
        s_dep.longitude AS departure_station_lng,
        s_dest.id AS destination_station_id,
        s_dest.name AS destination_station_name,
        s_dest.city AS destination_station_city,
        p_driver.full_name AS driver_name,
        p_driver.average_rating AS driver_rating,
        p_driver.phone AS driver_phone,
        v.model AS vehicle_model,
        v.registration_number AS vehicle_registration,
        dp.current_latitude AS driver_current_lat,
        dp.current_longitude AS driver_current_lng,
        -- Distance Haversine en kilomètres depuis le point de recherche jusqu'à la station de départ
        ROUND((
            6371.0 * acos(
                LEAST(1.0, GREATEST(-1.0,
                    cos(radians(p_lat)) * cos(radians(s_dep.latitude)) *
                    cos(radians(s_dep.longitude) - radians(p_lng)) +
                    sin(radians(p_lat)) * sin(radians(s_dep.latitude))
                ))
            )
        )::numeric, 1)::double precision AS distance_km
    FROM public.journeys j
    JOIN public.stations s_dep ON s_dep.id = j.departure_station_id
    JOIN public.stations s_dest ON s_dest.id = j.destination_station_id
    JOIN public.driver_profiles dp ON dp.id = j.driver_id
    JOIN public.profiles p_driver ON p_driver.id = dp.user_id
    JOIN public.vehicles v ON v.id = j.vehicle_id
    WHERE j.status IN ('published', 'boarding')
      AND j.available_seats >= p_min_seats
      AND (p_destination_station_id IS NULL OR j.destination_station_id = p_destination_station_id)
      AND (
          6371.0 * acos(
              LEAST(1.0, GREATEST(-1.0,
                  cos(radians(p_lat)) * cos(radians(s_dep.latitude)) *
                  cos(radians(s_dep.longitude) - radians(p_lng)) +
                  sin(radians(p_lat)) * sin(radians(s_dep.latitude))
              ))
          )
      ) <= p_radius_km
    ORDER BY distance_km ASC, j.departure_time ASC;
END;
$$ LANGUAGE plpgsql STABLE;

-- ----------------------------------------------------------------------------
-- 8. Mise à jour de la position GPS conducteur avec limitation de fréquence
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_driver_location(
    p_latitude DOUBLE PRECISION,
    p_longitude DOUBLE PRECISION,
    p_heading DOUBLE PRECISION DEFAULT NULL,
    p_speed DOUBLE PRECISION DEFAULT NULL,
    p_accuracy DOUBLE PRECISION DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID;
    v_driver RECORD;
    v_active_journey_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = 'P0001';
    END IF;

    -- Validation stricte des coordonnées
    IF p_latitude < -90.0 OR p_latitude > 90.0 OR p_longitude < -180.0 OR p_longitude > 180.0 THEN
        RAISE EXCEPTION 'Coordonnées GPS invalides' USING ERRCODE = 'P0015';
    END IF;

    -- Trouver le profil conducteur
    SELECT * INTO v_driver
    FROM public.driver_profiles
    WHERE user_id = v_caller_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profil conducteur introuvable' USING ERRCODE = 'P0011';
    END IF;

    -- Protection contre le spam: limitation à 1 écriture toutes les 3 secondes
    IF v_driver.location_updated_at IS NOT NULL AND v_driver.location_updated_at > (timezone('utc', now()) - INTERVAL '3 seconds') THEN
        RETURN jsonb_build_object('success', true, 'throttled', true);
    END IF;

    -- Mise à jour de la position courante
    UPDATE public.driver_profiles
    SET current_latitude = p_latitude,
        current_longitude = p_longitude,
        location_updated_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    WHERE id = v_driver.id;

    -- Trouver si un trajet actif (boarding ou in_progress) est en cours
    SELECT id INTO v_active_journey_id
    FROM public.journeys
    WHERE driver_id = v_driver.id
      AND status IN ('boarding', 'in_progress')
    ORDER BY departure_time DESC
    LIMIT 1;

    -- Si trajet actif, journaliser dans l'historique GPS
    IF v_active_journey_id IS NOT NULL THEN
        INSERT INTO public.journey_locations (
            journey_id,
            driver_id,
            latitude,
            longitude,
            heading,
            speed,
            accuracy,
            recorded_at
        ) VALUES (
            v_active_journey_id,
            v_driver.id,
            p_latitude,
            p_longitude,
            p_heading,
            p_speed,
            p_accuracy,
            timezone('utc', now())
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'latitude', p_latitude,
        'longitude', p_longitude,
        'updated_at', timezone('utc', now())
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 9. Cycle de vie d'un trajet (Création, Publication, Démarrage, Clôture)
-- ----------------------------------------------------------------------------

-- Publication d'un trajet
CREATE OR REPLACE FUNCTION public.publish_journey(
    p_departure_station_id UUID,
    p_destination_station_id UUID,
    p_vehicle_id UUID,
    p_departure_time TIMESTAMPTZ,
    p_price_per_seat NUMERIC(6, 3),
    p_estimated_duration_minutes INTEGER DEFAULT 45,
    p_share_live_location BOOLEAN DEFAULT true
)
RETURNS JSONB AS $$
DECLARE
    v_caller_id UUID;
    v_driver RECORD;
    v_vehicle RECORD;
    v_active_journey_count INTEGER;
    v_journey_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = 'P0001';
    END IF;

    -- Vérifier que le conducteur est vérifié
    SELECT * INTO v_driver
    FROM public.driver_profiles
    WHERE user_id = v_caller_id;

    IF NOT FOUND OR v_driver.verification_status <> 'verified' THEN
        RAISE EXCEPTION 'Seul un conducteur vérifié peut publier un trajet' USING ERRCODE = 'P0016';
    END IF;

    -- Vérifier que le véhicule lui appartient
    SELECT * INTO v_vehicle
    FROM public.vehicles
    WHERE id = p_vehicle_id AND driver_id = v_driver.id AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Véhicule invalide ou n''appartenant pas à ce conducteur' USING ERRCODE = 'P0017';
    END IF;

    -- Vérifier stations différentes
    IF p_departure_station_id = p_destination_station_id THEN
        RAISE EXCEPTION 'La station de départ et d''arrivée doivent être différentes' USING ERRCODE = 'P0018';
    END IF;

    -- Un conducteur ne peut avoir qu'un seul trajet 'boarding' ou 'in_progress'
    SELECT count(*) INTO v_active_journey_count
    FROM public.journeys
    WHERE driver_id = v_driver.id AND status IN ('boarding', 'in_progress');

    IF v_active_journey_count > 0 THEN
        RAISE EXCEPTION 'Vous avez déjà un trajet actif en cours' USING ERRCODE = 'P0019';
    END IF;

    IF p_price_per_seat <= 0 THEN
        RAISE EXCEPTION 'Le prix par place doit être supérieur à zéro' USING ERRCODE = 'P0020';
    END IF;

    -- Insérer le trajet
    INSERT INTO public.journeys (
        driver_id,
        vehicle_id,
        departure_station_id,
        destination_station_id,
        departure_time,
        estimated_duration_minutes,
        price_per_seat,
        currency,
        total_seats,
        available_seats,
        share_live_location,
        status
    ) VALUES (
        v_driver.id,
        p_vehicle_id,
        p_departure_station_id,
        p_destination_station_id,
        p_departure_time,
        p_estimated_duration_minutes,
        p_price_per_seat,
        'TND',
        v_vehicle.total_seat_capacity,
        v_vehicle.total_seat_capacity,
        p_share_live_location,
        'published'
    ) RETURNING id INTO v_journey_id;

    -- Initialiser les sièges dans reservation_seats (1 à total_seat_capacity)
    FOR i IN 1..v_vehicle.total_seat_capacity LOOP
        INSERT INTO public.reservation_seats (
            journey_id,
            seat_number,
            status
        ) VALUES (
            v_journey_id,
            i,
            'available'
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'journey_id', v_journey_id,
        'status', 'published',
        'available_seats', v_vehicle.total_seat_capacity,
        'message', 'Trajet publié avec succès'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Passage en embarquement
CREATE OR REPLACE FUNCTION public.start_journey_boarding(p_journey_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_driver_id UUID;
    v_journey RECORD;
BEGIN
    SELECT id INTO v_driver_id FROM public.driver_profiles WHERE user_id = auth.uid();
    SELECT * INTO v_journey FROM public.journeys WHERE id = p_journey_id FOR UPDATE;

    IF NOT FOUND OR (v_journey.driver_id <> v_driver_id AND NOT public.is_admin()) THEN
        RAISE EXCEPTION 'Action non autorisée' USING ERRCODE = 'P0012';
    END IF;

    IF v_journey.status <> 'published' THEN
        RAISE EXCEPTION 'Statut incompatible pour démarrer l''embarquement (%)', v_journey.status USING ERRCODE = 'P0021';
    END IF;

    UPDATE public.journeys
    SET status = 'boarding',
        updated_at = timezone('utc', now())
    WHERE id = p_journey_id;

    RETURN jsonb_build_object('success', true, 'status', 'boarding');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Démarrage du trajet (en route)
CREATE OR REPLACE FUNCTION public.start_journey_in_progress(p_journey_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_driver_id UUID;
    v_journey RECORD;
BEGIN
    SELECT id INTO v_driver_id FROM public.driver_profiles WHERE user_id = auth.uid();
    SELECT * INTO v_journey FROM public.journeys WHERE id = p_journey_id FOR UPDATE;

    IF NOT FOUND OR (v_journey.driver_id <> v_driver_id AND NOT public.is_admin()) THEN
        RAISE EXCEPTION 'Action non autorisée' USING ERRCODE = 'P0012';
    END IF;

    IF v_journey.status NOT IN ('published', 'boarding') THEN
        RAISE EXCEPTION 'Statut incompatible pour démarrer le trajet (%)', v_journey.status USING ERRCODE = 'P0021';
    END IF;

    UPDATE public.journeys
    SET status = 'in_progress',
        started_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    WHERE id = p_journey_id;

    RETURN jsonb_build_object('success', true, 'status', 'in_progress');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Clôture du trajet (Arrivée à destination)
CREATE OR REPLACE FUNCTION public.complete_journey(p_journey_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_driver_id UUID;
    v_journey RECORD;
    v_total_revenue NUMERIC(8, 3);
    v_boarded_passengers INTEGER;
BEGIN
    SELECT id INTO v_driver_id FROM public.driver_profiles WHERE user_id = auth.uid();
    SELECT * INTO v_journey FROM public.journeys WHERE id = p_journey_id FOR UPDATE;

    IF NOT FOUND OR (v_journey.driver_id <> v_driver_id AND NOT public.is_admin()) THEN
        RAISE EXCEPTION 'Action non autorisée' USING ERRCODE = 'P0012';
    END IF;

    IF v_journey.status NOT IN ('boarding', 'in_progress') THEN
        RAISE EXCEPTION 'Ce trajet ne peut pas être complété (statut: %)', v_journey.status USING ERRCODE = 'P0021';
    END IF;

    -- Marquer toutes les réservations embarquées comme 'completed'
    UPDATE public.reservations
    SET status = 'completed',
        completed_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    WHERE journey_id = p_journey_id
      AND status = 'boarded';

    -- Calculer les revenus CÔTÉ SERVEUR à partir des réservations valides
    SELECT COALESCE(SUM(total_price), 0.0), count(*)
    INTO v_total_revenue, v_boarded_passengers
    FROM public.reservations
    WHERE journey_id = p_journey_id
      AND status = 'completed';

    -- Compléter le trajet
    UPDATE public.journeys
    SET status = 'completed',
        completed_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    WHERE id = p_journey_id;

    -- Libérer les sièges
    UPDATE public.reservation_seats
    SET status = 'available',
        reservation_id = NULL,
        passenger_id = NULL,
        updated_at = timezone('utc', now())
    WHERE journey_id = p_journey_id;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'completed',
        'total_revenue', v_total_revenue,
        'passengers_count', v_boarded_passengers
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 10. Nettoyage de l'historique GPS ancien (Stratégie de conservation)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_old_journey_locations()
RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM public.journey_locations
    WHERE recorded_at < (timezone('utc', now()) - INTERVAL '7 days');
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
