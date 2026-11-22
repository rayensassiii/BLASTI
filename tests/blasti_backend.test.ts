// ============================================================================
// BLASTI - Tests Unitaires & d'Intégration du Backend
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest'
import {
  mockCreateReservationAtomic,
  mockCancelReservation,
  mockReleaseJourneySeat,
  mockScanBoardingQr,
  mockDb,
} from '../src/lib/mockData'
import { isValidTunisianPhone, formatTunisianPhone } from '../src/lib/supabase'

describe('BLASTI Backend & Logique Métier', () => {
  const activeJourneyId = '77777777-7777-7777-7777-777777777701'

  beforeEach(() => {
    // Réinitialiser les places disponibles pour le trajet de test
    const j = mockDb.journeys.find((x) => x.id === activeJourneyId)
    if (j) j.available_seats = 3
    // Réinitialiser la réservation r1 en statut 'confirmed'
    const r1 = mockDb.reservations.find((r) => r.id === 'r1')
    if (r1) {
      r1.status = 'confirmed'
      r1.boarded_at = null
    }
    mockDb.seats.forEach((s) => {
      if (s.seat_number >= 6) {
        s.status = 'available'
        s.reservation_id = null
        s.passenger_id = null
      }
    })
  })

  describe('Validation du Numéro Tunisien', () => {
    it('valide un numéro tunisien conforme (+216XXXXXXXX)', () => {
      expect(isValidTunisianPhone('+21622345678')).toBe(true)
      expect(isValidTunisianPhone('+21698123456')).toBe(true)
      expect(isValidTunisianPhone('+21650999888')).toBe(true)
    })

    it('rejette les numéros non tunisiens ou incomplets', () => {
      expect(isValidTunisianPhone('+33612345678')).toBe(false)
      expect(isValidTunisianPhone('22345678')).toBe(false)
      expect(isValidTunisianPhone('+21622345')).toBe(false)
    })

    it('formate correctement les 8 chiffres en +216', () => {
      expect(formatTunisianPhone('22345678')).toBe('+21622345678')
      expect(formatTunisianPhone('98 123 456')).toBe('+21698123456')
    })
  })

  describe('Réservation Atomique & Prévention du Surbooking', () => {
    it('calcule le prix total strictement côté serveur', () => {
      const res = mockCreateReservationAtomic(activeJourneyId, 2)
      expect(res.success).toBe(true)
      expect(res.seat_count).toBe(2)
      expect(res.price_per_seat).toBe(5.5)
      expect(res.total_price).toBe(11.0)
      expect(res.booking_reference).toMatch(/^BL-\d{4}-[A-Z0-9]{3}$/)
      expect(res.raw_qr_token).toBeDefined()
    })

    it('empêche une réservation qui dépasse les places disponibles (anti-surbooking)', () => {
      const j = mockDb.journeys.find((x) => x.id === activeJourneyId)!
      j.available_seats = 1

      expect(() => {
        mockCreateReservationAtomic(activeJourneyId, 2)
      }).toThrow(/Places insuffisantes/i)
    })

    it('empêche deux passagers simultanés de surréserver la dernière place', () => {
      const j = mockDb.journeys.find((x) => x.id === activeJourneyId)!
      j.available_seats = 1

      // Passager 1 réussit à réserver la dernière place
      const res1 = mockCreateReservationAtomic(activeJourneyId, 1)
      expect(res1.success).toBe(true)
      expect(j.available_seats).toBe(0)

      // Passager 2 tente de réserver la même place simultanément
      expect(() => {
        mockCreateReservationAtomic(activeJourneyId, 1)
      }).toThrow(/Places insuffisantes/i)
    })
  })

  describe('Annulation de Réservation', () => {
    it('libère les sièges et incrémente les places disponibles', () => {
      const j = mockDb.journeys.find((x) => x.id === activeJourneyId)!
      const initialAvailable = j.available_seats

      const booking = mockCreateReservationAtomic(activeJourneyId, 1)
      expect(j.available_seats).toBe(initialAvailable - 1)

      const cancelRes = mockCancelReservation(booking.reservation_id, 'Changement d’horaire')
      expect(cancelRes.success).toBe(true)
      expect(j.available_seats).toBe(initialAvailable)

      const cancelledBooking = mockDb.reservations.find((r) => r.id === booking.reservation_id)
      expect(cancelledBooking?.status).toBe('cancelled')
    })
  })

  describe('Fonctionnalité Conducteur: Passager Descendu (release_journey_seat)', () => {
    it('libère un siège occupé et met à jour les places disponibles', () => {
      const j = mockDb.journeys.find((x) => x.id === activeJourneyId)!
      const seatsBefore = j.available_seats

      // On s'assure que le siège 1 est occupé
      const seat1 = mockDb.seats.find((s) => s.journey_id === activeJourneyId && s.seat_number === 1)!
      seat1.status = 'occupied'

      const releaseResult = mockReleaseJourneySeat(activeJourneyId, 1)
      expect(releaseResult.success).toBe(true)
      expect(seat1.status).toBe('available')
      expect(j.available_seats).toBe(seatsBefore + 1)
    })
  })

  describe('Scan QR & Embarquement Conducteur', () => {
    it('valide un ticket valide et le passe à boarded', () => {
      const res = mockScanBoardingQr(activeJourneyId, 'BL-2408-73A')
      expect(res.success).toBe(true)
      expect(res.code).toBe('VALID')
      expect(res.passenger_name).toBeDefined()
    })

    it('interdit la réutilisation d’un QR déjà scanné (single-use guarantee)', () => {
      // Premier scan
      const firstScan = mockScanBoardingQr(activeJourneyId, 'BL-2408-73A')
      expect(firstScan.success).toBe(true)

      // Deuxième scan avec le même ticket
      const secondScan = mockScanBoardingQr(activeJourneyId, 'BL-2408-73A')
      expect(secondScan.success).toBe(false)
      expect(secondScan.code).toBe('ALREADY_USED')
    })

    it('rejette un ticket pour un mauvais token ou un trajet inexistant', () => {
      const scan = mockScanBoardingQr(activeJourneyId, 'FAUX_TOKEN_IMAGINAIRE')
      expect(scan.success).toBe(false)
      expect(scan.code).toBe('INVALID_TOKEN')
    })

    it('gère le cas où un siège est déjà libre lors d’une tentative de libération', () => {
      const seat6 = mockDb.seats.find((s) => s.journey_id === activeJourneyId && s.seat_number === 6)!
      seat6.status = 'available'
      const res = mockReleaseJourneySeat(activeJourneyId, 6)
      expect(res.success).toBe(true)
      expect(res.message).toContain('déjà libre')
    })
  })
})
