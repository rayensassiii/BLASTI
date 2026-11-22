-- ============================================================================
-- BLASTI - Migration 1: Schema Initial
-- ============================================================================
-- Description: Définition des types, extensions, tables relationnelles,
-- contraintes de sécurité et index pour la plateforme de Louage tunisienne.
-- ============================================================================

-- Extensions nécessaires
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- Types énumérés pour la cohérence des statuts
-- ----------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('passenger', 'driver', 'admin');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE driver_verification_status AS ENUM ('pending', 'verified', 'suspended', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE journey_status AS ENUM ('draft', 'published', 'boarding', 'in_progress', 'completed', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE reservation_status AS ENUM ('pending', 'confirmed', 'boarded', 'completed', 'cancelled', 'expired', 'no_show');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE seat_status AS ENUM ('available', 'reserved', 'occupied', 'blocked');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE waiting_status AS ENUM ('waiting', 'notified', 'converted', 'expired', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- Table: profiles
-- Utilisateurs BLASTI (passagers, conducteurs, administrateurs)
-- Liée à auth.users de Supabase
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'passenger',
    full_name TEXT NOT NULL,
    phone TEXT UNIQUE,
    avatar_url TEXT,
    preferred_language TEXT NOT NULL DEFAULT 'fr' CHECK (preferred_language IN ('ar', 'fr', 'en')),
    average_rating NUMERIC(3, 2) NOT NULL DEFAULT 5.00 CHECK (average_rating BETWEEN 1.00 AND 5.00),
    ratings_count INTEGER NOT NULL DEFAULT 0 CHECK (ratings_count >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT valid_tunisian_phone CHECK (phone IS NULL OR phone ~ '^\+216[0-9]{8}$')
);

-- ----------------------------------------------------------------------------
-- Table: driver_profiles
-- Profils vérifiés des louagistes
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.driver_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    verification_status driver_verification_status NOT NULL DEFAULT 'pending',
    license_number TEXT NOT NULL UNIQUE,
    license_document_url TEXT,
    identity_document_url TEXT,
    is_online BOOLEAN NOT NULL DEFAULT false,
    current_latitude DOUBLE PRECISION CHECK (current_latitude IS NULL OR (current_latitude BETWEEN -90.0 AND 90.0)),
    current_longitude DOUBLE PRECISION CHECK (current_longitude IS NULL OR (current_longitude BETWEEN -180.0 AND 180.0)),
    location_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- ----------------------------------------------------------------------------
-- Table: vehicles
-- Véhicules Louage (ex: Peugeot Expert, Toyota HiAce, etc.)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES public.driver_profiles(id) ON DELETE CASCADE,
    registration_number TEXT NOT NULL UNIQUE,
    model TEXT NOT NULL,
    color TEXT,
    total_seat_capacity INTEGER NOT NULL DEFAULT 8 CHECK (total_seat_capacity BETWEEN 4 AND 12),
    photo_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- ----------------------------------------------------------------------------
-- Table: stations
-- Stations de Louage tunisiennes (ex: Bab Bhar, Menchia, Sahloul, etc.)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90.0 AND 90.0),
    longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180.0 AND 180.0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- ----------------------------------------------------------------------------
-- Table: journeys
-- Trajets Louage planifiés ou en cours
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.journeys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES public.driver_profiles(id) ON DELETE RESTRICT,
    vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
    departure_station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE RESTRICT,
    destination_station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE RESTRICT,
    departure_time TIMESTAMPTZ NOT NULL,
    estimated_duration_minutes INTEGER NOT NULL DEFAULT 45 CHECK (estimated_duration_minutes > 0),
    price_per_seat NUMERIC(6, 3) NOT NULL CHECK (price_per_seat > 0),
    currency TEXT NOT NULL DEFAULT 'TND',
    total_seats INTEGER NOT NULL DEFAULT 8 CHECK (total_seats > 0),
    available_seats INTEGER NOT NULL CHECK (available_seats >= 0 AND available_seats <= total_seats),
    share_live_location BOOLEAN NOT NULL DEFAULT true,
    status journey_status NOT NULL DEFAULT 'draft',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT stations_must_differ CHECK (departure_station_id <> destination_station_id)
);

-- ----------------------------------------------------------------------------
-- Table: journey_locations
-- Historique GPS des trajets pour le suivi temps réel
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.journey_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journey_id UUID NOT NULL REFERENCES public.journeys(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES public.driver_profiles(id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90.0 AND 90.0),
    longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180.0 AND 180.0),
    heading DOUBLE PRECISION CHECK (heading IS NULL OR (heading >= 0.0 AND heading <= 360.0)),
    speed DOUBLE PRECISION CHECK (speed IS NULL OR speed >= 0.0),
    accuracy DOUBLE PRECISION CHECK (accuracy IS NULL OR accuracy >= 0.0),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- ----------------------------------------------------------------------------
-- Table: reservations
-- Réservations de places de Louage par les passagers
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_reference TEXT NOT NULL UNIQUE,
    journey_id UUID NOT NULL REFERENCES public.journeys(id) ON DELETE RESTRICT,
    passenger_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    seat_count INTEGER NOT NULL CHECK (seat_count > 0 AND seat_count <= 8),
    price_per_seat NUMERIC(6, 3) NOT NULL CHECK (price_per_seat > 0),
    total_price NUMERIC(7, 3) NOT NULL CHECK (total_price > 0),
    status reservation_status NOT NULL DEFAULT 'pending',
    qr_token_hash TEXT NOT NULL UNIQUE,
    reserved_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    confirmed_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
    boarded_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- ----------------------------------------------------------------------------
-- Table: reservation_seats
-- Suivi individuel des sièges par trajet (de 1 à 8 places)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reservation_seats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journey_id UUID NOT NULL REFERENCES public.journeys(id) ON DELETE CASCADE,
    reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL,
    seat_number INTEGER NOT NULL CHECK (seat_number BETWEEN 1 AND 12),
    status seat_status NOT NULL DEFAULT 'available',
    passenger_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    occupied_at TIMESTAMPTZ,
    released_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT unique_journey_seat UNIQUE (journey_id, seat_number)
);

-- ----------------------------------------------------------------------------
-- Table: notifications
-- Système d'alertes temps réel pour passagers et conducteurs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- ----------------------------------------------------------------------------
-- Table: ratings
-- Évaluations après trajet (1 à 5 étoiles)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journey_id UUID NOT NULL REFERENCES public.journeys(id) ON DELETE CASCADE,
    reservation_id UUID NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    target_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT unique_reservation_author_rating UNIQUE (reservation_id, author_id)
);

-- ----------------------------------------------------------------------------
-- Table: saved_destinations
-- Destinations favorites de l'utilisateur (Maison, Travail, etc.)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saved_destinations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
    custom_label TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT unique_user_station UNIQUE (user_id, station_id)
);

-- ----------------------------------------------------------------------------
-- Table: waiting_list
-- Liste d'attente pour passagers lors d'un trajet complet
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.waiting_list (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journey_id UUID NOT NULL REFERENCES public.journeys(id) ON DELETE CASCADE,
    passenger_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    requested_seats INTEGER NOT NULL DEFAULT 1 CHECK (requested_seats > 0 AND requested_seats <= 4),
    status waiting_status NOT NULL DEFAULT 'waiting',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    notified_at TIMESTAMPTZ
);

-- ----------------------------------------------------------------------------
-- Index de performance et recherche
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_journeys_status_dep_time ON public.journeys(status, departure_time);
CREATE INDEX IF NOT EXISTS idx_journeys_departure_destination ON public.journeys(departure_station_id, destination_station_id);
CREATE INDEX IF NOT EXISTS idx_journeys_driver ON public.journeys(driver_id);

CREATE INDEX IF NOT EXISTS idx_reservations_passenger ON public.reservations(passenger_id, status);
CREATE INDEX IF NOT EXISTS idx_reservations_journey ON public.reservations(journey_id, status);
CREATE INDEX IF NOT EXISTS idx_reservations_qr_hash ON public.reservations(qr_token_hash);
CREATE INDEX IF NOT EXISTS idx_reservations_ref ON public.reservations(booking_reference);

CREATE INDEX IF NOT EXISTS idx_seats_journey_status ON public.reservation_seats(journey_id, status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_driver_profiles_online ON public.driver_profiles(is_online, verification_status);
CREATE INDEX IF NOT EXISTS idx_journey_locations_journey_time ON public.journey_locations(journey_id, recorded_at DESC);

-- Trigger pour la mise à jour automatique de updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc', now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_modtime
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_driver_profiles_modtime
    BEFORE UPDATE ON public.driver_profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_vehicles_modtime
    BEFORE UPDATE ON public.vehicles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_journeys_modtime
    BEFORE UPDATE ON public.journeys
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_reservations_modtime
    BEFORE UPDATE ON public.reservations
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_reservation_seats_modtime
    BEFORE UPDATE ON public.reservation_seats
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
