/** WMO weather codes (used by Open-Meteo), grouped into the ranges its docs define. */
const WEATHER_CODE_INFO: Array<{ codes: number[]; emoji: string; label: string }> = [
  { codes: [0], emoji: '☀️', label: 'בהיר' },
  { codes: [1, 2], emoji: '🌤️', label: 'מעונן חלקית' },
  { codes: [3], emoji: '☁️', label: 'מעונן' },
  { codes: [45, 48], emoji: '🌫️', label: 'ערפילי' },
  { codes: [51, 53, 55, 56, 57], emoji: '🌦️', label: 'טפטוף גשם' },
  { codes: [61, 63, 65, 66, 67, 80, 81, 82], emoji: '🌧️', label: 'גשום' },
  { codes: [71, 73, 75, 77, 85, 86], emoji: '❄️', label: 'שלג' },
  { codes: [95, 96, 99], emoji: '⛈️', label: 'סופת רעמים' },
]

const DEFAULT_INFO = { emoji: '🌡️', label: 'מזג אוויר' }

export function weatherCodeInfo(code: number): { emoji: string; label: string } {
  const match = WEATHER_CODE_INFO.find((entry) => entry.codes.includes(code))
  return match ?? DEFAULT_INFO
}
