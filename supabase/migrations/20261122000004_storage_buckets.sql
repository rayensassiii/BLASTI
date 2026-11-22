-- ============================================================================
-- BLASTI - Migration 4: Configuration Supabase Storage & Sécurité
-- ============================================================================
-- Description: Buckets pour avatars, photos de véhicules et documents
-- d'identité/permis louagiste strictement privés.
-- ============================================================================

-- Création des buckets de stockage
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
    ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
    ('vehicles', 'vehicles', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']),
    ('driver_documents', 'driver_documents', false, 15728640, ARRAY['image/jpeg', 'image/png', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ----------------------------------------------------------------------------
-- Politiques RLS pour storage.objects
-- ----------------------------------------------------------------------------

-- Avatars: Tout le monde peut voir les avatars
CREATE POLICY "avatars_public_select" ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'avatars');

-- Avatars: Seul l'utilisateur peut uploader/modifier son avatar
CREATE POLICY "avatars_user_upload" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'avatars' 
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "avatars_user_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'avatars' 
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Véhicules: Lecture publique des photos de louages
CREATE POLICY "vehicles_public_select" ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'vehicles');

-- Véhicules: Seul le conducteur propriétaire peut uploader
CREATE POLICY "vehicles_driver_upload" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'vehicles'
        AND EXISTS (
            SELECT 1 FROM public.driver_profiles
            WHERE user_id = auth.uid()
        )
    );

-- Documents conducteur (Permis, CIN): STRICTEMENT PRIVÉ
-- Seul le conducteur propriétaire et les admins peuvent lire
CREATE POLICY "driver_documents_owner_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'driver_documents'
        AND (
            (storage.foldername(name))[1] = auth.uid()::text
            OR EXISTS (
                SELECT 1 FROM public.profiles
                WHERE id = auth.uid() AND role = 'admin'
            )
        )
    );

-- Documents conducteur: Le conducteur propriétaire peut uploader
CREATE POLICY "driver_documents_owner_upload" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'driver_documents'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );
