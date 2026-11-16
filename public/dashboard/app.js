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

// ---------- intro ----------
// The splash in index.html plays its logo animation, then opens once the page has loaded and the
// animation has had time to finish. A tap skips it, and it never waits longer than 5 seconds.
(() => {
  const splash = $('splash');
  if (!splash) return;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const minShow = calm ? 500 : 2300; // ms since the page started loading
  let gone = false;
  const open = () => {
    if (gone) return;
    gone = true;
    splash.classList.add('out');
    document.body.classList.add('enter');
    setTimeout(() => splash.remove(), 1300);
    setTimeout(() => document.body.classList.remove('enter'), 2200);
  };
  const whenLoaded = () => setTimeout(open, Math.max(0, minShow - performance.now()));
  if (document.readyState === 'complete') whenLoaded();
  else addEventListener('load', whenLoaded, { once: true });
  splash.addEventListener('click', open);
  setTimeout(open, 5000);
})();

const hhmm = new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false });

// ---------- settings ----------
const DEFAULTS = {
  lat: 32.0853, lon: 34.7818, city: 'תל אביב',
  symbols: ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'TEVA', 'QQQ'],
  finnhubKey: '', theme: 'auto', wake: true, autoSpeed: true, hiddenSites: [],
  night: true, nightFrom: '20:00', nightTo: '06:30',
  frame: true, frameIdle: 10,
};
const settings = { ...DEFAULTS, ...(store('dash.settings') || {}) };
const saveSettings = () => store('dash.settings', settings);
// Night mode used to start at 23:00 by default; move a setting still on that old default to 20:00.
if (!settings.nightV2) {
  if (settings.nightFrom === '23:00') settings.nightFrom = '20:00';
  settings.nightV2 = true;
  saveSettings();
}

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
  $('night-time').textContent = minute;
  $('night-date').textContent = dateFmt.format(now);
  $('frame-time').textContent = minute;
  $('frame-date').textContent = dateFmt.format(now);
  driftNightClock();
}

// ---------- night mode ----------
// Between the chosen hours (or when switched on from the menu) the page shows only a dim clock on
// black. A tap shows the dashboard for a minute. The clock drifts a little every minute so the same
// pixels are not lit all night.
let manualNight = false;
let peekUntil = 0;
let nightActive = false;

const toMinutes = (hhmmText) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmmText || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

function inNightHours(now = new Date()) {
  const from = toMinutes(settings.nightFrom);
  const to = toMinutes(settings.nightTo);
  if (from == null || to == null || from === to) return false;
  const t = now.getHours() * 60 + now.getMinutes();
  return from < to ? t >= from && t < to : t >= from || t < to; // the window may cross midnight
}

function updateNight() {
  const on = (manualNight || (settings.night && inNightHours())) && Date.now() >= peekUntil;
  if (on === nightActive) return;
  nightActive = on;
  $('night').hidden = !on;
  if (!on) $('night-flash').hidden = true;
  if (on) {
    stopFrame();
    nightFlashKey = '';
    renderNightTicker();
    document.querySelectorAll('dialog[open]').forEach((d) => d.close());
    $('night-hint').classList.remove('gone');
    setTimeout(() => $('night-hint').classList.add('gone'), 5000);
    driftNightClock();
  }
}

// The latest flashes: a column on the right of wide screens, a ticker along the bottom of narrow ones.
// Tapping a flash shows it large, with a link to the article.
let nightFlashKey = '';
function renderNightTicker() {
  const hidden = hiddenSources();
  const items = Object.values(news).flat()
    .filter((n) => SOURCE_INFO[n.source].group === 'flash' && !hidden.has(n.source))
    .sort((a, b) => b.date - a.date)
    .slice(0, 10);
  const at = newsUpdated.flash;
  $('night-updated').textContent = at ? `מבזקים · עודכן ${hhmm.format(new Date(at))}` : '';
  $('night-ticker').hidden = !items.length;
  $('night-list').hidden = !items.length;
  // redraw only when the flashes changed, so the ticker does not jump back on every refresh
  const key = items.map((n) => n.link).join('|');
  if (!items.length || key === nightFlashKey) return;
  nightFlashKey = key;
  const open = (n) => () => showNightFlash(n);
  $('night-list').replaceChildren(...items.slice(0, 8).map((n) => {
    const b = el('button', { type: 'button' },
      el('small', null, el('b', { text: SOURCE_INFO[n.source].label }), ` · ${hhmm.format(n.date)}`),
      el('p', { text: n.title }));
    b.addEventListener('click', open(n));
    return b;
  }));
  const copy = () => items.map((n) => {
    const span = el('span', null, el('b', { text: `${hhmm.format(n.date)} ${SOURCE_INFO[n.source].label}` }), n.title);
    span.addEventListener('click', open(n));
    return span;
  });
  const track = $('night-track');
  track.replaceChildren(...copy(), ...copy()); // two copies make the loop seamless
  requestAnimationFrame(() => {
    const half = track.scrollWidth / 2;
    track.style.setProperty('--ticker-time', `${Math.max(40, Math.round(half / 45))}s`); // about 45px a second
  });
}

function showNightFlash(n) {
  $('nf-meta').textContent = `${SOURCE_INFO[n.source].label} · ${hhmm.format(n.date)}`;
  $('nf-title').textContent = n.title;
  $('nf-link').href = n.link;
  $('night-flash').hidden = false;
}

function driftNightClock() {
  if (!nightActive) return;
  const dx = Math.round((Math.random() - 0.5) * 8);
  const dy = Math.round((Math.random() - 0.5) * 8);
  $('night-box').style.transform = `translate(${dx}vw, ${dy}vh)`;
}

function setupNight() {
  // "show the dashboard" shows it for a minute; one switched on from the menu stays off until asked again
  const peek = () => {
    if (!nightActive) return;
    manualNight = false;
    peekUntil = Date.now() + MIN;
    updateNight();
  };
  $('night-show').addEventListener('click', peek);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('night-flash').hidden) peek(); });
  const closeFlash = () => { $('night-flash').hidden = true; };
  $('nf-close').addEventListener('click', closeFlash);
  $('night-flash').addEventListener('click', (e) => { if (e.target === $('night-flash')) closeFlash(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') closeFlash(); });
  const nightNow = () => {
    $('sites').close();
    manualNight = true;
    peekUntil = 0;
    updateNight();
  };
  $('b-night').addEventListener('click', nightNow);
  $('b-night2').addEventListener('click', nightNow);
  setInterval(updateNight, 5000);
  updateNight();
}

// ---------- icons (Kubai Icons, bundled in vendor/kubai.js) ----------
// Returns an animated <svg>, or null when the bundle did not load or the name is unknown.
function icon(name, options = {}) {
  if (!name || typeof window.kubai !== 'function') return null;
  try {
    const svg = window.kubai(name, options);
    if (!svg) return null;
    svg.classList.add('kb');
    svg.setAttribute('aria-hidden', 'true');
    return svg;
  } catch {
    return null;
  }
}

function setupIcons() {
  const labels = { weather: 'cloud-sun', news: 'newspaper', stocks: 'chart-candlestick', net: 'wifi', radio: 'radio', today: 'candle' };
  for (const [card, name] of Object.entries(labels)) {
    const label = document.querySelector(`.${card} .label`);
    const svg = icon(name, { size: 18 });
    if (label && svg) label.prepend(svg);
  }
  const swap = (button, name, options) => {
    const svg = icon(name, { trigger: 'parent', ...options });
    if (svg) button.querySelector('svg')?.replaceWith(svg);
  };
  swap($('b-sites'), 'menu', { size: 30, color: '#7DD3FC' }); // light tile that reads on the clock's blue
  swap($('b-night2'), 'moon-star', { size: 30, color: '#7DD3FC' });
  swap($('r-stop'), 'stop', { size: 32 }); // follows the accent colour through CSS
  const actions = { 'b-settings': 'settings', 'b-theme': 'sun', 'b-night': 'moon', 'b-frame': 'photo-frame', 'b-full': 'maximize', 'b-terms': 'shield-check' };
  for (const [id, name] of Object.entries(actions)) {
    const svg = icon(name, { size: 20, trigger: 'parent' });
    if (svg) $(id).prepend(svg);
  }
  const sites = ['route', 'hotel', 'tv', 'shopping-cart'];
  document.querySelectorAll('.sites a').forEach((a, i) => {
    const svg = icon(sites[i], { size: 30, trigger: 'parent' });
    if (svg) a.prepend(svg);
  });
}

// ---------- weather (Open-Meteo) ----------
// codes, description, emoji day/night (fallback), Kubai icon day/night
const WMO = [
  [[0], 'בהיר', '☀️', '🌙', 'sun', 'moon'],
  [[1], 'בהיר ברובו', '🌤️', '🌙', 'cloud-sun', 'cloud-moon'],
  [[2], 'מעונן חלקית', '⛅', '☁️', 'cloud-sun', 'cloud-moon'],
  [[3], 'מעונן', '☁️', '☁️', 'cloud', 'cloud'],
  [[45, 48], 'ערפל', '☁️', '☁️', 'cloud-fog', 'cloud-fog'],
  [[51, 53, 55, 56, 57], 'טפטוף', '🌦️', '🌧️', 'cloud-drizzle', 'cloud-drizzle'],
  [[61, 63, 65, 66, 67], 'גשם', '🌧️', '🌧️', 'cloud-rain', 'cloud-rain'],
  [[71, 73, 75, 77, 85, 86], 'שלג', '❄️', '❄️', 'cloud-snow', 'cloud-snow'],
  [[80, 81, 82], 'ממטרים', '🌦️', '🌧️', 'cloud-rain', 'cloud-rain'],
  [[95, 96, 99], 'סופת רעמים', '⛈️', '⛈️', 'cloud-lightning', 'cloud-lightning'],
];
function wmo(code, isDay = 1) {
  const row = WMO.find((r) => r[0].includes(code));
  return row ? { text: row[1], icon: isDay ? row[2] : row[3], kubai: isDay ? row[4] : row[5] } : { text: '', icon: '🌡️', kubai: '' };
}
const WEATHER_COLORS = {
  sun: '#F59E0B', moon: '#FACC15', 'cloud-sun': '#F59E0B', 'cloud-moon': '#818CF8', cloud: '#94A3B8', 'cloud-fog': '#94A3B8',
  'cloud-drizzle': '#38BDF8', 'cloud-rain': '#0284C7', 'cloud-snow': '#7DD3FC', 'cloud-lightning': '#8B5CF6',
};
// A Kubai weather icon, or the emoji when the icon bundle did not load.
function weatherIcon(code, isDay, size) {
  const w = wmo(code, isDay);
  return icon(w.kubai, { size, color: WEATHER_COLORS[w.kubai] }) || document.createTextNode(w.icon);
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
  $('w-icon').replaceChildren(weatherIcon(c.weather_code, c.is_day, 58));
  $('w-temp').textContent = deg(c.temperature_2m);
  $('night-temp').textContent = `${deg(c.temperature_2m)} · ${now.text}`;
  $('ht-temp').textContent = deg(c.temperature_2m);
  $('ht-temp-label').textContent = `${now.text} ב${settings.city}`;
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
      el('i', null, weatherIcon(w.hourly.weather_code[i], w.hourly.is_day[i], 24)),
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
      el('span', { class: 'd-ico' }, weatherIcon(d.weather_code[i], 1, 20)),
      el('span', { class: 'lo', text: deg(d.temperature_2m_min[i]), dir: 'ltr' }),
      el('span', { class: 'bar' }, fill),
      el('span', { class: 'hi', text: deg(d.temperature_2m_max[i]), dir: 'ltr' }));
  }));

  sunTimes = { rise: d.sunrise[0].slice(11, 16), set: d.sunset[0].slice(11, 16) };
  renderToday();
}

// ---------- sea (Open-Meteo marine) ----------
// Waves and water temperature at the beach nearest the chosen city.
const BEACHES = [
  ['נהריה', 33.01, 35.08], ['עכו', 32.92, 35.06], ['חיפה', 32.80, 34.95], ['עתלית', 32.69, 34.93], ['קיסריה', 32.50, 34.88],
  ['חדרה', 32.45, 34.87], ['נתניה', 32.33, 34.84], ['הרצליה', 32.17, 34.79], ['תל אביב', 32.08, 34.76], ['בת ים', 32.02, 34.74],
  ['ראשון לציון', 31.98, 34.73], ['אשדוד', 31.80, 34.63], ['אשקלון', 31.67, 34.55], ['אילת', 29.54, 34.95],
];
function nearestBeach(lat, lon) {
  const dist = ([, la, lo]) => (la - lat) ** 2 + ((lo - lon) * Math.cos((lat * Math.PI) / 180)) ** 2;
  return BEACHES.reduce((best, b) => (dist(b) < dist(best) ? b : best));
}
const waveWord = (m) => (m < 0.3 ? 'ים שקט' : m < 0.6 ? 'גלים נמוכים' : m < 1.2 ? 'גלים בינוניים' : m < 2 ? 'גלים גבוהים' : 'ים סוער');

async function loadSea() {
  const [name, lat, lon] = nearestBeach(settings.lat, settings.lon);
  try {
    const m = await get(`https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&timezone=auto&current=wave_height,sea_surface_temperature&daily=wave_height_max&forecast_days=1`);
    const wave = m.current?.wave_height;
    if (wave == null) throw new Error('no sea data');
    const water = m.current.sea_surface_temperature;
    const max = m.daily?.wave_height_max?.[0];
    const line = $('w-sea');
    line.replaceChildren(...[
      icon('waves', { size: 18 }),
      el('span', null, `ים ב${name}: `, el('b', { text: `${waveWord(wave)} · ${wave.toFixed(1)} מ׳` }),
        max != null ? ` (עד ${max.toFixed(1)} היום)` : '',
        water != null ? ` · מים ${deg(water)}` : ''),
    ].filter(Boolean));
    line.hidden = false;
  } catch {
    // keep the last reading, if any
  }
}

// ---------- photo frame ----------
// Photos are added in the settings, shrunk, and kept on this device in IndexedDB. After some minutes
// without a touch (and never at night) they play full screen with a small clock; a tap returns.
const PHOTO_DB = 'dash-photos';
let photoKeys = [];
let frameActive = false;
let frameTimer = 0;
let frameIndex = 0;
let frameUrl = '';
let lastActivity = Date.now();

function photoStore(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(PHOTO_DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('photos', { autoIncrement: true });
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('photos', mode);
      const req = fn(tx.objectStore('photos'));
      tx.oncomplete = () => { db.close(); resolve(req && req.result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
}

async function loadPhotoKeys() {
  try { photoKeys = (await photoStore('readonly', (st) => st.getAllKeys())) || []; } catch { photoKeys = []; }
  $('set-photos-count').textContent = photoKeys.length ? `${photoKeys.length} תמונות שמורות במכשיר הזה.` : 'אין עדיין תמונות.';
}

async function shrinkPhoto(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
}

async function showNextPhoto() {
  if (!frameActive || !photoKeys.length) return;
  const key = photoKeys[frameIndex % photoKeys.length];
  frameIndex += 1;
  let blob;
  try { blob = await photoStore('readonly', (st) => st.get(key)); } catch { return; }
  if (!blob || !frameActive) return;
  const url = URL.createObjectURL(blob);
  const [a, b] = [$('frame-a'), $('frame-b')];
  const next = a.classList.contains('on') ? b : a;
  next.onload = () => {
    $('frame-bg').src = url;
    next.classList.add('on');
    (next === a ? b : a).classList.remove('on');
    if (frameUrl) setTimeout(((old) => () => URL.revokeObjectURL(old))(frameUrl), 2000);
    frameUrl = url;
  };
  next.src = url;
}

function startFrame() {
  if (frameActive || !photoKeys.length || nightActive) return;
  frameActive = true;
  // shuffle so the show starts somewhere different each time
  photoKeys = photoKeys.map((k) => [Math.random(), k]).sort((x, y) => x[0] - y[0]).map(([, k]) => k);
  frameIndex = 0;
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  $('frame').hidden = false;
  showNextPhoto();
  frameTimer = setInterval(showNextPhoto, 12000);
}

function stopFrame() {
  if (!frameActive) return;
  frameActive = false;
  clearInterval(frameTimer);
  $('frame').hidden = true;
  $('frame-a').classList.remove('on');
  $('frame-b').classList.remove('on');
}

function setupFrame() {
  const touched = () => { lastActivity = Date.now(); };
  ['pointerdown', 'keydown', 'wheel', 'touchmove'].forEach((t) => addEventListener(t, touched, { passive: true }));
  $('frame').addEventListener('pointerdown', () => stopFrame());
  $('b-frame').addEventListener('click', () => {
    $('sites').close();
    if (photoKeys.length) startFrame();
    else { $('b-settings').click(); }
  });
  $('set-photos').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    $('set-photos-count').textContent = `מוסיף ${files.length} תמונות…`;
    for (const file of files) {
      try {
        const blob = await shrinkPhoto(file);
        if (blob) await photoStore('readwrite', (st) => st.add(blob));
      } catch { /* skip a file the browser cannot read */ }
    }
    await loadPhotoKeys();
  });
  $('set-photos-clear').addEventListener('click', async () => {
    try { await photoStore('readwrite', (st) => st.clear()); } catch { /* ignore */ }
    await loadPhotoKeys();
  });
  setInterval(() => {
    const idle = Date.now() - lastActivity > (Number(settings.frameIdle) || 10) * MIN;
    if (settings.frame && idle && !document.querySelector('dialog[open]')) startFrame();
  }, 10000);
  loadPhotoKeys();
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
    if (shabbat.candles) {
      rows.push(['כניסה', clock(shabbat.candles)]);
      const day = new Date(shabbat.candles.date);
      $('ht-shabbat').textContent = day.toDateString() === new Date().toDateString() ? clock(shabbat.candles) : `${new Intl.DateTimeFormat('he-IL', { weekday: 'short' }).format(day)} ${clock(shabbat.candles)}`;
    }
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
// Relays may hand back a stored copy; flashes ask for a new one every 30 seconds with a changing parameter.
const feedUrl = (source) => {
  if (SOURCE_INFO[source].group !== 'flash') return FEEDS[source];
  return `${FEEDS[source]}${FEEDS[source].includes('?') ? '&' : '?'}_=${Math.floor(Date.now() / 30000)}`;
};
const viaRelay = (source) => async () => parseRss(await get(`https://api.allorigins.win/raw?url=${encodeURIComponent(feedUrl(source))}`, { type: 'text', timeout: 9000 }), source);
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
  const data = await get(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl(source))}`);
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
// When each tab (news / flash / sport) last received fresh headlines, shown in the card header.
const newsUpdated = {};

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
        if (items.length) {
          news[source] = items;
          newsUpdated[SOURCE_INFO[source].group] = Date.now();
          renderNews();
          return;
        }
      } catch { /* try the next route */ }
    }
  }));
  if (!group) newsLoaded = true;
  renderNews();
  if (nightActive) renderNightTicker();
}

function renderNews() {
  const at = newsUpdated[newsFilter];
  $('news-time').replaceChildren(...(at ? [el('span', { class: 'nt-word', text: 'עודכן ' }), hhmm.format(new Date(at))] : []));
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
    if (pings.length > 80) pings.shift();
    pingPoints.push({ time: Date.now() / 1000, value: best });
    if (pingPoints.length > 80) pingPoints.shift();
    setStatus(true);
    $('n-ping').textContent = `${Math.round(best)} ms`;
    $('n-jitter').textContent = `±${Math.round(Math.max(...samples) - best)} ms`;
    drawSpark();
    renderQuality();
  } catch {
    setStatus(false);
  }
}

// Latency chart: Liveline (vendor/liveline.js) when it loaded, otherwise the small SVG line below.
const pingPoints = [];
let liveChart = null;
const isDark = () => settings.theme === 'dark' || (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
const chartLook = () => ({ theme: isDark() ? 'dark' : 'light', color: isDark() ? '#38BDF8' : '#0284C7' });

function setupLatencyChart() {
  if (typeof window.mountLiveline !== 'function') return;
  try {
    liveChart = window.mountLiveline($('n-chart'), {
      data: [],
      value: 0,
      ...chartLook(),
      loading: true,
      window: 5 * 60,
      grid: true,
      fill: true,
      pulse: true,
      momentum: false,
      badgeVariant: 'minimal',
      lineWidth: 2,
      formatValue: (v) => `${Math.round(v)} ms`,
      formatTime: (t) => hhmm.format(new Date(t * 1000)),
      emptyText: 'מודד…',
    });
    $('n-chart').closest('.net').classList.add('has-chart');
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => liveChart.update(chartLook()));
  } catch {
    liveChart = null;
  }
}

function drawSpark() {
  if (liveChart) {
    liveChart.update({ data: pingPoints.slice(), value: pingPoints.at(-1)?.value ?? 0, loading: pingPoints.length < 2 });
    return;
  }
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
// Like speed-test sites, both directions use several connections at once: a single connection rarely
// fills a fast line, which made this card read lower than Speedtest. The button runs the full test;
// the automatic one is lighter to keep the data it uses down.
const FULL_TEST = { streams: 6, seconds: 8, maxDown: 300e6, upStreams: 4, maxUp: 40e6 };
const LIGHT_TEST = { streams: 4, seconds: 5, maxDown: 60e6, upStreams: 3, maxUp: 10e6 };
const fmtMbps = (mbps) => (mbps >= 100 ? String(Math.round(mbps)) : mbps.toFixed(1));

async function downloadTest({ streams, seconds, maxDown }) {
  const ctrl = new AbortController();
  const start = performance.now();
  const WARM_UP = 1000; // connections ramp up first; count bytes only after that
  let total = 0;
  let counted = 0;
  let measureFrom = 0;
  let mbps = 0;
  const stream = async () => {
    while (!ctrl.signal.aborted) {
      const res = await fetch(`${SPEED}?bytes=25000000&r=${Math.random()}`, { cache: 'no-store', signal: ctrl.signal });
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const now = performance.now();
        total += value.length;
        if (now - start >= WARM_UP) {
          if (!measureFrom) measureFrom = now;
          else counted += value.length;
          const secs = (now - measureFrom) / 1000;
          if (secs > 0.3) {
            mbps = (counted * 8) / secs / 1e6;
            $('n-down').textContent = fmtMbps(mbps);
          }
        }
        if (now - start > seconds * 1000 || total > maxDown) {
          ctrl.abort();
          return;
        }
      }
    }
  };
  await Promise.allSettled(Array.from({ length: streams }, stream));
  return mbps;
}

async function uploadTest({ upStreams, maxUp }) {
  const lag = (pings.at(-1) || 0) / 1000; // the round trip itself is not upload time
  const send = async (bytes) => {
    const body = new Blob([new Uint8Array(bytes)], { type: 'text/plain' });
    const res = await fetch(`${SPEED_UP}?r=${Math.random()}`, { method: 'POST', body, cache: 'no-store', signal: AbortSignal.timeout(30000) });
    await res.arrayBuffer();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  };
  // A small upload to estimate the speed, then parallel uploads sized to take about 4 seconds in all.
  // The first upload also sets up the connection, which can take seconds, so it is not timed.
  const probe = 500000;
  await send(probe);
  let t = performance.now();
  await send(probe);
  const estimate = probe / Math.max(0.02, (performance.now() - t) / 1000 - lag);
  const each = Math.round(Math.min(maxUp, Math.max(estimate * 4, 2e6 * upStreams)) / upStreams); // at least 2 MB each
  t = performance.now();
  await Promise.all(Array.from({ length: upStreams }, () => send(each)));
  const secs = Math.max(0.05, (performance.now() - t) / 1000 - lag);
  $('n-up').textContent = `${fmtMbps((each * upStreams * 8) / secs / 1e6)} Mbps`;
}

async function speedTest(full = false) {
  if (testing || !navigator.onLine) return;
  testing = true;
  const plan = full ? FULL_TEST : LIGHT_TEST;
  const btn = $('n-run');
  btn.disabled = true;
  btn.textContent = 'בודק…';
  try {
    const mbps = await downloadTest(plan);
    if (mbps) {
      lastDown = mbps;
      lastDownAt = Date.now();
      renderQuality();
    }
  } catch { /* leave the previous reading */ }
  try {
    await uploadTest(plan);
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
  if (liveChart) liveChart.update(chartLook());
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
    $('set-night').checked = settings.night;
    $('set-frame').checked = settings.frame;
    $('set-frame-idle').value = String(settings.frameIdle);
    $('set-night-from').value = settings.nightFrom;
    $('set-night-to').value = settings.nightTo;
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
    settings.night = $('set-night').checked;
    settings.frame = $('set-frame').checked;
    settings.frameIdle = Number($('set-frame-idle').value) || 10;
    if (toMinutes($('set-night-from').value) != null) settings.nightFrom = $('set-night-from').value;
    if (toMinutes($('set-night-to').value) != null) settings.nightTo = $('set-night-to').value;
    peekUntil = 0;
    setTimeout(updateNight, 300);
    if (picked) Object.assign(settings, picked);
    saveSettings();
    if (!settings.wake && wakeLock) wakeLock.release();
    setTimeout(reloadIfIdle, 500);
    keepAwake();
    if (picked) { run('weather', true); run('shabbat', true); run('sea', true); }
    if (stocksChanged) { store('dash.stocks', null); run('stocks', true); }
  });
}

// ---------- refresh schedule ----------
const TASKS = {
  weather: { fn: loadWeather, every: 15 * MIN },
  shabbat: { fn: loadShabbat, every: 180 * MIN },
  news: { fn: () => loadNews(), every: 5 * MIN },
  flash: { fn: () => loadNews('flash'), every: 0.5 * MIN }, // as close to live as the free relays allow
  stocks: { fn: loadStocks, every: 2 * MIN },
  fx: { fn: loadFx, every: 180 * MIN },
  ping: { fn: samplePing, every: 0.25 * MIN },
  speed: { fn: () => (settings.autoSpeed && !nightActive ? speedTest(false) : null), every: 120 * MIN }, // not at night
  sea: { fn: loadSea, every: 60 * MIN },
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
setupIcons();
setupNight();
setupFrame();
setupLatencyChart();

$('news-chips').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  newsFilter = btn.dataset.src;
  for (const b of $('news-chips').children) b.setAttribute('aria-pressed', String(b === btn));
  renderNews();
  $('news-list').scrollTop = 0;
});
$('n-run').addEventListener('click', () => speedTest(true));
addEventListener('online', () => { setStatus(true); refresh(); });
addEventListener('offline', () => setStatus(false));
document.addEventListener('visibilitychange', () => { keepAwake(); refresh(); });

refresh();
setInterval(refresh, 10 * 1000);
