// ============================================================================
// BLASTI - Service des Réservations & Billetterie QR Code
// ============================================================================
// Assure la réservation atomique (anti-surbooking), la gestion des tickets
// avec hachage SHA-256 du QR token, et le scan conducteur à l'embarquement.
// ============================================================================

import { supabase, isLiveSupabaseConfigured } from '../lib/supabase'
import type { Reservation, CreateReservationResult, ScanQrResult } from '../types/database'
import {
  mockDb,
  mockCreateReservationAtomic,
  mockCancelReservation,
  mockScanBoardingQr,
  DEMO_PASSENGER,
} from '../lib/mockData'

// Réservation atomique (RPC create_reservation_atomic)
export async function bookReservation(params: {
  journeyId: string
  seatCount: number
  preferredSeats?: number[]
}): Promise<CreateReservationResult> {
  if (!isLiveSupabaseConfigured) {
    return mockCreateReservationAtomic(params.journeyId, params.seatCount, DEMO_PASSENGER.id)
  }

  const { data, error } = await supabase.rpc('create_reservation_atomic', {
    p_journey_id: params.journeyId,
    p_seat_count: params.seatCount,
    p_preferred_seats: params.preferredSeats ?? null,
  })

  if (error) {
    throw new Error(error.message || 'Échec de la réservation')
  }

  return data
}

// Annulation d'une réservation (RPC cancel_reservation)
export async function cancelReservation(reservationId: string, reason?: string) {
  if (!isLiveSupabaseConfigured) {
    return mockCancelReservation(reservationId, reason)
  }

  const { data, error } = await supabase.rpc('cancel_reservation', {
    p_reservation_id: reservationId,
    p_cancellation_reason: reason || 'Annulé par le passager',
  })

  if (error) throw error
  return data
}

// Récupération des réservations de l'utilisateur connecté
export async function getMyReservations(): Promise<Reservation[]> {
  if (!isLiveSupabaseConfigured) {
    return mockDb.reservations.filter((r) => r.passenger_id === DEMO_PASSENGER.id)
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('reservations')
    .select(`
      *,
      journey:journeys(
        *,
        departure_station:stations!departure_station_id(*),
        destination_station:stations!destination_station_id(*),
        driver:driver_profiles(*, profile:profiles(*))
      )
    `)
    .eq('passenger_id', user.id)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

// Récupération des passagers d'un trajet (côté conducteur)
export async function getJourneyReservations(journeyId: string): Promise<Reservation[]> {
  if (!isLiveSupabaseConfigured) {
    return mockDb.reservations.filter((r) => r.journey_id === journeyId)
  }

  const { data, error } = await supabase
    .from('reservations')
    .select(`
      *,
      passenger:profiles(full_name, phone, avatar_url)
    `)
    .eq('journey_id', journeyId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}

// Validation d'un ticket QR par le conducteur (RPC scan_boarding_qr)
export async function scanTicketQr(journeyId: string, qrToken: string): Promise<ScanQrResult> {
  if (!isLiveSupabaseConfigured) {
    return mockScanBoardingQr(journeyId, qrToken)
  }

  const { data, error } = await supabase.rpc('scan_boarding_qr', {
    p_journey_id: journeyId,
    p_qr_token: qrToken,
  })

  if (error) {
    return {
      success: false,
      code: 'INVALID_TOKEN',
      message: error.message || 'Erreur lors du scan du ticket',
    }
  }

  return data
}
