import { useEffect, useRef, useState } from 'react'
import { fetchRoute } from './api/routing'
import { fetchPois, type RawPoi } from './api/pois'
import { fetchHikingPois } from './api/hikingPois'
import { distanceToRoute, routeSearchBBox, toRouteLine } from './utils/corridor'
import { FavoritesMenu } from './components/FavoritesMenu'
import { MapView } from './components/MapView'
import { SearchBox } from './components/SearchBox'
import { Sidebar } from './components/Sidebar'
import { TripWeather } from './components/TripWeather'
import type { FoodFilterTag, FuelFilterTag, LatLng, Place, Poi, PoiCategory } from './types'
import { matchesActiveFilters } from './utils/poiDisplay'
import { addSavedRoute, loadSavedRoutes, removeSavedRoute, type SavedRoute } from './utils/savedRoutes'
import { buildShareUrl, parseShareUrl } from './utils/shareLink'
import './App.css'

const DEFAULT_CORRIDOR_KM = 5

function toggleInSet<T>(setter: (updater: (prev: Set<T>) => Set<T>) => void, value: T) {
  setter((prev) => {
    const next = new Set(prev)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    return next
  })
}

interface RouteOverride {
  start?: Place
  end?: Place
  corridor?: number
}

function withRouteDistance(raw: RawPoi[], routeLine: ReturnType<typeof toRouteLine>, corridorKm: number): Poi[] {
  return raw
    .map((p) => {
      const { distanceFromRoute, distanceAlongRoute } = distanceToRoute(routeLine, { lat: p.lat, lng: p.lng })
      return { ...p, distanceFromRoute, distanceAlongRoute }
    })
    .filter((p) => p.distanceFromRoute <= corridorKm)
}

function App() {
  const [start, setStart] = useState<Place | null>(null)
  const [end, setEnd] = useState<Place | null>(null)
  const [departureDate, setDepartureDate] = useState('')
  const [returnDate, setReturnDate] = useState('')
  const [route, setRoute] = useState<LatLng[] | null>(null)
  const [routeSummary, setRouteSummary] = useState<{ distanceKm: number; durationMin: number } | null>(null)
  const [pois, setPois] = useState<Poi[]>([])
  const [corridorKm, setCorridorKm] = useState(DEFAULT_CORRIDOR_KM)
  const [activeFilters, setActiveFilters] = useState<Set<PoiCategory>>(new Set())
  const [activeFoodTags, setActiveFoodTags] = useState<Set<FoodFilterTag>>(new Set())
  const [activeFuelTags, setActiveFuelTags] = useState<Set<FuelFilterTag>>(new Set())
  const [activeFuelBrands, setActiveFuelBrands] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [focusedPoiId, setFocusedPoiId] = useState<string | null>(null)
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>(() => loadSavedRoutes())
  const [shareStatus, setShareStatus] = useState<string | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  // Guards against a slow, previous plan's hiking-POI fetch resolving after a newer plan has
  // already started (or the user hit "clear") and appending its results onto the wrong route.
  const planRequestIdRef = useRef(0)

  async function planRoute(override?: RouteOverride) {
    const effectiveStart = override?.start ?? start
    const effectiveEnd = override?.end ?? end
    const corridor = override?.corridor ?? corridorKm

    if (!effectiveStart || !effectiveEnd) {
      setError('בחרו קודם נקודת יציאה ונקודת יעד.')
      return
    }

    const requestId = ++planRequestIdRef.current

    setLoading(true)
    setError(null)
    setFocusedPoiId(null)
    // Clear the previous route's data up front, so a failure partway through (e.g. the
    // route loads but the POI search fails) can never leave stale markers on screen.
    setRoute(null)
    setRouteSummary(null)
    setPois([])

    try {
      const result = await fetchRoute(effectiveStart, effectiveEnd)
      setRoute(result.coordinates)
      setRouteSummary({ distanceKm: result.distanceKm, durationMin: result.durationMin })

      const routeLine = toRouteLine(result.coordinates)
      const bbox = routeSearchBBox(routeLine, corridor)
      const rawPois = await fetchPois(bbox)
      setPois(withRouteDistance(rawPois, routeLine, corridor))

      // The Israel Hiking Map is a slower, best-effort source (sequential requests, no
      // bounding-box search) used to enrich the viewpoint category — fetched in the background
      // so it never delays the faster, primary POI results, and merged in whenever it resolves
      // as long as this is still the current plan request.
      fetchHikingPois(routeLine)
        .then((rawHikingPois) => {
          if (planRequestIdRef.current !== requestId) return
          const hikingWithDistance = withRouteDistance(rawHikingPois, routeLine, corridor)
          if (hikingWithDistance.length > 0) setPois((prev) => [...prev, ...hikingWithDistance])
        })
        .catch(() => {
          // Best-effort supplementary source — never surface its failures to the user.
        })
    } catch (err) {
      if (planRequestIdRef.current === requestId) {
        setError(err instanceof Error ? err.message : 'משהו השתבש בתכנון המסלול.')
      }
    } finally {
      if (planRequestIdRef.current === requestId) setLoading(false)
    }
  }

  // Restore a shared route from the URL, if this page was opened from a share link.
  useEffect(() => {
    const shared = parseShareUrl()
    if (!shared) return

    setStart(shared.start)
    setEnd(shared.end)
    setCorridorKm(shared.corridorKm)
    setActiveFilters(shared.filters)
    setActiveFoodTags(shared.foodTags)
    setActiveFuelTags(shared.fuelTags)
    setActiveFuelBrands(shared.fuelBrands)
    void planRoute({ start: shared.start, end: shared.end, corridor: shared.corridorKm })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleDepartureDateChange(date: string) {
    setDepartureDate(date)
    // A return date earlier than the new departure date is no longer valid.
    if (returnDate && date && returnDate < date) setReturnDate('')
  }

  function toggleFilter(category: PoiCategory) {
    toggleInSet(setActiveFilters, category)
  }

  function toggleFoodTag(tag: FoodFilterTag) {
    toggleInSet(setActiveFoodTags, tag)
  }

  function toggleFuelTag(tag: FuelFilterTag) {
    toggleInSet(setActiveFuelTags, tag)
  }

  function toggleFuelBrand(brand: string) {
    toggleInSet(setActiveFuelBrands, brand)
  }

  function handleCorridorChange(km: number) {
    setCorridorKm(km)
    if (route) void planRoute({ corridor: km })
  }

  function handleSaveRoute() {
    if (!start || !end) return
    const defaultName = `${start.label.split(',')[0]} → ${end.label.split(',')[0]}`
    const name = window.prompt('שם למסלול השמור:', defaultName)
    if (!name) return

    setSavedRoutes(
      addSavedRoute({
        id: crypto.randomUUID(),
        name,
        start,
        end,
        corridorKm,
        filters: [...activeFilters],
        foodTags: [...activeFoodTags],
        fuelTags: [...activeFuelTags],
        fuelBrands: [...activeFuelBrands],
        savedAt: Date.now(),
      }),
    )
  }

  function handleLoadRoute(saved: SavedRoute) {
    setStart(saved.start)
    setEnd(saved.end)
    setCorridorKm(saved.corridorKm)
    setActiveFilters(new Set(saved.filters))
    setActiveFoodTags(new Set(saved.foodTags))
    setActiveFuelTags(new Set(saved.fuelTags))
    setActiveFuelBrands(new Set(saved.fuelBrands))
    void planRoute({ start: saved.start, end: saved.end, corridor: saved.corridorKm })
  }

  function handleDeleteRoute(id: string) {
    setSavedRoutes(removeSavedRoute(id))
  }

  function handleClearRoute() {
    setStart(null)
    setEnd(null)
    setDepartureDate('')
    setReturnDate('')
    setRoute(null)
    setRouteSummary(null)
    setPois([])
    setError(null)
    setFocusedPoiId(null)
  }

  async function handleShare() {
    if (!start || !end) return
    const url = buildShareUrl({
      start,
      end,
      corridorKm,
      filters: activeFilters,
      foodTags: activeFoodTags,
      fuelTags: activeFuelTags,
      fuelBrands: activeFuelBrands,
    })

    if (navigator.share) {
      try {
        await navigator.share({ title: 'מסלול טיול - מטיילים עם דוד חיים', url })
      } catch {
        // user closed the native share sheet without picking anything
      }
      return
    }

    try {
      await navigator.clipboard.writeText(url)
      setShareStatus('הקישור הועתק!')
    } catch {
      window.prompt('העתק את הקישור:', url)
      return
    }
    setTimeout(() => setShareStatus(null), 2500)
  }

  const filterState = {
    categories: activeFilters,
    foodTags: activeFoodTags,
    fuelTags: activeFuelTags,
    fuelBrands: activeFuelBrands,
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-start">
          <button
            type="button"
            className="mobile-menu-toggle"
            onClick={() => setMobileMenuOpen((o) => !o)}
            aria-label="תפריט חיפוש וסינון"
            aria-expanded={mobileMenuOpen}
          >
            ☰
          </button>
          <h1>מטיילים עם דוד חיים</h1>
        </div>
        <FavoritesMenu savedRoutes={savedRoutes} onLoadRoute={handleLoadRoute} onDeleteRoute={handleDeleteRoute} />
      </header>

      <div className={mobileMenuOpen ? 'body menu-open' : 'body'}>
        <div className="controls-panel">
          <button
            type="button"
            className="controls-panel-close"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="סגור"
          >
            ✕
          </button>
          <div className="route-form">
            <SearchBox label="נקודת יציאה" placeholder="עיר או מקום יציאה" value={start} onChange={setStart} />
            <SearchBox label="נקודת יעד" placeholder="עיר או מקום יעד" value={end} onChange={setEnd} />
            <TripWeather
              start={start}
              end={end}
              departureDate={departureDate}
              returnDate={returnDate}
              onDepartureDateChange={handleDepartureDateChange}
              onReturnDateChange={setReturnDate}
            />
            <div className="route-form-buttons">
              <button
                type="button"
                className="plan-button"
                onClick={() => {
                  void planRoute()
                  setMobileMenuOpen(false)
                }}
                disabled={loading}
              >
                {loading ? 'מתכנן…' : 'תכנון מסלול'}
              </button>
              {(start || end || route) && (
                <button type="button" className="clear-button" onClick={handleClearRoute} disabled={loading}>
                  🗑️ נקה
                </button>
              )}
            </div>
          </div>
          <Sidebar
            pois={pois}
            loading={loading}
            error={error}
            filterState={filterState}
            onToggleFilter={toggleFilter}
            onToggleFoodTag={toggleFoodTag}
            onToggleFuelTag={toggleFuelTag}
            onToggleFuelBrand={toggleFuelBrand}
            corridorKm={corridorKm}
            onCorridorChange={handleCorridorChange}
            onSelectPoi={(id) => {
              setFocusedPoiId(id)
              setMobileMenuOpen(false)
            }}
            routeSummary={routeSummary}
            onSaveRoute={handleSaveRoute}
            onShare={handleShare}
            shareStatus={shareStatus}
          />
        </div>
        <MapView
          start={start}
          end={end}
          route={route}
          pois={pois.filter((p) => matchesActiveFilters(p, filterState))}
          focusedPoiId={focusedPoiId}
        />
      </div>
    </div>
  )
}

export default App
