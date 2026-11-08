import { lineString, point } from '@turf/helpers'
import nearestPointOnLine from '@turf/nearest-point-on-line'
import length from '@turf/length'
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

const MAX_BOXES = 12

/**
 * Covers the route with a chain of small boxes (south,west,north,east), each widened by
 * corridorKm. Overpass answers box queries much faster than a search around a long line,
 * and the query stays short. The boxes overshoot the corridor a little; withRouteDistance
 * measures every result against the real route and drops the extras.
 */
export function routeQueryBoxes(routeLine: Feature<LineString>, corridorKm: number, kmPerBox = 20): string[] {
  const coords = routeLine.geometry.coordinates
  const totalKm = length(routeLine, { units: 'kilometers' })
  const boxCount = Math.max(1, Math.min(MAX_BOXES, Math.ceil(totalKm / kmPerBox)))
  const perBox = Math.ceil(coords.length / boxCount)
  const boxes: string[] = []

  for (let i = 0; i < coords.length - 1; i += perBox) {
    // Overlap by one point so consecutive boxes share their joint.
    const chunk = coords.slice(i, Math.min(coords.length, i + perBox + 1))
    const lats = chunk.map((c) => c[1])
    const lngs = chunk.map((c) => c[0])
    const midLat = (Math.min(...lats) + Math.max(...lats)) / 2
    const dLat = corridorKm / 111
    const dLng = corridorKm / (111 * Math.cos((midLat * Math.PI) / 180))
    boxes.push(
      [Math.min(...lats) - dLat, Math.min(...lngs) - dLng, Math.max(...lats) + dLat, Math.max(...lngs) + dLng]
        .map((v) => v.toFixed(4))
        .join(','),
    )
  }
  return boxes
}
