// Flash push service for the home dashboard (Cloudflare Worker).
//
// Every minute (cron) it reads the flash feeds, finds flashes it has not seen, and sends a Web Push
// notification to every device that signed up from the dashboard. It keeps its state in one KV
// namespace bound as SUBS: the VAPID key pair (made on first use), what it has already seen, and
// the subscriptions. No secrets need to be configured.
//
// Routes (called by the dashboard):
//   GET  /config        -> { publicKey }        the VAPID public key for pushManager.subscribe
//   POST /subscribe     { subscription, sources, quiet }   add or update a device
//   POST /unsubscribe   { endpoint }
//   POST /test          { endpoint }            send a test notification to that device

const FEEDS = [
  { source: 'flash', label: 'ynet', url: 'https://www.ynet.co.il/Integration/StoryRss1854.xml' },
  { source: 'maarivflash', label: 'מעריב', url: 'https://www.maariv.co.il/rss/rssfeedsmivzakichadashot' },
  { source: 'rotter', label: 'רוטר', url: 'https://rotter.net/rss/rotternews.xml' },
];
const DASHBOARD_URL = 'https://haimazzadok123.github.io/Home/dashboard/';
const DEFAULT_ORIGINS = ['https://haimazzadok123.github.io'];
const MAX_AGE = 30 * 60 * 1000; // a flash older than this is never pushed (a late feed must not replay old news)
const MAX_SEEN = 600;

// ---------- small helpers ----------
const te = new TextEncoder();
const enc = (s) => te.encode(s);
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
};
const b64u = (bytes) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64u = (str) => {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
const sha256hex = async (text) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc(text)))]
  .map((b) => b.toString(16).padStart(2, '0')).join('');

// ---------- VAPID keys (made once, kept in KV) ----------
async function vapidKeys(env) {
  let stored = await env.SUBS.get('vapid', 'json');
  if (!stored) {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    stored = {
      privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey),
      publicKey: b64u(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))),
    };
    await env.SUBS.put('vapid', JSON.stringify(stored));
  }
  const privateKey = await crypto.subtle.importKey('jwk', stored.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  return { privateKey, publicKey: stored.publicKey };
}

async function vapidJwt(audience, keys) {
  const header = b64u(enc(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(enc(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: DASHBOARD_URL })));
  const data = `${header}.${claims}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, enc(data)));
  return `${data}.${b64u(sig)}`;
}

// ---------- payload encryption (RFC 8291, aes128gcm) ----------
async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

async function encryptPayload(p256dh, authSecret, text) {
  const uaPublic = unb64u(p256dh);
  const auth = unb64u(authSecret);
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));
  const ikm = await hkdf(auth, shared, concat(enc('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(enc(text), new Uint8Array([2]))));
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, cipher);
}

// Returns the push service's status code (201 sent, 404/410 gone).
async function sendPush(subscription, message, keys) {
  const endpoint = new URL(subscription.endpoint);
  const body = await encryptPayload(subscription.keys.p256dh, subscription.keys.auth, JSON.stringify(message));
  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${await vapidJwt(endpoint.origin, keys)}, k=${keys.publicKey}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '1800',
      Urgency: 'high',
    },
    body,
  });
  return res.status;
}

// ---------- feeds ----------
// Rotter's feed is windows-1255; fall back to a small table if the runtime has no such decoder.
function decodeCp1255(bytes) {
  const special = { 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x96: 0x2013, 0x97: 0x2014, 0xa4: 0x20aa, 0xd4: 0x05f0, 0xd5: 0x05f1, 0xd6: 0x05f2, 0xd7: 0x05f3, 0xd8: 0x05f4 };
  let out = '';
  for (const b of bytes) {
    if (b < 0x80) out += String.fromCharCode(b);
    else if (b >= 0xe0 && b <= 0xfa) out += String.fromCharCode(0x05d0 + b - 0xe0);
    else if (special[b]) out += String.fromCharCode(special[b]);
    else if (b >= 0xc0 && b <= 0xd2) out += String.fromCharCode(0x05b0 + b - 0xc0);
    else if (b >= 0xa0) out += String.fromCharCode(b);
    else out += ' ';
  }
  return out;
}

function decodeFeed(buffer) {
  const bytes = new Uint8Array(buffer);
  const declared = /encoding=["']([\w-]+)["']/i.exec(new TextDecoder('ascii').decode(bytes.slice(0, 200)));
  const name = declared ? declared[1].toLowerCase() : 'utf-8';
  if (name === 'windows-1255') {
    try { return new TextDecoder('windows-1255').decode(bytes); } catch { return decodeCp1255(bytes); }
  }
  try { return new TextDecoder(name).decode(bytes); } catch { return new TextDecoder().decode(bytes); }
}

function decodeEntities(text) {
  let out = text;
  for (let i = 0; i < 2 && /&[#a-z0-9]+;/i.test(out); i++) { // some feeds escape twice
    out = out
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
      .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&');
  }
  return out;
}

function parseFeed(xml, feed) {
  const items = [];
  for (const match of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const field = (tag) => {
      const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(match[0]);
      return m ? decodeEntities(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).replace(/<[^>]+>/g, '').trim() : '';
    };
    const title = field('title');
    const link = field('link');
    const date = new Date(field('pubDate'));
    if (title && /^https:\/\//.test(link) && !Number.isNaN(date.getTime())) items.push({ ...feed, title, link, date: date.getTime() });
  }
  return items;
}

async function readFeed(feed) {
  const res = await fetch(feed.url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/604.1', Accept: 'application/rss+xml, text/xml, */*' },
    cf: { cacheTtl: 0 },
  });
  if (!res.ok) throw new Error(`${feed.source} ${res.status}`);
  return parseFeed(decodeFeed(await res.arrayBuffer()), feed);
}

// ---------- subscriptions ----------
async function allSubscriptions(env) {
  const subs = [];
  let cursor;
  do {
    const page = await env.SUBS.list({ prefix: 'sub:', cursor });
    for (const k of page.keys) {
      const value = await env.SUBS.get(k.name, 'json');
      if (value) subs.push({ key: k.name, ...value });
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return subs;
}

// quiet = { from: 'HH:MM', to: 'HH:MM' } in Israel time; the window may cross midnight
function inQuietHours(quiet, now = new Date()) {
  const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const from = toMin(quiet && quiet.from);
  const to = toMin(quiet && quiet.to);
  if (from == null || to == null || from === to) return false;
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now).split(':').map(Number);
  const t = h * 60 + m;
  return from < to ? t >= from && t < to : t >= from || t < to;
}

const timeIL = (ms) => new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));

function messagesFor(flashes) {
  if (flashes.length <= 3) {
    return flashes.map((n) => ({ title: `מבזק · ${n.label} · ${timeIL(n.date)}`, body: n.title, url: n.link, tag: n.link }));
  }
  const newest = flashes[flashes.length - 1];
  return [{ title: `${flashes.length} מבזקים חדשים`, body: newest.title, url: DASHBOARD_URL, tag: 'flash-summary' }];
}

// ---------- the minute check ----------
export async function checkFlashes(env, now = Date.now()) {
  const state = (await env.SUBS.get('state', 'json')) || { seeded: [], seen: [] };
  const seen = new Set(state.seen);
  const seeded = new Set(state.seeded);
  const fresh = [];
  let changed = false;
  const results = await Promise.allSettled(FEEDS.map(readFeed));
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled') return;
    const source = FEEDS[i].source;
    for (const n of r.value) {
      if (seen.has(n.link)) continue;
      seen.add(n.link);
      changed = true;
      // a feed's first successful read only records what is there
      if (seeded.has(source) && now - n.date < MAX_AGE) fresh.push(n);
    }
    if (!seeded.has(source)) { seeded.add(source); changed = true; }
  });
  if (changed) {
    // KV allows about 1000 writes a day on the free plan, so write only when something changed
    await env.SUBS.put('state', JSON.stringify({ seeded: [...seeded], seen: [...seen].slice(-MAX_SEEN), lastRun: new Date(now).toISOString() }));
  }
  if (!fresh.length) return { fresh: 0, sent: 0 };
  fresh.sort((a, b) => a.date - b.date);
  const keys = await vapidKeys(env);
  let sent = 0;
  for (const sub of await allSubscriptions(env)) {
    if (inQuietHours(sub.quiet)) continue;
    const mine = fresh.filter((n) => !sub.sources || sub.sources.includes(n.source));
    for (const message of messagesFor(mine)) {
      try {
        const status = await sendPush(sub.subscription, message, keys);
        if (status === 404 || status === 410) { await env.SUBS.delete(sub.key); break; } // the device unsubscribed
        if (status < 300) sent += 1;
      } catch { /* try the next device */ }
    }
  }
  return { fresh: fresh.length, sent };
}

// ---------- HTTP ----------
function cors(request, env) {
  const allowed = (env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',') : DEFAULT_ORIGINS).map((s) => s.trim());
  const origin = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const json = (data, headers, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

function validSubscription(s) {
  return s && typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 1000
    && s.keys && typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string';
}

export default {
  async fetch(request, env) {
    const headers = cors(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const { pathname } = new URL(request.url);
    try {
      if (request.method === 'GET' && pathname === '/config') {
        return json({ publicKey: (await vapidKeys(env)).publicKey }, headers);
      }
      if (request.method === 'GET' && pathname === '/check') {
        // diagnostics: what each feed returns right now (changes nothing)
        const results = await Promise.allSettled(FEEDS.map(readFeed));
        const state = (await env.SUBS.get('state', 'json')) || { seeded: [], seen: [] };
        return json({
          feeds: results.map((r, i) => (r.status === 'fulfilled'
            ? { source: FEEDS[i].source, items: r.value.length, newest: r.value[0] && new Date(r.value[0].date).toISOString() }
            : { source: FEEDS[i].source, error: String(r.reason && r.reason.message || r.reason) })),
          seeded: state.seeded,
          seen: state.seen.length,
          lastRun: state.lastRun || null,
        }, headers);
      }
      if (request.method === 'GET' && pathname === '/') {
        return json({ ok: true, service: 'home dashboard flash push' }, headers);
      }
      if (request.method !== 'POST') return json({ error: 'not found' }, headers, 404);
      const body = await request.json().catch(() => ({}));
      if (pathname === '/subscribe') {
        if (!validSubscription(body.subscription)) return json({ error: 'bad subscription' }, headers, 400);
        const sources = Array.isArray(body.sources) ? body.sources.filter((s) => FEEDS.some((f) => f.source === s)) : null;
        const quiet = body.quiet && typeof body.quiet.from === 'string' && typeof body.quiet.to === 'string' ? { from: body.quiet.from, to: body.quiet.to } : null;
        const { endpoint, keys } = body.subscription;
        await env.SUBS.put(`sub:${await sha256hex(endpoint)}`, JSON.stringify({ subscription: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }, sources, quiet, added: Date.now() }));
        return json({ ok: true }, headers);
      }
      if (pathname === '/unsubscribe') {
        if (typeof body.endpoint !== 'string') return json({ error: 'bad endpoint' }, headers, 400);
        await env.SUBS.delete(`sub:${await sha256hex(body.endpoint)}`);
        return json({ ok: true }, headers);
      }
      if (pathname === '/test') {
        if (typeof body.endpoint !== 'string') return json({ error: 'bad endpoint' }, headers, 400);
        const sub = await env.SUBS.get(`sub:${await sha256hex(body.endpoint)}`, 'json');
        if (!sub) return json({ error: 'not subscribed' }, headers, 404);
        const status = await sendPush(sub.subscription, { title: 'לוח הבית', body: 'התראות המבזקים פועלות. מעכשיו כל מבזק חדש יגיע לכאן.', url: DASHBOARD_URL, tag: 'test' }, await vapidKeys(env));
        return json({ ok: status < 300, status }, headers, status < 300 ? 200 : 502);
      }
      return json({ error: 'not found' }, headers, 404);
    } catch (e) {
      return json({ error: String(e && e.message || e) }, headers, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(checkFlashes(env));
  },
};
