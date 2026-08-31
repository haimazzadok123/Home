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
  { category: 'camping', label: 'לינה (קק"ל / רשות הטבע)', emoji: '⛺' },
]

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
      if (poi.category === 'fuel' && poi.brand) brands.add(poi.brand)
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
          <span>
            <strong>{routeSummary.distanceKm.toFixed(0)} ק"מ</strong> · {formatDuration(routeSummary.durationMin)}
          </span>
          <span className="route-summary-actions">
            <button type="button" className="text-button" onClick={onSaveRoute}>
              💾 שמור מסלול
            </button>
            <button type="button" className="text-button" onClick={onShare}>
              🔗 שיתוף
            </button>
          </span>
        </div>
      )}
      {shareStatus && <div className="status-message">{shareStatus}</div>}

      <div className="filters">
        {FILTERS.map((f) => (
          <button
            key={f.category}
            type="button"
            className={filterState.categories.has(f.category) ? 'filter active' : 'filter'}
            onClick={() => onToggleFilter(f.category)}
          >
            {f.emoji} {f.label}
          </button>
        ))}
      </div>

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
        <label htmlFor="corridor">חיפוש עד {corridorKm} ק"מ מהמסלול</label>
        <input
          id="corridor"
          type="range"
          min={1}
          max={20}
          value={corridorKm}
          onChange={(e) => onCorridorChange(Number(e.target.value))}
        />
      </div>

      {loading && <div className="status-message">מחפש מקומות לאורך המסלול…</div>}
      {error && <div className="status-message error">{error}</div>}
      {!loading && !error && pois.length === 0 && (
        <div className="status-message">תכננו מסלול כדי לראות מקומות מעניינים בדרך.</div>
      )}
      {!loading && !error && pois.length > 0 && filterState.categories.size === 0 && (
        <div className="status-message">בחרו קטגוריה אחת לפחות למעלה כדי לראות מקומות.</div>
      )}

      <ul className="poi-list">
        {visible.map((poi) => (
          <li key={poi.id} onClick={() => onSelectPoi(poi.id)}>
            <span className="poi-emoji">{CATEGORY_EMOJI[poi.category]}</span>
            <span className="poi-details">
              <span className="poi-name">{poi.name}</span>
              <span className="poi-meta">
                {poi.distanceAlongRoute.toFixed(0)} ק"מ מההתחלה · {poi.distanceFromRoute.toFixed(1)} ק"מ מהמסלול
              </span>
            </span>
          </li>
        ))}
      </ul>
    </aside>
  )
}
