export interface LatLng {
  lat: number
  lng: number
}

export interface Place extends LatLng {
  label: string
}

export type PoiCategory = 'viewpoint' | 'kosher-food' | 'fuel' | 'camping' | 'hiking'

/** Sub-filters for kosher-food POIs: diet (meat/dairy) and place type (restaurant/fast-food). */
export type FoodFilterTag = 'meat' | 'dairy' | 'restaurant' | 'fast-food'

/** Sub-filters for fuel-station POIs. */
export type FuelFilterTag = 'car-wash' | 'convenience-store' | 'shabbat-closed'

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
  /** only set for category 'kosher-food'; best-effort, may be empty if untagged */
  foodTags?: FoodFilterTag[]
  /** only set for category 'fuel' */
  brand?: string
  /** only set for category 'fuel'; best-effort, may be empty if untagged */
  fuelTags?: FuelFilterTag[]
  tags: Record<string, string>
}

export interface RouteResult {
  coordinates: LatLng[]
  distanceKm: number
  durationMin: number
}
