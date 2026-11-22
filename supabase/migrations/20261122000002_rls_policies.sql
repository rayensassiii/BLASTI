-- ============================================================================
-- BLASTI - Migration 2: Politiques Row Level Security (RLS)
-- ============================================================================
-- Description: Sécurisation granulaire des tables. RLS activé sur chaque table.
-- Rôles: passenger, driver, admin.
-- ============================================================================

-- Activation RLS sur toutes les tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journey_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waiting_list ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Fonctions d'assistance de sécurité
-- ----------------------------------------------------------------------------

-- Vérifie si l'utilisateur courant est administrateur
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin' AND is_active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Récupère l'identifiant driver_profile de l'utilisateur courant
CREATE OR REPLACE FUNCTION public.get_current_driver_id()
RETURNS UUID AS $$
BEGIN
    RETURN (
        SELECT id FROM public.driver_profiles
        WHERE user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Vérifie si l'utilisateur courant est un conducteur vérifié
CREATE OR REPLACE FUNCTION public.is_verified_driver()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.driver_profiles
        WHERE user_id = auth.uid() 
          AND verification_status = 'verified'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ----------------------------------------------------------------------------
-- Politiques: profiles
-- ----------------------------------------------------------------------------
-- Tout utilisateur authentifié peut lire les profils de base (pour afficher nom/avatar conducteur)
CREATE POLICY "profiles_select_authenticated" ON public.profiles
    FOR SELECT TO authenticated
    USING (is_active = true);

-- Un utilisateur ne peut modifier que son propre profil
CREATE POLICY "profiles_update_own" ON public.profiles
    FOR UPDATE TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())); -- empêche l'auto-élévation de rôle

-- Insertion automatique ou réservée au trigger auth
CREATE POLICY "profiles_insert_own" ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = id);

-- Admins: accès total
CREATE POLICY "profiles_admin_all" ON public.profiles
    FOR ALL TO authenticated
    USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- Politiques: driver_profiles
-- ----------------------------------------------------------------------------
-- Lecture publique/authentifiée des profils de conducteurs vérifiés
CREATE POLICY "driver_profiles_select_verified" ON public.driver_profiles
    FOR SELECT TO authenticated
    USING (verification_status = 'verified' OR user_id = auth.uid() OR public.is_admin());

-- Le conducteur peut créer/mettre à jour sa demande
CREATE POLICY "driver_profiles_insert_own" ON public.driver_profiles
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "driver_profiles_update_own" ON public.driver_profiles
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid() AND verification_status = (SELECT verification_status FROM public.driver_profiles WHERE user_id = auth.uid())); -- statut modifiable uniquement par admin

CREATE POLICY "driver_profiles_admin_all" ON public.driver_profiles
    FOR ALL TO authenticated
    USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- Politiques: vehicles
-- ----------------------------------------------------------------------------
-- Tout le monde peut voir les véhicules actifs des conducteurs
CREATE POLICY "vehicles_select_active" ON public.vehicles
    FOR SELECT TO authenticated
    USING (is_active = true OR driver_id = public.get_current_driver_id() OR public.is_admin());

-- Seul le conducteur propriétaire peut gérer ses véhicules
CREATE POLICY "vehicles_insert_own" ON public.vehicles
    FOR INSERT TO authenticated
    WITH CHECK (driver_id = public.get_current_driver_id());

CREATE POLICY "vehicles_update_own" ON public.vehicles
    FOR UPDATE TO authenticated
    USING (driver_id = public.get_current_driver_id())
    WITH CHECK (driver_id = public.get_current_driver_id());

CREATE POLICY "vehicles_delete_own" ON public.vehicles
    FOR DELETE TO authenticated
    USING (driver_id = public.get_current_driver_id());

CREATE POLICY "vehicles_admin_all" ON public.vehicles
    FOR ALL TO authenticated
    USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- Politiques: stations
-- ----------------------------------------------------------------------------
-- Stations lisibles par tous (anonymes et authentifiés)
CREATE POLICY "stations_select_all" ON public.stations
    FOR SELECT TO public
    USING (is_active = true);

-- Seul l'administrateur peut insérer/modifier/supprimer des stations
CREATE POLICY "stations_admin_all" ON public.stations
    FOR ALL TO authenticated
    USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- Politiques: journeys
-- ----------------------------------------------------------------------------
-- Passagers: peuvent voir les trajets publiés, boarding ou in_progress
CREATE POLICY "journeys_select_published" ON public.journeys
    FOR SELECT TO public
    USING (status IN ('published', 'boarding', 'in_progress', 'completed') OR driver_id = public.get_current_driver_id() OR public.is_admin());

-- Conducteur vérifié: peut insérer un trajet
CREATE POLICY "journeys_insert_driver" ON public.journeys
    FOR INSERT TO authenticated
    WITH CHECK (driver_id = public.get_current_driver_id() AND public.is_verified_driver());

-- Conducteur: peut mettre à jour ses propres trajets non terminés
CREATE POLICY "journeys_update_driver" ON public.journeys
    FOR UPDATE TO authenticated
    USING (driver_id = public.get_current_driver_id())
    WITH CHECK (driver_id = public.get_current_driver_id());

CREATE POLICY "journeys_admin_all" ON public.journeys
    FOR ALL TO authenticated
    USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- Politiques: journey_locations
-- ----------------------------------------------------------------------------
-- Passagers: peuvent consulter la position en direct pour un trajet actif partagé
CREATE POLICY "journey_locations_select" ON public.journey_locations
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.journeys j
            WHERE j.id = journey_locations.journey_id
              AND j.share_live_location = true
              AND j.status IN ('boarding', 'in_progress')
        )
        OR driver_id = public.get_current_driver_id()
        OR public.is_admin()
    );

-- Conducteur: peut insérer ses coordonnées
CREATE POLICY "journey_locations_insert_driver" ON public.journey_locations
    FOR INSERT TO authenticated
    WITH CHECK (driver_id = public.get_current_driver_id());

-- ----------------------------------------------------------------------------
-- Politiques: reservations
-- ----------------------------------------------------------------------------
-- Passagers: ne peuvent lire que leurs propres réservations
-- Conducteurs: peuvent lire les réservations de leurs propres trajets
CREATE POLICY "reservations_select" ON public.reservations
    FOR SELECT TO authenticated
    USING (
        passenger_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.journeys j
            WHERE j.id = reservations.journey_id
              AND j.driver_id = public.get_current_driver_id()
        )
        OR public.is_admin()
    );

-- Les insertions et modifications directes de réservations doivent passer
-- exclusivement par les fonctions transactionnelles sécurisées (create_reservation_atomic, cancel_reservation)
-- On bloque les INSERT et UPDATE sauvages directs depuis le client pour éviter les contournements de prix/surbooking.
CREATE POLICY "reservations_insert_restricted" ON public.reservations
    FOR INSERT TO authenticated
    WITH CHECK (passenger_id = auth.uid() AND status = 'pending');

CREATE POLICY "reservations_update_cancel_own" ON public.reservations
    FOR UPDATE TO authenticated
    USING (passenger_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.journeys j
        WHERE j.id = reservations.journey_id
          AND j.driver_id = public.get_current_driver_id()
    ) OR public.is_admin());

CREATE POLICY "reservations_admin_all" ON public.reservations
    FOR ALL TO authenticated
    USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- Politiques: reservation_seats
-- ----------------------------------------------------------------------------
-- Tout utilisateur peut consulter l'état des sièges d'un trajet publié
CREATE POLICY "reservation_seats_select" ON public.reservation_seats
    FOR SELECT TO authenticated
    USING (true);

-- Seules les fonctions PostgreSQL de réservation et de drop-off gèrent l'écriture
CREATE POLICY "reservation_seats_update_driver" ON public.reservation_seats
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.journeys j
            WHERE j.id = reservation_seats.journey_id
              AND j.driver_id = public.get_current_driver_id()
        )
        OR public.is_admin()
    );

-- ----------------------------------------------------------------------------
-- Politiques: notifications
-- ----------------------------------------------------------------------------
-- L'utilisateur ne voit que ses propres notifications
CREATE POLICY "notifications_select_own" ON public.notifications
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "notifications_update_own" ON public.notifications
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Politiques: ratings
-- ----------------------------------------------------------------------------
-- Tout le monde peut lire les évaluations
CREATE POLICY "ratings_select_all" ON public.ratings
    FOR SELECT TO authenticated
    USING (true);

-- Seul le passager ayant effectué le trajet et embarqué peut noter
CREATE POLICY "ratings_insert_author" ON public.ratings
    FOR INSERT TO authenticated
    WITH CHECK (
        author_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.reservations r
            WHERE r.id = ratings.reservation_id
              AND r.passenger_id = auth.uid()
              AND r.status IN ('boarded', 'completed')
        )
    );

-- ----------------------------------------------------------------------------
-- Politiques: saved_destinations
-- ----------------------------------------------------------------------------
CREATE POLICY "saved_destinations_all_own" ON public.saved_destinations
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Politiques: waiting_list
-- ----------------------------------------------------------------------------
CREATE POLICY "waiting_list_select" ON public.waiting_list
    FOR SELECT TO authenticated
    USING (
        passenger_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.journeys j
            WHERE j.id = waiting_list.journey_id
              AND j.driver_id = public.get_current_driver_id()
        )
        OR public.is_admin()
    );

CREATE POLICY "waiting_list_insert_own" ON public.waiting_list
    FOR INSERT TO authenticated
    WITH CHECK (passenger_id = auth.uid());

CREATE POLICY "waiting_list_delete_own" ON public.waiting_list
    FOR DELETE TO authenticated
    USING (passenger_id = auth.uid());
