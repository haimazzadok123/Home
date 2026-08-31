import type { FoodFilterTag, Poi, PoiCategory } from '../types'

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

/**
 * A POI is shown when its category is active, and — for kosher-food, when any
 * food sub-filter is checked — when it carries at least one of the checked tags.
 * An empty `activeFoodTags` means no sub-filtering: all kosher-food POIs show.
 */
export function matchesActiveFilters(
  poi: Poi,
  activeFilters: Set<PoiCategory>,
  activeFoodTags: Set<FoodFilterTag>,
): boolean {
  if (!activeFilters.has(poi.category)) return false
  if (poi.category === 'kosher-food' && activeFoodTags.size > 0) {
    return (poi.foodTags ?? []).some((tag) => activeFoodTags.has(tag))
  }
  return true
}
