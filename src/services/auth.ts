// ============================================================================
// BLASTI - Service d'Authentification & Gestion des Profils
// ============================================================================
// Supporte:
// - Numéro tunisien au format +216XXXXXXXX avec validation stricte
// - OTP par SMS via Supabase Auth
// - Connexion mot de passe
// - Connexion OAuth Google
// - Rafraîchissement automatique de session
// - Demande de vérification louagiste
// ============================================================================

import { supabase, isLiveSupabaseConfigured, isValidTunisianPhone, formatTunisianPhone } from '../lib/supabase'
import type { Profile, DriverProfile, UserRole } from '../types/database'
import { DEMO_PASSENGER, DEMO_DRIVER_USER, DEMO_DRIVER_PROFILE } from '../lib/mockData'

export interface AuthState {
  user: Profile | null
  driverProfile: DriverProfile | null
  isLoading: boolean
  isAuthenticated: boolean
}

// Récupération de la session courante
export async function getCurrentProfile(): Promise<{ profile: Profile | null; driverProfile: DriverProfile | null }> {
  if (!isLiveSupabaseConfigured) {
    const isLoggedIn = localStorage.getItem('blasti_logged_in') === 'true'
    if (!isLoggedIn) {
      return { profile: null, driverProfile: null }
    }
    const savedRole = (localStorage.getItem('blasti_demo_role') as UserRole) || 'passenger'
    if (savedRole === 'driver') {
      return { profile: DEMO_DRIVER_USER, driverProfile: DEMO_DRIVER_PROFILE }
    }
    return { profile: DEMO_PASSENGER, driverProfile: null }
  }

  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !session?.user) {
    return { profile: null, driverProfile: null }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single()

  let driverProfile: DriverProfile | null = null
  if (profile?.role === 'driver') {
    const { data: dProfile } = await supabase
      .from('driver_profiles')
      .select('*')
      .eq('user_id', profile.id)
      .single()
    driverProfile = dProfile
  }

  return { profile: profile || null, driverProfile }
}

// Inscription avec numéro tunisien et mot de passe
export async function signUpWithPhone(params: {
  phone: string
  password: string
  fullName: string
  isDriver?: boolean
}) {
  const formattedPhone = formatTunisianPhone(params.phone)
  if (!isValidTunisianPhone(formattedPhone)) {
    throw new Error('Numéro tunisien invalide. Format attendu: +216XXXXXXXX (8 chiffres)')
  }

  if (params.password.length < 6) {
    throw new Error('Le mot de passe doit comporter au moins 6 caractères.')
  }

  if (!isLiveSupabaseConfigured) {
    // Enregistrement démo
    const newProfile: Profile = {
      id: `u_${Date.now()}`,
      role: params.isDriver ? 'driver' : 'passenger',
      full_name: params.fullName,
      phone: formattedPhone,
      avatar_url: null,
      preferred_language: 'fr',
      average_rating: 5.0,
      ratings_count: 0,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    localStorage.setItem('blasti_demo_role', newProfile.role)
    localStorage.setItem('blasti_logged_in', 'true')
    return { user: newProfile, role: newProfile.role, error: null }
  }

  // Supabase Auth SignUp avec metadata
  const { data, error } = await supabase.auth.signUp({
    phone: formattedPhone,
    password: params.password,
    options: {
      data: {
        full_name: params.fullName,
        phone: formattedPhone,
        is_driver: params.isDriver ? 'true' : 'false',
      },
    },
  })

  if (error) throw error
  return data
}

// Connexion avec numéro tunisien et mot de passe
export async function signInWithPhonePassword(phone: string, password: string) {
  const formattedPhone = formatTunisianPhone(phone)
  if (!isValidTunisianPhone(formattedPhone)) {
    throw new Error('Numéro tunisien invalide (+216XXXXXXXX requis)')
  }

  if (!isLiveSupabaseConfigured) {
    const isDriver = phone.includes('98') || phone.includes('97')
    const role: UserRole = isDriver ? 'driver' : 'passenger'
    localStorage.setItem('blasti_demo_role', role)
    localStorage.setItem('blasti_logged_in', 'true')
    const profile = isDriver ? DEMO_DRIVER_USER : DEMO_PASSENGER
    return { profile, role }
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    phone: formattedPhone,
    password,
  })

  if (error) throw error
  return data
}

// Envoi d'un code OTP par SMS
export async function sendOtpPhone(phone: string) {
  const formattedPhone = formatTunisianPhone(phone)
  if (!isValidTunisianPhone(formattedPhone)) {
    throw new Error('Numéro tunisien invalide')
  }

  if (!isLiveSupabaseConfigured) {
    return { success: true, message: 'Code OTP 123456 envoyé (mode démo)' }
  }

  const { data, error } = await supabase.auth.signInWithOtp({
    phone: formattedPhone,
  })

  if (error) throw error
  return data
}

// Vérification du code OTP
export async function verifyOtpPhone(phone: string, token: string) {
  const formattedPhone = formatTunisianPhone(phone)

  if (!isLiveSupabaseConfigured) {
    if (token === '123456' || token.length === 6) {
      return { success: true }
    }
    throw new Error('Code OTP incorrect')
  }

  const { data, error } = await supabase.auth.verifyOtp({
    phone: formattedPhone,
    token,
    type: 'sms',
  })

  if (error) throw error
  return data
}

// Connexion Google OAuth
export async function signInWithGoogle() {
  if (!isLiveSupabaseConfigured) {
    localStorage.setItem('blasti_demo_role', 'passenger')
    return { success: true }
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
    },
  })

  if (error) throw error
  return data
}

// Déconnexion sécurisée
export async function signOut() {
  localStorage.removeItem('blasti_demo_role')
  localStorage.removeItem('blasti_logged_in')
  if (isLiveSupabaseConfigured) {
    await supabase.auth.signOut()
  }
}

// Demande d'agrément louagiste (Candidature conducteur)
export async function applyForDriverVerification(params: {
  licenseNumber: string
  licenseDocumentFile?: File
  identityDocumentFile?: File
}) {
  if (!isLiveSupabaseConfigured) {
    return { success: true, status: 'pending', message: 'Demande soumise avec succès' }
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Utilisateur non connecté')

  let licenseUrl: string | null = null
  let identityUrl: string | null = null

  // Upload sécurisé vers le bucket privé driver_documents
  if (params.licenseDocumentFile) {
    const ext = params.licenseDocumentFile.name.split('.').pop()
    const path = `${user.id}/license_${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('driver_documents')
      .upload(path, params.licenseDocumentFile)
    if (!upErr) licenseUrl = path
  }

  if (params.identityDocumentFile) {
    const ext = params.identityDocumentFile.name.split('.').pop()
    const path = `${user.id}/identity_${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('driver_documents')
      .upload(path, params.identityDocumentFile)
    if (!upErr) identityUrl = path
  }

  const { data, error } = await supabase
    .from('driver_profiles')
    .upsert({
      user_id: user.id,
      verification_status: 'pending',
      license_number: params.licenseNumber,
      license_document_url: licenseUrl,
      identity_document_url: identityUrl,
    })
    .select()
    .single()

  if (error) throw error
  return data
}
