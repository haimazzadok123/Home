'use strict';

// ---------- small helpers ----------
const $ = (id) => document.getElementById(id);
const MIN = 60 * 1000;

function el(tag, props, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const kid of kids) if (kid != null) node.append(kid);
  return node;
}

function store(key, value) {
  try {
    if (value === undefined) return JSON.parse(localStorage.getItem(key));
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* private mode or blocked storage: the page works without it */ }
  return null;
}

async function get(url, { type = 'json', timeout = 12000 } = {}) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeout), cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return type === 'json' ? res.json() : res.text();
}

const hhmm = new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false });

// ---------- settings ----------
const DEFAULTS = {
  lat: 32.0853, lon: 34.7818, city: 'תל אביב',
  symbols: ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'TEVA', 'SPY', 'QQQ'],
  finnhubKey: '', theme: 'auto', wake: true, autoSpeed: true,
};
const settings = { ...DEFAULTS, ...(store('dash.settings') || {}) };
const saveSettings = () => store('dash.settings', settings);

// ---------- clock ----------
const dateFmt = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
const hebFmt = new Intl.DateTimeFormat('he-IL-u-ca-hebrew-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });
const WORLD = [['ניו יורק', 'America/New_York'], ['לונדון', 'Europe/London'], ['טוקיו', 'Asia/Tokyo']]
  .map(([name, timeZone]) => ({ name, fmt: new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }) }));

// Hebrew numerals: 4 -> ד׳, 15 -> ט״ו, 787 -> תשפ״ז
function gematria(n) {
  const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
  const tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
  let out = '';
  for (const [value, letter] of [[400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק']]) {
    while (n >= value) { out += letter; n -= value; }
  }
  if (n === 15) out += 'טו';
  else if (n === 16) out += 'טז';
  else out += tens[Math.floor(n / 10)] + ones[n % 10];
  return out.length > 1 ? `${out.slice(0, -1)}״${out.slice(-1)}` : `${out}׳`;
}

function hebrewDate(now) {
  try {
    const parts = Object.fromEntries(hebFmt.formatToParts(now).map((p) => [p.type, p.value]));
    const day = Number(parts.day);
    const year = Number(parts.year);
    if (!day || !year) return hebFmt.format(now);
    return `${gematria(day)} ב${parts.month} ${gematria(year % 1000)}`;
  } catch { return ''; }
}

let lastMinute = '';
function tickClock() {
  const now = new Date();
  $('sec').textContent = String(now.getSeconds()).padStart(2, '0');
  const minute = hhmm.format(now);
  if (minute === lastMinute) return;
  lastMinute = minute;
  $('time').textContent = minute;
  $('date').textContent = dateFmt.format(now);
  $('hebdate').textContent = hebrewDate(now);
  $('world').replaceChildren(...WORLD.map((w) => el('span', { text: w.name }, el('b', { text: w.fmt.format(now), dir: 'ltr' }))));
}

// ---------- weather (Open-Meteo) ----------
const WMO = [
  [[0], 'בהיר', '☀️', '🌙'], [[1], 'בהיר ברובו', '🌤️', '🌙'], [[2], 'מעונן חלקית', '⛅', '☁️'], [[3], 'מעונן', '☁️', '☁️'],
  [[45, 48], 'ערפל', '🌫️', '🌫️'], [[51, 53, 55, 56, 57], 'טפטוף', '🌦️', '🌧️'], [[61, 63, 65, 66, 67], 'גשם', '🌧️', '🌧️'],
  [[71, 73, 75, 77, 85, 86], 'שלג', '❄️', '❄️'], [[80, 81, 82], 'ממטרים', '🌦️', '🌧️'], [[95, 96, 99], 'סופת רעמים', '⛈️', '⛈️'],
];
function wmo(code, isDay = 1) {
  const row = WMO.find((r) => r[0].includes(code));
  return row ? { text: row[1], icon: isDay ? row[2] : row[3] } : { text: '', icon: '🌡️' };
}
const deg = (n) => `${Math.round(n)}°`;
const aqiText = (v) => (v <= 20 ? 'טובה מאוד' : v <= 40 ? 'טובה' : v <= 60 ? 'בינונית' : v <= 80 ? 'ירודה' : 'גרועה');

let sunTimes = null;
async function loadWeather() {
  const { lat, lon } = settings;
  $('w-city').textContent = settings.city;
  const q = `latitude=${lat}&longitude=${lon}&timezone=auto`;
  let w;
  try {
    w = await get(`https://api.open-meteo.com/v1/forecast?${q}&forecast_days=7`
      + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day'
      + '&hourly=temperature_2m,weather_code,is_day'
      + '&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max');
  } catch {
    if (!$('w-hours').children.length) $('w-desc').textContent = 'אין נתוני מזג אוויר כרגע';
    return;
  }
  const c = w.current;
  const now = wmo(c.weather_code, c.is_day);
  $('w-icon').textContent = now.icon;
  $('w-temp').textContent = deg(c.temperature_2m);
  $('w-desc').textContent = `${now.text} · מרגיש כמו ${deg(c.apparent_temperature)}`;

  const facts = [['לחות', `${c.relative_humidity_2m}%`], ['רוח', `${Math.round(c.wind_speed_10m)} קמ״ש`], ['UV', String(Math.round(w.daily.uv_index_max[0]))]];
  try {
    const aq = await get(`https://air-quality-api.open-meteo.com/v1/air-quality?${q}&current=european_aqi`);
    if (aq.current.european_aqi != null) facts.push(['אוויר', aqiText(aq.current.european_aqi)]);
  } catch { /* air quality is optional */ }
  $('w-facts').replaceChildren(...facts.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]));

  // Times come back as local ISO strings without an offset, so compare them as text.
  const start = Math.max(0, w.hourly.time.findIndex((t) => t >= `${c.time.slice(0, 13)}:00`));
  $('w-hours').replaceChildren(...[0, 2, 4, 6, 8, 10].map((off) => {
    const i = start + off;
    return el('div', null,
      el('time', { text: off === 0 ? 'עכשיו' : w.hourly.time[i].slice(11, 16), dir: off === 0 ? null : 'ltr' }),
      el('i', { text: wmo(w.hourly.weather_code[i], w.hourly.is_day[i]).icon }),
      el('b', { text: deg(w.hourly.temperature_2m[i]), dir: 'ltr' }));
  }));

  const d = w.daily;
  const lo = Math.min(...d.temperature_2m_min);
  const span = Math.max(1, Math.max(...d.temperature_2m_max) - lo);
  const dayName = new Intl.DateTimeFormat('he-IL', { weekday: 'short' });
  $('w-days').replaceChildren(...d.time.map((t, i) => {
    const fill = el('i');
    fill.style.insetInlineStart = `${((d.temperature_2m_min[i] - lo) / span) * 100}%`;
    fill.style.insetInlineEnd = `${100 - ((d.temperature_2m_max[i] - lo) / span) * 100}%`;
    return el('div', null,
      el('span', { text: i === 0 ? 'היום' : dayName.format(new Date(`${t}T12:00`)) }),
      el('span', { text: wmo(d.weather_code[i]).icon }),
      el('span', { class: 'lo', text: deg(d.temperature_2m_min[i]), dir: 'ltr' }),
      el('span', { class: 'bar' }, fill),
      el('span', { class: 'hi', text: deg(d.temperature_2m_max[i]), dir: 'ltr' }));
  }));

  sunTimes = { rise: d.sunrise[0].slice(11, 16), set: d.sunset[0].slice(11, 16) };
  renderToday();
}

// ---------- Shabbat times (Hebcal) ----------
let shabbat = null;
async function loadShabbat() {
  try {
    const data = await get(`https://www.hebcal.com/shabbat?cfg=json&latitude=${settings.lat}&longitude=${settings.lon}&M=on&lg=he`);
    const find = (cat) => data.items.find((i) => i.category === cat);
    shabbat = { candles: find('candles'), havdalah: find('havdalah'), parasha: find('parashat'), holiday: find('holiday') };
  } catch { /* keep whatever is already shown */ }
  renderToday();
}

function renderToday() {
  const rows = [];
  const clock = (item) => hhmm.format(new Date(item.date));
  if (shabbat) {
    $('t-parasha').textContent = shabbat.parasha ? shabbat.parasha.hebrew : (shabbat.holiday ? shabbat.holiday.hebrew : '');
    if (shabbat.candles) rows.push(['כניסה', clock(shabbat.candles)]);
    if (shabbat.havdalah) rows.push(['יציאה', clock(shabbat.havdalah)]);
  }
  if (sunTimes) rows.push(['זריחה', sunTimes.rise], ['שקיעה', sunTimes.set]);
  $('t-rows').replaceChildren(...rows.map(([k, v]) => el('div', null, el('dt', { text: k }), el('dd', { text: v, dir: 'ltr' }))));
}

// ---------- news (RSS) ----------
const FEEDS = {
  ynet: 'https://www.ynet.co.il/Integration/StoryRss2.xml',
  mako: 'https://rcs.mako.co.il/rss/31750a2610f26110VgnVCM1000005201000aRCRD.xml',
  one: 'https://www.one.co.il/cat/coop/xml/rss/newsfeed.aspx',
  sport5: 'https://www.sport5.co.il/rss.aspx?FolderID=252',
  ynetsport: 'https://www.ynet.co.il/Integration/StoryRss3.xml',
};
const SOURCE_INFO = {
  ynet: { label: 'ynet', group: 'news' },
  mako: { label: 'mako', group: 'news' },
  one: { label: 'ONE', group: 'sport' },
  sport5: { label: 'ספורט 5', group: 'sport' },
  ynetsport: { label: 'ynet', group: 'sport' },
};
const viaRelay = (source) => async () => parseRss(await get(`https://api.allorigins.win/raw?url=${encodeURIComponent(FEEDS[source])}`, { type: 'text', timeout: 9000 }), source);
const htmlParser = new DOMParser();
const safeUrl = (u) => (typeof u === 'string' && /^https:\/\//.test(u.trim()) ? u.trim() : '');

function parseRss(xml, source) {
  const doc = htmlParser.parseFromString(xml, 'text/xml');
  const items = [...doc.querySelectorAll('item')];
  if (!items.length) throw new Error('empty feed');
  return items.map((item) => {
    const text = (tag) => item.querySelector(tag)?.textContent?.trim() || '';
    const inDescription = /<img[^>]+src=['"]([^'"]+)['"]/i.exec(text('description'));
    return {
      source,
      title: text('title'),
      link: safeUrl(text('link')),
      date: new Date(text('pubDate')),
      image: safeUrl(text('image139X80') || text('image') || (inDescription ? inDescription[1] : '')),
    };
  });
}

// rss2json returns the feed as JSON; its dates are UTC.
async function viaRss2Json(source) {
  const data = await get(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(FEEDS[source])}`);
  if (data.status !== 'ok') throw new Error('rss2json failed');
  return data.items.map((i) => {
    const inDescription = /<img[^>]+src=['"]([^'"]+)['"]/i.exec(i.description || '');
    return {
      source,
      title: htmlParser.parseFromString(i.title || '', 'text/html').body.textContent.trim(),
      link: safeUrl(i.link),
      date: new Date(`${i.pubDate.replace(' ', 'T')}Z`),
      image: safeUrl(i.thumbnail || (inDescription ? inDescription[1] : '')),
    };
  });
}

// mako allows direct reading; the other sites do not, so they go through a relay.
// The sport feeds try rss2json first because it also handles their text encoding.
const NEWS_SOURCES = {
  mako: [async () => parseRss(await get(FEEDS.mako, { type: 'text' }), 'mako'), () => viaRss2Json('mako')],
  ynet: [viaRelay('ynet'), () => viaRss2Json('ynet')],
  one: [() => viaRss2Json('one'), viaRelay('one')],
  sport5: [() => viaRss2Json('sport5'), viaRelay('sport5')],
  ynetsport: [viaRelay('ynetsport'), () => viaRss2Json('ynetsport')],
};

const news = { ynet: [], mako: [], one: [], sport5: [], ynetsport: [] };
let newsFilter = 'news';
let newsLoaded = false;

async function loadNews() {
  await Promise.all(Object.entries(NEWS_SOURCES).map(async ([source, attempts]) => {
    for (const attempt of attempts) {
      try {
        const items = (await attempt()).filter((i) => i.title && i.link && !Number.isNaN(i.date.getTime()));
        // mako publishes Sport5's articles under /news-sport/, so they belong to the sport tab
        for (const i of items) if (i.source === 'mako' && i.link.includes('/news-sport')) i.source = 'sport5';
        if (items.length) { news[source] = items; renderNews(); return; }
      } catch { /* try the next route */ }
    }
  }));
  newsLoaded = true;
  renderNews();
}

function renderNews() {
  const seen = new Set();
  const all = Object.values(news).flat()
    .filter((n) => SOURCE_INFO[n.source].group === newsFilter && !seen.has(n.link) && seen.add(n.link))
    .sort((a, b) => b.date - a.date).slice(0, 40);
  const list = $('news-list');
  if (!all.length) {
    if (newsLoaded) list.replaceChildren(el('p', { class: 'empty', text: 'לא הצלחתי לטעון כותרות כרגע. ננסה שוב בעוד כמה דקות.' }));
    return;
  }
  const today = new Date().toDateString();
  const dayFmt = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'numeric' });
  list.replaceChildren(...all.map((n) => {
    const when = n.date.toDateString() === today ? hhmm.format(n.date) : dayFmt.format(n.date);
    const img = n.image ? el('img', { src: n.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : null;
    if (img) img.addEventListener('error', () => img.remove());
    return el('a', { class: 'n-item', href: n.link, target: '_blank', rel: 'noopener noreferrer' },
      img,
      el('div', null,
        el('div', { class: 'n-meta' }, el('b', { text: SOURCE_INFO[n.source].label }), el('time', { text: when, dir: 'ltr' })),
        el('div', { class: 'n-title', text: n.title })));
  }));
}

// ---------- stocks ----------
const NAMES = {
  AAPL: 'Apple', MSFT: 'Microsoft', NVDA: 'Nvidia', GOOGL: 'Alphabet', GOOG: 'Alphabet', AMZN: 'Amazon', META: 'Meta',
  TSLA: 'Tesla', TEVA: 'Teva', SPY: 'S&P 500', QQQ: 'Nasdaq 100', NFLX: 'Netflix', AMD: 'AMD', INTC: 'Intel',
  CHKP: 'Check Point', NICE: 'NICE', WIX: 'Wix', MNDY: 'monday.com', AVGO: 'Broadcom', 'BRK.B': 'Berkshire Hathaway',
};

async function quotesFinnhub(symbols) {
  const rows = await Promise.all(symbols.map(async (symbol) => {
    try {
      const q = await get(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(settings.finnhubKey)}`);
      return q && q.c ? { symbol, name: NAMES[symbol] || '', price: q.c, pct: q.dp } : null;
    } catch { return null; }
  }));
  return rows.filter(Boolean);
}

// Keyless route. It works only where the service lets a browser read it, so it is a best effort.
async function quotesCnbc(symbols) {
  const data = await get(`https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=${encodeURIComponent(symbols.join('|'))}&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json`, { timeout: 8000 });
  const list = [].concat(data?.FormattedQuoteResult?.FormattedQuote || []);
  const num = (s) => parseFloat(String(s).replace(/[,%+]/g, ''));
  return list.map((q) => ({ symbol: q.symbol, name: NAMES[q.symbol] || q.shortName || q.name || '', price: num(q.last), pct: num(q.change_pct) }))
    .filter((q) => q.symbol && Number.isFinite(q.price));
}

async function loadStocks() {
  const symbols = settings.symbols;
  let rows = [];
  try {
    rows = settings.finnhubKey ? await quotesFinnhub(symbols) : await quotesCnbc(symbols);
  } catch { /* handled below */ }
  if (rows.length) {
    store('dash.stocks', { rows, at: Date.now() });
    renderStocks(rows, Date.now());
    return;
  }
  const cached = store('dash.stocks');
  if (cached && cached.rows && cached.rows.length) { renderStocks(cached.rows, cached.at); return; }
  $('s-time').textContent = '';
  $('s-list').replaceChildren(settings.finnhubKey
    ? el('p', { class: 'empty', text: 'לא התקבלו מחירים. כדאי לבדוק את המפתח ואת הסימולים בהגדרות.' })
    : el('p', { class: 'empty', text: 'כדי להציג מחירי מניות צריך מפתח חינמי של Finnhub. מוסיפים אותו בהגדרות (הכפתור בפינה).' }));
}

function renderStocks(rows, at) {
  $('s-time').textContent = `עודכן ${hhmm.format(new Date(at))}`;
  $('s-list').replaceChildren(...rows.map((r) => {
    const pct = Number.isFinite(r.pct) ? r.pct : 0;
    return el('div', { class: 's-row' },
      el('div', null, el('div', { class: 's-sym', text: r.symbol }), el('div', { class: 's-name', text: r.name })),
      el('div', { class: 's-price', text: r.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }),
      el('div', { class: `s-chg${pct < 0 ? ' neg' : ''}`, text: `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%` }));
  }));
}

// ---------- exchange rates (Frankfurter, daily ECB rates) ----------
async function loadFx() {
  try {
    const from = new Date(Date.now() - 9 * 24 * 60 * MIN).toISOString().slice(0, 10);
    const data = await get(`https://api.frankfurter.dev/v1/${from}..?base=ILS&symbols=USD,EUR`);
    const days = Object.keys(data.rates).sort();
    const last = data.rates[days.at(-1)];
    const prev = data.rates[days.at(-2)] || last;
    $('fx').replaceChildren(...[['USD', 'דולר'], ['EUR', 'אירו']].map(([code, name]) => {
      const now = 1 / last[code];
      const pct = (now / (1 / prev[code]) - 1) * 100;
      return el('div', null, `${name} `,
        el('em', { class: pct < 0 ? 'neg' : 'pos', text: `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`, dir: 'ltr' }),
        el('b', { text: `₪${now.toFixed(3)}`, dir: 'ltr' }));
    }));
  } catch { /* the tile stays as it was */ }
}

// ---------- network ----------
// A web page cannot read the Wi-Fi name or signal, so the card measures the connection itself.
const SPEED = 'https://speed.cloudflare.com/__down';
const pings = [];
let lastDown = null;
let lastDownAt = 0;
let testing = false;

async function pingOnce() {
  const t = performance.now();
  await fetch(`${SPEED}?bytes=0&r=${Math.random()}`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
  return performance.now() - t;
}

function setStatus(online) {
  const conn = navigator.connection;
  const kind = conn && conn.type && conn.type !== 'unknown' ? ({ wifi: 'Wi-Fi', cellular: 'סלולרי', ethernet: 'קווי' }[conn.type] || '') : '';
  $('n-status').className = `status ${online ? 'on' : 'off'}`;
  $('n-status').lastElementChild.textContent = online ? (kind ? `מחובר · ${kind}` : 'מחובר') : 'אין חיבור';
}

async function samplePing() {
  if (testing) return;
  if (!navigator.onLine) { setStatus(false); return; }
  try {
    await pingOnce(); // opens the connection so the next samples measure only the round trip
    const samples = [await pingOnce(), await pingOnce(), await pingOnce()];
    const best = Math.min(...samples);
    pings.push(best);
    if (pings.length > 40) pings.shift();
    setStatus(true);
    $('n-ping').textContent = `${Math.round(best)} ms`;
    $('n-jitter').textContent = `±${Math.round(Math.max(...samples) - best)} ms`;
    drawSpark();
    renderQuality();
  } catch {
    setStatus(false);
  }
}

function drawSpark() {
  const svg = $('n-spark');
  if (pings.length < 2) { svg.replaceChildren(); return; }
  const max = Math.max(...pings) * 1.15;
  const min = Math.min(...pings) * 0.85;
  const pts = pings.map((p, i) => `${(i / (pings.length - 1)) * 100},${26 - ((p - min) / (max - min || 1)) * 24}`);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', `M${pts.join(' L')}`);
  svg.replaceChildren(path);
}

function renderQuality() {
  const ping = pings.at(-1);
  let text = '';
  if (lastDown != null && ping != null) {
    text = lastDown >= 50 && ping < 80 ? 'חיבור מצוין' : lastDown >= 15 ? 'חיבור טוב' : lastDown >= 5 ? 'חיבור בינוני' : 'חיבור חלש';
    text += ` · נבדק ב־${hhmm.format(new Date(lastDownAt))}`;
  }
  $('n-quality').textContent = text;
}

async function speedTest() {
  if (testing || !navigator.onLine) return;
  testing = true;
  const btn = $('n-run');
  btn.disabled = true;
  btn.textContent = 'בודק…';
  try {
    const ctrl = new AbortController();
    const res = await fetch(`${SPEED}?bytes=15000000&r=${Math.random()}`, { cache: 'no-store', signal: ctrl.signal });
    const reader = res.body.getReader();
    let bytes = 0;
    let started = 0;
    let mbps = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const now = performance.now();
      if (!started) { started = now; continue; } // skip the first chunk: it includes the connection setup
      bytes += value.length;
      const secs = (now - started) / 1000;
      if (secs > 0.2) {
        mbps = (bytes * 8) / secs / 1e6;
        $('n-down').textContent = mbps >= 100 ? Math.round(mbps) : mbps.toFixed(1);
      }
      if (secs > 5) { ctrl.abort(); break; } // five seconds is enough for a stable reading
    }
    if (mbps) {
      lastDown = mbps;
      lastDownAt = Date.now();
      renderQuality();
    }
  } catch { /* leave the previous reading */ }
  testing = false;
  btn.disabled = false;
  btn.textContent = 'בדיקת מהירות';
}

// ---------- screen: theme, wake lock, full screen ----------
function applyTheme() {
  if (settings.theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', settings.theme);
}

let wakeLock = null;
async function keepAwake() {
  if (!settings.wake || !('wakeLock' in navigator) || document.visibilityState !== 'visible' || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch { /* the browser wants a tap first; the tap handler below retries */ }
}

function setupScreen() {
  applyTheme();
  $('b-theme').addEventListener('click', () => {
    const dark = settings.theme === 'dark' || (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    settings.theme = dark ? 'light' : 'dark';
    applyTheme();
    saveSettings();
  });

  const root = document.documentElement;
  const enter = root.requestFullscreen || root.webkitRequestFullscreen;
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (!enter || standalone) $('b-full').hidden = true;
  $('b-full').addEventListener('click', () => {
    if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else enter.call(root);
  });

  const sites = $('sites');
  $('b-sites').addEventListener('click', () => sites.showModal());
  $('sites-close').addEventListener('click', () => sites.close());
  sites.addEventListener('click', (e) => { if (e.target === sites) sites.close(); }); // tap outside the list

  document.addEventListener('pointerdown', keepAwake);
  keepAwake();
}

// ---------- settings dialog ----------
function setupSettings() {
  const dialog = $('settings');
  let picked = null;
  let searchTimer = 0;

  const showCity = () => { $('set-city-now').textContent = `נבחר: ${(picked || settings).city}`; };

  $('b-settings').addEventListener('click', () => {
    picked = null;
    $('set-city').value = '';
    $('set-city-results').replaceChildren();
    $('set-symbols').value = settings.symbols.join(', ');
    $('set-key').value = settings.finnhubKey;
    $('set-wake').checked = settings.wake;
    $('set-speed').checked = settings.autoSpeed;
    showCity();
    dialog.showModal();
  });
  $('set-cancel').addEventListener('click', () => dialog.close());

  $('set-city').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const name = e.target.value.trim();
    if (name.length < 2) { $('set-city-results').replaceChildren(); return; }
    searchTimer = setTimeout(async () => {
      try {
        const data = await get(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=he`);
        $('set-city-results').replaceChildren(...(data.results || []).map((r) => {
          const btn = el('button', { type: 'button', text: r.name }, el('small', { text: [r.admin1, r.country].filter(Boolean).join(', ') }));
          btn.addEventListener('click', () => {
            picked = { lat: r.latitude, lon: r.longitude, city: r.name };
            $('set-city-results').replaceChildren();
            $('set-city').value = '';
            showCity();
          });
          return btn;
        }));
      } catch { /* no results to show */ }
    }, 350);
  });

  $('set-geo').addEventListener('click', () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      picked = { lat: +pos.coords.latitude.toFixed(3), lon: +pos.coords.longitude.toFixed(3), city: 'המיקום שלי' };
      showCity();
    }, () => { $('set-city-now').textContent = 'לא התקבלה הרשאה למיקום.'; }, { timeout: 10000 });
  });

  $('set-form').addEventListener('submit', () => {
    const symbols = $('set-symbols').value.toUpperCase().split(/[\s,]+/).filter((s) => /^[A-Z0-9.\-^=]{1,10}$/.test(s)).slice(0, 20);
    const stocksChanged = symbols.join() !== settings.symbols.join() || $('set-key').value.trim() !== settings.finnhubKey;
    if (symbols.length) settings.symbols = symbols;
    settings.finnhubKey = $('set-key').value.trim();
    settings.wake = $('set-wake').checked;
    settings.autoSpeed = $('set-speed').checked;
    if (picked) Object.assign(settings, picked);
    saveSettings();
    if (!settings.wake && wakeLock) wakeLock.release();
    keepAwake();
    if (picked) { run('weather', true); run('shabbat', true); }
    if (stocksChanged) { store('dash.stocks', null); run('stocks', true); }
  });
}

// ---------- refresh schedule ----------
const TASKS = {
  weather: { fn: loadWeather, every: 15 * MIN },
  shabbat: { fn: loadShabbat, every: 180 * MIN },
  news: { fn: loadNews, every: 5 * MIN },
  stocks: { fn: loadStocks, every: 2 * MIN },
  fx: { fn: loadFx, every: 180 * MIN },
  ping: { fn: samplePing, every: 0.5 * MIN },
  speed: { fn: () => (settings.autoSpeed ? speedTest() : null), every: 30 * MIN },
};

function run(name, force) {
  const task = TASKS[name];
  if (!force && task.last && Date.now() - task.last < task.every) return;
  task.last = Date.now();
  Promise.resolve(task.fn()).catch(() => {});
}

function refresh() {
  if (document.visibilityState !== 'visible') return;
  for (const name of Object.keys(TASKS)) run(name);
}

// ---------- start ----------
tickClock();
setInterval(tickClock, 1000);
setupScreen();
setupSettings();

$('news-chips').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  newsFilter = btn.dataset.src;
  for (const b of $('news-chips').children) b.setAttribute('aria-pressed', String(b === btn));
  renderNews();
  $('news-list').scrollTop = 0;
});
$('n-run').addEventListener('click', speedTest);
addEventListener('online', () => { setStatus(true); refresh(); });
addEventListener('offline', () => setStatus(false));
document.addEventListener('visibilitychange', () => { keepAwake(); refresh(); });

refresh();
setInterval(refresh, 20 * 1000);
