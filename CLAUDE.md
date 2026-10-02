# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"מטיילים עם דוד חיים" — a road-trip route planner (Hebrew UI, RTL). User picks a start and
end point, gets a driving route on a map, and sees points of interest along a configurable
corridor around the route: scenic viewpoints, kosher food, fuel stations, KKL/Nature Authority
camping/lodging, and hiking sites. Routes and filters can be saved (localStorage) or shared via
a URL.

No backend of its own — everything is a browser-side React app calling free public OSM-based
services directly:

- **Geocoding:** Nominatim (`src/api/geocode.ts`)
- **Route planning:** OSRM public demo server, driving profile only (`src/api/routing.ts`)
- **POIs (viewpoints/kosher/fuel/camping):** Overpass API (`src/api/pois.ts`)
- **Hiking sites:** Israel Hiking Map API (`src/api/hikingPois.ts`)
- **Corridor/distance math:** Turf.js (`src/utils/corridor.ts`)
- **Map rendering:** Leaflet / react-leaflet (`src/components/MapView.tsx`)

## Commands

```bash
npm install
npm run dev       # start dev server (Vite)
npm run build     # tsc -b then vite build
npm run lint      # oxlint
npm run preview   # preview production build
```

There is no test suite in this repo currently. Type-checking happens as part of `npm run build`
(`tsc -b`).

## Architecture

**All state lives in `src/App.tsx`.** There is no state management library and no context —
`App` owns start/end points, the current route, POIs, all filter selections, and orchestrates
the components below. Read `App.tsx` first when tracing any feature end to end.

### Route planning flow (`planRoute` in `App.tsx`)

1. Clears all previous route data (route line, summary, POIs) *before* fetching, so a failure
   partway through never leaves stale markers from the previous route on screen.
2. Fetches the driving route from OSRM (`fetchRoute`).
3. Builds a buffered bounding-box "corridor" around the route (`routeSearchBBox` in
   `utils/corridor.ts`) at the user-selected width (1–20 km) and queries Overpass for
   viewpoints/kosher-food/fuel/camping within it.
4. Independently (and without blocking the above), samples points along the route and queries
   the Israel Hiking Map API for the nearest hiking POI to each sample (`fetchHikingPois`) —
   this API has no bounding-box search, only nearest-to-a-single-point, so coverage is sparse
   and best-effort. Results are merged in whenever they resolve.
5. A `planRequestIdRef` guard discards results from a stale in-flight request (e.g. user changed
   the corridor width or cleared the route before the slow hiking-POI fetch finished) — check
   this pattern before adding any other async data source to `planRoute`.
6. Every POI gets `distanceFromRoute` / `distanceAlongRoute` computed via
   `distanceToRoute` (nearest-point-on-line), and anything outside the corridor is filtered out
   client-side (needed because the hiking-POI source can't be bounded server-side, and is
   applied uniformly for consistency).

### POI categorization is all heuristic, on purpose

`src/api/pois.ts` and `src/utils/poiDisplay.ts` derive category and sub-filter tags (kosher
meat/dairy, fuel car-wash/convenience/shabbat-closed) from loosely-tagged OSM data — there are no
dedicated tags for most of these concepts (e.g. "belongs to KKL", "closed for Shabbat"). Each
heuristic function has a comment explaining exactly what it matches and why it will over- or
under-detect; read those comments before changing matching logic, and keep new heuristics
similarly documented since their accuracy tradeoffs aren't obvious from the code alone. The
`README.md`'s "מגבלות ידועות" (known limitations) section is the canonical list of these
tradeoffs from the user's perspective.

### Filtering model

- `PoiCategory` is the top-level toggle (viewpoint / kosher-food / fuel / camping / hiking).
- `FoodFilterTag` and `FuelFilterTag` are sub-filters within kosher-food and fuel respectively,
  plus free-form fuel brand filtering.
- `matchesActiveFilters` (`utils/poiDisplay.ts`) is the single source of truth for whether a POI
  is currently visible — an empty sub-filter group means "no narrowing", not "show nothing".
  Both `MapView` (which markers to draw) and the POI list read through this function.

### Sharing / persistence

- `utils/shareLink.ts` encodes the full planning state (start, end, corridor width, all active
  filters) into URL query params and decodes it back; `App.tsx` reads this on mount and
  auto-replans if a shared route is present.
- `utils/savedRoutes.ts` persists named routes to `localStorage` under
  `travel-planner:saved-routes`; failures (private browsing, quota) degrade to in-memory-only
  rather than throwing.

### External API resilience patterns worth preserving

- Overpass queries try multiple public mirrors in sequence (`OVERPASS_ENDPOINTS` in
  `api/pois.ts`) since the primary instance 504s under load.
- Hiking POI requests are rate-limited (500ms between requests) to match the community server's
  expected load, each with its own timeout so one hung request can't stall the whole plan.
- The hiking-POI source's failures are always swallowed (best-effort supplementary data); the
  primary Overpass/OSRM sources still throw to `App.tsx`'s `error` state.
