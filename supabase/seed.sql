-- ============================================================================
-- BLASTI - Seed Idempotent: Données de Démonstration Tunisiennes
-- ============================================================================
-- Description: Stations tunisiennes, conducteurs de louage, véhicules,
-- trajets de démonstration au départ de Sousse, réservations et alertes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Stations de Louage en Tunisie
-- ----------------------------------------------------------------------------
INSERT INTO public.stations (id, name, city, latitude, longitude, is_active)
VALUES
    ('11111111-1111-1111-1111-111111111101', 'Bab Bhar', 'Sousse', 35.8288, 10.6405, true),
    ('11111111-1111-1111-1111-111111111102', 'Rond-point Menchia', 'Sousse', 35.8350, 10.6280, true),
    ('11111111-1111-1111-1111-111111111103', 'Sahloul (Hôpital & Faculté)', 'Sousse', 35.8450, 10.6050, true),
    ('11111111-1111-1111-1111-111111111104', 'Station Louage M''saken', 'M''saken', 35.7330, 10.5830, true),
    ('11111111-1111-1111-1111-111111111105', 'Monastir Centre (Gare Louages)', 'Monastir', 35.7720, 10.8260, true),
    ('11111111-1111-1111-1111-111111111106', 'Hergla Plage & Centre', 'Hergla', 36.0320, 10.5080, true),
    ('11111111-1111-1111-1111-111111111107', 'Gare Routière Kairouan', 'Kairouan', 35.6780, 10.0960, true),
    ('11111111-1111-1111-1111-111111111108', 'Station Bab Alioua / Moncef Bey', 'Tunis', 36.7900, 10.1800, true)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    city = EXCLUDED.city,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude;

-- ----------------------------------------------------------------------------
-- 2. Utilisateurs de test (Passagers et Conducteurs)
-- Note: Dans un environnement Supabase avec Auth, ces ID correspondent
-- aux UUID de auth.users. Pour le seed local/démo, on peuple public.profiles.
-- ----------------------------------------------------------------------------
INSERT INTO public.profiles (id, role, full_name, phone, preferred_language, average_rating, ratings_count, is_active)
VALUES
    -- Conducteurs
    ('22222222-2222-2222-2222-222222222201', 'driver', 'Mohamed Karray', '+21698123456', 'fr', 4.90, 142, true),
    ('22222222-2222-2222-2222-222222222202', 'driver', 'Amine Ben Salem', '+21697234567', 'fr', 4.80, 89, true),
    ('22222222-2222-2222-2222-222222222203', 'driver', 'Sami Oueslati', '+21699345678', 'ar', 4.70, 65, true),
    -- Passagers
    ('33333333-3333-3333-3333-333333333301', 'passenger', 'Yasmine Mansour', '+21622345678', 'fr', 5.00, 8, true),
    ('33333333-3333-3333-3333-333333333302', 'passenger', 'Mehdi Trabelsi', '+21623456789', 'fr', 4.90, 12, true),
    ('33333333-3333-3333-3333-333333333303', 'passenger', 'Ahmed Ben Ali', '+21624567890', 'ar', 4.80, 19, true),
    -- Administrateur
    ('44444444-4444-4444-4444-444444444401', 'admin', 'Administrateur BLASTI', '+21671000000', 'fr', 5.00, 0, true)
ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    role = EXCLUDED.role;

-- ----------------------------------------------------------------------------
-- 3. Profils conducteurs (driver_profiles)
-- ----------------------------------------------------------------------------
INSERT INTO public.driver_profiles (id, user_id, verification_status, license_number, is_online, current_latitude, current_longitude, location_updated_at)
VALUES
    ('55555555-5555-5555-5555-555555555501', '22222222-2222-2222-2222-222222222201', 'verified', 'LG-SOUSSE-19842', true, 35.8288, 10.6405, timezone('utc', now())),
    ('55555555-5555-5555-5555-555555555502', '22222222-2222-2222-2222-222222222202', 'verified', 'LG-SOUSSE-24105', true, 35.8350, 10.6280, timezone('utc', now())),
    ('55555555-5555-5555-5555-555555555503', '22222222-2222-2222-2222-222222222203', 'verified', 'LG-SOUSSE-31089', true, 35.8450, 10.6050, timezone('utc', now()))
ON CONFLICT (id) DO UPDATE SET
    is_online = EXCLUDED.is_online,
    verification_status = EXCLUDED.verification_status,
    current_latitude = EXCLUDED.current_latitude,
    current_longitude = EXCLUDED.current_longitude;

-- ----------------------------------------------------------------------------
-- 4. Véhicules Louage
-- ----------------------------------------------------------------------------
INSERT INTO public.vehicles (id, driver_id, registration_number, model, color, total_seat_capacity, is_active)
VALUES
    ('66666666-6666-6666-6666-666666666601', '55555555-5555-5555-5555-555555555501', '178 TUN 4521', 'Peugeot Expert', 'Blanc / Bandes bleues', 8, true),
    ('66666666-6666-6666-6666-666666666602', '55555555-5555-5555-5555-555555555502', '210 TUN 8890', 'Toyota HiAce', 'Blanc / Bandes rouges', 8, true),
    ('66666666-6666-6666-6666-666666666603', '55555555-5555-5555-5555-555555555503', '195 TUN 3312', 'Renault Trafic', 'Blanc / Bandes bleues', 8, true)
ON CONFLICT (id) DO UPDATE SET
    registration_number = EXCLUDED.registration_number,
    model = EXCLUDED.model;

-- ----------------------------------------------------------------------------
-- 5. Trajets de Démonstration (depuis Sousse)
-- ----------------------------------------------------------------------------
INSERT INTO public.journeys (
    id,
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
)
VALUES
    -- Trajet 1: Sousse Bab Bhar -> Monastir Centre (Trajet actif en cours d'embarquement)
    (
        '77777777-7777-7777-7777-777777777701',
        '55555555-5555-5555-5555-555555555501',
        '66666666-6666-6666-6666-666666666601',
        '11111111-1111-1111-1111-111111111101', -- Bab Bhar Sousse
        '11111111-1111-1111-1111-111111111105', -- Monastir Centre
        timezone('utc', now() + INTERVAL '15 minutes'),
        45,
        5.500,
        'TND',
        8,
        3, -- 5 occupées/réservées, 3 disponibles
        true,
        'boarding'
    ),
    -- Trajet 2: Sousse Menchia -> M'saken
    (
        '77777777-7777-7777-7777-777777777702',
        '55555555-5555-5555-5555-555555555502',
        '66666666-6666-6666-6666-666666666602',
        '11111111-1111-1111-1111-111111111102', -- Menchia
        '11111111-1111-1111-1111-111111111104', -- M'saken
        timezone('utc', now() + INTERVAL '30 minutes'),
        30,
        3.200,
        'TND',
        8,
        5,
        true,
        'published'
    ),
    -- Trajet 3: Sousse Sahloul -> Hergla
    (
        '77777777-7777-7777-7777-777777777703',
        '55555555-5555-5555-5555-555555555503',
        '66666666-6666-6666-6666-666666666603',
        '11111111-1111-1111-1111-111111111103', -- Sahloul
        '11111111-1111-1111-1111-111111111106', -- Hergla
        timezone('utc', now() + INTERVAL '45 minutes'),
        40,
        4.000,
        'TND',
        8,
        2,
        true,
        'published'
    )
ON CONFLICT (id) DO UPDATE SET
    available_seats = EXCLUDED.available_seats,
    status = EXCLUDED.status,
    departure_time = EXCLUDED.departure_time;

-- ----------------------------------------------------------------------------
-- 6. Sièges du trajet 1 (8 places du Peugeot Expert)
-- ----------------------------------------------------------------------------
INSERT INTO public.reservation_seats (id, journey_id, seat_number, status)
VALUES
    ('88888888-8888-8888-8888-888888888801', '77777777-7777-7777-7777-777777777701', 1, 'occupied'),
    ('88888888-8888-8888-8888-888888888802', '77777777-7777-7777-7777-777777777701', 2, 'reserved'),
    ('88888888-8888-8888-8888-888888888803', '77777777-7777-7777-7777-777777777701', 3, 'occupied'),
    ('88888888-8888-8888-8888-888888888804', '77777777-7777-7777-7777-777777777701', 4, 'occupied'),
    ('88888888-8888-8888-8888-888888888805', '77777777-7777-7777-7777-777777777701', 5, 'reserved'),
    ('88888888-8888-8888-8888-888888888806', '77777777-7777-7777-7777-777777777701', 6, 'available'),
    ('88888888-8888-8888-8888-888888888807', '77777777-7777-7777-7777-777777777701', 7, 'available'),
    ('88888888-8888-8888-8888-888888888808', '77777777-7777-7777-7777-777777777701', 8, 'available')
ON CONFLICT (journey_id, seat_number) DO UPDATE SET
    status = EXCLUDED.status;

-- ----------------------------------------------------------------------------
-- 7. Réservations de Démonstration (BL-2408-73A, BL-2408-18K, BL-2408-52F)
-- ----------------------------------------------------------------------------
INSERT INTO public.reservations (
    id,
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
)
VALUES
    -- Yasmine Mansour (Ticket démo principal)
    (
        '99999999-9999-9999-9999-999999999901',
        'BL-2408-73A',
        '77777777-7777-7777-7777-777777777701',
        '33333333-3333-3333-3333-333333333301',
        1,
        5.500,
        5.500,
        'confirmed',
        encode(digest('BLASTI-DEMO-TOKEN-YASMINE-73A', 'sha256'), 'hex'),
        timezone('utc', now() - INTERVAL '10 minutes'),
        timezone('utc', now() - INTERVAL '10 minutes')
    ),
    -- Mehdi Trabelsi
    (
        '99999999-9999-9999-9999-999999999902',
        'BL-2408-18K',
        '77777777-7777-7777-7777-777777777701',
        '33333333-3333-3333-3333-333333333302',
        2,
        5.500,
        11.000,
        'confirmed',
        encode(digest('BLASTI-DEMO-TOKEN-MEHDI-18K', 'sha256'), 'hex'),
        timezone('utc', now() - INTERVAL '25 minutes'),
        timezone('utc', now() - INTERVAL '25 minutes')
    ),
    -- Ahmed Ben Ali (Déjà à bord)
    (
        '99999999-9999-9999-9999-999999999903',
        'BL-2408-52F',
        '77777777-7777-7777-7777-777777777701',
        '33333333-3333-3333-3333-333333333303',
        1,
        5.500,
        5.500,
        'boarded',
        encode(digest('BLASTI-DEMO-TOKEN-AHMED-52F', 'sha256'), 'hex'),
        timezone('utc', now() - INTERVAL '40 minutes'),
        timezone('utc', now() - INTERVAL '40 minutes')
    )
ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    seat_count = EXCLUDED.seat_count;

-- Associer les réservations aux sièges
UPDATE public.reservation_seats SET reservation_id = '99999999-9999-9999-9999-999999999901', passenger_id = '33333333-3333-3333-3333-333333333301' WHERE id = '88888888-8888-8888-8888-888888888802';
UPDATE public.reservation_seats SET reservation_id = '99999999-9999-9999-9999-999999999902', passenger_id = '33333333-3333-3333-3333-333333333302' WHERE id = '88888888-8888-8888-8888-888888888805';
UPDATE public.reservation_seats SET reservation_id = '99999999-9999-9999-9999-999999999903', passenger_id = '33333333-3333-3333-3333-333333333303' WHERE id = '88888888-8888-8888-8888-888888888801';

-- ----------------------------------------------------------------------------
-- 8. Notifications de Démonstration
-- ----------------------------------------------------------------------------
INSERT INTO public.notifications (id, user_id, type, title, body, data)
VALUES
    (
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
        '33333333-3333-3333-3333-333333333301',
        'booking_confirmed',
        'Réservation confirmée',
        'Votre place pour Monastir est réservée avec succès.',
        '{"booking_reference": "BL-2408-73A"}'::jsonb
    ),
    (
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
        '33333333-3333-3333-3333-333333333301',
        'louage_approaching',
        'Votre louage approche',
        'Mohamed sera à Bab Bhar dans 8 minutes.',
        '{"eta_minutes": 8}'::jsonb
    ),
    (
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
        '33333333-3333-3333-3333-333333333301',
        'seat_available',
        'Une place vient de se libérer',
        '2 places sont disponibles vers Hergla.',
        '{"available_seats": 2}'::jsonb
    )
ON CONFLICT (id) DO NOTHING;
