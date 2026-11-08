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
const ALL_CATEGORIES: PoiCategory[] = ['viewpoint', 'kosher-food', 'fuel', 'camping']
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
  const [activeFilters, setActiveFilters] = useState<Set<PoiCategory>>(() => new Set(ALL_CATEGORIES))
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
  const corridorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * Loads the places along an already-planned route. The Overpass search and the slower
   * Israel Hiking Map lookups run side by side; whichever finishes first shows up first.
   * A failed place search keeps the route on the map and only shows a message.
   */
  async function loadPois(coordinates: LatLng[], corridor: number, requestId: number) {
    const isCurrent = () => planRequestIdRef.current === requestId
    const routeLine = toRouteLine(coordinates)
    setPois([])

    // Best-effort source used to enrich the viewpoint category; its failures stay silent.
    fetchHikingPois(routeLine)
      .then((rawHikingPois) => {
        if (!isCurrent()) return
        const hikingWithDistance = withRouteDistance(rawHikingPois, routeLine, corridor)
        if (hikingWithDistance.length > 0) setPois((prev) => [...prev, ...hikingWithDistance])
      })
      .catch(() => {})

    try {
      // A small margin so points that sit just off the simplified line are not missed;
      // withRouteDistance then measures against the full route and drops the extras.
      const rawPois = await fetchPois(routeQueryPoints(routeLine), corridor + 0.5)
      if (!isCurrent()) return
      const withDistance = withRouteDistance(rawPois, routeLine, corridor)
      setPois((prev) => [...withDistance, ...prev])
    } catch {
      if (isCurrent()) {
        setError('המסלול מוכן, אבל שרת המקומות לא ענה. נסו שוב בעוד דקה.')
      }
    }
  }

  async function planRoute(override?: RouteOverride) {
    const effectiveStart = override?.start ?? start
    const effectiveEnd = override?.end ?? end
    const corridor = override?.corridor ?? corridorKm

    if (!effectiveStart || !effectiveEnd) {
      setError('בחרו נקודת יציאה ונקודת יעד מתוך ההצעות שמופיעות בזמן ההקלדה.')
      return
    }

    const requestId = ++planRequestIdRef.current

    setLoading(true)
    setError(null)
    setFocusedPoiId(null)
    // Clear the previous route's data up front, so a failure partway through can never
    // leave stale markers on screen.
    setRoute(null)
    setRouteSummary(null)
    setPois([])

    try {
      const result = await fetchRoute(effectiveStart, effectiveEnd)
      if (planRequestIdRef.current !== requestId) return
      setRoute(result.coordinates)
      setRouteSummary({ distanceKm: result.distanceKm, durationMin: result.durationMin })
      await loadPois(result.coordinates, corridor, requestId)
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
    setActiveFilters(shared.filters.size > 0 ? shared.filters : new Set(ALL_CATEGORIES))
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
    if (!route) return
    // The route itself does not change, so only the places are searched again, and only
    // once the slider settles; dragging it used to send a full re-plan for every step.
    if (corridorTimerRef.current) clearTimeout(corridorTimerRef.current)
    corridorTimerRef.current = setTimeout(async () => {
      const requestId = ++planRequestIdRef.current
      setLoading(true)
      setError(null)
      await loadPois(route, km, requestId)
      if (planRequestIdRef.current === requestId) setLoading(false)
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
    setActiveFilters(new Set(saved.filters.length > 0 ? saved.filters : ALL_CATEGORIES))
    setActiveFoodTags(new Set(saved.foodTags))
    setActiveFuelTags(new Set(saved.fuelTags))
    setActiveFuelBrands(new Set(saved.fuelBrands))
    void planRoute({ start: saved.start, end: saved.end, corridor: saved.corridorKm })
  }

  function handleDeleteRoute(id: string) {
    setSavedRoutes(removeSavedRoute(id))
  }

  function handleClearRoute() {
    planRequestIdRef.current++
    if (corridorTimerRef.current) clearTimeout(corridorTimerRef.current)
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
                  // Keep the sheet open when a point is missing, so the message stays visible.
                  if (start && end) setMobileMenuOpen(false)
                }}
                disabled={loading}
              >
                {loading ? 'מחפש…' : 'תכנון מסלול'}
              </button>
              {(start || end || route) && (
                <button type="button" className="clear-button" onClick={handleClearRoute} disabled={loading}>
                  ניקוי
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
        {!mobileMenuOpen && (
          <button type="button" className="mobile-fab" onClick={() => setMobileMenuOpen(true)}>
            {route ? `🧭 ${pois.filter((p) => matchesActiveFilters(p, filterState)).length} מקומות בדרך` : '🔍 תכנון מסלול'}
          </button>
        )}
      </div>
    </div>
  )
}

export default App
