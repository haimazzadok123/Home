import { useEffect, useRef, useState } from 'react'
import { fetchRoute } from './api/routing'
import { fetchPois, type RawPoi } from './api/pois'
import { fetchHikingPois } from './api/hikingPois'
import { distanceToRoute, routeQueryPoints, toRouteLine } from './utils/corridor'
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
const CORRIDOR_DEBOUNCE_MS = 600

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
  categories?: Set<PoiCategory>
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
  const [loadingCats, setLoadingCats] = useState<Set<PoiCategory>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [focusedPoiId, setFocusedPoiId] = useState<string | null>(null)
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>(() => loadSavedRoutes())
  const [shareStatus, setShareStatus] = useState<string | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  // Every new route, corridor change, cancel or clear bumps the version, so a slow answer
  // that belongs to an older search can never add its places to the current one.
  const versionRef = useRef(0)
  const abortRef = useRef(new AbortController())
  /** Categories already searched (or being searched) for the current route and corridor. */
  const fetchedRef = useRef(new Set<PoiCategory>())
  const pendingRef = useRef(new Set<PoiCategory>())
  const activeFiltersRef = useRef(activeFilters)
  const corridorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const poisLoading = loadingCats.size > 0

  function applyFilters(next: Set<PoiCategory>) {
    activeFiltersRef.current = next
    setActiveFilters(next)
  }

  /** Stops everything in flight and forgets what was searched. */
  function resetSearch() {
    abortRef.current.abort()
    abortRef.current = new AbortController()
    versionRef.current++
    fetchedRef.current = new Set()
    pendingRef.current = new Set()
    if (corridorTimerRef.current) clearTimeout(corridorTimerRef.current)
    setLoadingCats(new Set())
  }

  /** Cancel button: stops running searches but keeps the route and places already found. */
  function cancelSearch() {
    abortRef.current.abort()
    abortRef.current = new AbortController()
    versionRef.current++
    // Unfinished categories can be searched again by choosing them again.
    for (const c of pendingRef.current) fetchedRef.current.delete(c)
    pendingRef.current = new Set()
    if (corridorTimerRef.current) clearTimeout(corridorTimerRef.current)
    setLoadingCats(new Set())
    setLoading(false)
  }

  /**
   * Searches the route for the given categories only, skipping ones already searched.
   * Overpass and the slower Israel Hiking Map (viewpoints only) run side by side.
   */
  async function searchCategories(categories: PoiCategory[], coordinates: LatLng[], corridor: number) {
    const todo = categories.filter((c) => !fetchedRef.current.has(c))
    if (todo.length === 0) return

    const version = versionRef.current
    const signal = abortRef.current.signal
    const isCurrent = () => versionRef.current === version
    const routeLine = toRouteLine(coordinates)
    for (const c of todo) {
      fetchedRef.current.add(c)
      pendingRef.current.add(c)
    }
    setLoadingCats(new Set(pendingRef.current))
    setError(null)

    if (todo.includes('viewpoint')) {
      // Best-effort extra viewpoints; its failures stay silent.
      fetchHikingPois(routeLine, signal)
        .then((rawHikingPois) => {
          if (!isCurrent()) return
          const hikingWithDistance = withRouteDistance(rawHikingPois, routeLine, corridor)
          if (hikingWithDistance.length > 0) setPois((prev) => [...prev, ...hikingWithDistance])
        })
        .catch(() => {})
    }

    try {
      // Widen the search by how far the simplified line strays from the road, so nothing
      // near the real route is missed; withRouteDistance then drops the extras.
      const { points, deviationKm } = routeQueryPoints(routeLine)
      const rawPois = await fetchPois(points, corridor + deviationKm + 0.3, todo, signal)
      if (!isCurrent()) return
      const withDistance = withRouteDistance(rawPois, routeLine, corridor)
      setPois((prev) => [...prev, ...withDistance])
    } catch {
      if (!isCurrent()) return
      for (const c of todo) fetchedRef.current.delete(c)
      setError('שרת המקומות לא ענה. נסו שוב בעוד דקה (כבו והדליקו את הסוג שבחרתם).')
    } finally {
      if (isCurrent()) {
        for (const c of todo) pendingRef.current.delete(c)
        setLoadingCats(new Set(pendingRef.current))
      }
    }
  }

  async function planRoute(override?: RouteOverride) {
    const effectiveStart = override?.start ?? start
    const effectiveEnd = override?.end ?? end
    const corridor = override?.corridor ?? corridorKm
    const categories = override?.categories ?? activeFiltersRef.current

    if (!effectiveStart || !effectiveEnd) {
      setError('בחרו נקודת יציאה ונקודת יעד מתוך ההצעות שמופיעות בזמן ההקלדה.')
      return
    }

    resetSearch()
    const version = versionRef.current
    const signal = abortRef.current.signal

    setLoading(true)
    setError(null)
    setFocusedPoiId(null)
    // Clear the previous route's data up front, so a failure partway through can never
    // leave stale markers on screen.
    setRoute(null)
    setRouteSummary(null)
    setPois([])

    try {
      const result = await fetchRoute(effectiveStart, effectiveEnd, signal)
      if (versionRef.current !== version) return
      setRoute(result.coordinates)
      setRouteSummary({ distanceKm: result.distanceKm, durationMin: result.durationMin })
      setLoading(false)
      // Only the categories the user chose are searched.
      void searchCategories([...categories], result.coordinates, corridor)
    } catch (err) {
      if (versionRef.current === version) {
        setError(err instanceof Error ? err.message : 'משהו השתבש בתכנון המסלול.')
      }
    } finally {
      if (versionRef.current === version) setLoading(false)
    }
  }

  // Restore a shared route from the URL, if this page was opened from a share link.
  useEffect(() => {
    const shared = parseShareUrl()
    if (!shared) return

    setStart(shared.start)
    setEnd(shared.end)
    setCorridorKm(shared.corridorKm)
    applyFilters(shared.filters)
    setActiveFoodTags(shared.foodTags)
    setActiveFuelTags(shared.fuelTags)
    setActiveFuelBrands(shared.fuelBrands)
    void planRoute({ start: shared.start, end: shared.end, corridor: shared.corridorKm, categories: shared.filters })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleDepartureDateChange(date: string) {
    setDepartureDate(date)
    // A return date earlier than the new departure date is no longer valid.
    if (returnDate && date && returnDate < date) setReturnDate('')
  }

  function toggleFilter(category: PoiCategory) {
    const next = new Set(activeFiltersRef.current)
    if (next.has(category)) {
      next.delete(category)
    } else {
      next.add(category)
      // Choosing a category searches the route for that category only.
      if (route) void searchCategories([category], route, corridorKm)
    }
    applyFilters(next)
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
    if (!route) return
    // The route itself does not change, so only the chosen categories are searched again,
    // and only once the slider settles.
    if (corridorTimerRef.current) clearTimeout(corridorTimerRef.current)
    corridorTimerRef.current = setTimeout(() => {
      resetSearch()
      setPois([])
      void searchCategories([...activeFiltersRef.current], route, km)
    }, CORRIDOR_DEBOUNCE_MS)
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
    const savedFilters = new Set(saved.filters)
    applyFilters(savedFilters)
    setActiveFoodTags(new Set(saved.foodTags))
    setActiveFuelTags(new Set(saved.fuelTags))
    setActiveFuelBrands(new Set(saved.fuelBrands))
    void planRoute({ start: saved.start, end: saved.end, corridor: saved.corridorKm, categories: savedFilters })
  }

  function handleDeleteRoute(id: string) {
    setSavedRoutes(removeSavedRoute(id))
  }

  function handleClearRoute() {
    resetSearch()
    setLoading(false)
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
          <h1 className="brand">
            מטיילים עם <span>דוד חיים</span>
          </h1>
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
            <div className="panel-heading">
              <h2>לאן נוסעים?</h2>
              <p>בוחרים מוצא ויעד, ואנחנו מראים מה יש בדרך.</p>
            </div>
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
                  // Keep the sheet open when a point is missing (so the message shows) or when
                  // nothing is chosen yet (so the categories below can be picked).
                  if (start && end && activeFilters.size > 0) setMobileMenuOpen(false)
                }}
                disabled={loading}
              >
                {loading ? 'מחשב מסלול…' : 'תכנון מסלול'}
              </button>
              {loading || poisLoading ? (
                <button type="button" className="clear-button" onClick={cancelSearch}>
                  ביטול
                </button>
              ) : (
                (start || end || route) && (
                  <button type="button" className="clear-button" onClick={handleClearRoute}>
                    ניקוי
                  </button>
                )
              )}
            </div>
          </div>
          <Sidebar
            pois={pois}
            loading={poisLoading}
            loadingCategories={loadingCats}
            hasRoute={!!route}
            onCancel={cancelSearch}
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
        {!mobileMenuOpen && (
          <button
            type="button"
            className="mobile-fab"
            onClick={() => (loading || poisLoading ? cancelSearch() : setMobileMenuOpen(true))}
          >
            {loading || poisLoading
              ? '✕ ביטול חיפוש'
              : !route
                ? '🔍 תכנון מסלול'
                : activeFilters.size === 0
                  ? '🧭 בחרו מה לחפש בדרך'
                  : `🧭 ${pois.filter((p) => matchesActiveFilters(p, filterState)).length} מקומות בדרך`}
          </button>
        )}
      </div>
    </div>
  )
}

export default App
