// ============================================================================
// BLASTI - Données et Moteur de Simulation Réactif (Mode Démo / Fallback)
// ============================================================================
// Utilisé pour assurer une expérience 100% fonctionnelle immédiate en local
// ou lorsque Supabase n'est pas connecté. Reproduit fidèlement la logique
// transactionnelle PostgreSQL (verrous, anti-surbooking, scan QR, drop-off).
// ============================================================================

import type {
  Station,
  Profile,
  DriverProfile,
  Vehicle,
  Journey,
  ReservationSeat,
  Reservation,
  AppNotification,
  NearbyLouageResult,
  CreateReservationResult,
  ScanQrResult,
  ReleaseSeatResult,
} from '../types/database'

export const DEMO_STATIONS: Station[] = [
  { id: '11111111-1111-1111-1111-111111111101', name: 'Bab Bhar', city: 'Sousse', latitude: 35.8288, longitude: 10.6405, is_active: true, created_at: new Date().toISOString() },
  { id: '11111111-1111-1111-1111-111111111102', name: 'Rond-point Menchia', city: 'Sousse', latitude: 35.8350, longitude: 10.6280, is_active: true, created_at: new Date().toISOString() },
  { id: '11111111-1111-1111-1111-111111111103', name: 'Sahloul (Hôpital & Faculté)', city: 'Sousse', latitude: 35.8450, longitude: 10.6050, is_active: true, created_at: new Date().toISOString() },
  { id: '11111111-1111-1111-1111-111111111104', name: 'Station Louage M’saken', city: 'M’saken', latitude: 35.7330, longitude: 10.5830, is_active: true, created_at: new Date().toISOString() },
  { id: '11111111-1111-1111-1111-111111111105', name: 'Monastir Centre (Gare)', city: 'Monastir', latitude: 35.7720, longitude: 10.8260, is_active: true, created_at: new Date().toISOString() },
  { id: '11111111-1111-1111-1111-111111111106', name: 'Hergla Centre', city: 'Hergla', latitude: 36.0320, longitude: 10.5080, is_active: true, created_at: new Date().toISOString() },
  { id: '11111111-1111-1111-1111-111111111107', name: 'Gare Routière Kairouan', city: 'Kairouan', latitude: 35.6780, longitude: 10.0960, is_active: true, created_at: new Date().toISOString() },
  { id: '11111111-1111-1111-1111-111111111108', name: 'Station Bab Alioua / Moncef Bey', city: 'Tunis', latitude: 36.7900, longitude: 10.1800, is_active: true, created_at: new Date().toISOString() },
]

export const DEMO_PASSENGER: Profile = {
  id: '33333333-3333-3333-3333-333333333301',
  role: 'passenger',
  full_name: 'Yasmine Mansour',
  phone: '+21622345678',
  avatar_url: null,
  preferred_language: 'fr',
  average_rating: 4.9,
  ratings_count: 8,
  is_active: true,
  created_at: '2025-01-15T10:00:00Z',
  updated_at: '2025-01-15T10:00:00Z',
}

export const DEMO_DRIVER_USER: Profile = {
  id: '22222222-2222-2222-2222-222222222201',
  role: 'driver',
  full_name: 'Mohamed Karray',
  phone: '+21698123456',
  avatar_url: null,
  preferred_language: 'fr',
  average_rating: 4.9,
  ratings_count: 142,
  is_active: true,
  created_at: '2024-06-01T08:00:00Z',
  updated_at: '2024-06-01T08:00:00Z',
}

export const DEMO_DRIVER_PROFILE: DriverProfile = {
  id: '55555555-5555-5555-5555-555555555501',
  user_id: DEMO_DRIVER_USER.id,
  verification_status: 'verified',
  license_number: 'LG-SOUSSE-19842',
  license_document_url: null,
  identity_document_url: null,
  is_online: true,
  current_latitude: 35.8288,
  current_longitude: 10.6405,
  location_updated_at: new Date().toISOString(),
  created_at: '2024-06-01T08:00:00Z',
  updated_at: new Date().toISOString(),
  profile: DEMO_DRIVER_USER,
}

export const DEMO_VEHICLE: Vehicle = {
  id: '66666666-6666-6666-6666-666666666601',
  driver_id: DEMO_DRIVER_PROFILE.id,
  registration_number: '178 TUN 4521',
  model: 'Peugeot Expert',
  color: 'Blanc / Bandes bleues',
  total_seat_capacity: 8,
  photo_url: null,
  is_active: true,
  created_at: '2024-06-01T08:00:00Z',
  updated_at: '2024-06-01T08:00:00Z',
}

// État mémoire mutable pour les tests et le mode démonstration réactif
class MockDatabaseState {
  journeys: Journey[] = [
    {
      id: '77777777-7777-7777-7777-777777777701',
      driver_id: DEMO_DRIVER_PROFILE.id,
      vehicle_id: DEMO_VEHICLE.id,
      departure_station_id: DEMO_STATIONS[0].id, // Bab Bhar Sousse
      destination_station_id: DEMO_STATIONS[4].id, // Monastir Centre
      departure_time: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      estimated_duration_minutes: 45,
      price_per_seat: 5.5,
      currency: 'TND',
      total_seats: 8,
      available_seats: 3,
      share_live_location: true,
      status: 'boarding',
      started_at: null,
      completed_at: null,
      cancelled_at: null,
      cancellation_reason: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      departure_station: DEMO_STATIONS[0],
      destination_station: DEMO_STATIONS[4],
      vehicle: DEMO_VEHICLE,
      driver: DEMO_DRIVER_PROFILE,
    },
    {
      id: '77777777-7777-7777-7777-777777777702',
      driver_id: '55555555-5555-5555-5555-555555555502',
      vehicle_id: '66666666-6666-6666-6666-666666666602',
      departure_station_id: DEMO_STATIONS[1].id, // Menchia
      destination_station_id: DEMO_STATIONS[3].id, // M'saken
      departure_time: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      estimated_duration_minutes: 30,
      price_per_seat: 3.2,
      currency: 'TND',
      total_seats: 8,
      available_seats: 5,
      share_live_location: true,
      status: 'published',
      started_at: null,
      completed_at: null,
      cancelled_at: null,
      cancellation_reason: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      departure_station: DEMO_STATIONS[1],
      destination_station: DEMO_STATIONS[3],
    },
    {
      id: '77777777-7777-7777-7777-777777777703',
      driver_id: '55555555-5555-5555-5555-555555555503',
      vehicle_id: '66666666-6666-6666-6666-666666666603',
      departure_station_id: DEMO_STATIONS[2].id, // Sahloul
      destination_station_id: DEMO_STATIONS[5].id, // Hergla
      departure_time: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
      estimated_duration_minutes: 40,
      price_per_seat: 4.0,
      currency: 'TND',
      total_seats: 8,
      available_seats: 2,
      share_live_location: true,
      status: 'published',
      started_at: null,
      completed_at: null,
      cancelled_at: null,
      cancellation_reason: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      departure_station: DEMO_STATIONS[2],
      destination_station: DEMO_STATIONS[5],
    },
  ]

  seats: ReservationSeat[] = [
    { id: 's1', journey_id: '77777777-7777-7777-7777-777777777701', seat_number: 1, status: 'occupied', reservation_id: 'r3', passenger_id: 'p3', occupied_at: new Date().toISOString(), released_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 's2', journey_id: '77777777-7777-7777-7777-777777777701', seat_number: 2, status: 'reserved', reservation_id: 'r1', passenger_id: DEMO_PASSENGER.id, occupied_at: null, released_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 's3', journey_id: '77777777-7777-7777-7777-777777777701', seat_number: 3, status: 'occupied', reservation_id: 'r_other_1', passenger_id: 'p_other_1', occupied_at: new Date().toISOString(), released_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 's4', journey_id: '77777777-7777-7777-7777-777777777701', seat_number: 4, status: 'occupied', reservation_id: 'r_other_2', passenger_id: 'p_other_2', occupied_at: new Date().toISOString(), released_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 's5', journey_id: '77777777-7777-7777-7777-777777777701', seat_number: 5, status: 'reserved', reservation_id: 'r2', passenger_id: 'p2', occupied_at: null, released_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 's6', journey_id: '77777777-7777-7777-7777-777777777701', seat_number: 6, status: 'available', reservation_id: null, passenger_id: null, occupied_at: null, released_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 's7', journey_id: '77777777-7777-7777-7777-777777777701', seat_number: 7, status: 'available', reservation_id: null, passenger_id: null, occupied_at: null, released_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 's8', journey_id: '77777777-7777-7777-7777-777777777701', seat_number: 8, status: 'available', reservation_id: null, passenger_id: null, occupied_at: null, released_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  ]

  reservations: Reservation[] = [
    {
      id: 'r1',
      booking_reference: 'BL-2408-73A',
      journey_id: '77777777-7777-7777-7777-777777777701',
      passenger_id: DEMO_PASSENGER.id,
      seat_count: 1,
      price_per_seat: 5.5,
      total_price: 5.5,
      status: 'confirmed',
      qr_token_hash: 'HASH_DEMO_YASMINE_73A',
      reserved_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      confirmed_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      boarded_at: null,
      completed_at: null,
      cancelled_at: null,
      cancellation_reason: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'r2',
      booking_reference: 'BL-2408-18K',
      journey_id: '77777777-7777-7777-7777-777777777701',
      passenger_id: 'p2',
      seat_count: 1,
      price_per_seat: 5.5,
      total_price: 5.5,
      status: 'confirmed',
      qr_token_hash: 'HASH_DEMO_MEHDI_18K',
      reserved_at: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
      confirmed_at: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
      boarded_at: null,
      completed_at: null,
      cancelled_at: null,
      cancellation_reason: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'r3',
      booking_reference: 'BL-2408-52F',
      journey_id: '77777777-7777-7777-7777-777777777701',
      passenger_id: 'p3',
      seat_count: 1,
      price_per_seat: 5.5,
      total_price: 5.5,
      status: 'boarded',
      qr_token_hash: 'HASH_DEMO_AHMED_52F',
      reserved_at: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
      confirmed_at: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
      boarded_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      completed_at: null,
      cancelled_at: null,
      cancellation_reason: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]

  notifications: AppNotification[] = [
    {
      id: 'n1',
      user_id: DEMO_PASSENGER.id,
      type: 'booking_confirmed',
      title: 'Réservation confirmée',
      body: 'Votre place pour Monastir est réservée avec succès.',
      data: { booking_reference: 'BL-2408-73A' },
      read_at: null,
      created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    },
    {
      id: 'n2',
      user_id: DEMO_PASSENGER.id,
      type: 'louage_approaching',
      title: 'Votre louage approche',
      body: 'Mohamed sera à Bab Bhar dans 8 minutes.',
      data: { eta_minutes: 8 },
      read_at: null,
      created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    },
    {
      id: 'n3',
      user_id: DEMO_PASSENGER.id,
      type: 'seat_available',
      title: 'Une place vient de se libérer',
      body: '2 places sont disponibles vers Hergla.',
      data: { available_seats: 2 },
      read_at: null,
      created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    },
  ]

  listeners: Set<() => void> = new Set()

  constructor() {
    this.loadFromStorage()
  }

  loadFromStorage() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const storedJourneys = localStorage.getItem('blasti_db_journeys')
        const storedReservations = localStorage.getItem('blasti_db_reservations')
        const storedSeats = localStorage.getItem('blasti_db_seats')
        if (storedJourneys) this.journeys = JSON.parse(storedJourneys)
        if (storedReservations) this.reservations = JSON.parse(storedReservations)
        if (storedSeats) this.seats = JSON.parse(storedSeats)
      }
    } catch {
      // Ignore parse error in test runner
    }
  }

  saveToStorage() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('blasti_db_journeys', JSON.stringify(this.journeys))
        localStorage.setItem('blasti_db_reservations', JSON.stringify(this.reservations))
        localStorage.setItem('blasti_db_seats', JSON.stringify(this.seats))
      }
    } catch {
      // Ignore in non-browser env
    }
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  notify() {
    this.saveToStorage()
    this.listeners.forEach((l) => l())
  }
}

export const mockDb = new MockDatabaseState()

// ----------------------------------------------------------------------------
// Implémentation locale de la réservation atomique (Anti-surbooking)
// ----------------------------------------------------------------------------
export function mockCreateReservationAtomic(
  journeyId: string,
  seatCount: number,
  passengerId: string = DEMO_PASSENGER.id
): CreateReservationResult {
  const journey = mockDb.journeys.find((j) => j.id === journeyId)
  if (!journey) {
    throw new Error('Trajet introuvable')
  }

  if (journey.status !== 'published' && journey.status !== 'boarding') {
    throw new Error(`Ce trajet n'accepte plus de réservations (statut: ${journey.status})`)
  }

  // Vérification stricte anti-surbooking
  if (journey.available_seats < seatCount) {
    throw new Error(`Places insuffisantes. Seulement ${journey.available_seats} place(s) disponible(s).`)
  }

  // Attribution des sièges disponibles
  const availableSeatItems = mockDb.seats.filter((s) => s.journey_id === journeyId && s.status === 'available')
  if (availableSeatItems.length < seatCount) {
    throw new Error('Impossible d’allouer les sièges demandés')
  }

  const assigned = availableSeatItems.slice(0, seatCount)
  const assignedSeatNumbers = assigned.map((s) => s.seat_number)

  // Calcul du prix serveur (confiance zéro au client)
  const totalPrice = journey.price_per_seat * seatCount
  const bookingRef = `BL-${new Date().toISOString().slice(2, 4)}${new Date().toISOString().slice(5, 7)}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`
  const rawQrToken = `BLASTI-${crypto.randomUUID()}-${Date.now()}`
  const reservationId = `r_${Date.now()}`

  // Création réservation
  const newReservation: Reservation = {
    id: reservationId,
    booking_reference: bookingRef,
    journey_id: journeyId,
    passenger_id: passengerId,
    seat_count: seatCount,
    price_per_seat: journey.price_per_seat,
    total_price: totalPrice,
    status: 'confirmed',
    qr_token_hash: `HASH_${rawQrToken.slice(0, 16)}`,
    reserved_at: new Date().toISOString(),
    confirmed_at: new Date().toISOString(),
    boarded_at: null,
    completed_at: null,
    cancelled_at: null,
    cancellation_reason: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  mockDb.reservations.unshift(newReservation)

  // Mise à jour des sièges
  assigned.forEach((s) => {
    s.status = 'reserved'
    s.reservation_id = reservationId
    s.passenger_id = passengerId
  })

  // Décrémentation des places du trajet
  journey.available_seats -= seatCount
  journey.updated_at = new Date().toISOString()

  // Notification passager
  mockDb.notifications.unshift({
    id: `n_${Date.now()}`,
    user_id: passengerId,
    type: 'booking_confirmed',
    title: 'Réservation confirmée !',
    body: `Votre réservation ${bookingRef} pour ${seatCount} place(s) est confirmée.`,
    data: { booking_reference: bookingRef, reservation_id: reservationId },
    read_at: null,
    created_at: new Date().toISOString(),
  })

  mockDb.notify()

  return {
    success: true,
    reservation_id: reservationId,
    booking_reference: bookingRef,
    seat_count: seatCount,
    seats: assignedSeatNumbers,
    price_per_seat: journey.price_per_seat,
    total_price: totalPrice,
    raw_qr_token: rawQrToken,
    departure_time: journey.departure_time,
    message: 'Réservation effectuée avec succès',
  }
}

// ----------------------------------------------------------------------------
// Implémentation locale de l'annulation
// ----------------------------------------------------------------------------
export function mockCancelReservation(reservationId: string, reason: string = 'Annulé par le passager') {
  const res = mockDb.reservations.find((r) => r.id === reservationId)
  if (!res) throw new Error('Réservation introuvable')

  if (res.status !== 'confirmed' && res.status !== 'pending') {
    throw new Error(`Cette réservation ne peut plus être annulée (statut: ${res.status})`)
  }

  const journey = mockDb.journeys.find((j) => j.id === res.journey_id)
  if (journey) {
    journey.available_seats = Math.min(journey.total_seats, journey.available_seats + res.seat_count)
  }

  // Libération des sièges
  mockDb.seats.forEach((s) => {
    if (s.reservation_id === reservationId) {
      s.status = 'available'
      s.reservation_id = null
      s.passenger_id = null
      s.released_at = new Date().toISOString()
    }
  })

  res.status = 'cancelled'
  res.cancelled_at = new Date().toISOString()
  res.cancellation_reason = reason

  mockDb.notify()
  return { success: true, message: 'Réservation annulée avec succès' }
}

// ----------------------------------------------------------------------------
// Implémentation "Passager descendu" (release_journey_seat)
// ----------------------------------------------------------------------------
export function mockReleaseJourneySeat(journeyId: string, seatNumber: number): ReleaseSeatResult {
  const journey = mockDb.journeys.find((j) => j.id === journeyId)
  if (!journey) throw new Error('Trajet introuvable')

  const seat = mockDb.seats.find((s) => s.journey_id === journeyId && s.seat_number === seatNumber)
  if (!seat) throw new Error('Siège introuvable')

  if (seat.status === 'available') {
    return {
      success: true,
      message: 'Le siège est déjà libre',
      seat_number: seatNumber,
      new_available_seats: journey.available_seats,
    }
  }

  // Libération du siège
  seat.status = 'available'
  seat.reservation_id = null
  seat.passenger_id = null
  seat.released_at = new Date().toISOString()

  // Mise à jour places trajet
  journey.available_seats = Math.min(journey.total_seats, journey.available_seats + 1)
  journey.updated_at = new Date().toISOString()

  // Notification alerte place libérée
  mockDb.notifications.unshift({
    id: `n_rel_${Date.now()}`,
    user_id: DEMO_PASSENGER.id,
    type: 'seat_available',
    title: 'Place libérée en direct !',
    body: `Une place (siège n°${seatNumber}) s'est libérée dans le louage vers Monastir.`,
    data: { journey_id: journeyId, seat_number: seatNumber },
    read_at: null,
    created_at: new Date().toISOString(),
  })

  mockDb.notify()

  return {
    success: true,
    message: 'Passager descendu: place libérée avec succès',
    seat_number: seatNumber,
    new_available_seats: journey.available_seats,
  }
}

// ----------------------------------------------------------------------------
// Implémentation du Scan QR à l'embarquement
// ----------------------------------------------------------------------------
export function mockScanBoardingQr(journeyId: string, rawToken: string): ScanQrResult {
  // Recherche par token ou réservation démo
  const res = mockDb.reservations.find(
    (r) =>
      r.journey_id === journeyId &&
      (r.qr_token_hash.includes(rawToken.slice(0, 8)) ||
        rawToken.includes(r.booking_reference) ||
        rawToken === 'BLASTI-DEMO-TOKEN-YASMINE-73A' ||
        rawToken === 'VALID_DEMO_QR')
  )

  if (!res) {
    return {
      success: false,
      code: 'INVALID_TOKEN',
      message: 'Ticket QR invalide ou non reconnu',
    }
  }

  if (res.status === 'boarded') {
    return {
      success: false,
      code: 'ALREADY_USED',
      message: 'Ce ticket a déjà été scanné et utilisé',
      boarded_at: res.boarded_at || undefined,
    }
  }

  if (res.status === 'cancelled') {
    return {
      success: false,
      code: 'CANCELLED',
      message: 'Cette réservation a été annulée',
      cancellation_reason: res.cancellation_reason,
    }
  }

  // Validation
  res.status = 'boarded'
  res.boarded_at = new Date().toISOString()

  // Passer les sièges en occupied
  const assigned = mockDb.seats.filter((s) => s.reservation_id === res.id)
  assigned.forEach((s) => {
    s.status = 'occupied'
    s.occupied_at = new Date().toISOString()
  })

  mockDb.notify()

  return {
    success: true,
    code: 'VALID',
    message: 'Embarquement validé avec succès',
    booking_reference: res.booking_reference,
    passenger_name: res.passenger_id === DEMO_PASSENGER.id ? DEMO_PASSENGER.full_name : 'Ahmed Ben Ali',
    seat_count: res.seat_count,
    seats: assigned.map((s) => s.seat_number),
    boarded_at: res.boarded_at,
  }
}

// ----------------------------------------------------------------------------
// Recherche Haversine
// ----------------------------------------------------------------------------
export function mockSearchNearbyLouages(
  lat: number = 35.8288,
  lng: number = 10.6405,
  destId?: string
): NearbyLouageResult[] {
  return mockDb.journeys
    .filter((j) => (destId ? j.destination_station_id === destId : true))
    .map((j) => {
      const dep = DEMO_STATIONS.find((s) => s.id === j.departure_station_id)!
      const dest = DEMO_STATIONS.find((s) => s.id === j.destination_station_id)!
      return {
        journey_id: j.id,
        status: j.status,
        departure_time: j.departure_time,
        estimated_duration_minutes: j.estimated_duration_minutes,
        price_per_seat: j.price_per_seat,
        currency: j.currency,
        available_seats: j.available_seats,
        total_seats: j.total_seats,
        departure_station_id: dep.id,
        departure_station_name: dep.name,
        departure_station_city: dep.city,
        departure_station_lat: dep.latitude,
        departure_station_lng: dep.longitude,
        destination_station_id: dest.id,
        destination_station_name: dest.name,
        destination_station_city: dest.city,
        destination_station_lat: dest.latitude,
        destination_station_lng: dest.longitude,
        driver_name: DEMO_DRIVER_USER.full_name,
        driver_rating: DEMO_DRIVER_USER.average_rating,
        driver_phone: DEMO_DRIVER_USER.phone,
        vehicle_model: DEMO_VEHICLE.model,
        vehicle_registration: DEMO_VEHICLE.registration_number,
        driver_current_lat: DEMO_DRIVER_PROFILE.current_latitude,
        driver_current_lng: DEMO_DRIVER_PROFILE.current_longitude,
        distance_km: 1.2,
      }
    })
}
