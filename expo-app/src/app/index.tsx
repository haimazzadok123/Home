import { Link } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Muted } from '@/components/card';
import { topInset, usePalette } from '@/constants/palette';
import { BottomTabInset, MaxContentWidth } from '@/constants/theme';
import {
  describeWeather,
  fetchHeadlines,
  fetchQuotes,
  fetchRates,
  type Headline,
  type NewsTab,
  type Quote,
  type Rate,
  type Weather,
  fetchWeather,
} from '@/lib/data';
import { useRadio } from '@/state/radio';
import { useSettings } from '@/state/settings';
import { STATIONS } from '@/lib/data';

// The home dashboard: clock, weather, stocks and exchange rates, and news / flashes / sport.

const MIN = 60 * 1000;
const timeFmt = new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false });
const dateFmt = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
const dayFmt = new Intl.DateTimeFormat('he-IL', { weekday: 'short' });

// On the web the page is first rendered on the server, whose clock, time zone and colour scheme
// differ from the device's. Drawing the dashboard only after it mounts keeps the two renders identical.
function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

export default function HomeScreen() {
  const mounted = useMounted();
  return mounted ? <Dashboard /> : <View style={styles.root} />;
}

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const NEWS_TABS: { id: NewsTab; label: string }[] = [
  { id: 'news', label: 'חדשות' },
  { id: 'flash', label: 'מבזקים' },
  { id: 'sport', label: 'ספורט' },
];

function Dashboard() {
  const c = usePalette();
  const now = useNow();
  const { settings, loaded } = useSettings();
  const radio = useRadio();

  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherError, setWeatherError] = useState(false);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [rates, setRates] = useState<Rate[]>([]);
  const [tab, setTab] = useState<NewsTab>('news');
  const [news, setNews] = useState<Partial<Record<NewsTab, Headline[]>>>({});
  const [newsAt, setNewsAt] = useState<Partial<Record<NewsTab, Date>>>({});
  const [refreshing, setRefreshing] = useState(false);

  const loadWeather = useCallback(
    () =>
      fetchWeather(settings.city).then(
        (w) => {
          setWeather(w);
          setWeatherError(false);
        },
        () => setWeatherError(true),
      ),
    [settings.city],
  );
  const loadStocks = useCallback(async () => {
    fetchRates().then(setRates, () => {});
    if (settings.finnhubKey) setQuotes(await fetchQuotes(settings.symbols, settings.finnhubKey));
    else setQuotes([]);
  }, [settings.finnhubKey, settings.symbols]);
  const loadNews = useCallback(async (which: NewsTab) => {
    const items = await fetchHeadlines(which);
    if (items.length) {
      setNews((n) => ({ ...n, [which]: items }));
      setNewsAt((t) => ({ ...t, [which]: new Date() }));
    }
  }, []);

  // weather follows the chosen city; stocks follow the key and symbols
  useEffect(() => {
    if (!loaded) return;
    loadWeather();
    const id = setInterval(loadWeather, 15 * MIN);
    return () => clearInterval(id);
  }, [loaded, loadWeather]);
  useEffect(() => {
    if (!loaded) return;
    loadStocks();
    const id = setInterval(loadStocks, 2 * MIN);
    return () => clearInterval(id);
  }, [loaded, loadStocks]);
  // the open news tab refreshes every 5 minutes, flashes every 90 seconds
  useEffect(() => {
    loadNews(tab);
    const id = setInterval(() => loadNews(tab), tab === 'flash' ? 1.5 * MIN : 5 * MIN);
    return () => clearInterval(id);
  }, [tab, loadNews]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadWeather(), loadStocks(), loadNews(tab)]);
    setRefreshing(false);
  };

  const lo = weather ? Math.min(...weather.days.map((d) => d.min)) : 0;
  const span = weather ? Math.max(1, Math.max(...weather.days.map((d) => d.max)) - lo) : 1;
  const today = now.toDateString();
  const current = weather ? describeWeather(weather.code, weather.isDay) : null;
  const headlines = news[tab] ?? [];

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
            {radio.current >= 0 && (
              <Pressable onPress={radio.stop} style={styles.nowPlaying} accessibilityRole="button" accessibilityLabel="עצירת הרדיו">
                <Text style={styles.nowPlayingText}>
                  {radio.buffering ? 'טוען' : '■'} {STATIONS[radio.current].name}
                </Text>
              </Pressable>
            )}
          </View>

          {/* weather */}
          <Card title="מזג אוויר" aside={settings.city.name}>
            {weather && current ? (
              <>
                <View style={styles.now}>
                  <Text style={styles.bigIcon}>{current.icon}</Text>
                  <View style={styles.flex}>
                    <Text style={[styles.temp, { color: c.text }]}>{Math.round(weather.temp)}°</Text>
                    <Muted>
                      {current.text} · מרגיש כמו {Math.round(weather.feels)}°
                    </Muted>
                  </View>
                </View>
                {weather.days.map((d, i) => (
                  <View key={d.date} style={[styles.row, { borderTopColor: c.line }]}>
                    <Text style={[styles.dayName, { color: c.text }]}>
                      {i === 0 ? 'היום' : dayFmt.format(new Date(`${d.date}T12:00:00`))}
                    </Text>
                    <Text style={styles.dayIcon}>{describeWeather(d.code).icon}</Text>
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
              <Muted>{weatherError ? 'אין נתוני מזג אוויר כרגע' : 'טוען…'}</Muted>
            )}
          </Card>

          {/* stocks and exchange rates */}
          <Card title="מניות ומטבע">
            {settings.finnhubKey ? (
              quotes.length ? (
                quotes.map((q) => (
                  <View key={q.symbol} style={[styles.row, { borderTopColor: c.line }]}>
                    <Text style={[styles.symbol, { color: c.text }]}>{q.symbol}</Text>
                    <View style={styles.flex} />
                    <Text style={[styles.price, { color: c.text }]}>
                      {q.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                    <Text
                      style={[
                        styles.pct,
                        { color: q.pct < 0 ? c.down : c.up, backgroundColor: q.pct < 0 ? c.downBg : c.upBg },
                      ]}>
                      {`${q.pct > 0 ? '+' : ''}${q.pct.toFixed(2)}%`}
                    </Text>
                  </View>
                ))
              ) : (
                <Muted>טוען מחירים… אם זה נשאר ככה, כדאי לבדוק את המפתח בהגדרות.</Muted>
              )
            ) : (
              <Link href="/settings" asChild>
                <Pressable>
                  <Text style={[styles.hint, { color: c.accent }]}>
                    כדי לראות מחירי מניות צריך מפתח חינמי של Finnhub. מוסיפים אותו בלשונית ההגדרות ›
                  </Text>
                </Pressable>
              </Link>
            )}
            {rates.length > 0 && (
              <View style={styles.rates}>
                {rates.map((r) => (
                  <View key={r.code} style={[styles.rate, { backgroundColor: c.soft }]}>
                    <Muted>{r.name}</Muted>
                    <Text style={[styles.rateValue, { color: c.text }]}>₪{r.value.toFixed(3)}</Text>
                    <Text style={{ color: r.pct < 0 ? c.down : c.up, textAlign: 'right', fontSize: 13 }}>
                      {`${r.pct > 0 ? '+' : ''}${r.pct.toFixed(2)}%`}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </Card>

          {/* news, flashes and sport */}
          <Card
            title="חדשות"
            aside={newsAt[tab] ? `עודכן ${timeFmt.format(newsAt[tab] as Date)}` : undefined}>
            <View style={[styles.segment, { backgroundColor: c.soft }]}>
              {NEWS_TABS.map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => setTab(t.id)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === t.id }}
                  style={[styles.segmentItem, tab === t.id && { backgroundColor: c.accent }]}>
                  <Text style={[styles.segmentText, { color: tab === t.id ? '#FFFFFF' : c.muted }]}>{t.label}</Text>
                </Pressable>
              ))}
            </View>
            {headlines.length === 0 && <Muted>טוען כותרות…</Muted>}
            {headlines.map((n) => (
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
          </Card>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: {
    padding: 16,
    paddingTop: topInset,
    paddingBottom: BottomTabInset + 24,
    gap: 14,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  clock: { backgroundColor: '#0284C7', borderRadius: 28, paddingVertical: 24, alignItems: 'center', gap: 2 },
  time: { color: '#FFFFFF', fontSize: 72, fontWeight: '600', fontVariant: ['tabular-nums'] },
  date: { color: '#E0F2FE', fontSize: 22, fontWeight: '500' },
  nowPlaying: { marginTop: 10, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  nowPlayingText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  now: { flexDirection: 'row-reverse', alignItems: 'center', gap: 14, paddingVertical: 4 },
  bigIcon: { fontSize: 52 },
  temp: { fontSize: 52, fontWeight: '600', textAlign: 'right' },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  dayName: { width: 52, fontSize: 15, textAlign: 'right' },
  dayIcon: { width: 26, fontSize: 18, textAlign: 'center' },
  dayTemp: { width: 34, fontSize: 15, textAlign: 'center' },
  bar: { flex: 1, height: 6, borderRadius: 3 },
  barFill: { position: 'absolute', top: 0, bottom: 0, borderRadius: 3 },
  symbol: { fontSize: 16, fontWeight: '700' },
  price: { fontSize: 16, fontVariant: ['tabular-nums'] },
  pct: { width: 72, textAlign: 'center', fontSize: 14, fontWeight: '600', borderRadius: 8, paddingVertical: 3, overflow: 'hidden' },
  hint: { fontSize: 15, lineHeight: 22, textAlign: 'right' },
  rates: { flexDirection: 'row-reverse', gap: 8, marginTop: 4 },
  rate: { flex: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  rateValue: { fontSize: 18, fontWeight: '600', textAlign: 'right' },
  segment: { flexDirection: 'row-reverse', borderRadius: 999, padding: 3, gap: 3, alignSelf: 'flex-end' },
  segmentItem: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  segmentText: { fontSize: 14, fontWeight: '600' },
  item: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10, gap: 2 },
  meta: { fontSize: 12, textAlign: 'right' },
  title: { fontSize: 16, lineHeight: 22, textAlign: 'right', writingDirection: 'rtl' },
});
