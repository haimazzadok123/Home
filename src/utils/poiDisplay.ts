import type { PoiCategory } from '../types'

export const CATEGORY_EMOJI: Record<PoiCategory, string> = {
  viewpoint: '🏞️',
  'kosher-food': '🍽️',
  coffee: '☕',
}

/** Singular label for a single point, e.g. shown under its name in a popup. */
export const CATEGORY_LABEL: Record<PoiCategory, string> = {
  viewpoint: 'נקודת תצפייה',
  'kosher-food': 'אוכל כשר',
  coffee: 'בית קפה / עגלת קפה',
}
