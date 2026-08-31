import type { FoodFilterTag, FuelFilterTag, Poi, PoiCategory } from '../types'

export const CATEGORY_EMOJI: Record<PoiCategory, string> = {
  viewpoint: '🏞️',
  'kosher-food': '🍽️',
  fuel: '⛽',
}

/** Singular label for a single point, e.g. shown under its name in a popup. */
export const CATEGORY_LABEL: Record<PoiCategory, string> = {
  viewpoint: 'נקודת תצפייה',
  'kosher-food': 'אוכל כשר',
  fuel: 'תחנת דלק',
}

export const FOOD_FILTER_TAGS: FoodFilterTag[] = ['meat', 'dairy', 'restaurant', 'fast-food']

export const FOOD_FILTER_LABEL: Record<FoodFilterTag, string> = {
  meat: 'בשרי',
  dairy: 'חלבי',
  restaurant: 'מסעדה',
  'fast-food': 'מזון מהיר',
}

export const FUEL_FILTER_TAGS: FuelFilterTag[] = ['car-wash', 'convenience-store', 'fuel-card', 'shabbat-closed']

export const FUEL_FILTER_LABEL: Record<FuelFilterTag, string> = {
  'car-wash': 'שטיפת רכב',
  'convenience-store': 'חנות נוחות',
  'fuel-card': 'מקבלת דלקן',
  'shabbat-closed': 'סגורה בשבת',
}

export interface ActiveFilterState {
  categories: Set<PoiCategory>
  foodTags: Set<FoodFilterTag>
  fuelTags: Set<FuelFilterTag>
  fuelBrands: Set<string>
}

/**
 * A POI is shown when its category is active, and each checked sub-filter group narrows
 * it further: any checked food tag must be carried by a kosher-food POI, any checked fuel
 * tag must be carried by a fuel POI, and any checked brand must match a fuel POI's brand.
 * An empty group means no sub-filtering by that group.
 */
export function matchesActiveFilters(poi: Poi, state: ActiveFilterState): boolean {
  if (!state.categories.has(poi.category)) return false

  if (poi.category === 'kosher-food' && state.foodTags.size > 0) {
    if (!(poi.foodTags ?? []).some((tag) => state.foodTags.has(tag))) return false
  }

  if (poi.category === 'fuel') {
    if (state.fuelTags.size > 0 && !(poi.fuelTags ?? []).some((tag) => state.fuelTags.has(tag))) return false
    if (state.fuelBrands.size > 0 && !(poi.brand && state.fuelBrands.has(poi.brand))) return false
  }

  return true
}
