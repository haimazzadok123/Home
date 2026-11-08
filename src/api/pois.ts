import { withTimeout } from '../utils/abort'
import { firstSuccessful, preferredOrder, rememberPreferred } from '../utils/hedge'
import type { FoodFilterTag, FuelFilterTag, Poi, PoiCategory } from '../types'

/**
 * The public overpass-api.de instance is prone to 504s under load, so fall back to a
 * mirror on failure rather than surfacing a dead end to the user.
 */
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

/**
 * Overpass statements per category. Kosher food places aren't consistently tagged in
 * OpenStreetMap, so that one casts a wide net: diet:kosher=yes/only, cuisine=kosher and
 * shop=kosher (kosher grocers/bakeries).
 */
const CATEGORY_STATEMENTS: Record<PoiCategory, string[]> = {
  viewpoint: ['["tourism"="viewpoint"]'],
  'kosher-food': ['["diet:kosher"~"^(yes|only)$"]', '["cuisine"~"kosher"]', '["shop"="kosher"]'],
  fuel: ['["amenity"="fuel"]'],
  camping: ['["tourism"="camp_site"]'],
}

/** Builds a query for the chosen categories only, inside the given boxes along the route. */
function buildQuery(boxes: string[], categories: PoiCategory[]): string {
  // Nodes and ways only: relations are rare for these and their centers are slow to compute.
  const statements = categories
    .flatMap((c) => CATEGORY_STATEMENTS[c])
    .flatMap((filter) => boxes.flatMap((box) => [`node${filter}(${box});`, `way${filter}(${box});`]))
  return `[out:json][timeout:25];(${statements.join('')});out center tags;`
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

const OVERPASS_TIMEOUT_MS = 25_000
/** A normal answer takes a few seconds, so a second mirror only joins after a longer wait. */
const OVERPASS_STAGGER_MS = 4_000
const PREFERRED_KEY = 'travel-planner:overpass-server'

async function queryOverpassAt(endpoint: string, query: string, signal: AbortSignal): Promise<OverpassElement[]> {
  // A hung mirror must not stall the search, so each attempt has its own timeout.
  const attempt = withTimeout(signal, OVERPASS_TIMEOUT_MS)
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: attempt.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as { elements?: OverpassElement[]; remark?: string }
    // Overpass reports a server-side timeout as HTTP 200 with a "runtime error" remark.
    if (!data.elements || (data.elements.length === 0 && data.remark?.includes('error'))) {
      throw new Error(data.remark ?? 'no elements')
    }
    return data.elements
  } finally {
    attempt.done()
  }
}

/**
 * Asks the Overpass mirrors, starting with the one that answered last time. A second mirror
 * joins if the first is slow, and the first answer wins.
 */
async function queryOverpass(query: string, signal?: AbortSignal): Promise<{ elements: OverpassElement[] }> {
  const endpoints = preferredOrder(PREFERRED_KEY, OVERPASS_ENDPOINTS, (e) => e)
  try {
    const { value, index } = await firstSuccessful(
      endpoints.map((endpoint) => (s: AbortSignal) =>
        queryOverpassAt(endpoint, query, s).catch((err) => {
          if (!s.aborted) console.warn(`Overpass server failed: ${endpoint}`, err)
          throw err
        }),
      ),
      OVERPASS_STAGGER_MS,
      signal,
    )
    rememberPreferred(PREFERRED_KEY, endpoints[index])
    return { elements: value }
  } catch (err) {
    if (signal?.aborted) throw err
    throw new Error('חיפוש נקודות העניין נכשל.')
  }
}

/**
 * Queries Overpass for the chosen categories (viewpoints, kosher food, fuel stations, KKL/Nature
 * Authority camping) inside the boxes that cover the route corridor.
 */
/** Turns one OSM object (from either source) into a RawPoi, or null if it is not wanted. */
function toRawPoi(
  id: string,
  lat: number | undefined,
  lng: number | undefined,
  tags: Record<string, string>,
  wanted: Set<PoiCategory>,
): RawPoi | null {
  const category = categorize(tags)
  const name = displayNameFor(tags)
  // Skip unnamed places — a generic category label isn't a useful name to show.
  if (!category || !name || !wanted.has(category) || lat == null || lng == null) return null
  return {
    id,
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
  }
}

async function fetchFromOverpass(boxes: string[], wanted: Set<PoiCategory>, signal: AbortSignal): Promise<RawPoi[]> {
  const data = await queryOverpass(buildQuery(boxes, [...wanted]), signal)
  return data.elements
    .map((el) => toRawPoi(`${el.type}/${el.id}`, el.lat ?? el.center?.lat, el.lon ?? el.center?.lon, el.tags ?? {}, wanted))
    .filter((p): p is RawPoi => p !== null)
}

/**
 * Nominatim "special phrases" per category. Kosher food has no phrase of its own, so
 * restaurants and fast food are fetched and the kosher tags in extratags decide.
 */
const NOMINATIM_PHRASES: Record<PoiCategory, string[]> = {
  viewpoint: ['[viewpoint]'],
  'kosher-food': ['[restaurant]', '[fast_food]'],
  fuel: ['[fuel]'],
  camping: ['[camp_site]'],
}
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
/** Nominatim's usage policy allows at most one request per second. */
const NOMINATIM_INTERVAL_MS = 1_100

interface NominatimPlace {
  osm_type: string
  osm_id: number
  lat: string
  lon: string
  category: string
  type: string
  name?: string
  extratags?: Record<string, string> | null
}

/**
 * Backup source: Nominatim, which the address search already uses and which answers
 * reliably from the browser. It searches each box for each category's phrase, one
 * request per second.
 */
async function fetchFromNominatim(
  boxes: string[],
  wanted: Set<PoiCategory>,
  signal: AbortSignal,
  onPartial: (pois: RawPoi[]) => void,
): Promise<RawPoi[]> {
  const results = new Map<string, RawPoi>()
  const phrases = [...wanted].flatMap((c) => NOMINATIM_PHRASES[c])
  let first = true

  for (const box of boxes) {
    const [south, west, north, east] = box.split(',')
    for (const phrase of phrases) {
      if (!first) await new Promise((resolve) => setTimeout(resolve, NOMINATIM_INTERVAL_MS))
      first = false
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

      const url = new URL(NOMINATIM_URL)
      url.searchParams.set('q', phrase)
      url.searchParams.set('format', 'jsonv2')
      url.searchParams.set('viewbox', `${west},${north},${east},${south}`)
      url.searchParams.set('bounded', '1')
      url.searchParams.set('limit', '40')
      url.searchParams.set('extratags', '1')
      url.searchParams.set('accept-language', 'he')

      const attempt = withTimeout(signal, 10_000)
      try {
        const res = await fetch(url.toString(), { signal: attempt.signal })
        if (!res.ok) continue
        const places = (await res.json()) as NominatimPlace[]
        const fresh: RawPoi[] = []
        for (const place of places) {
          const tags: Record<string, string> = { ...(place.extratags ?? {}), [place.category]: place.type }
          if (place.name) tags.name = place.name
          const id = `${place.osm_type}/${place.osm_id}`
          const poi = toRawPoi(id, Number(place.lat), Number(place.lon), tags, wanted)
          if (poi && !results.has(id)) {
            results.set(id, poi)
            fresh.push(poi)
          }
        }
        // Show each part of the route as soon as it is in, instead of waiting for all of it.
        if (fresh.length > 0 && !signal.aborted) onPartial(fresh)
      } catch (err) {
        if (signal.aborted) throw err
        // one failed box should not lose the rest
      } finally {
        attempt.done()
      }
    }
  }
  return [...results.values()]
}

/** How long Overpass gets on its own before the Nominatim backup starts alongside it. */
const BACKUP_AFTER_MS = 3_000

/**
 * Finds the chosen categories inside the boxes that cover the route corridor. onPartial
 * gets results early when the backup source delivers them piece by piece; the returned
 * list is the full set, so callers should merge by id. Overpass is
 * tried first (full tag data, one request); if it fails or is silent for a few seconds,
 * Nominatim starts too, and the first source to answer wins.
 */
export async function fetchPois(
  boxes: { overpass: string[]; nominatim: string[] },
  categories: PoiCategory[],
  onPartial: (pois: RawPoi[]) => void,
  signal?: AbortSignal,
): Promise<RawPoi[]> {
  if (categories.length === 0) return []
  const wanted = new Set(categories)
  try {
    const { value } = await firstSuccessful(
      [
        (s) => fetchFromOverpass(boxes.overpass, wanted, s),
        // Bigger boxes for Nominatim: one request per box and category, at one per second.
        (s) => fetchFromNominatim(boxes.nominatim, wanted, s, onPartial),
      ],
      BACKUP_AFTER_MS,
      signal,
    )
    return value
  } catch (err) {
    if (signal?.aborted) throw err
    throw new Error('חיפוש המקומות נכשל.')
  }
}
