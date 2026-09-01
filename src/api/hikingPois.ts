import along from '@turf/along'
import length from '@turf/length'
import type { Feature, LineString } from 'geojson'
import type { LatLng } from '../types'
import type { RawPoi } from './pois'

const BASE_URL = 'https://israelhiking.osm.org.il'

/**
 * The Israel Hiking Map API (unlike Overpass) has no bounding-box search — only "closest
 * point to a single location". So instead of one query for the whole corridor, this samples
 * points at regular intervals along the route and asks for the nearest hiking POI to each one.
 * Coverage is therefore sparse and can repeat the same POI for nearby samples; anything that
 * ends up outside the corridor is dropped afterwards in App.tsx, same as the other categories.
 * The 500ms delay between requests matches the official MCP wrapper's own rate limiting, to be
 * respectful of the public, community-run server.
 */
const MIN_REQUEST_INTERVAL_MS = 500
const SAMPLE_INTERVAL_KM = 20
const MAX_SAMPLES = 10
const REQUEST_TIMEOUT_MS = 15_000

function sampleRoute(routeLine: Feature<LineString>): LatLng[] {
  const totalKm = length(routeLine, { units: 'kilometers' })
  if (totalKm <= 0) return []

  const sampleCount = Math.min(MAX_SAMPLES, Math.max(1, Math.round(totalKm / SAMPLE_INTERVAL_KM)))
  const points: LatLng[] = []
  for (let i = 0; i <= sampleCount; i++) {
    const distanceKm = (totalKm * i) / sampleCount
    const sampled = along(routeLine, distanceKm, { units: 'kilometers' })
    const [lng, lat] = sampled.geometry.coordinates
    points.push({ lat, lng })
  }
  return points
}

interface IsraelHikingFeature {
  geometry?: { type?: string; coordinates?: number[] }
  properties?: Record<string, unknown>
  features?: IsraelHikingFeature[]
}

/** The API may return a bare Feature or a FeatureCollection, depending on the endpoint. */
function extractFeature(data: IsraelHikingFeature): IsraelHikingFeature | null {
  if (data.features && data.features.length > 0) return data.features[0]
  if (data.geometry) return data
  return null
}

function stringProp(props: Record<string, unknown>, key: string): string | undefined {
  const value = props[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Queries the Israel Hiking Map for the nearest hiking POI to each sampled point along the route. */
export async function fetchHikingPois(routeLine: Feature<LineString>, signal?: AbortSignal): Promise<RawPoi[]> {
  const samples = sampleRoute(routeLine)
  const seen = new Set<string>()
  const results: RawPoi[] = []

  for (const sample of samples) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    try {
      const url = `${BASE_URL}/api/points/closest?location=${sample.lat},${sample.lng}&language=he`
      // Each request gets its own timeout — a single hung request must never stall the whole
      // route plan, since this is a best-effort supplementary source layered on top of it.
      const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
      if (res.ok) {
        const data = (await res.json()) as IsraelHikingFeature
        const feature = extractFeature(data)
        const props = feature?.properties
        const coords = feature?.geometry?.coordinates

        if (props && coords && coords.length >= 2) {
          const name = stringProp(props, 'name:he') ?? stringProp(props, 'name:en') ?? stringProp(props, 'name')
          const id = stringProp(props, 'poiId') ?? stringProp(props, 'identifier')

          if (name && id && !seen.has(id)) {
            seen.add(id)
            const [lng, lat] = coords
            results.push({
              id: `hiking/${id}`,
              category: 'hiking',
              name,
              lat,
              lng,
              tags: {},
            })
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      // A single sample point failing (e.g. no nearby POI, or a transient error) shouldn't
      // drop the rest — this whole data source is best-effort supplementary data.
    }

    await delay(MIN_REQUEST_INTERVAL_MS)
  }

  return results
}
