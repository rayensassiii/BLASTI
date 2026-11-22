// ============================================================================
// BLASTI - Hook Réactif d'Authentification & Rôle
// ============================================================================

import { useState, useEffect } from 'react'
import type { Profile, DriverProfile } from '../types/database'
import { getCurrentProfile, signOut as authSignOut } from '../services/auth'
import { supabase, isLiveSupabaseConfigured } from '../lib/supabase'

export function useAuth() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [driverProfile, setDriverProfile] = useState<DriverProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadUser = async () => {
    try {
      const res = await getCurrentProfile()
      setProfile(res.profile)
      setDriverProfile(res.driverProfile)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUser()

    if (isLiveSupabaseConfigured) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
        loadUser()
      })
      return () => {
        subscription.unsubscribe()
      }
    }
  }, [])

  const signOut = async () => {
    await authSignOut()
    setProfile(null)
    setDriverProfile(null)
  }

  return {
    profile,
    driverProfile,
    isDriver: profile?.role === 'driver',
    loading,
    refresh: loadUser,
    signOut,
  }
}
