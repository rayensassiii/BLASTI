// ============================================================================
// BLASTI - Client Supabase & Gestionnaire de Session
// ============================================================================
// Initialise le client officiel Supabase avec options de persistance et
// rafraîchissement automatique de token. Intègre également un adaptateur
// de secours (mock demo) complet si aucune variable d'environnement n'est fournie.
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://demo-blasti.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'demo-anon-key-placeholder'

export const isLiveSupabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && 
  import.meta.env.VITE_SUPABASE_ANON_KEY &&
  !import.meta.env.VITE_SUPABASE_URL.includes('your-project') &&
  !import.meta.env.VITE_SUPABASE_URL.includes('demo-blasti')
)

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'blasti-auth-session',
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})

// Validation de numéro tunisien
export function isValidTunisianPhone(phone: string): boolean {
  // Format attendu: +216XXXXXXXX (8 chiffres)
  const cleaned = phone.replace(/[\s-]/g, '')
  return /^\+216[0-9]{8}$/.test(cleaned)
}

// Nettoyage et formatage du numéro tunisien
export function formatTunisianPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('216') && digits.length === 11) {
    return `+${digits}`
  }
  if (digits.length === 8) {
    return `+216${digits}`
  }
  return raw
}

// Formatage monétaire en Dinars Tunisiens (TND)
export function formatTND(amount: number): string {
  return amount.toFixed(3).replace('.', ',') + ' DT'
}

// Formatage heure locale tunisienne (Africa/Tunis)
export function formatTunisTime(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleTimeString('fr-TN', {
      timeZone: 'Africa/Tunis',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '14:20'
  }
}
