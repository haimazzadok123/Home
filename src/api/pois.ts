import type { FoodFilterTag, FuelFilterTag, Poi } from '../types'

/**
 * The public overpass-api.de instance is prone to 504s under load, so fall back to a
 * mirror on failure rather than surfacing a dead end to the user.
 */
const OVERPASS_ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']

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
      node["tourism"="camp_site"](${bboxStr});
      way["tourism"="camp_site"](${bboxStr});
    );
    out center tags;
  `
}

/**
 * Lodging is scoped to KKL (Jewish National Fund) and Nature and Parks Authority sites
 * only — no hotels or guesthouses. There's no dedicated OSM tag for "run by KKL/the
 * Nature Authority", so this checks the operator (and, as a fallback, the name) for
 * either body's common Hebrew/English spellings.
 */
const KKL_KEYWORDS = ['קק"ל', 'קק״ל', 'קרן קיימת', 'kkl', 'jnf']
const NATURE_AUTHORITY_KEYWORDS = ['רשות הטבע', 'רט"ג', 'רט״ג', 'nature and parks authority', 'inpa']

function isKklOrNatureAuthoritySite(tags: Record<string, string>): boolean {
  const haystack = `${tags.operator ?? ''} ${tags.name ?? ''}`.toLowerCase()
  return [...KKL_KEYWORDS, ...NATURE_AUTHORITY_KEYWORDS].some((keyword) => haystack.includes(keyword.toLowerCase()))
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
  if (tags.tourism === 'camp_site' && isKklOrNatureAuthoritySite(tags)) return 'camping'
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

/**
 * Convenience store is reasonably well tagged in OpenStreetMap. Car wash is tagged more
 * loosely — beyond car_wash=yes, some mappers use a non-"yes" truthy value or a
 * service:vehicle:car_wash tag, and some only mention it in the station's name — so this
 * also catches "שטיפה"/"שטיפת רכב"/"car wash" in the name or brand. "Closed for Shabbat"
 * is inferred from opening_hours: true when the schedule lists specific weekdays but
 * never lists Saturday as open — a heuristic, not a real tag, so it under-detects more
 * than it over-detects.
 */
function fuelTagsFor(tags: Record<string, string>): FuelFilterTag[] {
  const result: FuelFilterTag[] = []
  const nameAndBrand = `${tags.name ?? ''} ${tags.brand ?? ''}`

  const hasCarWash =
    (tags.car_wash && tags.car_wash !== 'no') ||
    tags['service:vehicle:car_wash'] === 'yes' ||
    /שטיפ|car\s*wash/i.test(nameAndBrand)
  if (hasCarWash) result.push('car-wash')

  if (tags.shop === 'convenience' || tags.convenience_store === 'yes') result.push('convenience-store')
  if (isClosedForShabbat(tags.opening_hours)) result.push('shabbat-closed')

  return result
}

function isClosedForShabbat(openingHours: string | undefined): boolean {
  if (!openingHours) return false
  if (/\bSa\s+off\b/i.test(openingHours)) return true

  const withoutSaOff = openingHours.replace(/\bSa\s+off\b/gi, '')
  const mentionsSaturdayOpen = /\bSa\b/i.test(withoutSaOff)
  const mentionsOtherWeekdays = /\b(Su|Mo|Tu|We|Th|Fr)\b/i.test(openingHours)
  return mentionsOtherWeekdays && !mentionsSaturdayOpen
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
  brand?: string
  fuelTags?: FuelFilterTag[]
  tags: Record<string, string>
}

/** Tries each Overpass mirror in turn — the public instances routinely 504 under load. */
async function queryOverpass(query: string, signal?: AbortSignal): Promise<{ elements: OverpassElement[] }> {
  let lastError: unknown

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal,
      })
      if (!res.ok) {
        lastError = new Error(`חיפוש נקודות העניין נכשל (שגיאה ${res.status})`)
        continue
      }
      return await res.json()
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      lastError = err
    }
  }

  throw lastError instanceof Error ? lastError : new Error('חיפוש נקודות העניין נכשל.')
}

/** Queries Overpass for scenic viewpoints, kosher food, fuel stations and KKL/Nature Authority camping within a bounding box. */
export async function fetchPois(bbox: BBox, signal?: AbortSignal): Promise<RawPoi[]> {
  const [south, west, north, east] = bbox
  const bboxStr = `${south},${west},${north},${east}`
  const query = buildQuery(bboxStr)

  const data = await queryOverpass(query, signal)

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
      brand: category === 'fuel' ? tags.brand : undefined,
      fuelTags: category === 'fuel' ? fuelTagsFor(tags) : undefined,
      tags,
    })
  }

  return results
}
