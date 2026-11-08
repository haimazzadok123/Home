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

const MAX_QUERY_POINTS = 50

/**
 * A simplified copy of the route (at most MAX_QUERY_POINTS points) for Overpass's
 * `around` filter, plus how far (km) the simplified line can stray from the real one.
 * Searching along the line instead of inside its bounding box keeps the query small.
 */
export function routeQueryPoints(routeLine: Feature<LineString>): { points: LatLng[]; deviationKm: number } {
  let tolerance = 0.001
  let coords = routeLine.geometry.coordinates
  let usedTolerance = 0
  while (coords.length > MAX_QUERY_POINTS && tolerance < 1) {
    coords = simplify(routeLine, { tolerance, highQuality: false }).geometry.coordinates
    usedTolerance = tolerance
    tolerance *= 2
  }
  return {
    points: coords.map(([lng, lat]) => ({ lat, lng })),
    // tolerance is in degrees; one degree is at most ~111 km.
    deviationKm: usedTolerance * 111,
  }
}
