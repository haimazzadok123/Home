import type { RawPoi } from '../api/pois'

export interface CoffeeCart {
  name: string
  lat: number
  lng: number
  city?: string
  address?: string
  phone?: string
  openingHours?: string
}

/**
 * Curated coffee cart / food truck locations from coffeetrail.co.il (Coffee Trail),
 * kept as a static list rather than pulled from OpenStreetMap — add entries here as
 * they're gathered. Name and coordinates are required; the rest are optional.
 */
export const COFFEE_CARTS: CoffeeCart[] = []

export function coffeeCartsAsPoiInput(): RawPoi[] {
  return COFFEE_CARTS.map((cart, index) => ({
    id: `coffee-cart/${index}`,
    category: 'coffee',
    name: cart.name,
    lat: cart.lat,
    lng: cart.lng,
    phone: cart.phone,
    openingHours: cart.openingHours,
    address: cart.address ?? cart.city,
    tags: {},
  }))
}
