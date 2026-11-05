import LocomotiveScroll from 'locomotive-scroll';
import 'locomotive-scroll/dist/locomotive-scroll.css';
import '@fontsource/edu-qld-beginner/400.css';
import '@fontsource/edu-qld-beginner/500.css';
import '@fontsource/edu-qld-beginner/600.css';
import '@fontsource/edu-qld-beginner/700.css';
import '@fontsource/m-plus-rounded-1c/800.css';
import './styles/main.css';
import { initFrames } from './frames';
import { initRain } from './rain';
import { initPetals } from './petals';
import { initLens } from './lens';
import { initEndFireworks, launchFromButton, BUTTON_COOLDOWN_MS } from './fx/fireworks';
import { unlockAudio, isSoundOn, setSoundOn } from './fx/fireworks-sound';
import { initHase, initCartHase } from './fx/hase';
import { initLegal } from './legal';
import { initCms } from './cms';
import { sitePromise, type ShopConfig } from './site';
import { LOGO_PATHS, LOGO_STARS, LOGO_DRAW } from './logo';
import { products as localProducts } from './data';
import { fetchShopifyProducts, createCheckoutUrl, type ShopifyProduct } from './shopify';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const root = document.documentElement;
const BASE = import.meta.env.BASE_URL;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover:hover) and (pointer:fine)').matches;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const esc = (v: string | number) => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/* ---- Produkte: primär aus Shopify, lokale Daten als Fallback ---- */
interface CardProduct {
  id: string;
  handle: string;          // Shopify-Handle (lokal: Bildname), Schlüssel fürs Ausblenden im CMS
  name: string;
  jp: string;
  kind: string;
  price: number;
  tile: string;
  img: string;
  speed: number;
  fx: string;
  fy: string;
  rot: string;
  py: string;
  wide?: boolean;
  imageUrl: string;
  variantId?: string;
  images: string[];
  currentImageIndex: number;
}

/* Lokale Produkte als Vorlage für Animationen (nur Fallback-Struktur) */
const LOCAL_TEMPLATES = localProducts;

/* Die Mockups bestimmen die Karte: jedes Motiv hat seine eigene Karte mit allen Mockups (public/shirts/<img>-<suffix>.webp) */
const mockups = (t: { img: string; gallery?: string[] }) =>
  (t.gallery ?? ['mock-black']).map(g => `${BASE}shirts/${t.img}-${g}.webp`);

function templateForIndex(i: number): CardProduct {
  const t = LOCAL_TEMPLATES[i % LOCAL_TEMPLATES.length];
  return {
    id: t.id,
    handle: t.img,
    name: t.name,
    jp: t.jp,
    kind: t.kind,
    price: t.price,
    tile: t.tile,
    img: t.img,
    speed: t.speed,
    fx: t.fx,
    fy: t.fy,
    rot: t.rot,
    py: t.py,
    wide: t.wide,
    imageUrl: mockups(t)[0],
    images: mockups(t),
    currentImageIndex: 0,
  };
}

$('logo-g').innerHTML = LOGO_PATHS + LOGO_STARS;
$('pre-logo').innerHTML = `<g fill="none" stroke="currentColor" stroke-width="13" stroke-linecap="round" stroke-linejoin="round">${LOGO_DRAW}</g>`;

let products: CardProduct[] = LOCAL_TEMPLATES.map((_, i) => templateForIndex(i));

/* Steuerung aus dem CMS: Kollektion, ausgeblendete Produkte, Reihenfolge, Anzahl */
let shopCfg: ShopConfig | null = null;
let fetched: ShopifyProduct[] = [];          // letzte Shopify-Antwort ungefiltert (das CMS listet daraus die Produkte)
let loadSeq = 0;

function applyShopConfig(list: CardProduct[], cfg: ShopConfig): CardProduct[] {
  let out = list.filter(p => !cfg.hidden.includes(p.handle));
  if (cfg.sort === 'price-asc') out = [...out].sort((a, b) => a.price - b.price);
  else if (cfg.sort === 'price-desc') out = [...out].sort((a, b) => b.price - a.price);
  else if (cfg.sort === 'name') out = [...out].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return cfg.limit > 0 ? out.slice(0, cfg.limit) : out;
}

async function loadShopifyProducts() {
  const seq = ++loadSeq;
  const cfg = shopCfg ?? (await sitePromise).config.shop;
  const local = LOCAL_TEMPLATES.map((_, i) => templateForIndex(i));
  try {
    const shopifyProducts = await fetchShopifyProducts(50, cfg.collection);
    if (seq !== loadSeq) return;               // eine neuere Anfrage hat übernommen
    fetched = shopifyProducts;
    console.log(`[Shopify] ${shopifyProducts.length} Produkte geladen`);

    if (shopifyProducts.length === 0) {
      console.warn('[Shopify] Keine Produkte zurückgegeben (Produkte nicht für den Storefront-Kanal veröffentlicht?) – lokale Produkte bleiben aktiv');
      products = applyShopConfig(local, cfg);
      renderProducts();
      return;
    }

    products = applyShopConfig(shopifyProducts.map((sp, i) => {
      const t = templateForIndex(i);
      const firstVariant = sp.variants[0];
      return {
        ...t,
        id: `SP-${i + 1}`,
        handle: sp.handle,
        name: sp.title,
        jp: sp.title,
        price: Number.parseFloat(firstVariant?.price ?? t.price.toString()),
        images: sp.images.length > 0 ? sp.images : t.images,
        currentImageIndex: 0,
        imageUrl: sp.images[0] ?? t.imageUrl,
        variantId: firstVariant?.id,
      };
    }), cfg);

    renderProducts();
  } catch (err) {
    if (seq !== loadSeq) return;
    console.warn('[Shopify] Fallback auf lokale Produkte:', err);
    fetched = [];
    products = applyShopConfig(local, cfg);
    renderProducts();
  }
}

/** Vom CMS aufgerufen, wenn sich die Shop-Steuerung ändert. */
function refreshProducts(cfg: ShopConfig) { shopCfg = cfg; return loadShopifyProducts(); }

function renderProducts() {
  $('grid').innerHTML = products.map((p, i) => `
    <li class="card" data-scroll data-scroll-speed="${p.speed}" data-scroll-css-progress style="--tile:${p.tile};--fx:${p.fx};--fy:${p.fy};--rot:${p.rot};--py:${p.py}">
      <a class="card-in" href="#" data-product="${esc(p.id)}">
        <span class="card-img"><img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" loading="lazy" decoding="async"></span>
        <span class="card-meta"><span class="no">${String(i + 1).padStart(2, '0')}</span><span class="name">${esc(p.name)}</span><span class="jp" lang="ja">${esc(p.jp)}</span><span class="kind">${esc(p.kind)}</span><span class="price">${p.price.toFixed(2)} €</span></span>
        <button class="add-to-cart" data-product="${esc(p.id)}" data-variant="${esc(p.variantId ?? '')}" aria-label="${esc(p.name)} in den Warenkorb legen">+</button>
      </a>
    </li>`).join('');

  const lookItems = products.filter(p => !p.wide);
  $('look-track').style.setProperty('--n', String(lookItems.length));
  $('look-track').innerHTML = lookItems.map((p, i) => `
    <article class="look-slide" style="--tile:${p.tile};--i:${i}">
      <span class="look-no" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
      <h3 class="look-name">${esc(p.name)}</h3>
      <div class="look-frame"><div class="look-card" data-product="${esc(p.id)}"><img class="on" src="${esc(p.imageUrl)}" alt="${esc(p.name)}" decoding="async"></div></div>
      <p class="look-jp" lang="ja">${esc(p.jp)}</p>
      <p class="look-meta">${esc(p.id)} · ${esc(p.kind)} · ${p.price.toFixed(2)} €</p>
    </article>`).join('');

  rebuildLoco();
}

loadShopifyProducts();




/* ---- Locomotive Scroll (Lenis + Parallax über data-scroll-speed) ---- */
let loco: LocomotiveScroll | null = null;

function rebuildLoco() {
  // Scroll-Position merken
  const scrollY = window.scrollY;

  // Alte Instanz zerstören
  if (loco) {
    try { loco.destroy(); } catch { /* ignore */ }
    loco = null;
  }

  // Neue Instanz erstellen (außer bei reduced-motion)
  if (!reduce) {
    try {
      loco = new LocomotiveScroll({ lenisOptions: { lerp: 0.085, smoothWheel: true } });
      // Scroll-Position wiederherstellen
      (loco as any).scrollTo?.(scrollY, { immediate: true });
    } catch (e) {
      console.warn('Locomotive Scroll nicht verfügbar, normales Scrollen aktiv.', e);
      loco = null;
    }
  }
}

renderProducts(); // initialer Flug-Effekt mit lokalen Templates, Shopify-Bilder folgen im Hintergrund

/* ---- Hintergrund-Frames + Preloader ---- */
const pre = $('pre'), preN = $('pre-n'), preBar = $('pre-bar');
let target = 0, shown = 0, finished = false;
const t0 = performance.now();
const frames = initFrames($('bg') as HTMLCanvasElement, reduce, p => { target = p; });
const rain = initRain($('rain') as HTMLCanvasElement, reduce);
const petals = initPetals($('petals') as HTMLCanvasElement, reduce);
initEndFireworks();   // Feuerwerk zündet automatisch, sobald man am Seitenende ankommt
initLens($('lens') as HTMLCanvasElement, reduce);

function finish() {
  if (finished) return; finished = true;
  preN.textContent = '100'; preBar.style.transform = 'scaleX(1)';
  pre.classList.add('done'); document.body.classList.add('ready');
  setTimeout(() => pre.remove(), 1400);
}
if (reduce) { pre.remove(); document.body.classList.add('ready'); finished = true; }
(function tick(now: number) {
  if (finished) return;
  const t = now - t0;
  shown += (Math.min(target, Math.min(1, t / 1900)) - shown) * 0.12;
  preN.textContent = String(Math.round(shown * 100));
  preBar.style.transform = `scaleX(${shown})`;
  if ((target >= 1 && t > 1900) || t > 7000) return void setTimeout(finish, 250);
  requestAnimationFrame(tick);
})(t0);

/* ---- Wort-Reveal ---- */
document.querySelectorAll<HTMLElement>('[data-split]').forEach(el => {
  el.innerHTML = el.textContent!.trim().split(/\s+/).map((w, i) => `<span class="w"><i style="--d:${i}">${esc(w)}</i></span>`).join(' ');
  new IntersectionObserver(([e], o) => { if (e.isIntersecting) { el.classList.add('in'); o.disconnect(); } }, { threshold: 0.3 }).observe(el);
});

/* ---- Cursor, magnetische Buttons ---- */
if (fine && !reduce) {
  root.classList.add('has-cur');
  const cur = $('cur'), ring = $('ring');
  let mx = 0, my = 0, rx = 0, ry = 0;
  addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; cur.style.transform = `translate(${mx}px,${my}px)`; });
  (function loop() { rx += (mx - rx) * 0.16; ry += (my - ry) * 0.16; ring.style.transform = `translate(${rx}px,${ry}px)`; requestAnimationFrame(loop); })();
  document.addEventListener('pointerover', e => ring.classList.toggle('hov', !!(e.target as Element).closest('a,button')));
  document.querySelectorAll<HTMLElement>('.btn,.cart').forEach(b => {
    b.addEventListener('pointermove', e => { const r = b.getBoundingClientRect(); b.style.translate = `${(e.clientX - r.left - r.width / 2) * 0.25}px ${(e.clientY - r.top - r.height / 2) * 0.35}px`; });
    b.addEventListener('pointerleave', () => { b.style.translate = ''; });
  });
}

/* ---- Scroll-Geschwindigkeit: Kachel-Neigung, Leiterbahnen ---- */
const traces = [...document.querySelectorAll<SVGPathElement>('#traces path')];
let last = scrollY, vel = 0;
(function loop() {
  vel += (clamp(scrollY - last, -80, 80) - vel) * 0.12; last = scrollY;
  root.style.setProperty('--v', clamp(vel, -14, 14).toFixed(2));
  const max = root.scrollHeight - innerHeight, p = max > 0 ? scrollY / max : 0;
  traces.forEach(t => { if (!t.classList.contains('stub')) t.style.strokeDashoffset = String(1 - clamp(p * 1.15, 0, 1)); });
  requestAnimationFrame(loop);
})();

/* ---- Header-Logo ab Hero-Ende ---- */
new IntersectionObserver(([e]) => document.body.classList.toggle('hero-out', !e.isIntersecting), { rootMargin: '-60px 0px 0px 0px' })
  .observe(document.getElementById('brand')!);

/* ---- Anker (Skip-Link, Footer-Links): weich zum Ziel scrollen ---- */
document.addEventListener('click', e => {
  const a = (e.target as Element).closest<HTMLAnchorElement>('a[href^="#"]'); if (!a || a.dataset.legal) return;   // Rechtstexte öffnet legal.ts
  e.preventDefault(); const hash = a.getAttribute('href')!; if (hash === '#') return;
  let el: HTMLElement | null = null;
  if (hash !== '#top') { try { el = document.querySelector<HTMLElement>(hash); } catch { /* ungültiger Anker */ } }
  if (loco) loco.scrollTo(el ?? 0, { duration: 1.4 });
  else (el ?? document.body).scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
  history.pushState(null, '', hash);
});

/* ---- Theme (Dark/Light), Highlight-Farbe, Styling-Panel ---- */
interface Style { theme: 'light' | 'dark'; themeV: number; accent: string; own: boolean; tint: boolean; ownTint: boolean; flick: number }   // own/ownTint: Besucher hat selbst gewählt, sonst gilt der CMS-Standard
const DEF: Style = { theme: 'dark', themeV: 2, accent: '#8bd16b', own: false, tint: false, ownTint: false, flick: 60 };
let siteAccent = DEF.accent;                 // Highlight-Standard aus dem CMS
let siteTint = DEF.tint;                     // „Auge mitfärben“ als Standard aus dem CMS
const KEY = 'kc-style';
let st: Style = { ...DEF };
let storedV: unknown;
try { const saved = JSON.parse(localStorage.getItem(KEY) || '{}'); storedV = saved?.themeV; st = { ...DEF, ...saved }; } catch { /* ignorieren */ }
// Gespeicherte Werte prüfen: sie landen in CSS-Variablen und in parseInt
if (!/^#[0-9a-f]{6}$/i.test(String(st.accent))) st.accent = DEF.accent;
if (st.theme !== 'dark' && st.theme !== 'light') st.theme = DEF.theme;
// Dark ist jetzt der Standard: einmalig auch bei Besuchern, die vorher automatisch „light“ gespeichert hatten (danach zählt wieder die eigene Wahl über ◐)
if (storedV !== DEF.themeV) { st.theme = DEF.theme; st.themeV = DEF.themeV; }
st.flick = clamp(Number(st.flick) || DEF.flick, 0, 100);
st.own = st.own === true; st.tint = st.tint === true; st.ownTint = st.ownTint === true;
const accentIn = $('accent-in') as HTMLInputElement, tintIn = $('tint-in') as HTMLInputElement, flickIn = $('flick-in') as HTMLInputElement;

function hueOf(hex: string) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  if (!d) return 100;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
function applyStyle() {
  const acc = st.own ? st.accent : siteAccent;
  const tint = st.ownTint ? st.tint : siteTint;
  const [r, g, b] = [1, 3, 5].map(i => parseInt(acc.slice(i, i + 2), 16));
  root.dataset.theme = st.theme;
  root.style.setProperty('--accent', acc);
  root.style.setProperty('--glow-color', acc.toLowerCase() === DEF.accent ? '#9b7bff' : acc);   // Hover-Backglow der Karten: Lila beim Standard-Grün, sonst die gewählte Highlight-Farbe
  root.style.setProperty('--on-accent', 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#14181A' : '#ffffff');
  root.style.setProperty('--bg-tint', `hue-rotate(${tint ? Math.round(hueOf(acc) - 100) : 0}deg)`);
  root.style.setProperty('--flick', String(st.flick / 100));
  accentIn.value = acc; tintIn.checked = tint; flickIn.value = String(st.flick);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', st.theme === 'dark' ? '#0a0d0f' : '#F9F9FA');
  try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* ignorieren */ }
}
$('theme-btn').addEventListener('click', () => { st.theme = st.theme === 'dark' ? 'light' : 'dark'; applyStyle(); });
accentIn.addEventListener('input', () => { st.accent = accentIn.value; st.own = true; applyStyle(); });
tintIn.addEventListener('change', () => { st.tint = tintIn.checked; st.ownTint = true; applyStyle(); });
flickIn.addEventListener('input', () => { st.flick = +flickIn.value; applyStyle(); });
$('reset').addEventListener('click', () => { st = { ...DEF, theme: st.theme }; applyStyle(); });
$('swatches').innerHTML = ['#8bd16b', '#7c5cff', '#00d4c8', '#ff5fa2', '#ffb020'].map(c => `<button type="button" style="--c:${c}" data-c="${c}" aria-label="Farbe ${c}"></button>`).join('');
$('swatches').addEventListener('click', e => { const c = (e.target as HTMLElement).dataset.c; if (c) { st.accent = c; st.own = true; applyStyle(); } });
const panel = $('panel'), styleBtn = $('style-btn');
function setPanel(open: boolean) { panel.classList.toggle('open', open); panel.toggleAttribute('inert', !open); styleBtn.setAttribute('aria-expanded', String(open)); }
styleBtn.addEventListener('click', () => setPanel(!panel.classList.contains('open')));
$('panel-x').addEventListener('click', () => setPanel(false));
document.addEventListener('keydown', e => { if (e.key === 'Escape') setPanel(false); });
applyStyle();

/* ---- Encrypted-Text-Effekt (Scramble) ---- */
const GL = '01<>/\\|{}[]#$%&*+=';
function scramble(el: HTMLElement) {
  const txt = el.dataset.txt ?? (el.dataset.txt = el.textContent ?? '');
  clearInterval(Number(el.dataset.iv)); let f = 0;
  const iv = window.setInterval(() => {
    f++;
    el.textContent = [...txt].map((ch, i) => ch === ' ' || i < f / 2 ? ch : GL[Math.floor(Math.random() * GL.length)]).join('');
    if (f / 2 >= txt.length) { clearInterval(iv); el.textContent = txt; }
  }, 32);
  el.dataset.iv = String(iv);
}
if (!reduce) {
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { scramble(e.target as HTMLElement); io.unobserve(e.target); } }), { threshold: 0.6 });
  document.querySelectorAll<HTMLElement>('.eyebrow, .tag-line span:last-child, .kind, .chip-head b, .foot-links a, .copy').forEach(el => {
    io.observe(el);
    (el.closest('a, li') ?? el).addEventListener('pointerenter', () => scramble(el));
  });
}

/* ---- Cursor-Glow auf den Produktkarten ---- */
/* ---- Hero gepinnt: Video läuft durch (0–75 %), danach fliegt nur die Überschrift nach oben; dort angekommen kurzer Blütenregen ---- */
const hero = document.querySelector<HTMLElement>('.hero')!, brandEl = $('brand'), bgCanvas = $('bg');
let heroR = 1;
const clampN = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
function heroLayout() {
  heroR = Math.max(1, hero.offsetHeight - innerHeight);
  hero.style.setProperty('--dist', Math.max(0, brandEl.offsetTop - (innerWidth < 700 ? 88 : 100)) + 'px');
  frames.setAnchors([[heroR * 0.75, 37]]);
}
heroLayout(); addEventListener('load', heroLayout); addEventListener('resize', heroLayout); document.fonts?.ready.then(heroLayout);
let rained = false;
(function heroLoop() {
  const y = scrollY, f = clampN((y - heroR * 0.75) / (heroR * 0.25), 0, 1);
  hero.style.setProperty('--fly', f.toFixed(4));
  bgCanvas.style.opacity = String(1 - clampN((y - heroR) / (innerHeight * 0.7), 0, 1));
  if (f >= 1 && !rained && !reduce) { rained = true; petals.burst(28); } else if (f < 0.6) rained = false;
  requestAnimationFrame(heroLoop);
})();

/* Lookbook: Fortschritt selbst aus der echten Pin-Strecke berechnen (zuverlässig auf Mobile, wo die Browserleiste die Viewport-Höhe ändert) */
const look = document.getElementById('look')!, lookStick = look.querySelector<HTMLElement>('.look-stick')!;
(function lookLoop() {
  const top = look.getBoundingClientRect().top + scrollY, range = Math.max(1, look.offsetHeight - lookStick.offsetHeight);
  look.style.setProperty('--p', clampN((scrollY - top) / (range * 0.94), 0, 1).toFixed(4));
  requestAnimationFrame(lookLoop);
})();

/* ---- Japanische Wörter: fliegen beim Scrollen von unten nach oben (je Wort eigener Start, Tempo, Größe, Richtung) ---- */
const BLUE = '#86d8ff', LILAC = '#c4a8ff';
interface JpWord { t: string; x: number; fs: string; s: number; d: number; v: boolean; c: string }   // t = Text, x = % Breite, fs = Größe, s = Start (Anteil des Fortschritts), d = Dauer, v = vertikal, c = Farbe
const jpHero: JpWord[] = [
  { t: 'かわいい',  x: 4,  fs: 'clamp(2.2rem, 6vw, 5rem)',   s: 0.02, d: 0.42, v: true,  c: BLUE },
  { t: 'キラキラ',  x: 22, fs: 'clamp(1.8rem, 4.4vw, 3.6rem)', s: 0.14, d: 0.36, v: false, c: LILAC },
  { t: 'ふわふわ',  x: 52, fs: 'clamp(2.4rem, 7vw, 6rem)',   s: 0.24, d: 0.5,  v: false, c: BLUE },
  { t: 'ゆめかわ',  x: 38, fs: 'clamp(2rem, 5vw, 4.2rem)',   s: 0.34, d: 0.4,  v: true,  c: LILAC },
  { t: 'ドキドキ',  x: 66, fs: 'clamp(1.6rem, 3.6vw, 3rem)', s: 0.42, d: 0.34, v: true,  c: BLUE },
  { t: 'ぷにぷに',  x: 10, fs: 'clamp(2.2rem, 6.2vw, 5.2rem)', s: 0.52, d: 0.44, v: false, c: LILAC },
  { t: 'ほしい',    x: 44, fs: 'clamp(2.6rem, 8vw, 6.6rem)', s: 0.6,  d: 0.38, v: true,  c: BLUE },
];
/* Kollektion: Fortschritt 0…1 läuft, solange der Abschnitt durchs Fenster wandert; Wörter wechseln zwischen hochkant und waagerecht */
const jpShop: JpWord[] = [
  { t: 'あたらしい', x: 6,  fs: 'clamp(2rem, 5.4vw, 4.6rem)',  s: 0.02, d: 0.30, v: true,  c: BLUE },
  { t: 'シャツ',     x: 58, fs: 'clamp(2.6rem, 8vw, 6.8rem)',  s: 0.10, d: 0.34, v: false, c: LILAC },
  { t: 'おしゃれ',   x: 84, fs: 'clamp(1.8rem, 4.4vw, 3.6rem)', s: 0.20, d: 0.30, v: true,  c: BLUE },
  { t: 'ゆめ',       x: 24, fs: 'clamp(3rem, 9vw, 7.4rem)',    s: 0.28, d: 0.32, v: false, c: LILAC },
  { t: 'ぴかぴか',   x: 72, fs: 'clamp(2rem, 5vw, 4.2rem)',    s: 0.40, d: 0.30, v: true,  c: BLUE },
  { t: 'すてき',     x: 8,  fs: 'clamp(2.2rem, 6.4vw, 5.4rem)', s: 0.50, d: 0.34, v: false, c: LILAC },
  { t: 'だいすき',   x: 46, fs: 'clamp(2rem, 5.6vw, 4.8rem)',  s: 0.60, d: 0.32, v: true,  c: BLUE },
  { t: 'キラキラ',   x: 76, fs: 'clamp(2.4rem, 6.6vw, 5.6rem)', s: 0.68, d: 0.30, v: false, c: LILAC },
];
/** Erzeugt die Wörter in einem Container und liefert die Funktion, die sie pro Frame passend zum Fortschritt bewegt. */
function makeJpLayer(containerId: string, cfg: JpWord[], progress: () => number) {
  const els = cfg.map(w => {
    const el = document.createElement('span'); el.textContent = w.t; if (w.v) el.className = 'v';
    el.style.cssText = `--fs:${w.fs};--c:${w.c};left:${w.x}%`; $(containerId).appendChild(el); return { el, ...w, len: 0 };
  });
  const measure = () => els.forEach(w => { w.len = w.v ? w.el.offsetHeight : w.el.offsetHeight * 2; });
  measure(); addEventListener('resize', measure); document.fonts?.ready.then(measure);
  return () => {
    const t = progress(), vh = innerHeight;
    els.forEach((w, i) => {
      const u = (t - w.s) / w.d, on = u > 0 && u < 1;
      if (!on) { w.el.style.opacity = '0'; return; }
      const y = vh + 24 - u * (vh + 24 + w.len);
      w.el.style.opacity = String(Math.min(1, u * 5, (1 - u) * 5));
      w.el.style.transform = `translate3d(0,${y.toFixed(1)}px,0) rotate(${(Math.sin(u * 3 + i) * 4).toFixed(1)}deg)`;
    });
  };
}
const shopSection = $('shop');
const jpLayers = [
  makeJpLayer('jp-words', jpHero, () => clampN(scrollY / (heroR * 0.8), 0, 1)),
  makeJpLayer('jp-words-shop', jpShop, () => {
    const r = shopSection.getBoundingClientRect();
    return clampN((innerHeight - r.top) / (r.height + innerHeight), 0, 1);
  }),
];
(function jpLoop() { jpLayers.forEach(update => update()); requestAnimationFrame(jpLoop); })();

/* ============================================================
   Warenkorb – einfacher Drawer, leitet zu Shopify Checkout weiter
   ============================================================ */

const cart = new Map<string, { name: string; price: number; qty: number; variantId?: string }>();
const cartBtn = document.querySelector<HTMLElement>('.cart')!;
const cartCount = cartBtn.querySelector<HTMLElement>('.count')!;

function updateCartBadge() {
  const total = [...cart.values()].reduce((s, i) => s + i.qty, 0);
  cartCount.textContent = String(total);
  cartBtn.setAttribute('aria-label', `Warenkorb, ${total} Artikel`);
}

function renderCart() {
  const panel = document.getElementById('cart-panel')!;
  const itemsEl = panel.querySelector<HTMLElement>('#cart-items')!;
  const totalEl = panel.querySelector<HTMLElement>('#cart-total')!;

  itemsEl.innerHTML = '';
  let total = 0;

  for (const [id, item] of cart) {
    const lineTotal = item.price * item.qty;
    total += lineTotal;
    itemsEl.insertAdjacentHTML('beforeend', `
      <div class="cart-row" data-product="${esc(id)}">
        <span class="cart-row-name">${esc(item.name)}</span>
        <span class="cart-row-qty">${item.qty}x</span>
        <span class="cart-row-price">${lineTotal.toFixed(2)} €</span>
        <button class="cart-row-remove" data-product="${esc(id)}" aria-label="Entfernen">×</button>
      </div>`);
  }

  totalEl.textContent = `${total.toFixed(2)} €`;
  updateCartBadge();
  updateCheckoutButton();
}

function toggleCart() {
  const panel = document.getElementById('cart-panel')!;
  const open = panel.hasAttribute('open');
  if (open) {
    panel.removeAttribute('open');
  } else {
    panel.setAttribute('open', '');
    renderCart();
  }
}

/* Warenkorb-Panel ins DOM einfügen */
const cartPanel = document.createElement('div');
cartPanel.id = 'cart-panel';
cartPanel.setAttribute('role', 'dialog');
cartPanel.setAttribute('aria-modal', 'true');
cartPanel.setAttribute('aria-label', 'Warenkorb');
cartPanel.innerHTML = `
  <button id="cart-close" type="button" aria-label="Schließen">×</button>
  <h3>Warenkorb</h3>
  <div id="cart-items"></div>
  <div class="cart-footer">
    <span>Gesamt:</span>
    <span id="cart-total">0,00 €</span>
  </div>
  <button id="cart-checkout" type="button" disabled>Zur Kasse</button>
`;
document.body.appendChild(cartPanel);

/* CSS für Warenkorb-Panel */
const cartStyle = document.createElement('style');
cartStyle.textContent = `
/* Warenkorb als Glas-Karte im Stil der Artikel-Karten: halbtransparent, Weichzeichner, helle Kante, abgeschnittene Ecken.
   Bewusst dunkel getönt (in Light- und Dark-Mode gleich). */
#cart-panel {
  --cart-ink: #eaf0ea; --cart-muted: #a9b3ac; --cart-edge: rgba(255, 255, 255, .2);
  position: fixed;
  top: 74px; right: var(--pad); bottom: var(--pad);
  z-index: 1000;
  width: min(360px, calc(100vw - 2 * var(--pad)));
  background: color-mix(in srgb, #1a1430 58%, transparent);
  -webkit-backdrop-filter: blur(20px) saturate(1.5);
  backdrop-filter: blur(20px) saturate(1.5);
  border: 1px solid var(--cart-edge);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .14);
  clip-path: polygon(0 0, calc(100% - 22px) 0, 100% 22px, 100% 100%, 22px 100%, 0 calc(100% - 22px));
  color: var(--cart-ink);
  font-family: var(--sans);
  padding: 1.6rem 1.4rem;
  transform: translateX(calc(100% + var(--pad) + 20px));
  transition: transform 0.45s cubic-bezier(.2, .8, .2, 1);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
#cart-panel[open] { transform: translateX(0); }
#cart-panel h3 { margin: 0 0 0.5rem 0; font: 700 .8rem var(--mono); letter-spacing: .12em; text-transform: uppercase; color: var(--accent); }
#cart-items { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.7rem; }
.cart-row { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; padding: 0.55rem 0.7rem; border: 1px solid rgba(255, 255, 255, .14); background: rgba(255, 255, 255, .06); clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px)); }
.cart-row-name { flex: 1; font-size: 0.9rem; }
.cart-row-qty { font-size: 0.85rem; color: var(--cart-muted); }
.cart-row-price { font-variant-numeric: tabular-nums; }
.cart-row-remove { background: none; border: none; color: var(--cart-muted); font-size: 1.5rem; cursor: pointer; line-height: 1; transition: color .2s; }
.cart-row-remove:hover, .cart-row-remove:focus-visible { color: var(--accent); }
.cart-footer { display: flex; justify-content: space-between; font-weight: 700; font-size: 1.1rem; padding-top: 0.75rem; border-top: 1px solid var(--cart-edge); }
#cart-checkout {
  width: 100%;
  min-height: 48px;
  padding: 0 1rem;
  background: var(--accent, #8bd16b);
  color: var(--on-accent, #14181A);
  border: none;
  font: 700 .8rem var(--mono); text-transform: uppercase; letter-spacing: .08em;
  clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px));
  cursor: pointer;
}
#cart-checkout:disabled { opacity: 0.4; cursor: not-allowed; }
#cart-close { position: absolute; top: 0.9rem; right: 1.6rem; background: none; border: none; color: var(--cart-ink); font-size: 1.5rem; cursor: pointer; }
`;
document.head.appendChild(cartStyle);

const playCartHase = initCartHase(reduce);

/* In den Warenkorb: Delegation am Grid, weil renderProducts() die Buttons bei jedem Laden neu erzeugt.
   Schlüssel ist die Variante (stabil), nicht die Position: Sortieren/Ausblenden im CMS verschiebt die Positionen. */
$('grid').addEventListener('click', e => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('.add-to-cart');
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  const product = products.find(p => p.id === btn.dataset.product);
  if (!product) return;
  const variantId = btn.dataset.variant || undefined;
  const key = variantId ?? product.id;

  const existing = cart.get(key);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.set(key, { name: product.name, price: product.price, qty: 1, variantId });
  }
  renderCart();
  playCartHase(btn);                                   // Häschen hüpft neben dem Button
  btn.textContent = '✓';
  setTimeout(() => { btn.textContent = '+'; }, 600);
});

cartBtn.addEventListener('click', e => {
  e.preventDefault();
  toggleCart();
});

document.getElementById('cart-close')!.addEventListener('click', () => toggleCart());

document.getElementById('cart-checkout')!.addEventListener('click', async () => {
  const lineItems: Array<{ variantId: string; quantity: number }> = [];
  for (const item of cart.values()) {
    if (item.variantId) {
      lineItems.push({ variantId: item.variantId, quantity: item.qty });
    }
  }
  if (lineItems.length === 0) return;

  try {
    const checkoutUrl = await createCheckoutUrl(lineItems);
    window.location.href = checkoutUrl;
  } catch (err) {
    console.error('[Checkout] Fehler:', err);
    alert('Checkout konnte nicht erstellt werden. Bitte später erneut versuchen.');
  }
});

/* Remove-Buttons im Warenkorb */
document.getElementById('cart-items')!.addEventListener('click', e => {
  const target = e.target as HTMLElement;
  if (!target.classList.contains('cart-row-remove')) return;
  const id = target.dataset.product!;
  cart.delete(id);
  renderCart();
});

/* Checkout-Button aktivieren/deaktivieren */
function updateCheckoutButton() {
  const btn = document.getElementById('cart-checkout') as HTMLButtonElement;
  btn.disabled = cart.size === 0;
}

/* ============================================================
   Mockups durchschalten (Kollektion und Lookbook): Hover = automatisch weiter, Tippen/Klick = ein Bild weiter
   ============================================================ */
function bindImageCycler(container: HTMLElement, cardSel: string, imgSel: string) {
  let timer = 0, delay = 0, active: HTMLElement | null = null;
  const prodOf = (c: HTMLElement) => products.find(p => p.id === c.dataset.product);
  const setImg = (c: HTMLElement, n: number) => {
    const p = prodOf(c), im = c.querySelector<HTMLImageElement>('img');
    if (!p || !im || !p.images.length) return;
    p.currentImageIndex = n % p.images.length;
    im.src = p.images[p.currentImageIndex];
  };
  const stop = () => {
    clearInterval(timer); clearTimeout(delay); timer = delay = 0;
    if (active) setImg(active, 0);
    active = null;
  };
  container.addEventListener('pointerover', e => {
    if ((e as PointerEvent).pointerType === 'touch') return;
    const c = (e.target as HTMLElement).closest<HTMLElement>(cardSel);
    if (!c || c === active) return;
    stop();
    const p = prodOf(c);
    if (!p || p.images.length <= 1) return;
    active = c;
    p.images.forEach(u => { new Image().src = u; });   // vorladen, damit nichts flackert
    delay = window.setTimeout(() => { if (active === c) setImg(c, 1); }, 250);
    timer = window.setInterval(() => {
      if (!c.isConnected) return stop();               // Karte wurde neu gerendert
      const q = prodOf(c); if (q) setImg(c, q.currentImageIndex + 1);
    }, 1400);
  });
  container.addEventListener('pointerout', e => {
    if (active && !active.contains((e as PointerEvent).relatedTarget as Node | null)) stop();
  });
  container.addEventListener('click', e => {
    const c = (e.target as HTMLElement).closest<HTMLImageElement>(imgSel)?.closest<HTMLElement>(cardSel);
    const p = c && prodOf(c);
    if (!c || !p || p.images.length <= 1) return;
    e.preventDefault();
    setImg(c, p.currentImageIndex + 1);
  });
}
bindImageCycler($('grid'), 'a.card-in', '.card-img img');
bindImageCycler($('look-track'), '.look-card', '.look-card img');

/* ---- Japanischer Schriftzug leuchtet kurz auf, wenn er beim Runterscrollen durch die Bildschirmmitte läuft ---- */
const flashEl = document.getElementById('jp-flash');
if (flashEl && !reduce) {
  const FLASH_RANGE = 0.30;                                        // Abstand zur Mitte (in Fensterhöhen), ab dem er unsichtbar ist
  const updateFlash = () => {
    const r = flashEl.getBoundingClientRect();
    const off = Math.abs(r.top + r.height / 2 - innerHeight / 2) / (innerHeight * FLASH_RANGE);   // 0 = genau in der Mitte
    const k = clamp(1 - off, 0, 1);
    flashEl.style.setProperty('--glow', String(Math.sin(Math.PI / 2 * k) ** 1.6));                // sanft an, Spitze in der Mitte, sanft aus
  };
  addEventListener('scroll', updateFlash, { passive: true });
  addEventListener('resize', updateFlash);
  updateFlash();

  /* Glimmen: langsames, unregelmäßiges Schwanken der Helligkeit (--shim) plus gelegentliches kurzes Aufblitzen.
     Läuft nur, solange der Schriftzug im Bild ist. */
  let glintAt = 0, glintStart = -1e9, shimId = 0;
  const shimmer = (now: number) => {
    const t = now / 1000;
    const wave = 0.5 + 0.5 * (0.55 * Math.sin(t * 1.3) + 0.3 * Math.sin(t * 2.9 + 1.7) + 0.15 * Math.sin(t * 6.1 + 0.4));   // 0…1, unregelmäßig
    if (now > glintAt) { glintStart = now; glintAt = now + 2200 + Math.random() * 3800; }                                  // alle 2–6 s ein Glanzlicht
    const glint = Math.exp(-(now - glintStart) / 380);                                                                      // klingt in ca. 0,4 s ab
    return clamp(0.5 + 0.6 * wave + 0.5 * glint, 0, 1.6);      // 0,5…1,1 im Ruhezustand, Glanzlicht bis 1,6 (Deckkraft wird in CSS begrenzt)
  };
  const shimLoop = (now: number) => { flashEl.style.setProperty('--shim', shimmer(now).toFixed(3)); shimId = requestAnimationFrame(shimLoop); };
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting) { if (!shimId) shimId = requestAnimationFrame(shimLoop); }
    else { cancelAnimationFrame(shimId); shimId = 0; }
  }).observe(flashEl);
}

/* ---- Ton: Browser erlauben Audio erst nach einer Berührung der Seite, daher beim ersten Klick/Tippen/Tastendruck freischalten ---- */
const unlockOnce = () => { unlockAudio(); for (const ev of ['pointerdown', 'keydown', 'touchend']) removeEventListener(ev, unlockOnce); };
for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, unlockOnce, { passive: true });
const sndBtn = $('snd-btn');
const showSound = () => { sndBtn.textContent = isSoundOn() ? '♪ Ton an' : '♪ Ton aus'; };
showSound();
sndBtn.addEventListener('click', () => { setSoundOn(!isSoundOn()); showSound(); });
if (reduce) sndBtn.hidden = true;                      // ohne Feuerwerk (Bewegung reduzieren) auch kein Ton-Schalter

/* ---- Feuerwerk-Button im Footer: höchstens alle 2 s ---- */
const fxBtn = $('fx-btn');
if (reduce) fxBtn.hidden = true;
const playHase = initHase($('hase') as HTMLCanvasElement, reduce);   // Häschen neben dem Button, nur bei der großen Bombe
fxBtn.addEventListener('click', () => {
  const launched = launchFromButton();
  if (!launched) return;                               // Sperre läuft noch
  if (launched === 'big') void playHase();
  fxBtn.setAttribute('aria-disabled', 'true'); fxBtn.classList.add('cool');
  setTimeout(() => { fxBtn.removeAttribute('aria-disabled'); fxBtn.classList.remove('cool'); }, BUTTON_COOLDOWN_MS);
});

/* ---- Rechtstexte (Impressum, Datenschutz, Versand & Rückgabe, Kontakt): Karte über der Seite; die Seite scrollt währenddessen nicht ---- */
initLegal({ lock: () => loco?.stop(), unlock: () => loco?.start() });

/* ---- CMS: wendet die Server-Einstellungen an; mit Login (✎ in der Kopfleiste) lässt sich alles live bearbeiten ---- */
initCms({
  frames, rain, petals,
  /* Highlight-Standard der Seite; force: der Admin überschreibt auch seine eigene, im Browser gemerkte Farbe */
  setSiteAccent(hex, force = false) { siteAccent = hex ?? DEF.accent; if (force) st.own = false; applyStyle(); },
  /* „Auge mitfärben“: Hero-Animation färbt sich mit dem Highlight (hue-rotate auf #bg) */
  setSiteTint(on, force = false) { siteTint = on ?? DEF.tint; if (force) st.ownTint = false; applyStyle(); },
  refreshProducts,
  listProducts: () => (fetched.length ? fetched.map(p => ({ handle: p.handle, title: p.title })) : LOCAL_TEMPLATES.map(t => ({ handle: t.img, title: t.name }))),
});
