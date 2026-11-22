// ============================================================================
// BLASTI - Service de Géolocalisation & Suivi GPS en Temps Réel
// ============================================================================

import { supabase, isLiveSupabaseConfigured } from '../lib/supabase'
import { DEMO_DRIVER_PROFILE, mockDb } from '../lib/mockData'

let lastLocationUpdate = 0
const THROTTLE_INTERVAL_MS = 4000 // Limitation à une écriture toutes les 4s pour préserver la base

// Envoi de la position GPS du conducteur
export async function sendDriverLocation(params: {
  latitude: number
  longitude: number
  heading?: number
  speed?: number
  accuracy?: number
}) {
  const now = Date.now()
  if (now - lastLocationUpdate < THROTTLE_INTERVAL_MS) {
    return { success: true, throttled: true }
  }
  lastLocationUpdate = now

  if (!isLiveSupabaseConfigured) {
    DEMO_DRIVER_PROFILE.current_latitude = params.latitude
    DEMO_DRIVER_PROFILE.current_longitude = params.longitude
    DEMO_DRIVER_PROFILE.location_updated_at = new Date().toISOString()
    mockDb.notify()
    return { success: true }
  }

  const { data, error } = await supabase.rpc('update_driver_location', {
    p_latitude: params.latitude,
    p_longitude: params.longitude,
    p_heading: params.heading ?? null,
    p_speed: params.speed ?? null,
    p_accuracy: params.accuracy ?? null,
  })

  if (error) {
    console.warn('GPS update error:', error.message)
    return { success: false, error: error.message }
  }

  return data
}

// Vérifie si une position GPS est encore fraîche (< 5 minutes)
export function isLocationFresh(updatedAt: string | null): boolean {
  if (!updatedAt) return false
  const updatedTime = new Date(updatedAt).getTime()
  const ageMs = Date.now() - updatedTime
  return ageMs < 5 * 60 * 1000 // 5 minutes
}

// Récupération de la position du conducteur
export async function getDriverLocation(driverId: string): Promise<{ latitude: number; longitude: number; isFresh: boolean } | null> {
  if (!isLiveSupabaseConfigured) {
    return {
      latitude: DEMO_DRIVER_PROFILE.current_latitude || 35.8288,
      longitude: DEMO_DRIVER_PROFILE.current_longitude || 10.6405,
      isFresh: isLocationFresh(DEMO_DRIVER_PROFILE.location_updated_at),
    }
  }

  const { data, error } = await supabase
    .from('driver_profiles')
    .select('current_latitude, current_longitude, location_updated_at')
    .eq('id', driverId)
    .single()

  if (error || !data || data.current_latitude === null || data.current_longitude === null) {
    return null
  }

  return {
    latitude: data.current_latitude,
    longitude: data.current_longitude,
    isFresh: isLocationFresh(data.location_updated_at),
  }
}
