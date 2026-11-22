// ============================================================================
// BLASTI - Service d'Itinéraire Routier Réel (OSRM + Fallback Robuste)
// ============================================================================

export interface RouteData {
  coordinates: [number, number][] // [lat, lng]
  distanceKm: number
  durationMinutes: number
  summary: string
}

// Calcul de distance orthodromique (Haversine) en km
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371 // Rayon de la Terre en km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c * 10) / 10
}

// Récupération de l'itinéraire routier réel via OpenStreetMap / OSRM
export async function getRoute(
  start: [number, number], // [lat, lng]
  end: [number, number]    // [lat, lng]
): Promise<RouteData> {
  const [startLat, startLng] = start
  const [endLat, endLng] = end

  // Distance à vol d'oiseau pour estimation de secours
  const directDistance = haversineDistance(startLat, startLng, endLat, endLng)
  const fallbackDistance = Math.max(1, Math.round(directDistance * 1.25 * 10) / 10)
  const fallbackDuration = Math.max(5, Math.round((fallbackDistance / 65) * 60))

  // Générer des points intermédiaires courbes pour un affichage fluide en secours
  const generateFallbackCoords = (): [number, number][] => {
    const points: [number, number][] = []
    const steps = 12
    const midLat = (startLat + endLat) / 2 + (startLng - endLng) * 0.08
    const midLng = (startLng + endLng) / 2 + (endLat - startLat) * 0.08

    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      // Bézier quadratique pour simuler un tracé routier naturel
      const lat = (1 - t) * (1 - t) * startLat + 2 * (1 - t) * t * midLat + t * t * endLat
      const lng = (1 - t) * (1 - t) * startLng + 2 * (1 - t) * t * midLng + t * t * endLng
      points.push([lat, lng])
    }
    return points
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 4000)

    // OSRM Public Driving API (lon,lat format)
    const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeoutId)

    if (res.ok) {
      const data = await res.json()
      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const route = data.routes[0]
        const coords: [number, number][] = route.geometry.coordinates.map(
          ([lng, lat]: [number, number]) => [lat, lng]
        )
        const distanceKm = Math.round((route.distance / 1000) * 10) / 10
        const durationMinutes = Math.max(2, Math.round(route.duration / 60))

        return {
          coordinates: coords,
          distanceKm,
          durationMinutes,
          summary: `Route via OSRM (${distanceKm} km, ~${durationMinutes} min)`,
        }
      }
    }
  } catch (err) {
    // Si réseau indisponible, timeout ou offline: bascule gracieuse sur tracé direct
    console.warn('Utilisation du tracé de secours BLASTI:', err)
  }

  return {
    coordinates: generateFallbackCoords(),
    distanceKm: fallbackDistance,
    durationMinutes: fallbackDuration,
    summary: `Itinéraire direct estimé (${fallbackDistance} km, ~${fallbackDuration} min)`,
  }
}
