import type { FoodFilterTag, FuelFilterTag, Place, PoiCategory } from '../types'

export interface SavedRoute {
  id: string
  name: string
  start: Place
  end: Place
  corridorKm: number
  filters: PoiCategory[]
  foodTags: FoodFilterTag[]
  fuelTags: FuelFilterTag[]
  fuelBrands: string[]
  savedAt: number
}

const STORAGE_KEY = 'travel-planner:saved-routes'

/** Reads saved routes from localStorage. Returns an empty list on any failure (private browsing, corrupt data, etc). */
export function loadSavedRoutes(): SavedRoute[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persist(routes: SavedRoute[]): SavedRoute[] {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(routes))
  } catch {
    // Storage unavailable (private browsing, quota) — the in-memory list still updates for this session.
  }
  return routes
}

export function addSavedRoute(route: SavedRoute): SavedRoute[] {
  return persist([...loadSavedRoutes(), route])
}

export function removeSavedRoute(id: string): SavedRoute[] {
  return persist(loadSavedRoutes().filter((r) => r.id !== id))
}
