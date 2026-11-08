import type { LatLng, Place, RouteResult } from '../types'
import { withTimeout } from '../utils/abort'
import { AllAttemptsFailedError, firstSuccessful, preferredOrder, rememberPreferred } from '../utils/hedge'

/**
 * Free, keyless routing servers, tried in order. When one is down (or blocked by the
 * user's network) the browser only says "Failed to fetch", so the next one is tried.
 * The first two speak the OSRM API; the last is Valhalla (FOSSGIS), a different engine
 * that openstreetmap.org itself calls from the browser.
 */
const OSRM_ENDPOINTS = [
  'https://router.project-osrm.org/route/v1/driving',
  'https://routing.openstreetmap.de/routed-car/route/v1/driving',
]
const VALHALLA_ENDPOINT = 'https://valhalla1.openstreetmap.de/route'
const ROUTE_TIMEOUT_MS = 15_000

class NoRouteError extends Error {}

async function fetchJson(url: string, signal?: AbortSignal): // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Promise<{ ok: boolean; status: number; data: any }> {
  const t = withTimeout(signal, ROUTE_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: t.signal })
    const data = await res.json().catch(() => null)
    return { ok: res.ok, status: res.status, data }
  } finally {
    t.done()
  }
}

async function osrmRoute(base: string, start: Place, end: Place, signal?: AbortSignal): Promise<RouteResult> {
  const url = new URL(`${base}/${start.lng},${start.lat};${end.lng},${end.lat}`)
  url.searchParams.set('overview', 'full')
  url.searchParams.set('geometries', 'geojson')
  const { ok, status, data } = await fetchJson(url.toString(), signal)
  if (data?.code === 'NoRoute') throw new NoRouteError()
  if (!ok || data?.code !== 'Ok' || !data.routes?.length) throw new Error(`HTTP ${status} ${data?.code ?? ''}`)

  const route = data.routes[0]
  return {
    coordinates: route.geometry.coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng })),
    distanceKm: route.distance / 1000,
    durationMin: route.duration / 60,
  }
}

/** Decodes a Valhalla shape (Google polyline format, 6 decimal places). */
function decodePolyline6(encoded: string): LatLng[] {
  const points: LatLng[] = []
  let index = 0
  let lat = 0
  let lng = 0
  while (index < encoded.length) {
    for (const axis of [0, 1]) {
      let result = 0
      let shift = 0
      let byte: number
      do {
        byte = encoded.charCodeAt(index++) - 63
        result |= (byte & 0x1f) << shift
        shift += 5
      } while (byte >= 0x20)
      const delta = result & 1 ? ~(result >> 1) : result >> 1
      if (axis === 0) lat += delta
      else lng += delta
    }
    points.push({ lat: lat / 1e6, lng: lng / 1e6 })
  }
  return points
}

async function valhallaRoute(start: Place, end: Place, signal?: AbortSignal): Promise<RouteResult> {
  const request = {
    locations: [
      { lat: start.lat, lon: start.lng },
      { lat: end.lat, lon: end.lng },
    ],
    costing: 'auto',
    directions_type: 'none',
    units: 'kilometers',
  }
  const url = `${VALHALLA_ENDPOINT}?json=${encodeURIComponent(JSON.stringify(request))}`
  const { ok, status, data } = await fetchJson(url, signal)
  const trip = data?.trip
  if (!ok || !trip?.legs?.length) {
    // Valhalla answers "no path" with HTTP 400 and error_code 442.
    if (data?.error_code === 442) throw new NoRouteError()
    throw new Error(`HTTP ${status} ${data?.error ?? ''}`)
  }
  return {
    coordinates: trip.legs.flatMap((leg: { shape: string }) => decodePolyline6(leg.shape)),
    distanceKm: trip.summary.length,
    durationMin: trip.summary.time / 60,
  }
}

const ROUTE_STAGGER_MS = 2_500
const PREFERRED_KEY = 'travel-planner:route-server'

/**
 * Fetches a driving route between two points. The server that answered last time goes
 * first; if it is silent for a couple of seconds the next one starts alongside it, and
 * whichever answers first wins.
 */
export async function fetchRoute(start: Place, end: Place, signal?: AbortSignal): Promise<RouteResult> {
  const servers = preferredOrder(
    PREFERRED_KEY,
    [
      // Valhalla first: in testing from a real browser it answered while both OSRM servers
      // were refused.
      { id: VALHALLA_ENDPOINT, run: (s: AbortSignal) => valhallaRoute(start, end, s) },
      ...OSRM_ENDPOINTS.map((base) => ({ id: base, run: (s: AbortSignal) => osrmRoute(base, start, end, s) })),
    ],
    (server) => server.id,
  )

  try {
    const { value, index } = await firstSuccessful(
      servers.map((server) => (s: AbortSignal) =>
        server.run(s).catch((err) => {
          // Shown in the browser console (F12) to tell a blocked server from a down one.
          if (!s.aborted) console.warn(`Routing server failed: ${server.id}`, err)
          throw err
        }),
      ),
      ROUTE_STAGGER_MS,
      signal,
    )
    rememberPreferred(PREFERRED_KEY, servers[index].id)
    return value
  } catch (err) {
    if (signal?.aborted) throw err
    const noRouteFound = err instanceof AllAttemptsFailedError && err.errors.some((e) => e instanceof NoRouteError)
    throw new Error(
      noRouteFound
        ? 'לא נמצא מסלול נסיעה בין שתי הנקודות שנבחרו.'
        : 'אף שרת מסלולים לא ענה. ייתכן שהרשת שלכם (למשל רשת בעבודה) חוסמת אותם. נסו מרשת אחרת או מהטלפון.',
    )
  }
}
