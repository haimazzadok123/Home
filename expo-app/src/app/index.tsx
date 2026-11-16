import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomTabInset, MaxContentWidth } from '@/constants/theme';

// First version of the home dashboard as an app: clock, weather and news.
// Data: Open-Meteo (weather) and the ynet / mako RSS feeds through rss2json.

const CITY = { name: 'תל אביב', lat: 32.0853, lon: 34.7818 };
const MIN = 60 * 1000;

const palette = {
  light: { bg: '#F0F9FF', card: '#FFFFFF', text: '#1E293B', muted: '#64748B', line: '#E2E8F0', accent: '#0284C7' },
  dark: { bg: '#060B18', card: '#111A2E', text: '#F1F5F9', muted: '#94A3B8', line: '#1E293B', accent: '#38BDF8' },
};

// ---------- clock ----------
const timeFmt = new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false });
const dateFmt = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
const dayFmt = new Intl.DateTimeFormat('he-IL', { weekday: 'short' });

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// ---------- weather ----------
type Weather = {
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
function describe(code: number, isDay = 1) {
  const row = WMO.find((r) => r[0].includes(code));
  return row ? { text: row[1], icon: isDay ? row[2] : row[3] } : { text: '', icon: '🌡️' };
}

async function fetchWeather(): Promise<Weather> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${CITY.lat}&longitude=${CITY.lon}&timezone=auto&forecast_days=5` +
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

// ---------- news ----------
type Headline = { source: string; title: string; link: string; date: Date };

const FEEDS = [
  { source: 'ynet', url: 'https://www.ynet.co.il/Integration/StoryRss2.xml' },
  { source: 'mako', url: 'https://rcs.mako.co.il/rss/31750a2610f26110VgnVCM1000005201000aRCRD.xml' },
];

const decode = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();

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

async function fetchNews(): Promise<Headline[]> {
  const lists = await Promise.all(FEEDS.map((f) => fetchFeed(f.source, f.url)));
  return lists
    .flat()
    .filter((n) => n.title && /^https:\/\//.test(n.link) && !Number.isNaN(n.date.getTime()))
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 20);
}

// ---------- screen ----------
// On the web the page is first rendered on the server, whose clock, time zone and colour scheme
// differ from the device's. Drawing the dashboard only after it mounts on the device keeps the two
// renders identical and avoids a hydration error.
function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

export default function HomeScreen() {
  const mounted = useMounted();
  return mounted ? <Dashboard /> : <View style={styles.root} />;
}

function Dashboard() {
  const c = palette[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const now = useNow();
  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherError, setWeatherError] = useState(false);
  const [news, setNews] = useState<Headline[]>([]);
  const [newsLoaded, setNewsLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadWeather = useCallback(
    () =>
      fetchWeather().then(
        (w) => {
          setWeather(w);
          setWeatherError(false);
        },
        () => setWeatherError(true),
      ),
    [],
  );
  const loadNews = useCallback(
    () =>
      fetchNews().then((n) => {
        if (n.length) setNews(n);
        setNewsLoaded(true);
      }),
    [],
  );

  useEffect(() => {
    loadWeather();
    loadNews();
    const w = setInterval(loadWeather, 15 * MIN);
    const n = setInterval(loadNews, 5 * MIN);
    return () => {
      clearInterval(w);
      clearInterval(n);
    };
  }, [loadWeather, loadNews]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadWeather(), loadNews()]);
    setRefreshing(false);
  };

  const lo = weather ? Math.min(...weather.days.map((d) => d.min)) : 0;
  const span = weather ? Math.max(1, Math.max(...weather.days.map((d) => d.max)) - lo) : 1;
  const today = now.toDateString();
  const current = weather ? describe(weather.code, weather.isDay) : null;

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}>
          {/* clock */}
          <View style={styles.clock}>
            <Text style={styles.time}>{timeFmt.format(now)}</Text>
            <Text style={styles.date}>{dateFmt.format(now)}</Text>
          </View>

          {/* weather */}
          <View style={[styles.card, { backgroundColor: c.card }]}>
            <View style={styles.head}>
              <Text style={[styles.label, { color: c.accent }]}>מזג אוויר</Text>
              <Text style={[styles.muted, { color: c.muted }]}>{CITY.name}</Text>
            </View>
            {weather && current ? (
              <>
                <View style={styles.now}>
                  <Text style={styles.bigIcon}>{current.icon}</Text>
                  <View style={styles.nowText}>
                    <Text style={[styles.temp, { color: c.text }]}>{Math.round(weather.temp)}°</Text>
                    <Text style={[styles.muted, { color: c.muted }]}>
                      {current.text} · מרגיש כמו {Math.round(weather.feels)}°
                    </Text>
                  </View>
                </View>
                {weather.days.map((d, i) => (
                  <View key={d.date} style={[styles.day, { borderTopColor: c.line }]}>
                    <Text style={[styles.dayName, { color: c.text }]}>
                      {i === 0 ? 'היום' : dayFmt.format(new Date(`${d.date}T12:00:00`))}
                    </Text>
                    <Text style={styles.dayIcon}>{describe(d.code).icon}</Text>
                    <Text style={[styles.dayTemp, { color: c.muted }]}>{Math.round(d.min)}°</Text>
                    <View style={[styles.bar, { backgroundColor: c.line }]}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            backgroundColor: c.accent,
                            right: `${((d.min - lo) / span) * 100}%`,
                            left: `${100 - ((d.max - lo) / span) * 100}%`,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.dayTemp, { color: c.text }]}>{Math.round(d.max)}°</Text>
                  </View>
                ))}
              </>
            ) : (
              <Text style={[styles.muted, { color: c.muted }]}>{weatherError ? 'אין נתוני מזג אוויר כרגע' : 'טוען…'}</Text>
            )}
          </View>

          {/* news */}
          <View style={[styles.card, { backgroundColor: c.card }]}>
            <View style={styles.head}>
              <Text style={[styles.label, { color: c.accent }]}>חדשות</Text>
              <Text style={[styles.muted, { color: c.muted }]}>משיכה למטה לרענון</Text>
            </View>
            {news.length === 0 && (
              <Text style={[styles.muted, { color: c.muted }]}>
                {newsLoaded ? 'לא הצלחתי לטעון כותרות כרגע' : 'טוען כותרות…'}
              </Text>
            )}
            {news.map((n) => (
              <Pressable
                key={n.link}
                accessibilityRole="link"
                onPress={() => WebBrowser.openBrowserAsync(n.link)}
                style={({ pressed }) => [styles.item, { borderTopColor: c.line, opacity: pressed ? 0.6 : 1 }]}>
                <Text style={[styles.meta, { color: c.muted }]}>
                  <Text style={{ color: c.accent, fontWeight: '700' }}>{n.source}</Text>
                  {'  '}
                  {n.date.toDateString() === today ? timeFmt.format(n.date) : dayFmt.format(n.date)}
                </Text>
                <Text style={[styles.title, { color: c.text }]}>{n.title}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    padding: 16,
    paddingTop: Platform.OS === 'web' ? 88 : 16, // the web tab bar floats over the top of the page
    paddingBottom: BottomTabInset + 24,
    gap: 14,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  clock: { backgroundColor: '#0284C7', borderRadius: 28, paddingVertical: 28, alignItems: 'center' },
  time: { color: '#FFFFFF', fontSize: 72, fontWeight: '600', fontVariant: ['tabular-nums'] },
  date: { color: '#E0F2FE', fontSize: 22, fontWeight: '500', marginTop: 2 },
  card: { borderRadius: 24, padding: 18, gap: 8 },
  head: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 14, fontWeight: '700' },
  muted: { fontSize: 14, textAlign: 'right' },
  now: { flexDirection: 'row-reverse', alignItems: 'center', gap: 14, paddingVertical: 4 },
  nowText: { flex: 1 },
  bigIcon: { fontSize: 52 },
  temp: { fontSize: 52, fontWeight: '600', textAlign: 'right' },
  day: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  dayName: { width: 52, fontSize: 15, textAlign: 'right' },
  dayIcon: { width: 26, fontSize: 18, textAlign: 'center' },
  dayTemp: { width: 34, fontSize: 15, textAlign: 'center' },
  bar: { flex: 1, height: 6, borderRadius: 3 },
  barFill: { position: 'absolute', top: 0, bottom: 0, borderRadius: 3 },
  item: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10, gap: 2 },
  meta: { fontSize: 12, textAlign: 'right' },
  title: { fontSize: 16, lineHeight: 22, textAlign: 'right', writingDirection: 'rtl' },
});
