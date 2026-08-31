import type { Place } from '../types'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

/** Searches for places by free-text query using OpenStreetMap's Nominatim geocoder. */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const trimmed = query.trim()
  if (trimmed.length < 3) return []

  const url = new URL(NOMINATIM_URL)
  url.searchParams.set('q', trimmed)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('limit', '5')
  url.searchParams.set('accept-language', 'he')

  const res = await fetch(url.toString(), { signal })
  if (!res.ok) throw new Error(`חיפוש המיקום נכשל (שגיאה ${res.status})`)

  const data: Array<{ lat: string; lon: string; display_name: string }> = await res.json()
  return data.map((item) => ({
    lat: Number(item.lat),
    lng: Number(item.lon),
    label: item.display_name,
  }))
}
