import { useState } from 'react'
import { fetchRoute } from './api/routing'
import { fetchPois } from './api/pois'
import { distanceToRoute, routeSearchBBox, toRouteLine } from './utils/corridor'
import { MapView } from './components/MapView'
import { SearchBox } from './components/SearchBox'
import { Sidebar } from './components/Sidebar'
import type { FoodFilterTag, LatLng, Place, Poi, PoiCategory } from './types'
import { matchesActiveFilters } from './utils/poiDisplay'
import './App.css'

const DEFAULT_CORRIDOR_KM = 5

function App() {
  const [start, setStart] = useState<Place | null>(null)
  const [end, setEnd] = useState<Place | null>(null)
  const [route, setRoute] = useState<LatLng[] | null>(null)
  const [routeSummary, setRouteSummary] = useState<{ distanceKm: number; durationMin: number } | null>(null)
  const [pois, setPois] = useState<Poi[]>([])
  const [corridorKm, setCorridorKm] = useState(DEFAULT_CORRIDOR_KM)
  const [activeFilters, setActiveFilters] = useState<Set<PoiCategory>>(
    new Set(['viewpoint', 'kosher-food', 'fuel']),
  )
  const [activeFoodTags, setActiveFoodTags] = useState<Set<FoodFilterTag>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [focusedPoiId, setFocusedPoiId] = useState<string | null>(null)

  async function planRoute(corridor = corridorKm) {
    if (!start || !end) {
      setError('בחרו קודם נקודת יציאה ונקודת יעד.')
      return
    }

    setLoading(true)
    setError(null)
    setFocusedPoiId(null)

    try {
      const result = await fetchRoute(start, end)
      setRoute(result.coordinates)
      setRouteSummary({ distanceKm: result.distanceKm, durationMin: result.durationMin })

      const routeLine = toRouteLine(result.coordinates)
      const bbox = routeSearchBBox(routeLine, corridor)
      const rawPois = await fetchPois(bbox)

      const withDistance: Poi[] = rawPois
        .map((p) => {
          const { distanceFromRoute, distanceAlongRoute } = distanceToRoute(routeLine, {
            lat: p.lat,
            lng: p.lng,
          })
          return { ...p, distanceFromRoute, distanceAlongRoute }
        })
        .filter((p) => p.distanceFromRoute <= corridor)

      setPois(withDistance)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'משהו השתבש בתכנון המסלול.')
    } finally {
      setLoading(false)
    }
  }

  function toggleFilter(category: PoiCategory) {
    setActiveFilters((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  function toggleFoodTag(tag: FoodFilterTag) {
    setActiveFoodTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  function handleCorridorChange(km: number) {
    setCorridorKm(km)
    if (route) void planRoute(km)
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>מטיילים עם דוד חיים</h1>
        <div className="route-form">
          <SearchBox label="נקודת יציאה" placeholder="עיר או מקום יציאה" value={start} onChange={setStart} />
          <SearchBox label="נקודת יעד" placeholder="עיר או מקום יעד" value={end} onChange={setEnd} />
          <button type="button" className="plan-button" onClick={() => planRoute()} disabled={loading}>
            {loading ? 'מתכנן…' : 'תכנון מסלול'}
          </button>
        </div>
      </header>

      <div className="body">
        <Sidebar
          pois={pois}
          loading={loading}
          error={error}
          activeFilters={activeFilters}
          onToggleFilter={toggleFilter}
          activeFoodTags={activeFoodTags}
          onToggleFoodTag={toggleFoodTag}
          corridorKm={corridorKm}
          onCorridorChange={handleCorridorChange}
          onSelectPoi={setFocusedPoiId}
          routeSummary={routeSummary}
        />
        <MapView
          start={start}
          end={end}
          route={route}
          pois={pois.filter((p) => matchesActiveFilters(p, activeFilters, activeFoodTags))}
          focusedPoiId={focusedPoiId}
        />
      </div>
    </div>
  )
}

export default App
