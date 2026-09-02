import { useEffect, useState } from 'react'
import { fetchDailyWeather, type DailyWeather } from '../api/weather'
import type { Place } from '../types'
import { weatherCodeInfo } from '../utils/weatherDisplay'

interface TripWeatherProps {
  start: Place | null
  end: Place | null
  departureDate: string
  returnDate: string
  onDepartureDateChange: (value: string) => void
  onReturnDateChange: (value: string) => void
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

interface WeatherCardProps {
  label: string
  hasDate: boolean
  hasLocation: boolean
  loading: boolean
  error: string | null
  weather: DailyWeather | null
}

function WeatherCard({ label, hasDate, hasLocation, loading, error, weather }: WeatherCardProps) {
  if (!hasDate) return null

  return (
    <div className="weather-card">
      <div className="weather-card-title">{label}</div>
      {!hasLocation && <div className="status-message">בחרו מיקום כדי לראות תחזית</div>}
      {hasLocation && loading && <div className="status-message">בודק תחזית…</div>}
      {hasLocation && !loading && error && <div className="status-message error">{error}</div>}
      {hasLocation && !loading && !error && weather && (
        <div className="weather-card-body">
          <span className="weather-emoji">{weatherCodeInfo(weather.weatherCode).emoji}</span>
          <span className="weather-details">
            <span>{weatherCodeInfo(weather.weatherCode).label}</span>
            <span>
              {Math.round(weather.tempMinC)}°–{Math.round(weather.tempMaxC)}° · {Math.round(weather.precipitationProbability)}%
              סיכוי גשם
            </span>
          </span>
        </div>
      )}
    </div>
  )
}

/** Fetches and shows the forecast for the departure location/date and the return location/date. */
export function TripWeather({ start, end, departureDate, returnDate, onDepartureDateChange, onReturnDateChange }: TripWeatherProps) {
  const [departureWeather, setDepartureWeather] = useState<DailyWeather | null>(null)
  const [departureLoading, setDepartureLoading] = useState(false)
  const [departureError, setDepartureError] = useState<string | null>(null)

  const [returnWeather, setReturnWeather] = useState<DailyWeather | null>(null)
  const [returnLoading, setReturnLoading] = useState(false)
  const [returnError, setReturnError] = useState<string | null>(null)

  useEffect(() => {
    setDepartureWeather(null)
    setDepartureError(null)
    if (!start || !departureDate) return

    const controller = new AbortController()
    setDepartureLoading(true)
    fetchDailyWeather(start.lat, start.lng, departureDate, controller.signal)
      .then(setDepartureWeather)
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setDepartureError(err instanceof Error ? err.message : 'שגיאה בטעינת התחזית.')
      })
      .finally(() => setDepartureLoading(false))

    return () => controller.abort()
  }, [start, departureDate])

  useEffect(() => {
    setReturnWeather(null)
    setReturnError(null)
    if (!end || !returnDate) return

    const controller = new AbortController()
    setReturnLoading(true)
    fetchDailyWeather(end.lat, end.lng, returnDate, controller.signal)
      .then(setReturnWeather)
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setReturnError(err instanceof Error ? err.message : 'שגיאה בטעינת התחזית.')
      })
      .finally(() => setReturnLoading(false))

    return () => controller.abort()
  }, [end, returnDate])

  return (
    <div className="trip-dates">
      <div className="date-fields">
        <div className="date-field">
          <label htmlFor="departure-date">תאריך יציאה</label>
          <input
            id="departure-date"
            type="date"
            min={todayIso()}
            value={departureDate}
            onChange={(e) => onDepartureDateChange(e.target.value)}
          />
        </div>
        <div className="date-field">
          <label htmlFor="return-date">תאריך חזרה</label>
          <input
            id="return-date"
            type="date"
            min={departureDate || todayIso()}
            value={returnDate}
            onChange={(e) => onReturnDateChange(e.target.value)}
          />
        </div>
      </div>

      {(departureDate || returnDate) && (
        <div className="weather-cards">
          <WeatherCard
            label={`מזג אוויר ביציאה${start ? ` · ${start.label.split(',')[0]}` : ''}`}
            hasDate={!!departureDate}
            hasLocation={!!start}
            loading={departureLoading}
            error={departureError}
            weather={departureWeather}
          />
          <WeatherCard
            label={`מזג אוויר בחזרה${end ? ` · ${end.label.split(',')[0]}` : ''}`}
            hasDate={!!returnDate}
            hasLocation={!!end}
            loading={returnLoading}
            error={returnError}
            weather={returnWeather}
          />
        </div>
      )}
    </div>
  )
}
