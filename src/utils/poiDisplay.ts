import type { PoiCategory } from '../types'

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
