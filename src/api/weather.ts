const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'

export interface DailyWeather {
  date: string
  weatherCode: number
  tempMaxC: number
  tempMinC: number
  precipitationProbability: number
}

interface OpenMeteoDailyResponse {
  daily?: {
    time?: string[]
    weather_code?: number[]
    weathercode?: number[]
    temperature_2m_max?: number[]
    temperature_2m_min?: number[]
    precipitation_probability_max?: number[]
  }
  reason?: string
}

/**
 * Fetches the daily forecast for a single date and location from Open-Meteo (free, no API
 * key, CORS-enabled for browser use). Open-Meteo only covers roughly today through 16 days
 * ahead — a date outside that range comes back as an HTTP error with a `reason` field, which
 * is surfaced as a Hebrew message rather than the raw API error.
 */
export async function fetchDailyWeather(lat: number, lng: number, date: string, signal?: AbortSignal): Promise<DailyWeather> {
  const url = new URL(FORECAST_URL)
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lng))
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max')
  url.searchParams.set('timezone', 'Asia/Jerusalem')
  url.searchParams.set('start_date', date)
  url.searchParams.set('end_date', date)

  const res = await fetch(url.toString(), { signal })
  if (!res.ok) {
    throw new Error('התחזית זמינה רק לתאריכים בטווח של כ-16 הימים הקרובים.')
  }

  const data = (await res.json()) as OpenMeteoDailyResponse
  const daily = data.daily
  const time = daily?.time?.[0]
  const weatherCode = daily?.weather_code?.[0] ?? daily?.weathercode?.[0]
  const tempMaxC = daily?.temperature_2m_max?.[0]
  const tempMinC = daily?.temperature_2m_min?.[0]

  if (!time || weatherCode == null || tempMaxC == null || tempMinC == null) {
    throw new Error('לא נמצאה תחזית לתאריך זה.')
  }

  return {
    date: time,
    weatherCode,
    tempMaxC,
    tempMinC,
    precipitationProbability: daily?.precipitation_probability_max?.[0] ?? 0,
  }
}
