// Data sources for the dashboard. All of them work without a key except stock quotes (Finnhub).

import type { City } from '@/state/settings';

// ---------- weather (Open-Meteo) ----------
export type Weather = {
  temp: number;
  feels: number;
  code: number;
  isDay: number;
  days: { date: string; code: number; min: number; max: number }[];
};

const WMO: [number[], string, string, string][] = [
  [[0], 'בהיר', '☀️', '🌙'],
  [[1, 2], 'מעונן חלקית', '⛅', '☁️'],
  [[3, 45, 48], 'מעונן', '☁️', '☁️'],
  [[51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82], 'גשם', '🌧️', '🌧️'],
  [[71, 73, 75, 77, 85, 86], 'שלג', '❄️', '❄️'],
  [[95, 96, 99], 'סופת רעמים', '⛈️', '⛈️'],
];

export function describeWeather(code: number, isDay = 1) {
  const row = WMO.find((r) => r[0].includes(code));
  return row ? { text: row[1], icon: isDay ? row[2] : row[3] } : { text: '', icon: '🌡️' };
}

export async function fetchWeather(city: City): Promise<Weather> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&timezone=auto&forecast_days=5` +
    '&current=temperature_2m,apparent_temperature,weather_code,is_day' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`weather ${res.status}`);
  const w = await res.json();
  return {
    temp: w.current.temperature_2m,
    feels: w.current.apparent_temperature,
    code: w.current.weather_code,
    isDay: w.current.is_day,
    days: w.daily.time.map((date: string, i: number) => ({
      date,
      code: w.daily.weather_code[i],
      min: w.daily.temperature_2m_min[i],
      max: w.daily.temperature_2m_max[i],
    })),
  };
}

// ---------- city search (Open-Meteo geocoding) ----------
export async function searchCities(name: string): Promise<(City & { region: string })[]> {
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=6&language=he`,
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results ?? []).map((r: { name: string; latitude: number; longitude: number; admin1?: string; country?: string }) => ({
    name: r.name,
    lat: r.latitude,
    lon: r.longitude,
    region: [r.admin1, r.country].filter(Boolean).join(', '),
  }));
}

// ---------- news, flashes and sport (RSS through rss2json) ----------
export type NewsTab = 'news' | 'flash' | 'sport';
export type Headline = { source: string; title: string; link: string; date: Date };

const FEEDS: Record<NewsTab, { source: string; url: string }[]> = {
  news: [
    { source: 'ynet', url: 'https://www.ynet.co.il/Integration/StoryRss2.xml' },
    { source: 'mako', url: 'https://rcs.mako.co.il/rss/31750a2610f26110VgnVCM1000005201000aRCRD.xml' },
    { source: 'וואלה', url: 'https://rss.walla.co.il/feed/1?type=main' },
  ],
  flash: [
    { source: 'ynet', url: 'https://www.ynet.co.il/Integration/StoryRss1854.xml' },
    { source: 'מעריב', url: 'https://www.maariv.co.il/Rss/RssFeedsMivzakiChadashot' },
  ],
  sport: [
    { source: 'ONE', url: 'https://www.one.co.il/rss' },
    { source: 'ynet', url: 'https://www.ynet.co.il/Integration/StoryRss3.xml' },
  ],
};

const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();

async function fetchFeed(source: string, url: string): Promise<Headline[]> {
  try {
    const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`);
    const data = await res.json();
    if (data.status !== 'ok') return [];
    // rss2json dates are UTC without a zone marker
    return data.items.map((i: { title: string; link: string; pubDate: string }) => ({
      source,
      title: decode(i.title || ''),
      link: i.link,
      date: new Date(`${String(i.pubDate).replace(' ', 'T')}Z`),
    }));
  } catch {
    return [];
  }
}

export async function fetchHeadlines(tab: NewsTab): Promise<Headline[]> {
  const lists = await Promise.all(FEEDS[tab].map((f) => fetchFeed(f.source, f.url)));
  const seen = new Set<string>();
  return lists
    .flat()
    .filter((n) => n.title && /^https:\/\//.test(n.link) && !Number.isNaN(n.date.getTime()))
    .filter((n) => !seen.has(n.link) && !!seen.add(n.link))
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 25);
}

// ---------- stocks (Finnhub, needs a free key) ----------
export type Quote = { symbol: string; price: number; pct: number };

export async function fetchQuotes(symbols: string[], key: string): Promise<Quote[]> {
  const rows = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const res = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(key)}`,
        );
        if (!res.ok) return null;
        const q = await res.json();
        return q && q.c ? { symbol, price: q.c as number, pct: (q.dp as number) ?? 0 } : null;
      } catch {
        return null;
      }
    }),
  );
  return rows.filter((r): r is Quote => r !== null);
}

// ---------- exchange rates (Frankfurter, daily) ----------
export type Rate = { code: string; name: string; value: number; pct: number };

export async function fetchRates(): Promise<Rate[]> {
  const from = new Date(Date.now() - 9 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const res = await fetch(`https://api.frankfurter.dev/v1/${from}..?base=ILS&symbols=USD,EUR`);
  if (!res.ok) throw new Error(`rates ${res.status}`);
  const data = await res.json();
  const days = Object.keys(data.rates).sort();
  const last = data.rates[days[days.length - 1]];
  const prev = data.rates[days[days.length - 2]] ?? last;
  return [
    ['USD', 'דולר'],
    ['EUR', 'אירו'],
  ].map(([code, name]) => {
    const value = 1 / last[code];
    return { code, name, value, pct: (value / (1 / prev[code]) - 1) * 100 };
  });
}

// ---------- radio ----------
const KAN = 'https://playerservices.streamtheworld.com/api/livestream-redirect/';
export const STATIONS = [
  { name: 'גלגלצ', url: 'https://glzwizzlv.bynetcdn.com/glglz_mp3' },
  { name: 'גל״צ', url: 'https://glzwizzlv.bynetcdn.com/glz_mp3' },
  { name: 'כאן ב', url: `${KAN}KAN_BET.mp3` },
  { name: 'כאן גימל', url: `${KAN}KAN_GIMMEL.mp3` },
  { name: 'כאן 88', url: `${KAN}KAN_88.mp3` },
  { name: '103FM', url: 'https://cdn.cybercdn.live/103FM/Live/icecast.audio' },
  { name: 'רדיוס 100', url: 'https://cdn.cybercdn.live/Radios_100FM/Audio/icecast.audio' },
  { name: 'קול ברמה', url: 'https://cdn.cybercdn.live/Kol_Barama/Live_Audio/icecast.audio' },
];
