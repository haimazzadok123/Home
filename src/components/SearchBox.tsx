import { useEffect, useRef, useState } from 'react'
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
  }

  return (
    <div className="search-box">
      <label>{label}</label>
      <input
        type="text"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          skipNextSyncRef.current = true
          onChange(null)
        }}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {loading && <div className="search-status">מחפש…</div>}
      {open && suggestions.length > 0 && (
        <ul className="suggestions">
          {suggestions.map((s) => (
            <li key={`${s.lat},${s.lng}`} onMouseDown={() => handleSelect(s)}>
              {s.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
