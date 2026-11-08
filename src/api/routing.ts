import type { LatLng, Place, RouteResult } from '../types'

/**
 * The public OSRM demo server is often overloaded or down; when it fails the browser only
 * reports "Failed to fetch". The FOSSGIS server runs the same OSRM API, so it is tried next.
 */
const OSRM_ENDPOINTS = [
  'https://router.project-osrm.org/route/v1/driving',
  'https://routing.openstreetmap.de/routed-car/route/v1/driving',
]
const ROUTE_TIMEOUT_MS = 20_000

/** Fetches a driving route between two points, trying each OSRM server in turn. */
export async function fetchRoute(start: Place, end: Place): Promise<RouteResult> {
  const coords = `${start.lng},${start.lat};${end.lng},${end.lat}`
  let noRouteFound = false

  for (const base of OSRM_ENDPOINTS) {
    const url = new URL(`${base}/${coords}`)
    url.searchParams.set('overview', 'full')
    url.searchParams.set('geometries', 'geojson')

    try {
      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(ROUTE_TIMEOUT_MS) })
      const data = await res.json().catch(() => null)
      if (data?.code === 'NoRoute') {
        noRouteFound = true
        continue
      }
      if (!res.ok || data?.code !== 'Ok' || !data.routes?.length) continue

      const route = data.routes[0]
      const coordinates: LatLng[] = route.geometry.coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng }))
      return {
        coordinates,
        distanceKm: route.distance / 1000,
        durationMin: route.duration / 60,
      }
    } catch {
      // Network error, CORS-less error page or timeout: try the next server.
    }
  }

  throw new Error(
    noRouteFound
      ? 'לא נמצא מסלול נסיעה בין שתי הנקודות שנבחרו.'
      : 'שרת המסלולים לא ענה. בדקו את החיבור לאינטרנט ונסו שוב בעוד דקה.',
  )
}
