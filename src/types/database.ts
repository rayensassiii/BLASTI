// ============================================================================
// BLASTI - Types TypeScript du Schéma Supabase & PostgreSQL
// ============================================================================

export type UserRole = 'passenger' | 'driver' | 'admin'
export type DriverVerificationStatus = 'pending' | 'verified' | 'suspended' | 'rejected'
export type JourneyStatus = 'draft' | 'published' | 'boarding' | 'in_progress' | 'completed' | 'cancelled'
export type ReservationStatus = 'pending' | 'confirmed' | 'boarded' | 'completed' | 'cancelled' | 'expired' | 'no_show'
export type SeatStatus = 'available' | 'reserved' | 'occupied' | 'blocked'
export type WaitingStatus = 'waiting' | 'notified' | 'converted' | 'expired' | 'cancelled'

export interface Profile {
  id: string
  role: UserRole
  full_name: string
  phone: string | null
  avatar_url: string | null
  preferred_language: 'ar' | 'fr' | 'en'
  average_rating: number
  ratings_count: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface DriverProfile {
  id: string
  user_id: string
  verification_status: DriverVerificationStatus
  license_number: string
  license_document_url: string | null
  identity_document_url: string | null
  is_online: boolean
  current_latitude: number | null
  current_longitude: number | null
  location_updated_at: string | null
  created_at: string
  updated_at: string
  profile?: Profile
}

export interface Vehicle {
  id: string
  driver_id: string
  registration_number: string
  model: string
  color: string | null
  total_seat_capacity: number
  photo_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Station {
  id: string
  name: string
  city: string
  latitude: number
  longitude: number
  is_active: boolean
  created_at: string
}

export interface Journey {
  id: string
  driver_id: string
  vehicle_id: string
  departure_station_id: string
  destination_station_id: string
  departure_time: string
  estimated_duration_minutes: number
  price_per_seat: number
  currency: string
  total_seats: number
  available_seats: number
  share_live_location: boolean
  status: JourneyStatus
  started_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  created_at: string
  updated_at: string

  // Joins optionnels
  departure_station?: Station
  destination_station?: Station
  vehicle?: Vehicle
  driver?: DriverProfile & { profile?: Profile }
}

export interface JourneyLocation {
  id: string
  journey_id: string
  driver_id: string
  latitude: number
  longitude: number
  heading: number | null
  speed: number | null
  accuracy: number | null
  recorded_at: string
}

export interface Reservation {
  id: string
  booking_reference: string
  journey_id: string
  passenger_id: string
  seat_count: number
  price_per_seat: number
  total_price: number
  status: ReservationStatus
  qr_token_hash: string
  reserved_at: string
  confirmed_at: string | null
  boarded_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  created_at: string
  updated_at: string

  // Joins optionnels
  journey?: Journey
  passenger?: Profile
  seats?: ReservationSeat[]
}

export interface ReservationSeat {
  id: string
  journey_id: string
  reservation_id: string | null
  seat_number: number
  status: SeatStatus
  passenger_id: string | null
  occupied_at: string | null
  released_at: string | null
  created_at: string
  updated_at: string
  passenger?: Profile
}

export interface AppNotification {
  id: string
  user_id: string
  type: string
  title: string
  body: string
  data: Record<string, unknown>
  read_at: string | null
  created_at: string
}

export interface Rating {
  id: string
  journey_id: string
  reservation_id: string
  author_id: string
  target_user_id: string
  score: number
  comment: string | null
  created_at: string
}

export interface SavedDestination {
  id: string
  user_id: string
  station_id: string
  custom_label: string
  created_at: string
  station?: Station
}

export interface WaitingListEntry {
  id: string
  journey_id: string
  passenger_id: string
  requested_seats: number
  status: WaitingStatus
  created_at: string
  notified_at: string | null
}

export interface NearbyLouageResult {
  journey_id: string
  status: JourneyStatus
  departure_time: string
  estimated_duration_minutes: number
  price_per_seat: number
  currency: string
  available_seats: number
  total_seats: number
  departure_station_id: string
  departure_station_name: string
  departure_station_city: string
  departure_station_lat: number
  departure_station_lng: number
  destination_station_id: string
  destination_station_name: string
  destination_station_city: string
  destination_station_lat?: number
  destination_station_lng?: number
  driver_name: string
  driver_rating: number
  driver_phone: string | null
  vehicle_model: string
  vehicle_registration: string
  driver_current_lat: number | null
  driver_current_lng: number | null
  distance_km: number
}

export interface CreateReservationResult {
  success: boolean
  reservation_id: string
  booking_reference: string
  seat_count: number
  seats: number[]
  price_per_seat: number
  total_price: number
  raw_qr_token: string
  departure_time: string
  message: string
}

export interface ScanQrResult {
  success: boolean
  code: 'VALID' | 'ALREADY_USED' | 'CANCELLED' | 'INVALID_TOKEN' | 'WRONG_JOURNEY' | 'INVALID_JOURNEY' | 'UNAUTHORIZED_DRIVER' | 'INVALID_STATUS'
  message: string
  booking_reference?: string
  passenger_name?: string
  passenger_phone?: string | null
  seat_count?: number
  seats?: number[]
  boarded_at?: string
  cancellation_reason?: string | null
}

export interface ReleaseSeatResult {
  success: boolean
  message: string
  seat_number: number
  new_available_seats: number
}
