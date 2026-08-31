import { useState } from 'react'
import type { FoodFilterTag, Poi, PoiCategory } from '../types'
import { CATEGORY_EMOJI, FOOD_FILTER_LABEL, FOOD_FILTER_TAGS, matchesActiveFilters } from '../utils/poiDisplay'

interface SidebarProps {
  pois: Poi[]
  loading: boolean
  error: string | null
  activeFilters: Set<PoiCategory>
  onToggleFilter: (category: PoiCategory) => void
  activeFoodTags: Set<FoodFilterTag>
  onToggleFoodTag: (tag: FoodFilterTag) => void
  corridorKm: number
  onCorridorChange: (km: number) => void
  onSelectPoi: (id: string) => void
  routeSummary: { distanceKm: number; durationMin: number } | null
}

const FILTERS: Array<{ category: PoiCategory; label: string; emoji: string }> = [
  { category: 'viewpoint', label: 'נקודות תצפייה', emoji: '🏞️' },
  { category: 'kosher-food', label: 'אוכל כשר', emoji: '🍽️' },
  { category: 'coffee', label: 'עגלות קפה', emoji: '☕' },
]

function formatDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h > 0 ? `${h} ש' ${m} ד'` : `${m} ד'`
}

export function Sidebar({
  pois,
  loading,
  error,
  activeFilters,
  onToggleFilter,
  activeFoodTags,
  onToggleFoodTag,
  corridorKm,
  onCorridorChange,
  onSelectPoi,
  routeSummary,
}: SidebarProps) {
  const [foodFiltersOpen, setFoodFiltersOpen] = useState(false)

  const visible = pois
    .filter((p) => matchesActiveFilters(p, activeFilters, activeFoodTags))
    .sort((a, b) => a.distanceAlongRoute - b.distanceAlongRoute)

  return (
    <aside className="sidebar">
      {routeSummary && (
        <div className="route-summary">
          <strong>{routeSummary.distanceKm.toFixed(0)} ק"מ</strong> · {formatDuration(routeSummary.durationMin)}
        </div>
      )}

      <div className="filters">
        {FILTERS.map((f) => (
          <button
            key={f.category}
            type="button"
            className={activeFilters.has(f.category) ? 'filter active' : 'filter'}
            onClick={() => onToggleFilter(f.category)}
          >
            {f.emoji} {f.label}
          </button>
        ))}
      </div>

      <div className="food-subfilter">
        <button
          type="button"
          className="food-subfilter-toggle"
          onClick={() => setFoodFiltersOpen((open) => !open)}
          aria-expanded={foodFiltersOpen}
        >
          סינון אוכל כשר לפי סוג {foodFiltersOpen ? '▲' : '▾'}
        </button>
        {foodFiltersOpen && (
          <div className="food-subfilter-options">
            {FOOD_FILTER_TAGS.map((tag) => (
              <label key={tag} className="food-subfilter-option">
                <input
                  type="checkbox"
                  checked={activeFoodTags.has(tag)}
                  onChange={() => onToggleFoodTag(tag)}
                />
                {FOOD_FILTER_LABEL[tag]}
              </label>
            ))}
          </div>
        )}
      </div>

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
