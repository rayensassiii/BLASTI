// ============================================================================
// BLASTI - Service des Trajets Louage & Gestion des Sièges
// ============================================================================

import { supabase, isLiveSupabaseConfigured } from '../lib/supabase'
import type { Journey, Station, ReservationSeat, NearbyLouageResult, ReleaseSeatResult } from '../types/database'
import {
  DEMO_STATIONS,
  mockDb,
  mockSearchNearbyLouages,
  mockReleaseJourneySeat,
} from '../lib/mockData'

// Récupération des stations tunisiennes
export async function getStations(): Promise<Station[]> {
  if (!isLiveSupabaseConfigured) {
    return DEMO_STATIONS
  }

  const { data, error } = await supabase
    .from('stations')
    .select('*')
    .eq('is_active', true)
    .order('city', { ascending: true })

  if (error) throw error
  return data || []
}

// Recherche des Louages proches avec calcul Haversine
export async function searchNearbyJourneys(params: {
  latitude?: number
  longitude?: number
  destinationStationId?: string
  minSeats?: number
}): Promise<NearbyLouageResult[]> {
  const lat = params.latitude ?? 35.8288 // Sousse Bab Bhar par défaut
  const lng = params.longitude ?? 10.6405

  if (!isLiveSupabaseConfigured) {
    return mockSearchNearbyLouages(lat, lng, params.destinationStationId)
  }

  const { data, error } = await supabase.rpc('search_nearby_louages', {
    p_lat: lat,
    p_lng: lng,
    p_radius_km: 75.0,
    p_destination_station_id: params.destinationStationId || null,
    p_min_seats: params.minSeats ?? 1,
  })

  if (error) throw error
  return data || []
}

// Détail d'un trajet avec stations et conducteur
export async function getJourneyById(journeyId: string): Promise<Journey | null> {
  if (!isLiveSupabaseConfigured) {
    return mockDb.journeys.find((j) => j.id === journeyId) || null
  }

  const { data, error } = await supabase
    .from('journeys')
    .select(`
      *,
      departure_station:stations!departure_station_id(*),
      destination_station:stations!destination_station_id(*),
      vehicle:vehicles(*),
      driver:driver_profiles(*, profile:profiles(*))
    `)
    .eq('id', journeyId)
    .single()

  if (error) return null
  return data
}

// État des sièges en direct pour la disposition du minibus
export async function getJourneySeats(journeyId: string): Promise<ReservationSeat[]> {
  if (!isLiveSupabaseConfigured) {
    return mockDb.seats.filter((s) => s.journey_id === journeyId)
  }

  const { data, error } = await supabase
    .from('reservation_seats')
    .select(`
      *,
      passenger:profiles(full_name, phone)
    `)
    .eq('journey_id', journeyId)
    .order('seat_number', { ascending: true })

  if (error) throw error
  return data || []
}

// Action principale conducteur: "Passager descendu" (release_journey_seat)
export async function releaseJourneySeat(journeyId: string, seatNumber: number): Promise<ReleaseSeatResult> {
  if (!isLiveSupabaseConfigured) {
    return mockReleaseJourneySeat(journeyId, seatNumber)
  }

  const { data, error } = await supabase.rpc('release_journey_seat', {
    p_journey_id: journeyId,
    p_seat_number: seatNumber,
  })

  if (error) throw error
  return data
}

// Trajet actif pour le tableau de bord conducteur
export async function getDriverActiveJourney(): Promise<Journey | null> {
  if (!isLiveSupabaseConfigured) {
    return mockDb.journeys.find((j) => j.status === 'boarding' || j.status === 'in_progress') || mockDb.journeys[0]
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: driver } = await supabase
    .from('driver_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!driver) return null

  const { data: journey, error } = await supabase
    .from('journeys')
    .select(`
      *,
      departure_station:stations!departure_station_id(*),
      destination_station:stations!destination_station_id(*),
      vehicle:vehicles(*)
    `)
    .eq('driver_id', driver.id)
    .in('status', ['boarding', 'in_progress', 'published'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return null
  return journey
}

// Publication d'un nouveau trajet
export async function publishJourney(params: {
  departureStationId: string
  destinationStationId: string
  vehicleId: string
  departureTime: string
  pricePerSeat: number
  estimatedDurationMinutes?: number
  shareLiveLocation?: boolean
}) {
  if (!isLiveSupabaseConfigured) {
    const newJourney: Journey = {
      id: `j_${Date.now()}`,
      driver_id: mockDb.journeys[0].driver_id,
      vehicle_id: params.vehicleId,
      departure_station_id: params.departureStationId,
      destination_station_id: params.destinationStationId,
      departure_time: params.departureTime,
      estimated_duration_minutes: params.estimatedDurationMinutes || 45,
      price_per_seat: params.pricePerSeat,
      currency: 'TND',
      total_seats: 8,
      available_seats: 8,
      share_live_location: params.shareLiveLocation ?? true,
      status: 'published',
      started_at: null,
      completed_at: null,
      cancelled_at: null,
      cancellation_reason: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    mockDb.journeys.unshift(newJourney)
    mockDb.notify()
    return { success: true, journey_id: newJourney.id }
  }

  const { data, error } = await supabase.rpc('publish_journey', {
    p_departure_station_id: params.departureStationId,
    p_destination_station_id: params.destinationStationId,
    p_vehicle_id: params.vehicleId,
    p_departure_time: params.departureTime,
    p_price_per_seat: params.pricePerSeat,
    p_estimated_duration_minutes: params.estimatedDurationMinutes ?? 45,
    p_share_live_location: params.shareLiveLocation ?? true,
  })

  if (error) throw error
  return data
}

// Passage au statut 'boarding'
export async function startJourneyBoarding(journeyId: string) {
  if (!isLiveSupabaseConfigured) {
    const j = mockDb.journeys.find((x) => x.id === journeyId)
    if (j) j.status = 'boarding'
    mockDb.notify()
    return { success: true }
  }

  const { data, error } = await supabase.rpc('start_journey_boarding', {
    p_journey_id: journeyId,
  })
  if (error) throw error
  return data
}

// Clôture du trajet
export async function completeJourney(journeyId: string) {
  if (!isLiveSupabaseConfigured) {
    const j = mockDb.journeys.find((x) => x.id === journeyId)
    if (j) j.status = 'completed'
    mockDb.notify()
    return { success: true, total_revenue: 44.0, passengers_count: 8 }
  }

  const { data, error } = await supabase.rpc('complete_journey', {
    p_journey_id: journeyId,
  })
  if (error) throw error
  return data
}
