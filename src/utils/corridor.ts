import { lineString, point } from '@turf/helpers'
import nearestPointOnLine from '@turf/nearest-point-on-line'
import simplify from '@turf/simplify'
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

const MAX_QUERY_POINTS = 80

/**
 * A simplified copy of the route (at most MAX_QUERY_POINTS points) for Overpass's
 * `around` filter. Searching along the line instead of inside its bounding box keeps
 * the query small: a diagonal route like Tel Aviv to Eilat has a bounding box covering
 * half the country, which made the public Overpass servers time out.
 */
export function routeQueryPoints(routeLine: Feature<LineString>): LatLng[] {
  let tolerance = 0.001
  let coords = routeLine.geometry.coordinates
  while (coords.length > MAX_QUERY_POINTS && tolerance < 1) {
    coords = simplify(routeLine, { tolerance, highQuality: false }).geometry.coordinates
    tolerance *= 2
  }
  return coords.map(([lng, lat]) => ({ lat, lng }))
}
