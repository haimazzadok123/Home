import type { LatLng, Place, RouteResult } from '../types'

const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving'

/** Fetches a driving route between two points using the public OSRM demo server. */
export async function fetchRoute(start: Place, end: Place, signal?: AbortSignal): Promise<RouteResult> {
  const coords = `${start.lng},${start.lat};${end.lng},${end.lat}`
  const url = new URL(`${OSRM_URL}/${coords}`)
  url.searchParams.set('overview', 'full')
  url.searchParams.set('geometries', 'geojson')

  const res = await fetch(url.toString(), { signal })
  if (!res.ok) throw new Error(`תכנון המסלול נכשל (שגיאה ${res.status})`)

  const data = await res.json()
  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error('לא נמצא מסלול בין שתי הנקודות שנבחרו.')
  }

  const route = data.routes[0]
  const coordinates: LatLng[] = route.geometry.coordinates.map(
    ([lng, lat]: [number, number]) => ({ lat, lng }),
  )

  return {
    coordinates,
    distanceKm: route.distance / 1000,
    durationMin: route.duration / 60,
  }
}
