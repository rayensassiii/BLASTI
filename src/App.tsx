import { useState, useEffect } from 'react'
import type { Journey, Reservation, NearbyLouageResult, Station } from './types/database'
import LeafletMap from './components/LeafletMap'
import {
  signInWithPhonePassword,
  signUpWithPhone,
  signInWithGoogle,
  signOut,
} from './services/auth'
import {
  getStations,
  searchNearbyJourneys,
  getDriverActiveJourney,
  publishJourney,
  releaseJourneySeat,
} from './services/journeys'
import {
  bookReservation,
  cancelReservation,
  getMyReservations,
  getJourneyReservations,
  scanTicketQr,
} from './services/reservations'
import { sendDriverLocation } from './services/locations'
import { useNotifications } from './hooks/useNotifications'
import { useRealtimeJourney } from './hooks/useRealtimeJourney'
import { useAuth } from './hooks/useAuth'
import { formatTND, formatTunisTime } from './lib/supabase'
import { DEMO_STATIONS, mockDb } from './lib/mockData'

type Screen =
  | 'splash'
  | 'onboarding'
  | 'auth'
  | 'home'
  | 'search'
  | 'bookings'
  | 'notifications'
  | 'profile'
  | 'reserve'
  | 'ticket'
  | 'driver'
  | 'publish'
  | 'journey'
  | 'reservations'
  | 'earnings'

type IconName =
  | 'arrow'
  | 'back'
  | 'bell'
  | 'booking'
  | 'calendar'
  | 'car'
  | 'check'
  | 'chevron'
  | 'clock'
  | 'filter'
  | 'home'
  | 'location'
  | 'map'
  | 'minus'
  | 'more'
  | 'phone'
  | 'plus'
  | 'profile'
  | 'qr'
  | 'route'
  | 'scan'
  | 'search'
  | 'seat'
  | 'star'
  | 'ticket'
  | 'wallet'

const paths: Record<IconName, React.ReactNode> = {
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  back: <><path d="M19 12H5m6-6-6 6 6 6" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
  booking: <><rect x="4" y="3" width="16" height="18" rx="3" /><path d="M8 7h8M8 12h8M8 17h5" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  car: <><path d="m5 17-1 3M19 17l1 3M3 14l2-6a3 3 0 0 1 3-2h8a3 3 0 0 1 3 2l2 6v4H3v-4Z" /><path d="M7 14h.01M17 14h.01M5 10h14" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  chevron: <path d="m9 18 6-6-6-6" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  filter: <><path d="M4 6h16M7 12h10M10 18h4" /></>,
  home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></>,
  location: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" /><path d="M9 3v15M15 6v15" /></>,
  minus: <path d="M5 12h14" />,
  more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>,
  phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  qr: <><rect x="3" y="3" width="6" height="6" /><rect x="15" y="3" width="6" height="6" /><rect x="3" y="15" width="6" height="6" /><path d="M15 15h3v3h3M15 21h3M21 15v3" /></>,
  route: <><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18h3a3 3 0 0 0 3-3V9a3 3 0 0 1 3-3" /></>,
  scan: <><path d="M3 8V4a1 1 0 0 1 1-1h4M16 3h4a1 1 0 0 1 1 1v4M21 16v4a1 1 0 0 1-1 1h-4M8 21H4a1 1 0 0 1-1-1v-4" /><path d="M7 12h10" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  seat: <><path d="M7 11V6a3 3 0 0 1 6 0v5M5 11h10a3 3 0 0 1 3 3v6H4v-6a3 3 0 0 1 1-2.2" /><path d="M8 20v2M16 20v2" /></>,
  star: <path d="m12 2 3 6 6.5 1-4.7 4.6 1.1 6.4-5.9-3.1L6.1 20l1.1-6.4L2.5 9 9 8l3-6Z" />,
  ticket: <><path d="M3 7a2 2 0 0 0 0 4v6h18v-6a2 2 0 0 0 0-4V5H3v2Z" /><path d="M13 5v12" /></>,
  wallet: <><path d="M3 6h16a2 2 0 0 1 2 2v11H5a2 2 0 0 1-2-2V6Z" /><path d="M3 6V5a2 2 0 0 1 2-2h12v3M16 11h5v4h-5a2 2 0 0 1 0-4Z" /></>,
}

function Icon({ name, size = 20, className = '' }: { name: IconName; size?: number; className?: string }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function Logo({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return <div className={`logo ${light ? 'logo-light' : ''}`}>
    <span className="logo-pin"><Icon name="location" size={compact ? 17 : 22} /></span>
    <span>BLASTI</span>
  </div>
}

function Avatar({ name = 'MK', yellow = false }: { name?: string; yellow?: boolean }) {
  return <div className={`avatar ${yellow ? 'avatar-yellow' : ''}`}>{name}</div>
}

function Button({ children, onClick, variant = 'primary', icon, disabled }: { children: React.ReactNode; onClick?: () => void; variant?: 'primary' | 'yellow' | 'soft' | 'danger'; icon?: IconName; disabled?: boolean }) {
  return <button className={`button button-${variant}`} onClick={onClick} disabled={disabled}>{children}{icon && <Icon name={icon} size={19} />}</button>
}

const passengerNav: { id: Screen; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Accueil', icon: 'home' },
  { id: 'search', label: 'Recherche', icon: 'search' },
  { id: 'bookings', label: 'Réservations', icon: 'ticket' },
  { id: 'notifications', label: 'Alertes', icon: 'bell' },
  { id: 'profile', label: 'Profil', icon: 'profile' },
]

const driverNav: { id: Screen; label: string; icon: IconName }[] = [
  { id: 'driver', label: 'Tableau', icon: 'home' },
  { id: 'journey', label: 'Trajet', icon: 'route' },
  { id: 'reservations', label: 'Passagers', icon: 'booking' },
  { id: 'earnings', label: 'Revenus', icon: 'wallet' },
  { id: 'profile', label: 'Profil', icon: 'profile' },
]

function BottomNav({ current, onGo, driver = false, unread = 0 }: { current: Screen; onGo: (s: Screen) => void; driver?: boolean; unread?: number }) {
  const nav = driver ? driverNav : passengerNav
  return <nav className="bottom-nav">
    {nav.map(item => <button key={item.id} className={current === item.id ? 'active' : ''} onClick={() => onGo(item.id)}>
      <span className="nav-icon">
        <Icon name={item.icon} size={21} />
        {item.id === 'notifications' && unread > 0 && <i />}
      </span>
      <small>{item.label}</small>
    </button>)}
  </nav>
}

function TopBar({ title, onBack, action, dark = false }: { title: string; onBack?: () => void; action?: React.ReactNode; dark?: boolean }) {
  return <header className={`topbar ${dark ? 'topbar-dark' : ''}`}>
    {onBack ? <button className="icon-button" onClick={onBack} aria-label="Retour"><Icon name="back" /></button> : <Logo light={dark} compact />}
    <strong>{title}</strong>
    <div className="top-action">{action || <button className="icon-button" aria-label="Menu"><Icon name="more" /></button>}</div>
  </header>
}

function Splash({ onDone }: { onDone: () => void }) {
  return <main className="splash" onClick={onDone}>
    <div className="splash-route"><span /><span /><span /></div>
    <div className="splash-logo">
      <div className="big-pin"><Icon name="location" size={44} /></div>
      <h1>BLASTI</h1>
      <p dir="rtl">بلاصتك، ورحلتك</p>
    </div>
    <button className="splash-continue" onClick={onDone}>Découvrir l’expérience <Icon name="arrow" /></button>
  </main>
}

const onboarding = [
  { icon: 'location' as IconName, kicker: 'AUTOUR DE VOUS', title: 'Trouvez votre louage, sans attendre.', text: 'Visualisez les louages proches et leurs destinations en direct.', visual: 'map' },
  { icon: 'seat' as IconName, kicker: 'PLACES EN DIRECT', title: 'La bonne place, au bon moment.', text: 'Consultez les places disponibles avant même d’arriver à la station.', visual: 'seats' },
  { icon: 'ticket' as IconName, kicker: 'RÉSERVEZ SIMPLEMENT', title: 'Réservez. Montez. Partez.', text: 'Votre place est sécurisée et votre ticket toujours dans votre poche.', visual: 'ticket' },
]

function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const item = onboarding[step]
  return <main className="onboarding">
    <div className="onboard-top"><Logo /><button onClick={onDone}>Passer</button></div>
    <div className={`onboard-art art-${item.visual}`}>
      <div className="art-grid" />
      <div className="art-route" />
      <span className="art-badge"><Icon name={item.icon} size={27} /></span>
      {item.visual === 'map' && <><span className="mini-car car-one"><Icon name="car" /></span><span className="mini-car car-two"><Icon name="car" /></span><div className="you-dot" /></>}
      {item.visual === 'seats' && <div className="seat-demo">{[0,1,2,3,4,5,6,7].map((n) => <span key={n} className={n < 3 ? 'taken' : n < 5 ? 'held' : ''}><Icon name="seat" /></span>)}</div>}
      {item.visual === 'ticket' && <div className="mini-ticket"><Logo compact /><b>Sousse → Monastir</b><div className="fake-qr" /></div>}
    </div>
    <section className="onboard-copy">
      <span className="eyebrow">{item.kicker}</span>
      <h1>{item.title}</h1>
      <p>{item.text}</p>
      <div className="dots">{onboarding.map((_, i) => <i key={i} className={i === step ? 'active' : ''} />)}</div>
      <Button icon="arrow" onClick={() => step < 2 ? setStep(step + 1) : onDone()}>{step === 2 ? 'Commencer' : 'Continuer'}</Button>
    </section>
  </main>
}

function Auth({ onPassenger, onDriver }: { onPassenger: () => void; onDriver: () => void }) {
  const [signup, setSignup] = useState(false)
  const [phone, setPhone] = useState('22 345 678')
  const [password, setPassword] = useState('123456')
  const [fullName, setFullName] = useState('Yasmine Mansour')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    setError(null)
    setLoading(true)
    try {
      let role = 'passenger'
      if (signup) {
        const res = await signUpWithPhone({ phone, password, fullName })
        if (res.role) role = res.role
      } else {
        const res = await signInWithPhonePassword(phone, password)
        if (res.role) role = res.role
      }
      if (role === 'driver') {
        onDriver()
      } else {
        onPassenger()
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    try {
      await signInWithGoogle()
      onPassenger()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur Google OAuth')
    }
  }

  return <main className="auth page-scroll">
    <div className="auth-hero">
      <Logo light />
      <div>
        <span className="eyebrow yellow-text">BIENVENUE À BORD</span>
        <h1>Votre trajet commence ici.</h1>
        <p>Connectez-vous pour voyager en toute sérénité.</p>
      </div>
    </div>
    <section className="auth-card">
      <div className="segmented">
        <button className={!signup ? 'active' : ''} onClick={() => { setSignup(false); setError(null) }}>Connexion</button>
        <button className={signup ? 'active' : ''} onClick={() => { setSignup(true); setError(null) }}>Créer un compte</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
        <button
          type="button"
          style={{ padding: '8px 6px', background: '#edf1f5', borderRadius: '10px', fontSize: '10px', fontWeight: 800 }}
          onClick={() => { setPhone('22 345 678'); setFullName('Yasmine Mansour'); setPassword('123456'); setSignup(false) }}
        >
          👤 Passager Démo
        </button>
        <button
          type="button"
          style={{ padding: '8px 6px', background: '#fff6d2', borderRadius: '10px', fontSize: '10px', fontWeight: 800 }}
          onClick={() => { setPhone('98 123 456'); setFullName('Mohamed Karray'); setPassword('123456'); setSignup(false) }}
        >
          🚐 Louagiste Démo
        </button>
      </div>
      {error && <div style={{ color: '#ef5350', fontSize: '11px', marginBottom: '10px', fontWeight: 600 }}>{error}</div>}
      {signup && <label>Nom complet<input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Votre nom et prénom" /></label>}
      <label>Numéro de téléphone<div className="phone-input"><span>🇹🇳 +216</span><input inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="22 345 678" /></div></label>
      <label>Mot de passe<div className="input-wrap"><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" /><span>Afficher</span></div></label>
      {!signup && <button className="forgot" onClick={() => setError('Contactez le support ou connectez-vous')}>Mot de passe oublié ?</button>}
      <Button onClick={handleSubmit} disabled={loading}>{loading ? 'Chargement...' : signup ? 'Créer mon compte' : 'Se connecter'}</Button>
      <div className="divider"><span>ou continuer avec</span></div>
      <button className="google" onClick={handleGoogle}><b>G</b> Google</button>
      <button className="driver-link" onClick={onDriver}><Icon name="car" /> Je suis louagiste <Icon name="chevron" /></button>
    </section>
  </main>
}

// ─── Carte Leaflet pour le conducteur (trajet actif) ─────────────────────────
function DriverLeafletMap({ driverLocation }: { driverLocation?: [number, number] | null }) {
  const depStation: [number, number] = [35.8288, 10.6405] // Bab Bhar Sousse
  const destStation: [number, number] = [35.7720, 10.8260] // Monastir

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <LeafletMap
        mode="driver"
        driverLocation={driverLocation ?? [35.8288, 10.6405]}
        routeFrom={depStation}
        routeTo={destStation}
      />
    </div>
  )
}

// ─── Home Screen (carte réelle Leaflet + OSM) ─────────────────────────────────
function Home({
  onGo,
  onSelectJourney,
  onQuickSearch,
}: {
  onGo: (s: Screen) => void
  onSelectJourney: (j: NearbyLouageResult) => void
  onQuickSearch: (destName: string) => void
}) {
  const [selectedLouage, setSelectedLouage] = useState<NearbyLouageResult | null>(null)
  const [louages, setLouages] = useState<NearbyLouageResult[]>([])
  const [gpsBadge, setGpsBadge] = useState<string | null>(null)
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)
  const { unreadCount } = useNotifications()

  // Itinéraire entre départ et destination du louage sélectionné
  const routeFrom: [number, number] | null = selectedLouage
    ? [selectedLouage.departure_station_lat, selectedLouage.departure_station_lng]
    : null
  const routeTo: [number, number] | null =
    selectedLouage?.destination_station_lat && selectedLouage?.destination_station_lng
      ? [selectedLouage.destination_station_lat, selectedLouage.destination_station_lng]
      : null

  const refreshLouages = (lat?: number, lng?: number) => {
    searchNearbyJourneys({ latitude: lat, longitude: lng }).then(data => {
      setLouages(data)
      if (!selectedLouage && data.length > 0) {
        setSelectedLouage(data[0])
      }
    })
  }

  useEffect(() => {
    refreshLouages()
    const interval = setInterval(() => { refreshLouages() }, 10000)
    return () => clearInterval(interval)
  }, [])

  const handleLocateMe = () => {
    if ('geolocation' in navigator) {
      setGpsBadge('Recherche GPS du navigateur...')
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords
          setUserLocation([latitude, longitude])
          setGpsBadge(`📍 GPS Réel : ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`)
          refreshLouages(latitude, longitude)
          setTimeout(() => setGpsBadge(null), 5000)
        },
        () => {
          setGpsBadge('GPS non autorisé – Position démo Sousse')
          setUserLocation([35.8288, 10.6405])
          setTimeout(() => setGpsBadge(null), 4000)
        },
        { timeout: 7000 }
      )
    }
  }

  return <main className="screen with-nav home-screen">
    {/* Barre de recherche flottante */}
    <div className="map-top">
      <div className="map-search"><Icon name="search" /><button onClick={() => onGo('search')}>Où allez-vous ?</button><Avatar name="YM" /></div>
      <div className="map-pills">
        <button className="active"><Icon name="car" size={16} /> Louages</button>
        <button onClick={() => onGo('search')}><Icon name="map" size={16} /> Stations</button>
      </div>
    </div>
    {gpsBadge && <div style={{ position: 'absolute', top: '90px', left: '16px', right: '16px', zIndex: 410, background: '#142b45', color: '#ffd447', padding: '7px 12px', borderRadius: '12px', fontSize: '9px', fontWeight: 800, textAlign: 'center', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>{gpsBadge}</div>}

    {/* Carte réelle OpenStreetMap avec marqueurs et itinéraire OSRM */}
    <div style={{ position: 'absolute', inset: '0 0 270px 0', zIndex: 1 }}>
      <LeafletMap
        mode="passenger"
        vehicles={louages}
        selectedVehicle={selectedLouage}
        onSelectVehicle={(v) => setSelectedLouage(v)}
        userLocation={userLocation}
        routeFrom={routeFrom}
        routeTo={routeTo}
      />
    </div>

    <button className="locate" style={{ zIndex: 420 }} onClick={handleLocateMe} aria-label="Localiser"><Icon name="location" /></button>

    {!selectedLouage ? <section className="destination-sheet">
      <div className="sheet-handle" />
      <span className="eyebrow">PLANIFIEZ VOTRE TRAJET</span>
      <h2 dir="rtl">وين تحب تمشي؟</h2>
      <button className="destination-input" onClick={() => onGo('search')}><span className="pin-dot" /><span><small>Destination</small><b>Rechercher une ville ou station</b></span><Icon name="search" /></button>
      <div className="quick-destinations">
        {['Tunis', 'Monastir', "M'saken", 'Hergla', 'Sahloul', 'Kairouan'].map((d) => (
          <button key={d} onClick={() => onQuickSearch(d)}>
            <span><Icon name="location" size={17} /></span>
            {d}
          </button>
        ))}
      </div>
    </section> : <LouageSheet
      louage={selectedLouage}
      onClose={() => setSelectedLouage(null)}
      onReserve={() => {
        onSelectJourney(selectedLouage)
        onGo('reserve')
      }}
    />}
    <BottomNav current="home" onGo={onGo} unread={unreadCount} />
  </main>
}

function LouageSheet({ louage, onClose, onReserve }: { louage: NearbyLouageResult; onClose: () => void; onReserve: () => void }) {
  return <section className="louage-sheet">
    <button className="sheet-handle" onClick={onClose} aria-label="Fermer" />
    <div className="driver-row">
      <Avatar name={louage.driver_name.slice(0, 2).toUpperCase()} yellow />
      <div><h3>{louage.driver_name} <span className="verified"><Icon name="check" size={11} /></span></h3><p><Icon name="star" size={14} /> <b>{louage.driver_rating}</b> · {louage.vehicle_model} · <span>{louage.vehicle_registration}</span></p></div>
      <button className="call" onClick={() => alert(`Appel vers ${louage.driver_phone || '+216 98 123 456'}`)} aria-label="Appeler"><Icon name="phone" /></button>
    </div>
    <div className="trip-route">
      <div className="route-dots"><i /><span /><i /></div>
      <div><p><small>DÉPART · À {louage.distance_km} KM</small><b>{louage.departure_station_name}</b></p><p><small>DESTINATION</small><b>{louage.destination_station_name}</b></p></div>
      <div className="eta"><b>8 min</b><small>ARRIVÉE</small><b>{formatTunisTime(louage.departure_time)}</b></div>
    </div>
    <div className="trip-stats">
      <div><span className="stat-icon"><Icon name="seat" /></span><p><b>{louage.available_seats} / {louage.total_seats}</b><small>places libres</small></p></div>
      <div><span className="stat-icon"><Icon name="wallet" /></span><p><b>{formatTND(louage.price_per_seat)}</b><small>par personne*</small></p></div>
      <div><span className="live-dot" /><p><b>{louage.status === 'boarding' ? 'Embarquement' : 'Publié'}</b><small>départ imminent</small></p></div>
    </div>
    <Button variant="yellow" icon="arrow" onClick={onReserve}>Réserver une place</Button>
    <small className="fare-note">* Tarif de démonstration, modifiable par le conducteur.</small>
  </section>
}

function SearchScreen({
  initialDest,
  onGo,
  onSelectJourney,
}: {
  initialDest?: string | null
  onGo: (s: Screen) => void
  onSelectJourney: (j: NearbyLouageResult) => void
}) {
  const [louages, setLouages] = useState<NearbyLouageResult[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [depStationId, setDepStationId] = useState<string>('11111111-1111-1111-1111-111111111101')
  const [destStationId, setDestStationId] = useState<string>('11111111-1111-1111-1111-111111111105')
  const [sortBy, setSortBy] = useState<'near' | 'fast' | 'price'>('near')

  useEffect(() => {
    getStations().then((sList) => {
      setStations(sList)
      if (initialDest) {
        const found = sList.find((s) => s.city.toLowerCase().includes(initialDest.toLowerCase()) || s.name.toLowerCase().includes(initialDest.toLowerCase()))
        if (found) setDestStationId(found.id)
      }
    })
  }, [initialDest])

  useEffect(() => {
    searchNearbyJourneys({ destinationStationId: destStationId }).then(setLouages)
  }, [destStationId])

  const handleSwap = () => {
    const temp = depStationId
    setDepStationId(destStationId)
    setDestStationId(temp)
  }

  const sorted = [...louages].sort((a, b) => {
    if (sortBy === 'price') return a.price_per_seat - b.price_per_seat
    if (sortBy === 'fast') return a.estimated_duration_minutes - b.estimated_duration_minutes
    return a.distance_km - b.distance_km
  })

  return <main className="screen with-nav pale page-scroll">
    <TopBar title="Trouver un louage" />
    <section className="search-panel">
      <div className="search-route-line"><i /><span /><i /></div>
      <div style={{ marginBottom: '8px' }}>
        <small style={{ fontSize: '7px', color: '#8492a6', fontWeight: 800 }}>DÉPART</small>
        <select
          value={depStationId}
          onChange={(e) => setDepStationId(e.target.value)}
          style={{ width: '100%', height: '42px', borderRadius: '12px', border: '1px solid #e6eaf0', background: '#f5f7fa', padding: '0 10px', fontSize: '11px', fontWeight: 700 }}
        >
          {stations.map((s) => (
            <option key={s.id} value={s.id}>{s.name} ({s.city})</option>
          ))}
        </select>
      </div>
      <div style={{ marginBottom: '8px' }}>
        <small style={{ fontSize: '7px', color: '#8492a6', fontWeight: 800 }}>DESTINATION</small>
        <select
          value={destStationId}
          onChange={(e) => setDestStationId(e.target.value)}
          style={{ width: '100%', height: '42px', borderRadius: '12px', border: '1px solid #e6eaf0', background: '#f5f7fa', padding: '0 10px', fontSize: '11px', fontWeight: 700 }}
        >
          {stations.map((s) => (
            <option key={s.id} value={s.id}>{s.name} ({s.city})</option>
          ))}
        </select>
      </div>
      <button className="swap" onClick={handleSwap} aria-label="Inverser"><Icon name="route" /></button>
      <div className="date-row">
        <button type="button"><Icon name="calendar" /> Aujourd’hui</button>
        <button type="button"><Icon name="clock" /> Maintenant</button>
      </div>
      <Button variant="yellow" icon="search" onClick={() => searchNearbyJourneys({ destinationStationId: destStationId }).then(setLouages)}>
        Rechercher
      </Button>
    </section>
    <section className="results">
      <div className="section-title"><div><span className="eyebrow">{sorted.length} LOUAGES TROUVÉS</span><h2>Départs disponibles</h2></div><button><Icon name="filter" /> Trier</button></div>
      <div className="sort-chips">
        <button className={sortBy === 'near' ? 'active' : ''} onClick={() => setSortBy('near')}>Plus proche</button>
        <button className={sortBy === 'fast' ? 'active' : ''} onClick={() => setSortBy('fast')}>Départ rapide</button>
        <button className={sortBy === 'price' ? 'active' : ''} onClick={() => setSortBy('price')}>Prix</button>
      </div>
      {sorted.map((l, i) => <button className="result-card" key={l.journey_id} onClick={() => {
        onSelectJourney(l)
        onGo('reserve')
      }}>
        <div className="result-head"><Avatar name={l.driver_name.slice(0, 2).toUpperCase()} yellow={i === 0} /><div><h3>{l.driver_name}</h3><p><Icon name="star" size={13} /> {l.driver_rating} · <span>{l.status === 'boarding' ? 'Embarquement' : 'À proximité'}</span></p></div><Icon name="chevron" /></div>
        <div className="result-route"><span><i /><i /></span><b>{l.departure_station_name} → {l.destination_station_name}</b><small>{l.distance_km} km de vous</small></div>
        <div className="result-foot"><span><Icon name="seat" /> <b>{l.available_seats}</b> places</span><strong>{formatTND(l.price_per_seat)} <small>/ pers.</small></strong></div>
      </button>)}
    </section>
    <BottomNav current="search" onGo={onGo} />
  </main>
}

interface TicketInfo {
  ref: string
  rawToken: string
  seats: number
  price: number
  departureStation?: string
  destinationStation?: string
  passengerName?: string
  driverName?: string
  vehicleModel?: string
}

function Reserve({
  journey,
  onBack,
  onConfirmed,
}: {
  journey: NearbyLouageResult | null
  onBack: () => void
  onConfirmed: (res: TicketInfo) => void
}) {
  const [seats, setSeats] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeJourney = journey || {
    journey_id: '77777777-7777-7777-7777-777777777701',
    departure_station_name: 'Bab Bhar, Sousse',
    destination_station_name: 'Monastir Centre',
    price_per_seat: 5.5,
    available_seats: 3,
    driver_name: 'Mohamed Karray',
    driver_rating: 4.9,
    vehicle_model: 'Peugeot Expert',
  }

  const price = (activeJourney.price_per_seat * seats).toFixed(3).replace('.', ',')

  const handleConfirm = async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await bookReservation({
        journeyId: activeJourney.journey_id,
        seatCount: seats,
      })
      onConfirmed({
        ref: res.booking_reference,
        rawToken: res.raw_qr_token,
        seats,
        price: res.total_price,
        departureStation: activeJourney.departure_station_name,
        destinationStation: activeJourney.destination_station_name,
        passengerName: 'Yasmine Mansour',
        driverName: activeJourney.driver_name,
        vehicleModel: activeJourney.vehicle_model,
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Réservation impossible')
    } finally {
      setLoading(false)
    }
  }

  return <main className="screen page-scroll reserve-screen">
    <TopBar title="Votre réservation" onBack={onBack} action={<span className="step-count">2 / 3</span>} />
    <section className="reserve-route">
      <span className="eyebrow">VOTRE TRAJET</span>
      <h1>{activeJourney.departure_station_name.split(',')[0]} <Icon name="arrow" size={23} /> {activeJourney.destination_station_name.split(' ')[0]}</h1>
      <div className="journey-line">
        <div><i /><span /><i /></div>
        <p><small>DÉPART · AUJOURD’HUI</small><b>{activeJourney.departure_station_name}</b><em>14:20 estimé</em></p>
        <p><small>DESTINATION</small><b>{activeJourney.destination_station_name}</b><em>15:05 estimé</em></p>
      </div>
    </section>
    <section className="reserve-content">
      {error && <div style={{ color: '#ef5350', background: '#ffebee', padding: '10px', borderRadius: '12px', fontSize: '12px', marginBottom: '14px', fontWeight: 700 }}>⚠️ {error}</div>}
      <div className="mini-driver"><Avatar name={activeJourney.driver_name.slice(0, 2).toUpperCase()} yellow /><div><small>VOTRE CONDUCTEUR</small><b>{activeJourney.driver_name}</b><span><Icon name="star" size={13} /> {activeJourney.driver_rating} · {activeJourney.vehicle_model}</span></div><button><Icon name="chevron" /></button></div>
      <div className="seat-picker">
        <div><span className="eyebrow">NOMBRE DE PLACES</span><p>{activeJourney.available_seats} places encore disponibles</p></div>
        <div className="counter"><button disabled={seats === 1} onClick={() => setSeats(seats - 1)}><Icon name="minus" /></button><b>{seats}</b><button disabled={seats >= activeJourney.available_seats} onClick={() => setSeats(seats + 1)}><Icon name="plus" /></button></div>
      </div>
      <div className="price-card"><div><span>Prix par place</span><b>{activeJourney.price_per_seat.toFixed(3).replace('.', ',')} DT</b></div><div><span>Frais de réservation</span><b>0,000 DT</b></div><hr /><div className="total"><span>Total</span><b>{price} DT</b></div></div>
      <div className="assurance"><Icon name="check" /><div><b>Réservation flexible</b><p>Annulation gratuite jusqu’au départ du louage.</p></div></div>
    </section>
    <div className="sticky-action"><div><small>TOTAL</small><b>{price} DT</b></div><Button variant="yellow" icon="arrow" onClick={handleConfirm} disabled={loading}>{loading ? 'Réservation...' : 'Confirmer'}</Button></div>
  </main>
}

function Ticket({ ticketData, onHome }: { ticketData: TicketInfo | null; onHome: () => void }) {
  const ref = ticketData?.ref || 'BL-2408-73A'
  const price = ticketData?.price ? formatTND(ticketData.price) : '5,500 DT'
  const seats = ticketData?.seats ? `0${ticketData.seats}` : '01'
  const depCity = ticketData?.departureStation?.split(',')[0] || 'Sousse'
  const destCity = ticketData?.destinationStation?.split(' ')[0] || 'Monastir'
  const depCode = depCity.slice(0, 3).toUpperCase()
  const destCode = destCity.slice(0, 3).toUpperCase()

  return <main className="screen ticket-screen page-scroll">
    <div className="success-head">
      <button className="icon-button" onClick={onHome}><Icon name="back" /></button>
      <div className="success-check"><Icon name="check" size={29} /></div>
      <span className="eyebrow yellow-text">RÉSERVATION CONFIRMÉE</span>
      <h1>Votre place vous attend.</h1>
      <p>Présentez ce ticket au conducteur.</p>
    </div>
    <section className="boarding-pass">
      <div className="pass-top"><Logo compact /><span>AUJOURD’HUI · 14:20</span></div>
      <div className="pass-route"><div><b>{depCode}</b><span>{depCity}</span></div><span className="pass-line"><Icon name="car" /><i /></span><div><b>{destCode}</b><span>{destCity}</span></div></div>
      <div className="pass-details">
        <div><small>PASSAGER</small><b>{ticketData?.passengerName || 'Yasmine Mansour'}</b></div><div><small>PLACES</small><b>{seats}</b></div>
        <div><small>CONDUCTEUR</small><b>{ticketData?.driverName || 'Mohamed K.'}</b></div><div><small>PRIX</small><b>{price}</b></div>
      </div>
      <div className="perforation"><i /><span /><i /></div>
      <div className="qr-area"><div className="qr-code">{Array.from({ length: 49 }, (_, i) => <i key={i} className={[0,1,2,7,9,14,15,16,22,24,25,28,30,32,34,36,38,40,42,45,46,47,48].includes(i) ? 'dark' : ''} />)}</div><div><small>RÉFÉRENCE</small><b>{ref}</b><span className="confirmed"><Icon name="check" size={12} /> Confirmé</span></div></div>
    </section>
    <p className="ticket-hint"><Icon name="qr" /> Le conducteur scannera ce code à l’embarquement.</p>
    <div className="ticket-actions"><Button variant="yellow" icon="map" onClick={onHome}>Suivre mon louage</Button><Button variant="soft" onClick={onHome}>Retour à l’accueil</Button></div>
  </main>
}

function Bookings({
  onGo,
  onViewTicket,
}: {
  onGo: (s: Screen) => void
  onViewTicket: (t: TicketInfo) => void
}) {
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [activeTab, setActiveTab] = useState<'upcoming' | 'completed' | 'cancelled'>('upcoming')

  const loadReservations = () => {
    getMyReservations().then(setReservations)
  }

  useEffect(() => {
    loadReservations()
  }, [])

  const handleCancel = async (id: string) => {
    if (confirm('Voulez-vous vraiment annuler votre réservation ?')) {
      await cancelReservation(id)
      loadReservations()
    }
  }

  const handleOpenTicket = (r: Reservation) => {
    const journey = mockDb.journeys.find((j) => j.id === r.journey_id)
    const dep = DEMO_STATIONS.find((s) => s.id === journey?.departure_station_id)?.name || 'Bab Bhar, Sousse'
    const dest = DEMO_STATIONS.find((s) => s.id === journey?.destination_station_id)?.name || 'Monastir Centre'
    onViewTicket({
      ref: r.booking_reference,
      rawToken: r.qr_token_hash,
      seats: r.seat_count,
      price: r.total_price,
      departureStation: dep,
      destinationStation: dest,
      passengerName: 'Yasmine Mansour',
      driverName: 'Mohamed Karray',
    })
    onGo('ticket')
  }

  const filtered = reservations.filter(r => {
    if (activeTab === 'upcoming') return r.status === 'confirmed' || r.status === 'pending' || r.status === 'boarded'
    if (activeTab === 'completed') return r.status === 'completed'
    return r.status === 'cancelled'
  })

  return <main className="screen with-nav pale page-scroll">
    <TopBar title="Mes réservations" />
    <section className="standard-content">
      <div className="tab-row">
        <button className={activeTab === 'upcoming' ? 'active' : ''} onClick={() => setActiveTab('upcoming')}>À venir <span>{reservations.filter(r => r.status === 'confirmed' || r.status === 'boarded').length}</span></button>
        <button className={activeTab === 'completed' ? 'active' : ''} onClick={() => setActiveTab('completed')}>Terminées</button>
        <button className={activeTab === 'cancelled' ? 'active' : ''} onClick={() => setActiveTab('cancelled')}>Annulées</button>
      </div>
      <span className="eyebrow">{activeTab === 'upcoming' ? 'PROCHAIN DÉPART' : 'HISTORIQUE'}</span>
      {filtered.length === 0 ? <div className="empty-inline"><Icon name="ticket" /><p>Aucune réservation trouvée.</p></div> :
        filtered.map(r => <article className="booking-card" key={r.id}>
          <div className="booking-status"><span><i /> {r.status === 'boarded' ? 'À bord' : r.status === 'confirmed' ? 'Confirmée' : r.status}</span><small>{r.booking_reference}</small></div>
          <h2>Sousse <Icon name="arrow" /> Monastir</h2>
          <div className="booking-info"><div><Icon name="location" /><span><small>POINT DE DÉPART</small><b>Bab Bhar, Sousse</b></span></div><div><Icon name="seat" /><span><small>PLACES</small><b>{r.seat_count} place{r.seat_count > 1 ? 's' : ''} · {formatTND(r.total_price)}</b></span></div></div>
          <div className="booking-driver"><Avatar name="MK" /><span><small>CONDUCTEUR</small><b>Mohamed Karray · 4.9 ★</b></span></div>
          <div className="dual-actions">
            <Button variant="soft" icon="qr" onClick={() => handleOpenTicket(r)}>Voir ticket</Button>
            {r.status === 'confirmed' && <Button variant="danger" onClick={() => handleCancel(r.id)}>Annuler</Button>}
          </div>
        </article>
      )}
      <div className="tip-card"><span><Icon name="bell" /></span><div><b>Soyez prêt 5 min avant</b><p>Nous vous préviendrons à l’approche de votre louage.</p></div></div>
    </section>
    <BottomNav current="bookings" onGo={onGo} />
  </main>
}

function Notifications({ onGo }: { onGo: (s: Screen) => void }) {
  const { notifications, markAsRead, markAllAsRead } = useNotifications()

  return <main className="screen with-nav pale page-scroll">
    <TopBar title="Notifications" action={<button className="text-button" onClick={() => markAllAsRead()}>Tout lire</button>} />
    <section className="standard-content">
      <span className="eyebrow">AUJOURD’HUI</span>
      <div className="notification-list">
        {notifications.map(n => <article key={n.id} onClick={() => markAsRead(n.id)}>
          <span className={`note-icon ${n.type.includes('seat') ? 'navy' : n.type.includes('approaching') ? 'yellow' : 'green'}`}><Icon name={n.type.includes('seat') ? 'seat' : n.type.includes('approaching') ? 'car' : 'check'} /></span>
          <div><b>{n.title}</b><p>{n.body}</p><small>{formatTunisTime(n.created_at)}</small></div>
          {!n.read_at && <i />}
        </article>)}
      </div>
      <span className="eyebrow">PLUS TÔT</span>
      <div className="empty-inline"><Icon name="bell" /><p>Vous êtes à jour.</p></div>
    </section>
    <BottomNav current="notifications" onGo={onGo} />
  </main>
}

function ProfileScreen({ onGo, onDriver }: { onGo: (s: Screen) => void; onDriver: () => void }) {
  const { profile, signOut: logOut } = useAuth()
  const rows: { icon: IconName; title: string; sub?: string; action?: () => void }[] = [
    { icon: 'booking', title: 'Informations personnelles', sub: 'Nom, téléphone et photo', action: () => alert(`Profil: ${profile?.full_name}\nTél: ${profile?.phone}`) },
    { icon: 'location', title: 'Destinations enregistrées', sub: 'Maison, travail et favoris', action: () => alert('Destinations enregistrées:\n- Maison: Sousse Sahloul\n- Travail: Monastir Centre') },
    { icon: 'bell', title: 'Préférences de notifications', action: () => alert('Notifications SMS & Push actives.') },
    { icon: 'map', title: 'Langue', sub: 'Français · العربية · English', action: () => alert('Langue actuelle: Français (Tunisie)') },
  ]
  return <main className="screen with-nav pale page-scroll">
    <TopBar title="Mon profil" />
    <section className="profile-hero">
      <div className="profile-avatar">{profile?.full_name ? profile.full_name.slice(0, 2).toUpperCase() : 'YM'}<button><Icon name="plus" size={15} /></button></div>
      <h2>{profile?.full_name || 'Yasmine Mansour'}</h2>
      <p>{profile?.phone || '+216 22 345 678'}</p>
      <span>Passagère depuis 2025</span>
    </section>
    <section className="profile-content">
      <div className="profile-stats"><div><b>08</b><small>Trajets</small></div><div><b>4.9</b><small>Note</small></div><div><b>03</b><small>Favoris</small></div></div>
      <div className="settings-list">{rows.map(r => <button key={r.title} onClick={r.action}><span><Icon name={r.icon} /></span><div><b>{r.title}</b>{r.sub && <small>{r.sub}</small>}</div><Icon name="chevron" /></button>)}</div>
      <button className="switch-role" onClick={onDriver}><Icon name="car" /><div><b>Passer en mode louagiste</b><small>Gérer mes trajets et réservations</small></div><Icon name="chevron" /></button>
      <div style={{ marginTop: '14px', display: 'grid', gap: '8px' }}>
        <Button variant="soft" onClick={async () => { await logOut(); onGo('auth') }}>Se déconnecter</Button>
        <Button variant="danger" onClick={async () => { if (confirm('Voulez-vous supprimer votre compte BLASTI ?')) { await logOut(); onGo('auth') } }}>Supprimer mon compte</Button>
      </div>
    </section>
    <BottomNav current="profile" onGo={onGo} />
  </main>
}

function DriverDashboard({ onGo }: { onGo: (s: Screen) => void }) {
  const [online, setOnline] = useState(true)
  const [journey, setJourney] = useState<Journey | null>(null)

  useEffect(() => {
    getDriverActiveJourney().then(setJourney)
  }, [])

  const toggleOnline = () => {
    const next = !online
    setOnline(next)
    if (next) {
      sendDriverLocation({ latitude: 35.8288, longitude: 10.6405 })
    }
  }

  const available = journey?.available_seats ?? 3
  const total = journey?.total_seats ?? 8
  const occupied = total - available
  const depName = journey?.departure_station?.name || 'Bab Bhar, Sousse'
  const destName = journey?.destination_station?.name || 'Monastir Centre'

  return <main className="screen with-nav driver-screen pale page-scroll">
    <header className="driver-header"><div><Logo light compact /><p>Bonjour, Mohamed</p><h1>Prêt à prendre la route ?</h1></div><div className="driver-head-actions"><button aria-label="Alertes"><Icon name="bell" /><i /></button><Avatar name="MK" yellow /></div></header>
    <section className="driver-content">
      <button className={`online-toggle ${online ? 'online' : ''}`} onClick={toggleOnline}><span><i /> {online ? 'Vous êtes en ligne' : 'Vous êtes hors ligne'}</span><b><i /></b></button>
      <article className="active-journey-card">
        <div className="active-label"><span><i /> TRAJET ACTIF</span><small>Départ 14:20</small></div>
        <h2>{depName.split(',')[0]} <Icon name="arrow" /> {destName.split(' ')[0]}</h2>
        <p><Icon name="location" /> {depName} · Peugeot Expert</p>
        <div className="capacity"><div><span><b>{occupied}</b><small>occupées</small></span><span><b>{available}</b><small>disponibles</small></span></div><div className="capacity-bar"><i style={{ width: `${(occupied / total) * 100}%` }} /></div></div>
        <Button variant="yellow" icon="arrow" onClick={() => onGo('journey')}>Gérer le trajet</Button>
      </article>
      <div className="driver-metrics"><article><span><Icon name="booking" /></span><small>RÉSERVATIONS</small><b>04</b><em>2 à confirmer</em></article><article><span><Icon name="wallet" /></span><small>GAINS DU JOUR</small><b>46,5 <small>DT</small></b><em className="green">+12% cette semaine</em></article></div>
      <div className="section-title"><div><span className="eyebrow">ACCÈS RAPIDE</span><h2>Que voulez-vous faire ?</h2></div></div>
      <div className="quick-actions"><button onClick={() => onGo('publish')}><span><Icon name="plus" /></span><b>Publier un trajet</b><small>Nouvelle destination</small></button><button onClick={() => onGo('reservations')}><span><Icon name="scan" /></span><b>Scanner un ticket</b><small>Confirmer l’embarquement</small></button></div>
    </section>
    <BottomNav current="driver" onGo={onGo} driver />
  </main>
}

function PublishJourneyScreen({ onBack, onPublish }: { onBack: () => void; onPublish: () => void }) {
  const [stations, setStations] = useState<Station[]>([])
  const [depId, setDepId] = useState('')
  const [destId, setDestId] = useState('')
  const [price, setPrice] = useState('5.500')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getStations().then(data => {
      setStations(data)
      if (data.length >= 2) {
        setDepId(data[0].id)
        setDestId(data[4]?.id || data[1].id)
      }
    })
  }, [])

  const handleSubmit = async () => {
    setError(null)
    setLoading(true)
    try {
      await publishJourney({
        departureStationId: depId,
        destinationStationId: destId,
        vehicleId: '66666666-6666-6666-6666-666666666601',
        departureTime: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
        pricePerSeat: parseFloat(price) || 5.5,
      })
      onPublish()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur de publication')
    } finally {
      setLoading(false)
    }
  }

  return <main className="screen page-scroll pale publish-screen">
    <TopBar title="Nouveau trajet" onBack={onBack} />
    <section className="standard-content form-content">
      <div className="progress-steps"><span className="active">1</span><i /><span>2</span><i /><span>3</span><small>Itinéraire</small><small>Véhicule</small><small>Confirmation</small></div>
      {error && <div style={{ color: '#ef5350', fontSize: '11px', marginBottom: '10px' }}>{error}</div>}
      <div className="form-section"><span className="eyebrow">ITINÉRAIRE</span>
        <label>Station de départ
          <select
            value={depId}
            onChange={(e) => setDepId(e.target.value)}
            style={{ width: '100%', height: '44px', borderRadius: '12px', border: '1px solid #e6eaf0', background: '#f5f7fa', padding: '0 10px', fontSize: '11px', fontWeight: 700, marginTop: '6px' }}
          >
            {stations.map(s => <option key={s.id} value={s.id}>{s.name} ({s.city})</option>)}
          </select>
        </label>
        <label>Destination
          <select
            value={destId}
            onChange={(e) => setDestId(e.target.value)}
            style={{ width: '100%', height: '44px', borderRadius: '12px', border: '1px solid #e6eaf0', background: '#f5f7fa', padding: '0 10px', fontSize: '11px', fontWeight: 700, marginTop: '6px' }}
          >
            {stations.map(s => <option key={s.id} value={s.id}>{s.name} ({s.city})</option>)}
          </select>
        </label>
      </div>
      <div className="form-section"><span className="eyebrow">DÉPART & TARIF</span>
        <div className="two-fields"><label>Heure<div className="simple-input"><Icon name="clock" /><b>14:20</b></div></label><label>Durée estimée<div className="simple-input"><Icon name="route" /><b>45 min</b></div></label></div>
        <label>Prix par passager<div className="simple-input"><Icon name="wallet" /><input value={price} onChange={e => setPrice(e.target.value)} style={{ border: 0, outline: 0, fontWeight: 700, width: '60px' }} /><strong>DT</strong></div></label>
      </div>
      <div className="form-section"><span className="eyebrow">PLACES DISPONIBLES</span><div className="publish-seats"><div><b>8</b><small>capacité totale</small></div><Icon name="arrow" /><div className="highlight"><b>8</b><small>disponibles</small></div></div></div>
      <label className="gps-toggle"><span><Icon name="location" /></span><div><b>Partager ma position en direct</b><small>Visible uniquement pendant le trajet</small></div><i><b /></i></label>
      <Button variant="yellow" icon="arrow" onClick={handleSubmit} disabled={loading}>{loading ? 'Publication...' : 'Publier le trajet'}</Button>
      <p className="fare-note">Les tarifs affichés sont des données de démonstration modifiables.</p>
    </section>
  </main>
}

function LiveJourney({ onGo }: { onGo: (s: Screen) => void }) {
  const [activeId, setActiveId] = useState('77777777-7777-7777-7777-777777777701')

  useEffect(() => {
    getDriverActiveJourney().then((j) => {
      if (j) setActiveId(j.id)
    })
  }, [])

  const { journey, seats } = useRealtimeJourney(activeId)
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null)
  const [releasing, setReleasing] = useState(false)

  const handleRelease = async () => {
    if (selectedSeat) {
      setReleasing(true)
      try {
        await releaseJourneySeat(activeId, selectedSeat)
        setSelectedSeat(null)
      } finally {
        setReleasing(false)
      }
    }
  }

  const freeCount = journey?.available_seats ?? seats.filter(s => s.status === 'available').length
  const depName = journey?.departure_station?.name || 'Bab Bhar, Sousse'
  const destName = journey?.destination_station?.name || 'Monastir Centre'

  return <main className="screen with-nav journey-screen page-scroll">
    <div className="journey-map-wrap">
      <DriverLeafletMap />
      <TopBar title="Trajet en cours" dark action={<span className="live-pill"><i /> EN DIRECT</span>} />
      <div className="journey-progress">
        <div><span className="eyebrow">DÉPART</span><b>{depName}</b><small>En route</small></div>
        <div><Icon name="arrow" /><b>{destName}</b></div>
      </div>
    </div>
    <section className="seat-management">
      <div className="sheet-handle" />
      <div className="management-head"><div><span className="eyebrow">GESTION DES PLACES</span><h2>{freeCount} places disponibles</h2></div><button onClick={() => onGo('reservations')}><Icon name="booking" /><i>4</i></button></div>
      <div className="seat-legend"><span><i className="occupied" /> Occupée</span><span><i className="reserved" /> Réservée</span><span><i className="free" /> Libre</span></div>
      <div className="van-layout">
        <div className="steering">⌁</div>
        <div className="van-seat driver"><Icon name="seat" /><small>V</small></div>
        {seats.map(s => {
          const isFree = s.status === 'available'
          return <button
            key={s.seat_number}
            disabled={isFree}
            onClick={() => setSelectedSeat(s.seat_number)}
            className={`van-seat ${s.status === 'available' ? 'free' : s.status} ${selectedSeat === s.seat_number ? 'selected' : ''}`}
          >
            <Icon name="seat" />
            <small>{s.seat_number}</small>
          </button>
        })}
      </div>
      {selectedSeat ? <div className="release-panel">
        <div><Avatar name="PA" /><span><small>PLACE {selectedSeat}</small><b>Passager siège {selectedSeat}</b></span></div>
        <Button variant="danger" onClick={handleRelease} disabled={releasing}>{releasing ? 'Libération...' : 'Passager descendu'}</Button>
      </div> :
      <div className="seat-help"><Icon name="seat" /><p><b>Un passager descend ?</b><span>Touchez sa place pour la libérer instantanément.</span></p></div>}
    </section>
    <BottomNav current="journey" onGo={onGo} driver />
  </main>
}

function ReservationsScreen({ onGo }: { onGo: (s: Screen) => void }) {
  const [activeId, setActiveId] = useState('77777777-7777-7777-7777-777777777701')
  const [people, setPeople] = useState<Reservation[]>([])
  const [scanResult, setScanResult] = useState<string | null>(null)
  const [manualCode, setManualCode] = useState('')

  const load = (jId: string) => {
    getJourneyReservations(jId).then(setPeople)
  }

  useEffect(() => {
    getDriverActiveJourney().then((j) => {
      const id = j ? j.id : '77777777-7777-7777-7777-777777777701'
      setActiveId(id)
      load(id)
    })
  }, [])

  const handleScanSimulation = async (ref: string) => {
    const res = await scanTicketQr(activeId, ref)
    if (res.success) {
      setScanResult(`✅ Embarquement validé: ${res.booking_reference}`)
      load(activeId)
    } else {
      setScanResult(`❌ ${res.message}`)
    }
    setTimeout(() => setScanResult(null), 4000)
  }

  return <main className="screen with-nav pale page-scroll">
    <TopBar title="Passagers" action={<button className="scan-button" onClick={() => handleScanSimulation(manualCode || 'BL-2408-73A')}><Icon name="scan" /> Valider</button>} />
    <section className="standard-content reservations-content">
      <div style={{ background: 'white', padding: '12px', borderRadius: '15px', marginBottom: '14px', border: '1px solid #e6eaf0' }}>
        <small style={{ fontSize: '8px', color: '#8492a6', fontWeight: 800 }}>SCANNER / SAISIR UN CODE BILLET</small>
        <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
          <input
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value.toUpperCase())}
            placeholder="Ex: BL-2408-73A"
            style={{ flex: 1, height: '38px', borderRadius: '10px', border: '1px solid #d8e0e8', padding: '0 10px', fontSize: '11px', fontWeight: 700 }}
          />
          <button
            type="button"
            onClick={() => handleScanSimulation(manualCode || 'BL-2408-73A')}
            style={{ padding: '0 12px', background: '#142b45', color: '#ffd447', borderRadius: '10px', fontSize: '10px', fontWeight: 800 }}
          >
            Scanner
          </button>
        </div>
      </div>
      {scanResult && <div style={{ background: '#142b45', color: '#ffd447', padding: '10px 14px', borderRadius: '13px', fontSize: '11px', fontWeight: 800, marginBottom: '12px' }}>{scanResult}</div>}
      <div className="reservation-summary"><div><span className="eyebrow">TRAJET ACTIF</span><h2>Passagers du Louage</h2><small>{people.length} réservations</small></div><span><b>{people.filter(p => p.status === 'boarded').length}</b><small>à bord</small></span></div>
      <div className="tab-row"><button className="active">Tous <span>{people.length}</span></button><button>À bord <span>{people.filter(p => p.status === 'boarded').length}</span></button></div>
      {people.map(p => {
        const isBoarded = p.status === 'boarded'
        return <article className="passenger-card" key={p.id}>
          <div className="passenger-main"><Avatar name="PA" yellow={!isBoarded} /><div><h3>Passager {p.booking_reference}</h3><p><Icon name="location" size={14} /> Bab Bhar · {p.seat_count} place{p.seat_count > 1 ? 's' : ''}</p><small>{p.booking_reference}</small></div><span className={isBoarded ? 'boarded' : 'waiting'}>{isBoarded ? 'À bord' : 'Réservé'}</span></div>
          {!isBoarded && <button className="confirm-board" onClick={() => handleScanSimulation(p.booking_reference)}><Icon name="qr" /> Confirmer l’embarquement <Icon name="chevron" /></button>}
        </article>
      })}
    </section>
    <BottomNav current="reservations" onGo={onGo} driver />
  </main>
}

function EarningsScreen({ onGo }: { onGo: (s: Screen) => void }) {
  return <main className="screen with-nav pale page-scroll">
    <TopBar title="Mes revenus" />
    <section className="standard-content">
      <article className="earnings-card"><span className="eyebrow yellow-text">GAINS DE LA SEMAINE</span><h1>186,500 <small>DT</small></h1><p><span>↑ 12%</span> par rapport à la semaine passée</p><div className="bars">{[35,55,40,75,60,90,48].map((h,i) => <div key={i}><i style={{height: `${h}%`}} className={i === 5 ? 'active' : ''}/><small>{['L','M','M','J','V','S','D'][i]}</small></div>)}</div></article>
      <div className="section-title"><div><span className="eyebrow">ACTIVITÉ RÉCENTE</span><h2>Vos derniers trajets</h2></div></div>
      <div className="transaction-list">{['Monastir · 8 passagers','M’saken · 6 passagers','Hergla · 7 passagers'].map((t,i) => <article key={t}><span><Icon name="route" /></span><div><b>Sousse → {t}</b><small>{i === 0 ? 'Aujourd’hui' : 'Hier'} · {45+i*8} min</small></div><strong>+{[44,19.2,28][i].toFixed(3).replace('.', ',')} DT</strong></article>)}</div>
    </section>
    <BottomNav current="earnings" onGo={onGo} driver />
  </main>
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('splash')
  const [, setDriverMode] = useState(false)
  const [selectedJourney, setSelectedJourney] = useState<NearbyLouageResult | null>(null)
  const [initialSearchDest, setInitialSearchDest] = useState<string | null>(null)
  const [confirmedTicket, setConfirmedTicket] = useState<TicketInfo | null>(null)

  const go = (s: Screen) => setScreen(s)
  const passenger = () => { setDriverMode(false); setScreen('home') }
  const driver = () => { setDriverMode(true); setScreen('driver') }

  // Persistance de session: restauration automatique sur refresh
  useEffect(() => {
    const isLoggedIn = localStorage.getItem('blasti_logged_in') === 'true'
    const savedRole = localStorage.getItem('blasti_demo_role')
    if (isLoggedIn) {
      if (savedRole === 'driver') {
        setDriverMode(true)
        setScreen('driver')
      } else {
        setDriverMode(false)
        setScreen('home')
      }
    }
  }, [])

  const handleQuickSearch = (destName: string) => {
    setInitialSearchDest(destName)
    setScreen('search')
  }

  if (screen === 'splash') return <AppFrame><Splash onDone={() => go('onboarding')} /></AppFrame>
  if (screen === 'onboarding') return <AppFrame><Onboarding onDone={() => go('auth')} /></AppFrame>
  if (screen === 'auth') return <AppFrame><Auth onPassenger={passenger} onDriver={driver} /></AppFrame>
  if (screen === 'home') return <AppFrame><Home onGo={go} onSelectJourney={setSelectedJourney} onQuickSearch={handleQuickSearch} /></AppFrame>
  if (screen === 'search') return <AppFrame><SearchScreen initialDest={initialSearchDest} onGo={go} onSelectJourney={setSelectedJourney} /></AppFrame>
  if (screen === 'reserve') return <AppFrame><Reserve journey={selectedJourney} onBack={() => go('home')} onConfirmed={(data) => { setConfirmedTicket(data); go('ticket') }} /></AppFrame>
  if (screen === 'ticket') return <AppFrame><Ticket ticketData={confirmedTicket} onHome={() => go('bookings')} /></AppFrame>
  if (screen === 'bookings') return <AppFrame><Bookings onGo={go} onViewTicket={(t) => setConfirmedTicket(t)} /></AppFrame>
  if (screen === 'notifications') return <AppFrame><Notifications onGo={go} /></AppFrame>
  if (screen === 'profile') return <AppFrame><ProfileScreen onGo={go} onDriver={driver} /></AppFrame>
  if (screen === 'driver') return <AppFrame><DriverDashboard onGo={go} /></AppFrame>
  if (screen === 'publish') return <AppFrame><PublishJourneyScreen onBack={() => go('driver')} onPublish={() => go('journey')} /></AppFrame>
  if (screen === 'journey') return <AppFrame><LiveJourney onGo={go} /></AppFrame>
  if (screen === 'reservations') return <AppFrame><ReservationsScreen onGo={go} /></AppFrame>
  if (screen === 'earnings') return <AppFrame><EarningsScreen onGo={go} /></AppFrame>
  return <AppFrame><ProfileScreen onGo={go} onDriver={driver} /></AppFrame>
}

function AppFrame({ children }: { children: React.ReactNode }) {
  return <div className="app-stage">
    <div className="desktop-brand"><Logo light /><h2>La mobilité tunisienne,<br />réinventée.</h2><p>Réservez votre place. Suivez votre louage.<br />Voyagez sans attendre.</p><span dir="rtl">بلاصتك، ورحلتك</span></div>
    <div className="phone-shell">{children}</div>
  </div>
}
