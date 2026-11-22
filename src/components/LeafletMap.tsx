// ============================================================================
// BLASTI - Carte Leaflet Interactive avec Itinéraire Routier Réel (OSRM)
// ============================================================================

import { useEffect, useRef, useState } from 'react'
import type { NearbyLouageResult, Station } from '../types/database'
import { getRoute } from '../services/routing'

// Import Leaflet CSS dynamically once
let leafletCssLoaded = false
function ensureLeafletCss() {
  if (!leafletCssLoaded) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)
    leafletCssLoaded = true
  }
}

// Fix default icon path issue with Vite
function fixLeafletIcons(L: typeof import('leaflet')) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  })
}

// Custom marker SVG builders
function makeLouageIcon(L: typeof import('leaflet'), seats: number, selected: boolean) {
  const bg = selected ? '#ffd447' : '#142b45'
  const fg = selected ? '#142b45' : 'white'
  const badge = selected ? '#142b45' : '#ffd447'
  const badgeFg = selected ? 'white' : '#142b45'
  const size = selected ? 60 : 54
  const html = `
    <div style="
      width:${size}px; height:${size * 0.7}px;
      background:${bg}; border:2.5px solid white;
      border-radius:12px; display:flex; align-items:center; justify-content:center;
      gap:4px; box-shadow:0 6px 18px rgba(20,43,69,0.5);
      transition:transform .15s;
      ${selected ? 'transform:scale(1.12);' : ''}
    ">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${fg}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m5 17-1 3M19 17l1 3M3 14l2-6a3 3 0 0 1 3-2h8a3 3 0 0 1 3 2l2 6v4H3v-4Z"/>
        <path d="M7 14h.01M17 14h.01M5 10h14"/>
      </svg>
      <div style="
        width:17px; height:17px; border-radius:50%;
        background:${badge}; color:${badgeFg};
        display:flex; align-items:center; justify-content:center;
        font-size:9px; font-weight:800; font-family:Manrope,sans-serif;
      ">${seats}</div>
    </div>
    <div style="
      width:0; height:0; margin:0 auto;
      border-left:6px solid transparent;
      border-right:6px solid transparent;
      border-top:8px solid ${bg};
      margin-top:-1px;
    "></div>`
  return L.divIcon({
    html,
    className: '',
    iconSize: [size, size * 0.7 + 8],
    iconAnchor: [size / 2, size * 0.7 + 8],
    popupAnchor: [0, -(size * 0.7 + 8)],
  })
}

function makeStationIcon(L: typeof import('leaflet'), type: 'departure' | 'destination' | 'station') {
  const colors: Record<string, string> = {
    departure: '#19b67a',
    destination: '#ffd447',
    station: '#8492a6',
  }
  const bg = colors[type]
  const html = `
    <div style="
      width:28px; height:28px; border-radius:50%;
      background:${bg}; border:3px solid white;
      box-shadow:0 4px 12px rgba(20,43,69,0.4);
      display:flex; align-items:center; justify-content:center;
    ">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${type === 'destination' ? '#142b45' : 'white'}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/>
        <circle cx="12" cy="10" r="2.5" fill="${type === 'destination' ? '#142b45' : 'white'}" stroke="none"/>
      </svg>
    </div>`
  return L.divIcon({
    html,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  })
}

function makeUserIcon(L: typeof import('leaflet')) {
  const html = `
    <div style="
      width:22px; height:22px; border-radius:50%;
      background:#438ef7; border:4px solid white;
      box-shadow:0 0 0 7px rgba(67,142,247,0.22);
    "></div>`
  return L.divIcon({ html, className: '', iconSize: [22, 22], iconAnchor: [11, 11] })
}

function makeDriverIcon(L: typeof import('leaflet')) {
  const html = `
    <div style="
      width:40px; height:40px; border-radius:13px;
      background:#ffd447; border:3px solid white;
      box-shadow:0 6px 18px rgba(20,43,69,0.5);
      display:flex; align-items:center; justify-content:center;
      transform:rotate(-12deg);
    ">
      <svg style="transform:rotate(12deg)" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#142b45" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m5 17-1 3M19 17l1 3M3 14l2-6a3 3 0 0 1 3-2h8a3 3 0 0 1 3 2l2 6v4H3v-4Z"/>
        <path d="M7 14h.01M17 14h.01M5 10h14"/>
      </svg>
      <div style="position:absolute;top:-4px;right:-4px;width:10px;height:10px;background:#19b67a;border:2px solid white;border-radius:50%"></div>
    </div>`
  return L.divIcon({ html, className: '', iconSize: [40, 40], iconAnchor: [20, 20] })
}

// ─────────────────────────────────────────────
// Props du composant
// ─────────────────────────────────────────────
interface LeafletMapProps {
  mode: 'passenger' | 'driver'
  vehicles?: NearbyLouageResult[]
  stations?: Station[]
  selectedVehicle?: NearbyLouageResult | null
  onSelectVehicle?: (v: NearbyLouageResult) => void
  userLocation?: [number, number] | null
  driverLocation?: [number, number] | null
  // Pour afficher un itinéraire entre deux stations
  routeFrom?: [number, number] | null
  routeTo?: [number, number] | null
  className?: string
}

export default function LeafletMap({
  mode,
  vehicles = [],
  stations = [],
  selectedVehicle,
  onSelectVehicle,
  userLocation,
  driverLocation,
  routeFrom,
  routeTo,
  className = '',
}: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const routeLayerRef = useRef<any>(null)
  const [routeInfo, setRouteInfo] = useState<{ km: number; min: number } | null>(null)
  const [routeSource, setRouteSource] = useState<'osrm' | 'estimated'>('osrm')

  // Centre initial sur Sousse
  const CENTER: [number, number] = [35.83, 10.64]
  const ZOOM = 11

  // ── Initialisation de la carte ──────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    ensureLeafletCss()

    let L: typeof import('leaflet')
    import('leaflet').then((module) => {
      L = module.default
      fixLeafletIcons(L)

      const map = L.map(containerRef.current!, {
        center: CENTER,
        zoom: ZOOM,
        zoomControl: false,
        attributionControl: false,
      })

      // Fond de carte OpenStreetMap (tiles gratuites)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(map)

      // Contrôle zoom en haut à droite
      L.control.zoom({ position: 'topright' }).addTo(map)

      // Attribution discrète en bas à gauche
      L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(map)
        .addAttribution('© OpenStreetMap')

      mapRef.current = map
    })

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [])

  // ── Mise à jour des marqueurs véhicules & stations ───────────────────────
  useEffect(() => {
    if (!mapRef.current) return
    let L: typeof import('leaflet')

    import('leaflet').then((module) => {
      L = module.default
      const map = mapRef.current
      if (!map) return

      // Supprimer les anciens marqueurs
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []

      // Stations secondaires (si fournies)
      stations.forEach((station) => {
        const marker = L.marker([station.latitude, station.longitude], {
          icon: makeStationIcon(L, 'station'),
        })
          .addTo(map)
          .bindTooltip(`<b>${station.name}</b><br/>${station.city}`, {
            direction: 'top',
            className: 'blasti-tooltip',
          })
        markersRef.current.push(marker)
      })

      // Marqueurs des louages en mode passager
      if (mode === 'passenger') {
        vehicles.forEach((v) => {
          const isSelected = selectedVehicle?.journey_id === v.journey_id
          const lat = v.driver_current_lat ?? v.departure_station_lat
          const lng = v.driver_current_lng ?? v.departure_station_lng
          if (!lat || !lng) return

          const icon = makeLouageIcon(L, v.available_seats, isSelected)
          const marker = L.marker([lat, lng], { icon, zIndexOffset: isSelected ? 1000 : 0 })
            .addTo(map)
            .bindPopup(
              `<div style="font-family:Manrope,sans-serif;min-width:200px;padding:4px">
                <b style="font-size:13px">${v.driver_name}</b>
                <p style="color:#8492a6;font-size:10px;margin:3px 0">${v.departure_station_name} → ${v.destination_station_name}</p>
                <div style="display:flex;gap:12px;margin-top:8px;font-size:11px">
                  <span>🪑 <b>${v.available_seats}</b> places</span>
                  <span>💰 <b>${v.price_per_seat.toFixed(3)} TND</b></span>
                </div>
                <button onclick="window.__blastiSelectVehicle('${v.journey_id}')"
                  style="margin-top:8px;width:100%;padding:7px;background:#142b45;color:white;border:none;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer">
                  Réserver une place →
                </button>
              </div>`,
              { maxWidth: 240 }
            )
            .on('click', () => {
              onSelectVehicle?.(v)
            })
          markersRef.current.push(marker)
        })
      }

      // Mode conducteur: marqueur de la position du conducteur
      if (mode === 'driver' && driverLocation) {
        const dm = L.marker(driverLocation, { icon: makeDriverIcon(L), zIndexOffset: 2000 })
          .addTo(map)
          .bindTooltip('Votre position', { direction: 'top', permanent: false })
        markersRef.current.push(dm)
      }

      // Marqueur de l'utilisateur
      if (userLocation) {
        const um = L.marker(userLocation, { icon: makeUserIcon(L), zIndexOffset: 1500 })
          .addTo(map)
          .bindTooltip('Vous êtes ici', { direction: 'top', permanent: false })
        markersRef.current.push(um)
        if (!routeFrom) map.setView(userLocation, Math.max(ZOOM, map.getZoom()))
      }
    })
  }, [vehicles, stations, selectedVehicle, userLocation, driverLocation, mode, onSelectVehicle])

  // ── Bouton d'exposition global pour les popups Leaflet ───────────────────
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__blastiSelectVehicle = (journeyId: string) => {
      const vehicle = vehicles.find((v) => v.journey_id === journeyId)
      if (vehicle) onSelectVehicle?.(vehicle)
    }
  }, [vehicles, onSelectVehicle])

  // ── Traçage de l'itinéraire réel ─────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !routeFrom || !routeTo) {
      // Nettoyer l'ancien itinéraire si aucun route
      if (routeLayerRef.current && mapRef.current) {
        routeLayerRef.current.remove()
        routeLayerRef.current = null
        setRouteInfo(null)
      }
      return
    }

    let cancelled = false
    let L: typeof import('leaflet')

    import('leaflet').then(async (module) => {
      if (cancelled) return
      L = module.default
      const map = mapRef.current
      if (!map || cancelled) return

      // Supprimer l'ancienne ligne d'itinéraire
      if (routeLayerRef.current) {
        routeLayerRef.current.remove()
        routeLayerRef.current = null
      }

      // Essai de récupération de l'itinéraire réel via OSRM
      const route = await getRoute(routeFrom, routeTo)
      if (cancelled || !map) return

      const isOsrm = route.summary.includes('OSRM')
      setRouteSource(isOsrm ? 'osrm' : 'estimated')
      setRouteInfo({ km: route.distanceKm, min: route.durationMinutes })

      // Ligne principale (couleur BLASTI navy)
      const polyline = L.polyline(route.coordinates, {
        color: '#142b45',
        weight: 5,
        opacity: 0.85,
        lineJoin: 'round',
      }).addTo(map)

      // Ligne en pointillé jaune par-dessus (effet BLASTI)
      const dashed = L.polyline(route.coordinates, {
        color: '#ffd447',
        weight: 2.5,
        opacity: 1,
        dashArray: '10 12',
        lineJoin: 'round',
      }).addTo(map)

      // Marqueurs de départ et d'arrivée
      const depMarker = L.marker(routeFrom, {
        icon: makeStationIcon(L, 'departure'),
        zIndexOffset: 2000,
      }).addTo(map)
      depMarker.bindTooltip('<b>Départ</b>', { direction: 'top', permanent: true, className: 'blasti-tooltip blasti-dep' })

      const destMarker = L.marker(routeTo, {
        icon: makeStationIcon(L, 'destination'),
        zIndexOffset: 2000,
      }).addTo(map)
      destMarker.bindTooltip('<b>Arrivée</b>', { direction: 'top', permanent: true, className: 'blasti-tooltip blasti-dest' })

      // Groupe de couches pour tout supprimer d'un coup
      const group = L.featureGroup([polyline, dashed, depMarker, destMarker])
      routeLayerRef.current = group

      // Zoom et centrage automatique sur l'itinéraire
      const bounds = polyline.getBounds()
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [60, 40], maxZoom: 14, animate: true })
      }
    })

    return () => {
      cancelled = true
    }
  }, [routeFrom, routeTo])

  // ── Zoom sur le louage sélectionné ──────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !selectedVehicle) return
    const lat = selectedVehicle.driver_current_lat ?? selectedVehicle.departure_station_lat
    const lng = selectedVehicle.driver_current_lng ?? selectedVehicle.departure_station_lng
    if (lat && lng) {
      mapRef.current.flyTo([lat, lng], 13, { animate: true, duration: 0.8 })
    }
  }, [selectedVehicle])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={containerRef}
        className={className}
        style={{ width: '100%', height: '100%' }}
      />
      {/* Badge d'information d'itinéraire */}
      {routeInfo && (
        <div style={{
          position: 'absolute', bottom: '8px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 1000, background: '#142b45', color: 'white',
          padding: '7px 14px', borderRadius: '20px',
          fontSize: '11px', fontWeight: 800, fontFamily: 'Manrope,sans-serif',
          boxShadow: '0 4px 15px rgba(20,43,69,0.4)',
          display: 'flex', gap: '10px', alignItems: 'center',
          whiteSpace: 'nowrap',
        }}>
          {routeSource === 'osrm'
            ? <span style={{ color: '#19b67a', fontSize: '8px' }}>📡 OSRM</span>
            : <span style={{ color: '#ffd447', fontSize: '8px' }}>📏 ESTIMÉ</span>}
          🗺️ {routeInfo.km} km · ⏱ ~{routeInfo.min} min
        </div>
      )}
    </div>
  )
}
