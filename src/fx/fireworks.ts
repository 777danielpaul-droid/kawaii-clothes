// Feuerwerk am Seitenende. Die Engine stammt aus mooney-fx (Raketen steigen auf und platzen zu einer Kugel aus
// blinkenden Sternen), ohne Fontäne und Bedienelemente. Der Ton kommt aus fireworks-sound.ts. Das Canvas legt das Modul selbst an.
// Zündet automatisch, sobald man unten an der Seite ankommt (initEndFireworks), und wieder, wenn man weggescrollt
// und erneut unten angekommen ist. Mit prefers-reduced-motion bleibt es aus.

import { playBang, playPop } from './fireworks-sound';

// --- Anpassbar -------------------------------------------------------------

const SHELLS = 3;                     // Raketen pro Salve
const VOLLEYS = 2;                    // Salven pro Ankunft am Seitenende
const VOLLEY_GAP_MS = 1500;           // Abstand zwischen den Salven
const STAGGER_MS = 380;               // Abstand zwischen den Raketen einer Salve
const MAX_SHELLS = 12;                // so viele Raketen warten höchstens
const RISE_MS = [650, 950];           // Steigzeit bis zur Explosion
const TOP = [0.16, 0.42];             // Höhe der Explosion (Anteil der Fensterhöhe, von oben gemessen)
const STARS = 210;                    // Sterne pro Explosion
const BIG_STARS = 900;                // die große Einzelbombe (erster Klick auf den Footer-Button)
const BIG_RADIUS = 2.2;               // …Endradius im Verhältnis zu einer normalen Kugel
const BIG_LIFE = 1.5;                 // …Sterne leuchten entsprechend länger
const BIG_SIZE = 1.75;                // …und sind größer
const POPS = 7;                       // Knistersterne ("Popping Flowers"), die nach der großen Bombe auf den Betrachter zufliegen und plopp machen
const POP_DELAY = [1.1, 2.0];         // …Start nach dem Platzen (s)
const POP_FLIGHT = [0.9, 1.4];        // …Flugzeit bis zum Plopp (s)
const POP_SPARKS = 30;                // …Funken der Mini-Explosion
const RADIUS = [0.24, 0.36];          // Endradius der Kugel (Anteil der kleineren Fensterseite)
const SPEED_JITTER = 0.06;            // 0 = perfekt glatte Kugel, höher = zerfranster
const DEPTH_SIZE = 0.2;               // Tiefenwirkung: Sterne, die auf dich zufliegen, sind größer
const DRAG = 1.9;                     // Luftwiderstand pro Sekunde: bremst die Sterne zur Kugel ab
const GRAVITY = 190;                  // px/s²: nach dem Platzen sinken die Sterne langsam ab
const LIFE = [1.7, 2.7];              // Lebensdauer der Sterne in s
const SIZE = 11;                      // Sterngröße
const POOL = 3200;                    // Größe des Sternen-Pools
const WHITE_SHARE = 0.14;             // Anteil fast weißer Funken (nur Dark-Mode)
const HUE_SPREAD = 50;                // Grad Farbabweichung innerhalb einer Kugel
const END_TOLERANCE_PX = 24;          // so nah am Seitenende gilt als „angekommen“
const REARM_VIEWPORTS = 0.6;          // so weit (in Fensterhöhen) muss man weg vom Ende, damit es wieder zündet
const Z_INDEX = 55;                   // über Inhalt, Leiste und Panels, unter Vorladeanimation und Cursor
// ----------------------------------------------------------------------------

interface Star {
  alive: boolean; x: number; y: number; vx: number; vy: number; z: number; age: number; life: number;
  r: number; cls: number; phase: number; speed: number; hueOff: number; white: boolean; hue: number; big: boolean;
}
interface Shell { x0: number; topY: number; riseMs: number; launchAt: number; hue: number; big?: boolean }
interface Flash { x: number; y: number; hue: number; age: number; big?: boolean; scale?: number }
interface Popper { x: number; y: number; dx: number; dy: number; delay: number; flight: number; age: number; phase: number }

const hsla = (h: number, s: number, l: number, a: number) => `hsla(${(((h % 360) + 360) % 360).toFixed(1)}, ${s}%, ${l}%, ${a})`;
const between = (r: number[]) => r[0] + Math.random() * (r[1] - r[0]);
const hueBucket = (h: number) => Math.floor((((h % 360) + 360) % 360) / 10);
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let width = 0, height = 0;
let frameId: number | null = null;
let lastFrame = 0;
let stars: Star[] = [];
let starNext = 0;
let shells: Shell[] = [];
const flashes: Flash[] = [];
const poppers: Popper[] = [];
const popSprites: { dark: HTMLCanvasElement | null; light: HTMLCanvasElement | null } = { dark: null, light: null };
const atlases: { dark: HTMLCanvasElement[] | null; light: HTMLCanvasElement[] | null } = { dark: null, light: null };

const isLight = () => document.documentElement.dataset.theme !== 'dark';

/** Vorgerenderte Leucht-Sprites pro Farbton (10°-Schritte). Index 36 = fast weißer Funke. */
function buildAtlas(light: boolean): HTMLCanvasElement[] {
  const list: HTMLCanvasElement[] = [];
  const count = light ? 36 : 37;
  for (let i = 0; i < count; i++) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const h = i * 10 + 5;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    if (i === 36) {
      grad.addColorStop(0, 'hsla(0, 0%, 100%, 1)');
      grad.addColorStop(0.12, 'hsla(200, 70%, 96%, 0.95)');
      grad.addColorStop(0.3, 'hsla(220, 90%, 85%, 0.4)');
      grad.addColorStop(1, 'hsla(220, 100%, 80%, 0)');
    } else if (light) {
      grad.addColorStop(0, hsla(h, 95, 42, 0.95));
      grad.addColorStop(0.3, hsla(h, 92, 48, 0.5));
      grad.addColorStop(1, hsla(h, 90, 50, 0));
    } else {
      grad.addColorStop(0, hsla(h, 100, 92, 1));
      grad.addColorStop(0.12, hsla(h, 100, 80, 0.95));
      grad.addColorStop(0.3, hsla(h, 100, 62, 0.45));
      grad.addColorStop(1, hsla(h, 100, 55, 0));
    }
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    list.push(c);
  }
  return list;
}

/** Weißer Knisterstern. Im Light-Mode bekommt er einen blauen Rand, sonst wäre Weiß auf hellem Grund unsichtbar. */
function getPopSprite(light: boolean): HTMLCanvasElement {
  const cached = light ? popSprites.light : popSprites.dark;
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  if (light) {
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.2, 'rgba(255,255,255,1)');
    grad.addColorStop(0.34, 'rgba(70,110,200,0.95)');
    grad.addColorStop(0.62, 'rgba(70,110,200,0.4)');
    grad.addColorStop(1, 'rgba(80,120,200,0)');
  } else {
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.14, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.34, 'rgba(190,220,255,0.5)');
    grad.addColorStop(1, 'rgba(160,200,255,0)');
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  if (light) popSprites.light = c; else popSprites.dark = c;
  return c;
}

const getAtlas = (light: boolean) => light ? (atlases.light ||= buildAtlas(true)) : (atlases.dark ||= buildAtlas(false));

function resize() {
  if (!canvas || !ctx) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/** Legt Canvas und Sternen-Pool beim ersten Zünden an. */
function ensureCanvas(): boolean {
  if (canvas && ctx) return true;
  canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = `position:fixed;inset:0;width:100%;height:100%;z-index:${Z_INDEX};pointer-events:none;display:block`;
  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d');
  if (!ctx) return false;
  stars = Array.from({ length: POOL }, () => ({
    alive: false, x: 0, y: 0, vx: 0, vy: 0, z: 0, age: 0, life: 0, r: 1, cls: 0, phase: 0, speed: 0, hueOff: 0, white: false, hue: 0, big: false,
  }));
  resize();
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  return true;
}

function nextStar(): Star {
  const p = stars[starNext];
  starNext = (starNext + 1) % stars.length;
  const roll = Math.random();
  p.cls = roll < 0.6 ? 0 : roll < 0.92 ? 1 : 2; // winzig, mittel, selten groß
  p.r = p.cls === 0 ? 0.8 + Math.random() * 0.4 : p.cls === 1 ? 1.3 + Math.random() * 0.7 : 2.2 + Math.random() * 0.8;
  p.phase = Math.random() * Math.PI * 2;
  p.speed = 2 + Math.random() * 6;
  p.hueOff = (Math.random() - 0.5) * HUE_SPREAD;
  p.white = Math.random() < WHITE_SHARE;
  p.big = false;
  p.alive = true;
  p.age = 0;
  p.z = 0;
  return p;
}

/** Zündet eine Salve (mehrere Raketen nacheinander, jede mit eigener Farbe). */
function launchFireworks(): void {
  if (!ensureCanvas() || !width) return;
  if (shells.length >= MAX_SHELLS) return;
  const now = performance.now();
  const xs = Array.from({ length: SHELLS }, (_, i) => (i + 0.5) / SHELLS + (Math.random() - 0.5) * 0.14);
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  const margin = Math.min(0.4, (Math.min(width, height) * RADIUS[1] + 16) / width);
  const hue0 = Math.random() * 360;
  xs.forEach((fx, i) => {
    const x = Math.min(1 - margin, Math.max(margin, fx));
    shells.push({
      x0: x * width,
      topY: height * between(TOP),
      riseMs: between(RISE_MS),
      launchAt: now + i * STAGGER_MS + Math.random() * 80,
      hue: hue0 + i * (360 / SHELLS) + (Math.random() - 0.5) * 40,
    });
  });
  start();
}

/** Position der Rakete nach el Millisekunden Flug: schnell am Anfang, zum Scheitel hin langsamer, mit leichtem Wackeln. */
function shellPos(sh: Shell, el: number) {
  const k = Math.min(1, Math.max(0, el / sh.riseMs));
  const eased = 1 - Math.pow(1 - k, 2.2);
  return { x: sh.x0 + Math.sin(el * 0.012) * 5 * (1 - k), y: height - (height - sh.topY) * eased, k };
}

/** Die Explosion: eine echte Kugel. Flugrichtungen liegen gleichmäßig auf einer 3D-Kugel (Fibonacci-Spirale), auf den Bildschirm fällt die Seitenansicht. */
function explode(x: number, y: number, hue: number, big = false) {
  const radius = Math.min(width, height) * between(RADIUS) * (big ? BIG_RADIUS : 1);
  const n = big ? BIG_STARS : STARS;
  const offset = Math.random() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const p = nextStar();
    const z = 1 - (2 * (i + 0.5)) / n + (Math.random() - 0.5) * 0.04;
    const side = Math.sqrt(Math.max(0, 1 - z * z));
    const ang = offset + i * GOLDEN_ANGLE;
    const v = radius * DRAG * (1 - Math.random() * SPEED_JITTER);
    p.x = x; p.y = y;
    p.vx = Math.cos(ang) * side * v;
    p.vy = Math.sin(ang) * side * v;
    p.z = z;
    p.life = between(LIFE) * (big ? BIG_LIFE : 1);
    p.hue = hue;
    p.big = big;
  }
  flashes.push({ x, y, hue, age: 0, big });
  if (big) scheduleCrackle(x, y, radius);          // …und etwas später: Knistersterne (Popping Flowers)
  playBang(big, (x / width) * 2 - 1);                // Knall: Sound 1 für normale, Sound 2 für die große Bombe
}

/** Nach der großen Bombe: ein paar weiße Knistersterne erscheinen im Bereich der Kugel und fliegen auf den Betrachter zu. */
function scheduleCrackle(cx: number, cy: number, radius: number) {
  for (let i = 0; i < POPS; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = radius * (0.12 + Math.random() * 0.7);
    const x = Math.min(width * 0.94, Math.max(width * 0.06, cx + Math.cos(a) * r));
    const y = Math.min(height * 0.86, Math.max(height * 0.12, cy + Math.sin(a) * r));
    poppers.push({
      x, y,
      dx: (x - width / 2) * 0.06, dy: (y - height / 2) * 0.06,   // wandern leicht nach außen, wie bei Perspektive
      delay: between(POP_DELAY), flight: between(POP_FLIGHT), age: 0, phase: Math.random() * 6.28,
    });
  }
}

/** Mini-Explosion eines Knistersterns: kleine weiße Funken, kurzer Blitz, Plopp. */
function pop(q: Popper) {
  for (let i = 0; i < POP_SPARKS; i++) {
    const p = nextStar();
    const ang = Math.random() * Math.PI * 2, v = 110 + Math.random() * 150;
    p.x = q.x; p.y = q.y;
    p.vx = Math.cos(ang) * v; p.vy = Math.sin(ang) * v;
    p.z = 0;
    p.life = 0.45 + Math.random() * 0.45;
    p.hue = 215;                                  // Light-Mode: kühles Blau, Dark-Mode: weiß (white = true)
    p.white = true;
    p.cls = Math.random() < 0.7 ? 0 : 1;
    p.r = p.cls === 0 ? 0.8 + Math.random() * 0.4 : 1.3 + Math.random() * 0.5;
    p.big = false;
  }
  flashes.push({ x: q.x, y: q.y, hue: 215, age: 0, scale: 0.45 });
  playPop((q.x / width) * 2 - 1);
}

/** Aktualisiert Raketen, Sterne und Blitze. Gibt zurück, ob noch etwas läuft. */
function update(dts: number, now: number): boolean {
  let busy = shells.length > 0 || flashes.length > 0;
  for (let i = shells.length - 1; i >= 0; i--) {
    const sh = shells[i];
    if (now < sh.launchAt) continue;
    const pos = shellPos(sh, now - sh.launchAt);
    if (pos.k >= 1) {
      explode(pos.x, pos.y, sh.hue, sh.big);
      shells.splice(i, 1);
      continue;
    }
    // kleine Funken, die die Rakete verliert
    const p = nextStar();
    p.cls = 0;
    p.r = 0.7 + Math.random() * 0.4;
    p.x = pos.x + (Math.random() - 0.5) * 4;
    p.y = pos.y + 4;
    p.vx = (Math.random() - 0.5) * 40;
    p.vy = 30 + Math.random() * 60;
    p.life = 0.5 + Math.random() * 0.4;
    p.hue = sh.hue;
  }
  for (let i = poppers.length - 1; i >= 0; i--) {
    const q = poppers[i];
    q.age += dts;
    if (q.age < q.delay) continue;
    q.x += q.dx * dts; q.y += q.dy * dts;
    if (q.age - q.delay >= q.flight) { pop(q); poppers.splice(i, 1); }
  }
  if (poppers.length > 0) busy = true;
  const decay = Math.exp(-DRAG * dts);
  for (const p of stars) {
    if (!p.alive) continue;
    p.age += dts;
    p.vy += GRAVITY * dts;
    p.vx *= decay;
    p.vy *= decay;
    p.x += p.vx * dts;
    p.y += p.vy * dts;
    if (p.age > p.life || p.y > height + 20 || p.x < -40 || p.x > width + 40) p.alive = false;
    else busy = true;
  }
  for (let i = flashes.length - 1; i >= 0; i--) {
    flashes[i].age += dts;
    if (flashes[i].age > 0.4) flashes.splice(i, 1);
  }
  return busy || shells.length > 0 || flashes.length > 0 || poppers.length > 0;
}

/** Glitzerkreuz bei den größeren Sternen, wenn sie gerade aufblitzen. */
function drawCross(p: Star, hue: number, alpha: number, tw: number, light: boolean) {
  if (!ctx || p.cls < 1 || tw <= (p.cls === 2 ? 0.55 : 0.85)) return;
  const len = p.r * (3 + 6 * tw) * (p.cls === 2 ? 1.6 : 1);
  ctx.globalAlpha = Math.min(1, alpha * 0.9);
  ctx.lineWidth = 1;
  ctx.strokeStyle = light ? hsla(hue, 90, 40, 1) : hsla(hue, 100, 90, 1);
  ctx.beginPath();
  ctx.moveTo(p.x - len, p.y); ctx.lineTo(p.x + len, p.y);
  ctx.moveTo(p.x, p.y - len); ctx.lineTo(p.x, p.y + len);
  if (p.cls === 2) {
    const d = len * 0.5;
    ctx.moveTo(p.x - d, p.y - d); ctx.lineTo(p.x + d, p.y + d);
    ctx.moveTo(p.x - d, p.y + d); ctx.lineTo(p.x + d, p.y - d);
  }
  ctx.stroke();
}

function drawFrame(now: number, light: boolean) {
  if (!ctx) return;
  const atlas = getAtlas(light);

  // Aufleuchten beim Platzen
  for (const f of flashes) {
    const k = f.age / 0.4;
    const size = (220 + 260 * k) * (f.big ? 4 : 1) * (f.scale ?? 1);
    ctx.globalAlpha = 0.55 * (1 - k) * (1 - k);
    ctx.drawImage(atlas[light ? hueBucket(f.hue) : 36], f.x - size / 2, f.y - size / 2, size, size);
  }

  // Knistersterne: wachsen, flackern und funkeln, bis sie plopp machen (sie kommen auf einen zu)
  for (const q of poppers) {
    const f = q.age - q.delay;
    if (f < 0) continue;
    const t = Math.min(1, f / q.flight);
    const size = 18 + 72 * t ** 2.2;
    const tw = 0.7 + 0.3 * Math.sin(now * 0.03 + q.phase);
    ctx.globalAlpha = Math.min(1, t * 5) * tw;
    ctx.drawImage(getPopSprite(light), q.x - size / 2, q.y - size / 2, size, size);
    if (t > 0.25) {                                         // Funkelkreuz, wird zum Plopp hin größer
      const len = size * 0.65;
      ctx.globalAlpha = Math.min(1, (t - 0.25) * 3) * tw;
      ctx.lineWidth = 1;
      ctx.strokeStyle = light ? 'hsla(215, 70%, 40%, 1)' : 'rgba(255,255,255,1)';
      ctx.beginPath();
      ctx.moveTo(q.x - len, q.y); ctx.lineTo(q.x + len, q.y);
      ctx.moveTo(q.x, q.y - len); ctx.lineTo(q.x, q.y + len);
      ctx.stroke();
    }
  }

  // Raketen: heller Kopf mit Schweif
  for (const sh of shells) {
    if (now < sh.launchAt) continue;
    const el = now - sh.launchAt;
    const sprite = atlas[light ? hueBucket(sh.hue) : 36];
    for (let j = 0; j < 6; j++) {
      const pos = shellPos(sh, el - j * 26);
      const size = (20 - j * 2.2) * (sh.big ? 1.8 : 1);
      ctx.globalAlpha = (1 - j / 6) * (j === 0 ? 1 : 0.55);
      ctx.drawImage(sprite, pos.x - size / 2, pos.y - size / 2, size, size);
    }
  }

  // Sterne
  for (const p of stars) {
    if (!p.alive) continue;
    const s = 0.5 + 0.5 * Math.sin(now * 0.001 * p.speed + p.phase);
    const tw = s * s * s;
    const fade = Math.min(1, p.age / 0.05) * Math.min(1, (p.life - p.age) / 0.8);
    const alpha = (light ? 0.4 + 0.6 * tw : 0.28 + 0.72 * tw) * fade;
    if (alpha < 0.01) continue;
    const hue = p.hue + p.hueOff;
    const sprite = atlas[!light && p.white ? 36 : hueBucket(hue)];
    const size = p.r * SIZE * (0.8 + 0.5 * tw) * (0.65 + 0.35 * fade) * (1 + DEPTH_SIZE * p.z) * (p.big ? BIG_SIZE : 1);

    ctx.globalAlpha = alpha;
    ctx.drawImage(sprite, p.x - size / 2, p.y - size / 2, size, size);

    // Schnelle Sterne ziehen einen Schweif in Flugrichtung
    if (Math.hypot(p.vx, p.vy) > 260) {
      ctx.globalAlpha = alpha * 0.35;
      ctx.drawImage(sprite, p.x - p.vx * 0.018 - size / 2, p.y - p.vy * 0.018 - size / 2, size, size);
      ctx.globalAlpha = alpha * 0.16;
      ctx.drawImage(sprite, p.x - p.vx * 0.036 - size / 2, p.y - p.vy * 0.036 - size / 2, size, size);
    }
    drawCross(p, hue, alpha, tw, light);
  }
  ctx.globalAlpha = 1;
}

function frame(now: number) {
  if (!ctx) return;
  const dt = lastFrame ? Math.min(100, now - lastFrame) : 16;
  lastFrame = now;
  ctx.clearRect(0, 0, width, height);

  const busy = update(Math.max(1, dt) / 1000, now);
  const light = isLight();
  // Dark: „lighter“ mischt Farben additiv wie Neonlicht. Light: additiv wäre auf hellem Grund unsichtbar.
  ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
  drawFrame(now, light);
  ctx.globalCompositeOperation = 'source-over';

  frameId = busy ? requestAnimationFrame(frame) : null;
  if (!busy) ctx.clearRect(0, 0, width, height); // nichts läuft mehr: keine Rechenzeit, Canvas leer
}

function start() {
  if (frameId === null && !document.hidden) {
    lastFrame = 0;
    frameId = requestAnimationFrame(frame);
  }
}

function stop() {
  if (frameId !== null) { cancelAnimationFrame(frameId); frameId = null; }
  for (const p of stars) p.alive = false;
  shells = [];
  flashes.length = 0;
  poppers.length = 0;
  if (ctx) ctx.clearRect(0, 0, width, height);
}

/** Eine einzelne, sehr große Bombe: steigt langsamer auf, mittig, und platzt zu einer riesigen Kugel. */
function launchBigBomb(): void {
  if (!ensureCanvas() || !width) return;
  shells.push({
    x0: width * (0.42 + Math.random() * 0.16),
    topY: height * 0.36,          // steigt höher als eine normale Rakete, bevor sie platzt
    riseMs: 1550,
    launchAt: performance.now(),
    hue: Math.random() * 360,
    big: true,
  });
  start();
}

export const BUTTON_COOLDOWN_MS = 2000;   // Sperre des Footer-Buttons gegen Spammen
let lastButtonFire = -Infinity;
let buttonPresses = 0;                   // zählt nur Klicks, die wirklich gezündet haben

/** Für den Footer-Button: zündet höchstens alle BUTTON_COOLDOWN_MS. Der 1. und jeder 3. Klick (3., 6., 9. …) zündet eine einzelne große Bombe, sonst die normale Salve.
 *  Gibt zurück, was gezündet wurde ('big' oder 'volley'), bzw. null, wenn die Sperre noch läuft. */
export function launchFromButton(): 'big' | 'volley' | null {
  const now = performance.now();
  if (now - lastButtonFire < BUTTON_COOLDOWN_MS) return null;
  lastButtonFire = now;
  buttonPresses += 1;
  if (buttonPresses === 1 || buttonPresses % 3 === 0) { launchBigBomb(); return 'big'; }   // 1., 3., 6., 9. … Klick: eine einzelne, richtig große Bombe
  launchFireworks();                                                                       // sonst die normale Salve
  return 'volley';
}

/** Zündet das Feuerwerk automatisch, sobald man unten an der Seite ankommt. */
export function initEndFireworks(): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const root = document.documentElement;
  const distanceToEnd = () => root.scrollHeight - (window.innerHeight + window.scrollY);
  let armed = true;
  let timers: number[] = [];

  const fire = () => {
    timers.forEach(clearTimeout);
    timers = [];
    launchFireworks();
    for (let i = 1; i < VOLLEYS; i++) {
      // weitere Salven nur, solange man noch unten ist
      timers.push(window.setTimeout(() => { if (distanceToEnd() < window.innerHeight * REARM_VIEWPORTS) launchFireworks(); }, i * VOLLEY_GAP_MS));
    }
  };

  const check = () => {
    const d = distanceToEnd();
    const scrollable = root.scrollHeight > window.innerHeight * 1.5; // kurze Seiten gelten nicht als „am Ende“
    if (armed && scrollable && d <= END_TOLERANCE_PX) {
      armed = false;
      fire();
    } else if (!armed && d > window.innerHeight * REARM_VIEWPORTS) {
      armed = true;
    }
  };

  window.addEventListener('scroll', check, { passive: true });
  window.addEventListener('resize', check);
}
