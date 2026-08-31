import { lineString, point } from '@turf/helpers'
import nearestPointOnLine from '@turf/nearest-point-on-line'
import bbox from '@turf/bbox'
import buffer from '@turf/buffer'
import type { Feature, LineString } from 'geojson'
import type { LatLng } from '../types'

export function toRouteLine(coordinates: LatLng[]): Feature<LineString> {
  return lineString(coordinates.map((c) => [c.lng, c.lat]))
}

/** Returns how far (km) a point is from the route, and how far along the route (km) that point is. */
export function distanceToRoute(
  routeLine: Feature<LineString>,
  latLng: LatLng,
): { distanceFromRoute: number; distanceAlongRoute: number } {
  const snapped = nearestPointOnLine(routeLine, point([latLng.lng, latLng.lat]), {
    units: 'kilometers',
  })
  return {
    distanceFromRoute: snapped.properties.dist ?? Infinity,
    distanceAlongRoute: snapped.properties.location ?? 0,
  }
}

/** Bounding box (south, west, north, east) around the route, expanded by corridorKm on every side. */
export function routeSearchBBox(
  routeLine: Feature<LineString>,
  corridorKm: number,
): [south: number, west: number, north: number, east: number] {
  const buffered = buffer(routeLine, corridorKm, { units: 'kilometers' })
  if (!buffered) throw new Error('לא ניתן היה לחשב את אזור החיפוש עבור המסלול הזה.')
  const [west, south, east, north] = bbox(buffered)
  return [south, west, north, east]
}
