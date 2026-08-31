export interface LatLng {
  lat: number
  lng: number
}

export interface Place extends LatLng {
  label: string
}

export type PoiCategory = 'viewpoint' | 'kosher-food' | 'fuel'

export interface Poi {
  id: string
  category: PoiCategory
  name: string
  lat: number
  lng: number
  /** distance in km from the route line */
  distanceFromRoute: number
  /** distance in km travelled along the route to the nearest point */
  distanceAlongRoute: number
  phone?: string
  openingHours?: string
  address?: string
  tags: Record<string, string>
}

export interface RouteResult {
  coordinates: LatLng[]
  distanceKm: number
  durationMin: number
}
