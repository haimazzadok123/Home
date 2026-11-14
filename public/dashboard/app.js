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
  if (type === 'json') return res.json();
  // Some feeds (Rotter) are not UTF-8, so decode with the encoding the XML declares.
  const bytes = await res.arrayBuffer();
  const declared = /encoding=["']([\w-]+)["']/i.exec(new TextDecoder('ascii').decode(bytes.slice(0, 200)));
  try {
    return new TextDecoder(declared ? declared[1] : 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

// This copy's version, from the ?v= that index.html loads it with.
const APP_VERSION = (() => {
  try { return new URL(document.currentScript.src).searchParams.get('v') || ''; } catch { return ''; }
})();

const hhmm = new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false });

// ---------- settings ----------
const DEFAULTS = {
  lat: 32.0853, lon: 34.7818, city: 'תל אביב',
  symbols: ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'TEVA', 'QQQ'],
  finnhubKey: '', theme: 'auto', wake: true, autoSpeed: true, hiddenSites: [],
};
const settings = { ...DEFAULTS, ...(store('dash.settings') || {}) };
const saveSettings = () => store('dash.settings', settings);

// ---------- clock ----------
const dateFmt = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
const hebFmt = new Intl.DateTimeFormat('he-IL-u-ca-hebrew-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });

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
}

// ---------- weather (Open-Meteo) ----------
const WMO = [
  [[0], 'בהיר', '☀️', '🌙'], [[1], 'בהיר ברובו', '🌤️', '🌙'], [[2], 'מעונן חלקית', '⛅', '☁️'], [[3], 'מעונן', '☁️', '☁️'],
  [[45, 48], 'ערפל', '☁️', '☁️'], [[51, 53, 55, 56, 57], 'טפטוף', '🌦️', '🌧️'], [[61, 63, 65, 66, 67], 'גשם', '🌧️', '🌧️'],
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
  one: 'https://www.one.co.il/rss',
  ynetsport: 'https://www.ynet.co.il/Integration/StoryRss3.xml',
  flash: 'https://www.ynet.co.il/Integration/StoryRss1854.xml',
  walla: 'https://rss.walla.co.il/feed/1?type=main',
  israelhayom: 'https://www.israelhayom.co.il/rss.xml',
  haaretz: 'https://www.haaretz.co.il/srv/rss---feedly',
  maariv: 'https://www.maariv.co.il/Rss/RssChadashot',
  maarivflash: 'https://www.maariv.co.il/Rss/RssFeedsMivzakiChadashot',
  globes: 'https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=2',
  rotter: 'https://rotter.net/rss/rotternews.xml',
  inn: 'https://www.inn.co.il/Rss.aspx?act=0.1',
};
const SOURCE_INFO = {
  ynet: { label: 'ynet', group: 'news' },
  mako: { label: 'mako', group: 'news' },
  one: { label: 'ONE', group: 'sport' },
  sport5: { label: 'ספורט 5', group: 'sport' },
  ynetsport: { label: 'ynet', group: 'sport' },
  flash: { label: 'ynet', group: 'flash' },
  walla: { label: 'וואלה', group: 'news' },
  israelhayom: { label: 'ישראל היום', group: 'news' },
  haaretz: { label: 'הארץ', group: 'news' },
  maariv: { label: 'מעריב', group: 'news' },
  maarivflash: { label: 'מעריב', group: 'flash' },
  globes: { label: 'גלובס', group: 'news' },
  rotter: { label: 'רוטר', group: 'flash' },
  inn: { label: 'ערוץ 7', group: 'news' },
};
// The switches in the settings, and the feeds each one turns on or off.
const SITES = [
  ['ynet', 'ynet', ['ynet', 'flash', 'ynetsport']], ['mako', 'mako', ['mako']], ['walla', 'וואלה', ['walla']],
  ['israelhayom', 'ישראל היום', ['israelhayom']], ['haaretz', 'הארץ', ['haaretz']], ['maariv', 'מעריב', ['maariv', 'maarivflash']],
  ['globes', 'גלובס', ['globes']], ['inn', 'ערוץ 7', ['inn']], ['rotter', 'רוטר', ['rotter']], ['one', 'ONE', ['one']], ['sport5', 'ספורט 5', ['sport5']],
];
const hiddenSources = () => new Set(SITES.filter(([id]) => settings.hiddenSites.includes(id)).flatMap((site) => site[2]));
const viaRelay = (source) => async () => parseRss(await get(`https://api.allorigins.win/raw?url=${encodeURIComponent(FEEDS[source])}`, { type: 'text', timeout: 9000 }), source);
const htmlParser = new DOMParser();
// Titles arrive with HTML entities, sometimes escaped twice (Rotter), so decode until stable.
function plain(text) {
  let out = text || '';
  for (let i = 0; i < 2 && /[&<]/.test(out); i++) out = htmlParser.parseFromString(out, 'text/html').body.textContent;
  return out.trim();
}
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
      title: plain(text('title')),
      link: safeUrl(text('link')),
      date: new Date(text('pubDate')),
      image: safeUrl(text('image139X80') || text('image') || item.querySelector('enclosure')?.getAttribute('url') || (inDescription ? inDescription[1] : '')),
    };
  });
}

// rss2json returns the feed as JSON; its dates are UTC.
let rss2jsonQueue = Promise.resolve();
function viaRss2Json(source) {
  const turn = rss2jsonQueue.then(() => readRss2Json(source));
  rss2jsonQueue = turn.then(() => {}, () => {}).then(() => new Promise((done) => { setTimeout(done, 350); }));
  return turn;
}

async function readRss2Json(source) {
  const data = await get(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(FEEDS[source])}`);
  if (data.status !== 'ok') throw new Error('rss2json failed');
  return data.items.map((i) => {
    const inDescription = /<img[^>]+src=['"]([^'"]+)['"]/i.exec(i.description || '');
    return {
      source,
      title: plain(i.title),
      link: safeUrl(i.link),
      date: new Date(`${i.pubDate.replace(' ', 'T')}Z`),
      image: safeUrl(i.thumbnail || (inDescription ? inDescription[1] : '')),
    };
  });
}

// mako and ONE allow direct reading; ynet does not, so it goes through a relay.
// Sport5 has no feed of its own: its articles arrive through mako (see loadNews).
const NEWS_SOURCES = {
  mako: [async () => parseRss(await get(FEEDS.mako, { type: 'text' }), 'mako'), () => viaRss2Json('mako')],
  ynet: [viaRelay('ynet'), () => viaRss2Json('ynet')],
  one: [async () => parseRss(await get(FEEDS.one, { type: 'text' }), 'one'), () => viaRss2Json('one')],
  ynetsport: [viaRelay('ynetsport'), () => viaRss2Json('ynetsport')],
  flash: [viaRelay('flash'), () => viaRss2Json('flash')],
  ...Object.fromEntries(['walla', 'israelhayom', 'haaretz', 'maariv', 'maarivflash', 'globes']
    .map((source) => [source, [() => viaRss2Json(source), viaRelay(source)]])),
  // Rotter goes through the relay first: rss2json would return only 10 items, an hour late
  rotter: [viaRelay('rotter'), () => viaRss2Json('rotter')],
  inn: [async () => parseRss(await get(FEEDS.inn, { type: 'text' }), 'inn'), () => viaRss2Json('inn')],
};

const news = Object.fromEntries(Object.keys(FEEDS).map((source) => [source, []]));
let newsFilter = 'news';
let newsLoaded = false;

async function loadNews(group) {
  const hidden = hiddenSources();
  await Promise.all(Object.entries(NEWS_SOURCES).map(async ([source, attempts]) => {
    if (group && SOURCE_INFO[source].group !== group) return;
    // Sport5's articles come through mako's feed, so that feed is needed while either is shown
    if (hidden.has(source) && !(source === 'mako' && !hidden.has('sport5'))) return;
    for (const attempt of attempts) {
      try {
        const items = (await attempt()).filter((i) => i.title && i.link && !Number.isNaN(i.date.getTime()));
        // mako publishes Sport5's articles under /news-sport/, so they belong to the sport tab
        for (const i of items) if (i.source === 'mako' && i.link.includes('/news-sport')) i.source = 'sport5';
        if (items.length) { news[source] = items; renderNews(); return; }
      } catch { /* try the next route */ }
    }
  }));
  if (!group) newsLoaded = true;
  renderNews();
}

function renderNews() {
  const seen = new Set();
  const hidden = hiddenSources();
  const all = Object.values(news).flat()
    .filter((n) => SOURCE_INFO[n.source].group === newsFilter && !hidden.has(n.source) && !seen.has(n.link) && seen.add(n.link))
    .sort((a, b) => b.date - a.date).slice(0, 60);
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

// The S&P 500 tile sits next to the exchange rates. Finnhub's free plan has no index quotes,
// so with a key it shows SPY, the fund that tracks the index.
const SP_FINNHUB = 'SPY';
const SP_CNBC = '.SPX';
const fxTiles = { rates: [], sp: null };

function renderFx() {
  const tiles = [...fxTiles.rates, fxTiles.sp].filter(Boolean);
  $('fx').replaceChildren(...tiles.map((t) => el('div', null, t.name,
    el('b', { text: t.value, dir: 'ltr' }),
    el('em', { class: t.pct < 0 ? 'neg' : 'pos', text: `${t.pct > 0 ? '+' : ''}${t.pct.toFixed(2)}%`, dir: 'ltr' }))));
}

function takeSp(rows, symbol, name) {
  const i = rows.findIndex((r) => r.symbol === symbol);
  const row = i < 0 ? null : rows[i];
  if (row && !settings.symbols.includes(symbol)) rows.splice(i, 1);
  if (row && Number.isFinite(row.pct)) {
    fxTiles.sp = { name, value: row.price.toLocaleString('en-US', { maximumFractionDigits: 2 }), pct: row.pct };
    renderFx();
  }
}

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
    if (settings.finnhubKey) {
      rows = await quotesFinnhub([...new Set([...symbols, SP_FINNHUB])]);
      takeSp(rows, SP_FINNHUB, 'S&P 500 · SPY');
    } else {
      rows = await quotesCnbc([...symbols, SP_CNBC]);
      takeSp(rows, SP_CNBC, 'S&P 500');
    }
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
    : el('p', { class: 'empty', text: 'כדי להציג מחירי מניות צריך מפתח חינמי של Finnhub. מוסיפים אותו בהגדרות, דרך התפריט שבפינת השעון.' }));
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
    fxTiles.rates = [['USD', 'דולר'], ['EUR', 'אירו']].map(([code, name]) => {
      const now = 1 / last[code];
      return { name, value: `₪${now.toFixed(3)}`, pct: (now / (1 / prev[code]) - 1) * 100 };
    });
    renderFx();
  } catch { /* the tile stays as it was */ }
}

// ---------- network ----------
// A web page cannot read the Wi-Fi name or signal, so the card measures the connection itself.
const SPEED = 'https://speed.cloudflare.com/__down';
const SPEED_UP = 'https://speed.cloudflare.com/__up';
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

// A page cannot watch an upload's progress without extra permission from the server, so this
// times whole uploads: a small one to estimate the speed, then one sized to take about 3 seconds.
async function uploadTest() {
  const lag = (pings.at(-1) || 0) / 1000; // the round trip itself is not upload time
  const send = async (bytes) => {
    const body = new Blob([new Uint8Array(bytes)], { type: 'text/plain' });
    const t = performance.now();
    const res = await fetch(`${SPEED_UP}?r=${Math.random()}`, { method: 'POST', body, cache: 'no-store', signal: AbortSignal.timeout(20000) });
    await res.arrayBuffer();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Math.max(0.02, (performance.now() - t) / 1000 - lag);
  };
  let bytes = 250000;
  let secs = await send(bytes);
  const target = Math.min(8000000, Math.round((bytes / secs) * 3));
  if (target > bytes * 2) {
    bytes = target;
    secs = await send(bytes);
  }
  const mbps = (bytes * 8) / secs / 1e6;
  $('n-up').textContent = `${mbps >= 100 ? Math.round(mbps) : mbps.toFixed(1)} Mbps`;
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
  try {
    await uploadTest();
  } catch { /* leave the previous upload reading */ }
  testing = false;
  btn.disabled = false;
  btn.textContent = 'בדיקה';
}

// ---------- updates ----------
// When a newer version is published (version.json differs from this copy), reload to pick it up.
// It waits while the radio plays or a window is open, and reloads at most once per version so a
// stale cached page can never cause a reload loop.
let radioPlaying = false;
let pendingVersion = '';

async function checkVersion() {
  if (!APP_VERSION) return;
  try {
    const data = await get(`version.json?r=${Date.now()}`);
    if (data && data.v && String(data.v) !== APP_VERSION) pendingVersion = String(data.v);
  } catch { /* offline: try again later */ }
  reloadIfIdle();
}

function reloadIfIdle() {
  if (!pendingVersion || radioPlaying || document.querySelector('dialog[open]')) return;
  const key = `dash.reloaded.${pendingVersion}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  } catch { return; } // without storage there is no loop guard, so do not reload
  location.reload();
}

// ---------- radio ----------
const KAN = 'https://playerservices.streamtheworld.com/api/livestream-redirect/';
const STATIONS = [
  ['גלגלצ', 'https://glzwizzlv.bynetcdn.com/glglz_mp3'],
  ['גל״צ', 'https://glzwizzlv.bynetcdn.com/glz_mp3'],
  ['כאן ב', `${KAN}KAN_BET.mp3`],
  ['כאן גימל', `${KAN}KAN_GIMMEL.mp3`],
  ['כאן 88', `${KAN}KAN_88.mp3`],
  ['103FM', 'https://cdn.cybercdn.live/103FM/Live/icecast.audio'],
  ['רדיוס 100', 'https://cdn.cybercdn.live/Radios_100FM/Audio/icecast.audio'],
  ['קול ברמה', 'https://cdn.cybercdn.live/Kol_Barama/Live_Audio/icecast.audio'],
];

function setupRadio() {
  const audio = new Audio();
  audio.preload = 'none';
  let current = -1;
  const status = (text) => { $('r-status').textContent = text; };
  const buttons = STATIONS.map(([name], i) => {
    const btn = el('button', { type: 'button', text: name, 'aria-pressed': 'false' });
    btn.addEventListener('click', () => (i === current ? stop() : play(i)));
    return btn;
  });
  $('r-list').replaceChildren(...buttons);
  const mark = () => {
    buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(i === current)));
    $('r-stop').disabled = current < 0;
  };
  $('r-stop').addEventListener('click', () => stop());

  // iPhone and iPad let only the hardware buttons change the volume, so the slider is hidden there.
  const vol = $('r-vol');
  const saved = store('dash.volume');
  audio.volume = 0.5;
  if (audio.volume !== 0.5) vol.hidden = true;
  audio.volume = typeof saved === 'number' && !vol.hidden ? saved : 1;
  vol.value = String(audio.volume);
  vol.addEventListener('input', () => { audio.volume = Number(vol.value); store('dash.volume', audio.volume); });

  function stop() {
    current = -1;
    radioPlaying = false;
    audio.pause();
    audio.removeAttribute('src'); // otherwise the stream keeps downloading in the background
    audio.load();
    mark();
    status('');
  }
  function play(i) {
    current = i;
    mark();
    status('מתחבר…');
    audio.src = STATIONS[i][1];
    audio.play().catch(() => { if (current === i) { stop(); status('התחנה לא זמינה כרגע'); } });
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: STATIONS[i][0], artist: 'רדיו' });
  }
  audio.addEventListener('playing', () => { radioPlaying = true; if (current >= 0) status(`מתנגן: ${STATIONS[current][0]}`); });
  audio.addEventListener('waiting', () => { if (current >= 0) status('טוען…'); });
  audio.addEventListener('error', () => { if (current >= 0) { stop(); status('התחנה לא זמינה כרגע'); } });
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

// On a computer, zoom the whole page so the tablet layout fills the window. It is measured from the
// window itself because browser bars, the taskbar and display scaling make it smaller than the screen.
function fitToWindow() {
  const w = innerWidth;
  const h = innerHeight;
  let z = w >= 1200 && h >= 600 && w > h ? Math.min(w / 1366, h / 768, 2.6) : 1;
  z = Math.round(z * 20) / 20;
  if (z > 1) document.documentElement.style.setProperty('--z', String(z));
  else document.documentElement.style.removeProperty('--z');
}

function setupScreen() {
  fitToWindow();
  addEventListener('resize', fitToWindow);
  applyTheme();
  $('b-theme').addEventListener('click', () => {
    const dark = settings.theme === 'dark' || (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    settings.theme = dark ? 'light' : 'dark';
    applyTheme();
    saveSettings();
    $('sites').close();
  });

  const root = document.documentElement;
  const enter = root.requestFullscreen || root.webkitRequestFullscreen;
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (!enter || standalone) $('b-full').hidden = true;
  $('b-full').addEventListener('click', () => {
    $('sites').close();
    if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else enter.call(root);
  });

  const sites = $('sites');
  $('b-sites').addEventListener('click', () => sites.showModal());
  $('sites-close').addEventListener('click', () => sites.close());
  $('b-terms').addEventListener('click', () => { sites.close(); $('terms').showModal(); });
  $('terms-close').addEventListener('click', () => $('terms').close());
  sites.addEventListener('click', (e) => { if (e.target === sites) sites.close(); }); // tap outside the list

  document.addEventListener('pointerdown', keepAwake);
  keepAwake();
}

// ---------- settings dialog ----------
function setupSettings() {
  const dialog = $('settings');
  let picked = null;
  let searchTimer = 0;

  $('set-sites').replaceChildren(...SITES.map(([id, label]) => el('label', null, el('input', { type: 'checkbox', value: id }), label)));

  const showCity = () => { $('set-city-now').textContent = `נבחר: ${(picked || settings).city}`; };

  $('b-settings').addEventListener('click', () => {
    $('sites').close();
    picked = null;
    $('set-city').value = '';
    $('set-city-results').replaceChildren();
    $('set-symbols').value = settings.symbols.join(', ');
    $('set-key').value = settings.finnhubKey;
    for (const box of $('set-sites').querySelectorAll('input')) box.checked = !settings.hiddenSites.includes(box.value);
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
    settings.hiddenSites = [...$('set-sites').querySelectorAll('input')].filter((box) => !box.checked).map((box) => box.value);
    run('news', true);
    settings.wake = $('set-wake').checked;
    settings.autoSpeed = $('set-speed').checked;
    if (picked) Object.assign(settings, picked);
    saveSettings();
    if (!settings.wake && wakeLock) wakeLock.release();
    setTimeout(reloadIfIdle, 500);
    keepAwake();
    if (picked) { run('weather', true); run('shabbat', true); }
    if (stocksChanged) { store('dash.stocks', null); run('stocks', true); }
  });
}

// ---------- refresh schedule ----------
const TASKS = {
  weather: { fn: loadWeather, every: 15 * MIN },
  shabbat: { fn: loadShabbat, every: 180 * MIN },
  news: { fn: () => loadNews(), every: 5 * MIN },
  flash: { fn: () => loadNews('flash'), every: 1.5 * MIN },
  stocks: { fn: loadStocks, every: 2 * MIN },
  fx: { fn: loadFx, every: 180 * MIN },
  ping: { fn: samplePing, every: 0.5 * MIN },
  speed: { fn: () => (settings.autoSpeed ? speedTest() : null), every: 30 * MIN },
  version: { fn: checkVersion, every: 5 * MIN },
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
setupRadio();

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
