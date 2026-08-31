import type { Poi } from '../types'

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
  return null
}

function nameFor(tags: Record<string, string>, category: Poi['category']): string {
  if (tags.name) return tags.name
  return category === 'viewpoint' ? 'נקודת תצפייה' : 'אוכל כשר'
}

/** Queries Overpass for scenic viewpoints and kosher food within a bounding box. */
export async function fetchPois(bbox: BBox, signal?: AbortSignal): Promise<
  Array<{ id: string; category: Poi['category']; name: string; lat: number; lng: number; tags: Record<string, string> }>
> {
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

  const results: Array<{
    id: string
    category: Poi['category']
    name: string
    lat: number
    lng: number
    tags: Record<string, string>
  }> = []

  for (const el of data.elements) {
    const tags = el.tags ?? {}
    const category = categorize(tags)
    if (!category) continue

    const lat = el.lat ?? el.center?.lat
    const lng = el.lon ?? el.center?.lon
    if (lat == null || lng == null) continue

    results.push({
      id: `${el.type}/${el.id}`,
      category,
      name: nameFor(tags, category),
      lat,
      lng,
      tags,
    })
  }

  return results
}
