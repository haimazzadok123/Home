import { useEffect, useId, useRef, useState } from 'react'
import { searchPlaces } from '../api/geocode'
import type { Place } from '../types'

interface SearchBoxProps {
  label: string
  placeholder: string
  value: Place | null
  onChange: (place: Place | null) => void
}

export function SearchBox({ label, placeholder, value, onChange }: SearchBoxProps) {
  const [query, setQuery] = useState(value?.label ?? '')
  const [suggestions, setSuggestions] = useState<Place[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const id = useId()
  const inputId = `${id}-input`
  const listId = `${id}-list`
  const abortRef = useRef<AbortController | null>(null)
  // Typing clears `value` to null (it no longer matches any selected place), which would
  // otherwise re-trigger the sync effect below and wipe the query text the user just typed.
  const skipNextSyncRef = useRef(false)

  useEffect(() => {
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false
      return
    }
    setQuery(value?.label ?? '')
  }, [value])

  useEffect(() => {
    if (value && query === value.label) return
    if (query.trim().length < 3) {
      setSuggestions([])
      return
    }

    const timer = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setLoading(true)
      try {
        const results = await searchPlaces(query, controller.signal)
        setSuggestions(results)
        setActiveIndex(-1)
        setOpen(true)
      } catch {
        // ignore aborted/failed lookups; user can keep typing
      } finally {
        setLoading(false)
      }
    }, 400)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  function handleSelect(place: Place) {
    onChange(place)
    setQuery(place.label)
    setOpen(false)
    setSuggestions([])
    setActiveIndex(-1)
  }

  const listVisible = open && suggestions.length > 0

  // Arrow keys move through the suggestions, Enter picks one, Escape closes the list.
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (suggestions.length === 0) return
      e.preventDefault()
      setOpen(true)
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((i) => (i + step + suggestions.length) % suggestions.length)
    } else if (e.key === 'Enter' && listVisible) {
      e.preventDefault()
      handleSelect(suggestions[Math.max(activeIndex, 0)])
    } else if (e.key === 'Escape' && listVisible) {
      e.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div className="search-box">
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={listVisible}
        aria-controls={listId}
        aria-activedescendant={listVisible && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        autoComplete="off"
        enterKeyHint="search"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          skipNextSyncRef.current = true
          onChange(null)
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {loading && (
        <div className="search-status" role="status">
          מחפש…
        </div>
      )}
      <ul className="suggestions" id={listId} role="listbox" aria-label={`הצעות ל${label}`} hidden={!listVisible}>
        {listVisible &&
          suggestions.map((s, i) => (
            <li
              key={`${i}-${s.lat},${s.lng}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              className={i === activeIndex ? 'active' : undefined}
              onMouseDown={() => handleSelect(s)}
            >
              {s.label}
            </li>
          ))}
      </ul>
    </div>
  )
}
