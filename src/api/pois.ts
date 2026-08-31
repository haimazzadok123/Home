import type { FoodFilterTag, Poi } from '../types'

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

/** south, west, north, east */
type BBox = [number, number, number, number]

/**
 * Kosher food places aren't consistently tagged in OpenStreetMap, so we cast a wide net:
 * explicit diet:kosher=yes/only, cuisine=kosher, and shop=kosher (kosher grocers/bakeries).
 */
function buildQuery(bboxStr: string): string {
  return `
    [out:json][timeout:25];
    (
      node["tourism"="viewpoint"](${bboxStr});
      node["diet:kosher"~"yes|only"](${bboxStr});
      way["diet:kosher"~"yes|only"](${bboxStr});
      node["cuisine"~"kosher"](${bboxStr});
      way["cuisine"~"kosher"](${bboxStr});
      node["shop"="kosher"](${bboxStr});
      way["shop"="kosher"](${bboxStr});
      node["amenity"="fuel"](${bboxStr});
      way["amenity"="fuel"](${bboxStr});
    );
    out center tags;
  `
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

function categorize(tags: Record<string, string>): Poi['category'] | null {
  if (tags.tourism === 'viewpoint') return 'viewpoint'
  if (tags['diet:kosher'] === 'yes' || tags['diet:kosher'] === 'only') return 'kosher-food'
  if (tags.cuisine?.toLowerCase().includes('kosher')) return 'kosher-food'
  if (tags.shop === 'kosher') return 'kosher-food'
  if (tags.amenity === 'fuel') return 'fuel'
  return null
}

/** Prefer the place's own name, falling back to its brand/operator (e.g. a fuel station chain). */
function displayNameFor(tags: Record<string, string>): string | undefined {
  return tags.name || tags.brand || tags.operator
}

/**
 * Meat/dairy is tagged even less consistently than kosher itself, so this is a
 * best-effort guess from a few known tag variants plus Hebrew/English keywords
 * in the cuisine and name fields. Restaurant/fast-food is reliable — it's the
 * standard OSM `amenity` value.
 */
function foodTagsFor(tags: Record<string, string>): FoodFilterTag[] {
  const cuisine = tags.cuisine?.toLowerCase() ?? ''
  const name = tags.name?.toLowerCase() ?? ''
  const result: FoodFilterTag[] = []

  const isMeat =
    tags['diet:kosher_meat'] === 'yes' ||
    tags['kosher:type'] === 'meat' ||
    cuisine.includes('meat') ||
    name.includes('בשרי')
  const isDairy =
    tags['diet:kosher_dairy'] === 'yes' ||
    tags['kosher:type'] === 'dairy' ||
    cuisine.includes('dairy') ||
    name.includes('חלבי')

  if (isMeat) result.push('meat')
  if (isDairy) result.push('dairy')
  if (tags.amenity === 'restaurant') result.push('restaurant')
  if (tags.amenity === 'fast_food') result.push('fast-food')

  return result
}

function phoneFor(tags: Record<string, string>): string | undefined {
  return tags.phone || tags['contact:phone'] || tags.mobile || tags['contact:mobile']
}

function addressFor(tags: Record<string, string>): string | undefined {
  const street = tags['addr:street']
  const houseNumber = tags['addr:housenumber']
  const city = tags['addr:city'] || tags['addr:place']
  const parts: string[] = []
  if (street) parts.push(houseNumber ? `${street} ${houseNumber}` : street)
  if (city) parts.push(city)
  return parts.length ? parts.join(', ') : undefined
}

export interface RawPoi {
  id: string
  category: Poi['category']
  name: string
  lat: number
  lng: number
  phone?: string
  openingHours?: string
  address?: string
  foodTags?: FoodFilterTag[]
  tags: Record<string, string>
}

/** Queries Overpass for scenic viewpoints, kosher food and fuel stations within a bounding box. */
export async function fetchPois(bbox: BBox, signal?: AbortSignal): Promise<RawPoi[]> {
  const [south, west, north, east] = bbox
  const bboxStr = `${south},${west},${north},${east}`
  const query = buildQuery(bboxStr)

  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    signal,
  })
  if (!res.ok) throw new Error(`חיפוש נקודות העניין נכשל (שגיאה ${res.status})`)

  const data: { elements: OverpassElement[] } = await res.json()

  const results: RawPoi[] = []

  for (const el of data.elements) {
    const tags = el.tags ?? {}
    const category = categorize(tags)
    const name = displayNameFor(tags)
    // Skip unnamed places — a generic category label isn't a useful name to show.
    if (!category || !name) continue

    const lat = el.lat ?? el.center?.lat
    const lng = el.lon ?? el.center?.lon
    if (lat == null || lng == null) continue

    results.push({
      id: `${el.type}/${el.id}`,
      category,
      name,
      lat,
      lng,
      phone: phoneFor(tags),
      openingHours: tags.opening_hours,
      address: addressFor(tags),
      foodTags: category === 'kosher-food' ? foodTagsFor(tags) : undefined,
      tags,
    })
  }

  return results
}
