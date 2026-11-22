// ============================================================================
// BLASTI - Hook Supabase Realtime pour le Suivi d'un Trajet et des Sièges
// ============================================================================
// Écoute en temps réel:
// - Mise à jour du nombre de places disponibles (journeys)
// - Changements d'état des sièges (reservation_seats)
// - Statut du trajet (boarding -> in_progress -> completed)
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { supabase, isLiveSupabaseConfigured } from '../lib/supabase'
import type { Journey, ReservationSeat } from '../types/database'
import { getJourneyById, getJourneySeats } from '../services/journeys'
import { mockDb } from '../lib/mockData'

export function useRealtimeJourney(journeyId: string) {
  const [journey, setJourney] = useState<Journey | null>(null)
  const [seats, setSeats] = useState<ReservationSeat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [jData, sData] = await Promise.all([
        getJourneyById(journeyId),
        getJourneySeats(journeyId),
      ])
      setJourney(jData)
      setSeats(sData)
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [journeyId])

  useEffect(() => {
    refresh()

    if (!isLiveSupabaseConfigured) {
      // Écoute locale réactive
      const unsubscribe = mockDb.subscribe(() => {
        refresh()
      })
      return () => {
        unsubscribe()
      }
    }

    // Abonnement Supabase Realtime ciblé par trajet (filtrage strict pour éviter la surcharge)
    const channel = supabase
      .channel(`journey:${journeyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'journeys',
          filter: `id=eq.${journeyId}`,
        },
        () => {
          refresh()
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reservation_seats',
          filter: `journey_id=eq.${journeyId}`,
        },
        () => {
          refresh()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [journeyId, refresh])

  return { journey, seats, loading, error, refresh }
}
