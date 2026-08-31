import { useEffect, useRef, useState } from 'react'
import type { SavedRoute } from '../utils/savedRoutes'

interface FavoritesMenuProps {
  savedRoutes: SavedRoute[]
  onLoadRoute: (route: SavedRoute) => void
  onDeleteRoute: (id: string) => void
}

export function FavoritesMenu({ savedRoutes, onLoadRoute, onDeleteRoute }: FavoritesMenuProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div className="favorites-menu" ref={containerRef}>
      <button type="button" className="favorites-button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        ⭐ מועדפים{savedRoutes.length > 0 ? ` (${savedRoutes.length})` : ''}
      </button>
      {open && (
        <div className="favorites-dropdown">
          {savedRoutes.length === 0 ? (
            <div className="favorites-empty">אין עדיין מסלולים שמורים</div>
          ) : (
            <ul className="saved-routes-list">
              {savedRoutes.map((saved) => (
                <li key={saved.id} className="saved-route">
                  <button
                    type="button"
                    className="saved-route-name"
                    onClick={() => {
                      onLoadRoute(saved)
                      setOpen(false)
                    }}
                  >
                    {saved.name}
                  </button>
                  <button
                    type="button"
                    className="saved-route-delete"
                    onClick={() => onDeleteRoute(saved.id)}
                    aria-label={`מחק את ${saved.name}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
