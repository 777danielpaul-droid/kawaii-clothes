// kawaii clothes – CMS-Server
// Speichert die Einstellungen der Seite (Texte, Farben, Wetter, Shop-Steuerung, Hero-Animation) auf dem Server,
// schützt das Bearbeiten mit einem Passwort und liefert im Produktivbetrieb auch die gebaute Seite (dist/) aus.
// Start: npm run server   (Einstellungen siehe .env.example)
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* .env einlesen (Variablen, die schon gesetzt sind, gewinnen). Nur ADMIN_PASSWORD & Co.; Vite gibt nur VITE_* an den Browser. */
for (const name of ['.env', '.env.local']) {
  try {
    for (const line of fs.readFileSync(path.join(ROOT, name), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch { /* Datei fehlt: ok */ }
}

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '127.0.0.1';      // nur lokal erreichbar; auf einem Server HOST=0.0.0.0 setzen
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const DATA = path.resolve(ROOT, process.env.DATA_DIR || 'data');
const DIST = path.join(ROOT, 'dist');
const FRAME_COUNT = 38;                       // muss zu src/frames.ts passen
const SESSION_HOURS = 8;
const COOKIE = 'kc_session';

fs.mkdirSync(DATA, { recursive: true });

/* Geheimnis für die Sitzungs-Cookies: aus der Umgebung oder einmalig zufällig erzeugt und in data/.secret abgelegt */
function loadSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const file = path.join(DATA, '.secret');
  try { return fs.readFileSync(file, 'utf8').trim(); } catch { /* neu erzeugen */ }
  const s = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, s, { mode: 0o600 });
  return s;
}
const SECRET = loadSecret();

/* Content-Security-Policy: Skripte, Styles, Bilder und Verbindungen nur von der eigenen Seite bzw. Shopify */
const SHOP_HOST = (process.env.VITE_SHOPIFY_DOMAIN || '').replace(/[^a-z0-9.-]/gi, '');
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",            // die Seite setzt Farben/Positionen per Inline-Style
  "img-src 'self' data: blob: https://cdn.shopify.com",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  `connect-src 'self' ${SHOP_HOST ? `https://${SHOP_HOST}` : 'https://*.myshopify.com'}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/* ---------- Standardwerte & Prüfung der Konfiguration ---------- */
const DEFAULT_CONFIG = {
  texts: {},
  colors: { light: {}, dark: {} },
  weather: { mode: 'rain', intensity: 100, wind: 0 },
  petals: true,
  shop: { sort: 'shopify', limit: 0, hidden: [], collection: '' },
  legal: {},
};
/* Betreiberangaben für die Rechtstexte (Feldnamen wie in src/legal.ts) */
const LEGAL_KEYS = ['name', 'street', 'zipCity', 'email', 'phone', 'vatId', 'vatNote', 'shipCountries', 'shippingCosts', 'deliveryTime', 'hosting', 'payment', 'authority', 'withdrawalUrl'];
const HEX = /^#[0-9a-f]{6}$/i;
const hex = v => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : undefined);
const int = (v, min, max, fb) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fb; };
const text = (v, max) => String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max);

/** Baut aus beliebiger Eingabe eine saubere Konfiguration: unbekannte Felder fallen weg, Werte werden begrenzt. */
function sanitize(input) {
  const i = input && typeof input === 'object' ? input : {};
  const out = structuredClone(DEFAULT_CONFIG);

  if (i.texts && typeof i.texts === 'object') {
    for (const [k, v] of Object.entries(i.texts).slice(0, 40)) {
      if (/^[a-z0-9_-]{1,30}$/i.test(k) && typeof v === 'string' && v.trim()) out.texts[k] = text(v, 300);
    }
  }
  const c = i.colors && typeof i.colors === 'object' ? i.colors : {};
  const accent = hex(c.accent);
  if (accent) out.colors.accent = accent;
  if (c.tint === true) out.colors.tint = true;   // Hero-Animation färbt sich mit dem Highlight mit ("Auge mitfärben")
  for (const mode of ['light', 'dark']) {
    const paper = hex(c[mode]?.paper), ink = hex(c[mode]?.ink);
    if (paper) out.colors[mode].paper = paper;
    if (ink) out.colors[mode].ink = ink;
  }
  const w = i.weather && typeof i.weather === 'object' ? i.weather : {};
  out.weather = {
    mode: ['clear', 'rain', 'snow'].includes(w.mode) ? w.mode : DEFAULT_CONFIG.weather.mode,
    intensity: int(w.intensity, 20, 200, 100),
    wind: int(w.wind, -100, 100, 0),
  };
  out.petals = i.petals !== false;

  const s = i.shop && typeof i.shop === 'object' ? i.shop : {};
  out.shop = {
    sort: ['shopify', 'price-asc', 'price-desc', 'name'].includes(s.sort) ? s.sort : 'shopify',
    limit: int(s.limit, 0, 50, 0),
    hidden: Array.isArray(s.hidden) ? [...new Set(s.hidden.filter(h => typeof h === 'string' && /^[a-z0-9._-]{1,120}$/i.test(h)))].slice(0, 500) : [],
    collection: typeof s.collection === 'string' && /^[a-z0-9-]{0,100}$/i.test(s.collection.trim()) ? s.collection.trim() : '',
  };
  const l = i.legal && typeof i.legal === 'object' ? i.legal : {};
  for (const k of LEGAL_KEYS) {
    if (typeof l[k] === 'string' && l[k].trim()) out.legal[k] = text(l[k].trim(), 300);
  }
  return out;
}

/* ---------- Speicher (JSON-Dateien, atomar geschrieben) ---------- */
const CONFIG_FILE = path.join(DATA, 'site.json');
const HERO_DIR = path.join(DATA, 'hero');
const STAGE_DIR = path.join(DATA, 'hero-upload');

async function writeAtomic(file, content) {
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, content);
  await fsp.rename(tmp, file);
}
async function readConfig() {
  try { return sanitize(JSON.parse(await fsp.readFile(CONFIG_FILE, 'utf8'))); } catch { return structuredClone(DEFAULT_CONFIG); }
}
async function readHero() {
  try {
    const m = JSON.parse(await fsp.readFile(path.join(HERO_DIR, 'meta.json'), 'utf8'));
    return m && typeof m.v === 'string' && m.w > 0 && m.h > 0 ? { v: m.v, w: m.w, h: m.h } : null;
  } catch { return null; }
}
const frameName = i => `${String(i).padStart(2, '0')}.jpg`;

/* ---------- Sitzungen: signiertes Cookie ohne Serverzustand ---------- */
const sign = data => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
function makeToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_HOURS * 3600e3 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
function validToken(token) {
  if (typeof token !== 'string') return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const good = sign(payload);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return false;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now(); } catch { return false; }
}
function cookieOf(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return '';
}
const isAuthed = req => validToken(cookieOf(req, COOKIE));
const setCookie = (req, res, value, maxAge) =>
  res.setHeader('Set-Cookie', `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${req.secure ? '; Secure' : ''}`);

/* Login-Versuche begrenzen: 5 Fehlversuche pro Adresse, dann 60 s Pause */
const attempts = new Map();
function lockedFor(ip) {
  const a = attempts.get(ip);
  return a && a.until > Date.now() ? Math.ceil((a.until - Date.now()) / 1000) : 0;
}
function failed(ip) {
  const a = attempts.get(ip) || { n: 0, until: 0, seen: 0 };
  a.n += 1; a.seen = Date.now();
  if (a.n >= 5) { a.until = Date.now() + 60e3; a.n = 0; }
  attempts.set(ip, a);
}
setInterval(() => {                                   // abgelaufene Einträge entfernen, damit die Liste nicht endlos wächst
  const now = Date.now();
  for (const [ip, a] of attempts) if (a.until < now && now - a.seen > 15 * 60e3) attempts.delete(ip);
}, 10 * 60e3).unref();
const sameHash = (a, b) => crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(), crypto.createHash('sha256').update(b).digest());

/* ---------- App ---------- */
const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

/* Schreibende Anfragen nur von der eigenen Seite (Schutz vor Fremdseiten, die den Browser des Admins benutzen) */
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin) {
    try { if (new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'Fremde Herkunft' }); }
    catch { return res.status(403).json({ error: 'Fremde Herkunft' }); }
  }
  next();
});

/* Express 4 reicht Fehler aus async-Handlern nicht weiter: ohne das würde ein Schreibfehler den ganzen Server beenden */
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const needAuth = (req, res, next) => (isAuthed(req) ? next() : res.status(401).json({ error: 'Nicht angemeldet' }));
const json = express.json({ limit: '100kb' });
const noStore = (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); };

app.get('/api/site', noStore, wrap(async (req, res) => {
  res.json({ config: await readConfig(), hero: await readHero(), authed: isAuthed(req) });
}));

app.post('/api/login', noStore, json, (req, res) => {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'ADMIN_PASSWORD ist auf dem Server nicht gesetzt' });
  const wait = lockedFor(req.ip);
  if (wait) return res.status(429).json({ error: `Zu viele Versuche, bitte ${wait} s warten` });
  const pw = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!sameHash(pw, ADMIN_PASSWORD)) { failed(req.ip); return res.status(401).json({ error: 'Passwort falsch' }); }
  attempts.delete(req.ip);
  setCookie(req, res, makeToken(), SESSION_HOURS * 3600);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => { setCookie(req, res, '', 0); res.json({ ok: true }); });

app.put('/api/site', noStore, needAuth, json, wrap(async (req, res) => {
  const config = sanitize(req.body);
  await writeAtomic(CONFIG_FILE, JSON.stringify(config, null, 2));
  res.json({ config });
}));

/* Hero-Animation: der Browser zerlegt Video/Bilder in 38 JPEGs und lädt sie nacheinander hoch; "commit" setzt sie in Kraft */
app.put('/api/hero/frame/:i', needAuth, express.raw({ type: 'image/jpeg', limit: '8mb' }), wrap(async (req, res) => {
  const i = Number(req.params.i);
  if (!Number.isInteger(i) || i < 0 || i >= FRAME_COUNT) return res.status(400).json({ error: 'Ungültiger Frame' });
  const b = req.body;
  if (!Buffer.isBuffer(b) || b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return res.status(400).json({ error: 'Kein JPEG' });
  if (i === 0) await fsp.rm(STAGE_DIR, { recursive: true, force: true });
  await fsp.mkdir(STAGE_DIR, { recursive: true });
  await writeAtomic(path.join(STAGE_DIR, frameName(i)), b);
  res.json({ ok: true });
}));

app.post('/api/hero/commit', needAuth, json, wrap(async (req, res) => {
  const w = int(req.body?.w, 1, 8192, 0), h = int(req.body?.h, 1, 8192, 0);
  if (!w || !h) return res.status(400).json({ error: 'Größe fehlt' });
  for (let i = 0; i < FRAME_COUNT; i++) {
    if (!fs.existsSync(path.join(STAGE_DIR, frameName(i)))) return res.status(400).json({ error: `Frame ${i} fehlt` });
  }
  const meta = { v: Date.now().toString(36), w, h };
  await writeAtomic(path.join(STAGE_DIR, 'meta.json'), JSON.stringify(meta));
  await fsp.rm(HERO_DIR, { recursive: true, force: true });
  await fsp.rename(STAGE_DIR, HERO_DIR);
  res.json({ hero: meta });
}));

app.delete('/api/hero', needAuth, wrap(async (_req, res) => {
  await fsp.rm(HERO_DIR, { recursive: true, force: true });
  await fsp.rm(STAGE_DIR, { recursive: true, force: true });
  res.json({ ok: true });
}));

app.get('/api/hero/:v/:i.jpg', (req, res) => {
  const i = Number(req.params.i);
  if (!Number.isInteger(i) || i < 0 || i >= FRAME_COUNT) return res.sendStatus(404);
  const file = path.join(HERO_DIR, frameName(i));
  if (!fs.existsSync(file)) return res.sendStatus(404);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');   // v ändert sich bei jedem neuen Upload
  res.type('image/jpeg').sendFile(file);
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Nicht gefunden' }));

/* Produktivbetrieb: die gebaute Seite mitliefern */
if (fs.existsSync(DIST)) app.use(express.static(DIST));

app.use((err, _req, res, _next) => {
  console.error('[CMS]', err.message);
  res.status(err.status && err.status < 500 ? err.status : 500).json({ error: err.status && err.status < 500 ? err.message : 'Serverfehler' });
});

process.on('unhandledRejection', err => console.error('[CMS] Unbehandelter Fehler:', err instanceof Error ? err.message : err));

app.listen(PORT, HOST, () => {
  console.log(`[CMS] läuft auf http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}  (Daten: ${DATA})`);
  if (!ADMIN_PASSWORD) console.warn('[CMS] ADMIN_PASSWORD fehlt: Login ist gesperrt. Setze es in .env (siehe .env.example).');
});
