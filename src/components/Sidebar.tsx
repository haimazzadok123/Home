import { useMemo, useState } from 'react'
import type { FoodFilterTag, FuelFilterTag, Poi, PoiCategory } from '../types'
import {
  CATEGORY_EMOJI,
  FOOD_FILTER_LABEL,
  FOOD_FILTER_TAGS,
  FUEL_FILTER_LABEL,
  FUEL_FILTER_TAGS,
  matchesActiveFilters,
  type ActiveFilterState,
} from '../utils/poiDisplay'

interface SidebarProps {
  pois: Poi[]
  loading: boolean
  loadingCategories: Set<PoiCategory>
  hasRoute: boolean
  onCancel: () => void
  error: string | null
  filterState: ActiveFilterState
  onToggleFilter: (category: PoiCategory) => void
  onToggleFoodTag: (tag: FoodFilterTag) => void
  onToggleFuelTag: (tag: FuelFilterTag) => void
  onToggleFuelBrand: (brand: string) => void
  corridorKm: number
  onCorridorChange: (km: number) => void
  onSelectPoi: (id: string) => void
  routeSummary: { distanceKm: number; durationMin: number } | null
  onSaveRoute: () => void
  onShare: () => void
  shareStatus: string | null
}

const FILTERS: Array<{ category: PoiCategory; label: string; emoji: string }> = [
  { category: 'viewpoint', label: 'נקודות תצפייה', emoji: '🏞️' },
  { category: 'kosher-food', label: 'אוכל כשר', emoji: '🍽️' },
  { category: 'fuel', label: 'תחנות דלק', emoji: '⛽' },
  { category: 'camping', label: 'לינה בקק"ל וברט"ג', emoji: '⛺' },
]

/** Excludes English-only brand tags from the "by company" filter — Hebrew names only. */
const HEBREW_LETTER = /[\u0590-\u05FF]/

function formatDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h > 0 ? `${h} ש' ${m} ד'` : `${m} ד'`
}

interface SubfilterGroupProps<T extends string> {
  title: string
  options: T[]
  labelFor: (option: T) => string
  active: Set<T>
  onToggle: (option: T) => void
}

function SubfilterGroup<T extends string>({ title, options, labelFor, active, onToggle }: SubfilterGroupProps<T>) {
  const [open, setOpen] = useState(false)
  if (options.length === 0) return null

  return (
    <div className="subfilter">
      <button type="button" className="subfilter-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {title} {open ? '▲' : '▾'}
      </button>
      {open && (
        <div className="subfilter-options">
          {options.map((option) => (
            <label key={option} className="subfilter-option">
              <input type="checkbox" checked={active.has(option)} onChange={() => onToggle(option)} />
              {labelFor(option)}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export function Sidebar({
  pois,
  loading,
  loadingCategories,
  hasRoute,
  onCancel,
  error,
  filterState,
  onToggleFilter,
  onToggleFoodTag,
  onToggleFuelTag,
  onToggleFuelBrand,
  corridorKm,
  onCorridorChange,
  onSelectPoi,
  routeSummary,
  onSaveRoute,
  onShare,
  shareStatus,
}: SidebarProps) {
  const fuelBrands = useMemo(() => {
    const brands = new Set<string>()
    for (const poi of pois) {
      if (poi.category === 'fuel' && poi.brand && HEBREW_LETTER.test(poi.brand)) brands.add(poi.brand)
    }
    return [...brands].sort((a, b) => a.localeCompare(b, 'he'))
  }, [pois])

  const visible = pois
    .filter((p) => matchesActiveFilters(p, filterState))
    .sort((a, b) => a.distanceAlongRoute - b.distanceAlongRoute)

  return (
    <aside className="sidebar">
      {routeSummary && (
        <div className="route-summary">
          <span className="route-summary-stats">
            <span>
              <small>מרחק</small>
              <b>{routeSummary.distanceKm.toFixed(0)} ק"מ</b>
            </span>
            <span>
              <small>זמן נסיעה</small>
              <b>{formatDuration(routeSummary.durationMin)}</b>
            </span>
          </span>
          <span className="route-summary-actions">
            <button type="button" className="pill-button" onClick={onSaveRoute}>
              שמירה
            </button>
            <button type="button" className="pill-button" onClick={onShare}>
              שיתוף
            </button>
          </span>
        </div>
      )}
      {shareStatus && <div className="status-message">{shareStatus}</div>}

      <h3 className="filters-title">מה לחפש בדרך?</h3>
      <div className="filters">
        {FILTERS.map((f) => (
          <button
            key={f.category}
            type="button"
            className={`filter filter--${f.category}${filterState.categories.has(f.category) ? ' active' : ''}`}
            aria-pressed={filterState.categories.has(f.category)}
            onClick={() => onToggleFilter(f.category)}
          >
            <span className="filter-icon">
              {loadingCategories.has(f.category) ? <span className="spinner" aria-label="מחפש" /> : f.emoji}
            </span>
            <span className="filter-label">{f.label}</span>
          </button>
        ))}
      </div>
      {pois.length > 0 && <div className="poi-count">{visible.length} מקומות בדרך, לפי סדר הנסיעה</div>}

      <SubfilterGroup
        title="סינון אוכל כשר לפי סוג"
        options={FOOD_FILTER_TAGS}
        labelFor={(tag) => FOOD_FILTER_LABEL[tag]}
        active={filterState.foodTags}
        onToggle={onToggleFoodTag}
      />

      <SubfilterGroup
        title="סינון תחנות דלק לפי סוג"
        options={FUEL_FILTER_TAGS}
        labelFor={(tag) => FUEL_FILTER_LABEL[tag]}
        active={filterState.fuelTags}
        onToggle={onToggleFuelTag}
      />

      <SubfilterGroup
        title="סינון תחנות דלק לפי חברה"
        options={fuelBrands}
        labelFor={(brand) => brand}
        active={filterState.fuelBrands}
        onToggle={onToggleFuelBrand}
      />

      <div className="corridor-control">
        <label htmlFor="corridor">
          מרחק מהמסלול <b>עד {corridorKm} ק"מ</b>
        </label>
        <input
          id="corridor"
          type="range"
          min={1}
          max={20}
          value={corridorKm}
          onChange={(e) => onCorridorChange(Number(e.target.value))}
        />
      </div>

      {loading && (
        <div className="status-message loading-row">
          <span className="spinner" aria-hidden="true" />
          <span>מחפש לאורך המסלול…</span>
          <button type="button" className="pill-button" onClick={onCancel}>
            ביטול
          </button>
        </div>
      )}
      {error && <div className="status-message error">{error}</div>}
      {!loading && !error && filterState.categories.size === 0 && (
        <div className="status-message">
          {hasRoute
            ? 'בחרו למעלה מה לחפש. נחפש רק את מה שבחרתם.'
            : 'בחרו מה לחפש ותכננו מסלול. אפשר גם להוסיף סוגים אחרי שהמסלול מוכן.'}
        </div>
      )}
      {!loading && !error && hasRoute && filterState.categories.size > 0 && visible.length === 0 && (
        <div className="status-message">לא נמצאו מקומות כאלה ליד המסלול. אפשר להגדיל את המרחק מהמסלול.</div>
      )}

      <ul className="poi-list">
        {visible.map((poi) => (
          <li key={poi.id}>
            <button type="button" className={`poi-item poi-item--${poi.category}`} onClick={() => onSelectPoi(poi.id)}>
              <span className="poi-emoji">{CATEGORY_EMOJI[poi.category]}</span>
              <span className="poi-details">
                <span className="poi-name">{poi.name}</span>
                <span className="poi-meta">
                  {poi.distanceAlongRoute.toFixed(0)} ק"מ מההתחלה · {poi.distanceFromRoute.toFixed(1)} ק"מ מהכביש
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
