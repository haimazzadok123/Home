import type { FoodFilterTag, FuelFilterTag, Place, PoiCategory } from '../types'

export interface ShareState {
  start: Place
  end: Place
  corridorKm: number
  filters: Set<PoiCategory>
  foodTags: Set<FoodFilterTag>
  fuelTags: Set<FuelFilterTag>
  fuelBrands: Set<string>
}

/** Builds a URL that reopens this app with the same route and filters preselected. */
export function buildShareUrl(state: ShareState): string {
  const params = new URLSearchParams()
  params.set('slat', state.start.lat.toFixed(6))
  params.set('slng', state.start.lng.toFixed(6))
  params.set('slabel', state.start.label)
  params.set('elat', state.end.lat.toFixed(6))
  params.set('elng', state.end.lng.toFixed(6))
  params.set('elabel', state.end.label)
  params.set('corridor', String(state.corridorKm))
  if (state.filters.size > 0) params.set('filters', [...state.filters].join(','))
  if (state.foodTags.size > 0) params.set('food', [...state.foodTags].join(','))
  if (state.fuelTags.size > 0) params.set('fuel', [...state.fuelTags].join(','))
  if (state.fuelBrands.size > 0) params.set('brands', [...state.fuelBrands].join(','))

  const url = new URL(window.location.href)
  url.search = params.toString()
  return url.toString()
}

/** Reads a shared route out of the current page URL, if one is present. */
export function parseShareUrl(): ShareState | null {
  const params = new URLSearchParams(window.location.search)
  const slat = params.get('slat')
  const slng = params.get('slng')
  const slabel = params.get('slabel')
  const elat = params.get('elat')
  const elng = params.get('elng')
  const elabel = params.get('elabel')
  if (!slat || !slng || !slabel || !elat || !elng || !elabel) return null

  return {
    start: { lat: Number(slat), lng: Number(slng), label: slabel },
    end: { lat: Number(elat), lng: Number(elng), label: elabel },
    corridorKm: Number(params.get('corridor')) || 5,
    filters: new Set((params.get('filters')?.split(',').filter(Boolean) ?? []) as PoiCategory[]),
    foodTags: new Set((params.get('food')?.split(',').filter(Boolean) ?? []) as FoodFilterTag[]),
    fuelTags: new Set((params.get('fuel')?.split(',').filter(Boolean) ?? []) as FuelFilterTag[]),
    fuelBrands: new Set(params.get('brands')?.split(',').filter(Boolean) ?? []),
  }
}
