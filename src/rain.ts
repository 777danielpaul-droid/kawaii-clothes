/* Wetter: fester Vollbild-Canvas hinter allem (Dino, Texte, Karten). Modi: Klar, Regen, Schnee.
   Drei Tiefenebenen mit eigenem Tempo, Scroll-Parallax (hintere Teilchen wandern weniger mit),
   Farbe folgt dem Dark/Light-Theme. Intensität und Wind sind zur Laufzeit einstellbar (siehe cms.ts). */
interface Drop { x: number; y: number; l: number; v: number; p: number }
interface Layer { share: number; w: number; a: number; v: [number, number]; l: [number, number]; par: number; drops: Drop[] }

export interface Weather { mode: 'clear' | 'rain' | 'snow'; intensity: number; wind: number }   // intensity 20–200 (%), wind −100…100
export const WEATHER_DEFAULT: Weather = { mode: 'rain', intensity: 100, wind: 0 };
export interface WeatherApi { get(): Weather; set(patch: Partial<Weather>): void }

const WIND = 0.2;                       // Grundneigung der Tropfen pro Höhe (fallen leicht nach links)
const LIGHT: [number, number, number] = [84, 140, 208];
const DARK: [number, number, number] = [158, 198, 255];
const SNOW_LIGHT: [number, number, number] = [120, 150, 200];
const SNOW_DARK: [number, number, number] = [235, 242, 255];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export function initRain(canvas: HTMLCanvasElement, reduceMotion: boolean): WeatherApi {
  const state: Weather = { ...WEATHER_DEFAULT };
  const get = () => ({ ...state });
  if (reduceMotion) return { get, set: p => { Object.assign(state, p); } };

  const ctx = canvas.getContext('2d')!;
  const root = document.documentElement;
  const layers: Layer[] = [
    { share: 0.46, w: 1,   a: 0.24, v: [9, 13],  l: [10, 18], par: 0.10, drops: [] },   // hinten: fein, langsam, blass
    { share: 0.32, w: 1.4, a: 0.40, v: [15, 21], l: [16, 28], par: 0.22, drops: [] },
    { share: 0.22, w: 2,   a: 0.58, v: [23, 31], l: [26, 44], par: 0.40, drops: [] },   // vorne: kräftig, schnell
  ];
  let W = 0, H = 0, dpr = 1, last = performance.now(), lastY = scrollY;

  function seed() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const base = Math.min(260, Math.max(70, Math.round(W * H / 9500)));
    const total = Math.round(base * (state.intensity / 100) * (state.mode === 'snow' ? 0.7 : 1));
    layers.forEach(L => {
      L.drops = Array.from({ length: Math.round(total * L.share) }, () => ({
        x: rnd(-40, W + 40), y: rnd(-60, H + 60), l: rnd(...L.l), v: rnd(...L.v), p: rnd(0, 6.283),
      }));
    });
  }

  function frame(now: number) {
    requestAnimationFrame(frame);
    const dt = Math.min(50, now - last) / 16.667; last = now;
    const dy = scrollY - lastY; lastY = scrollY;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (state.mode === 'clear') return;
    const dark = root.dataset.theme === 'dark';
    const snow = state.mode === 'snow';
    const [r, g, b] = snow ? (dark ? SNOW_DARK : SNOW_LIGHT) : (dark ? DARK : LIGHT);
    const wv = WIND + state.wind / 100 * 0.5;                // Neigung der Regentropfen
    ctx.lineCap = 'round';
    for (const L of layers) {
      ctx.lineWidth = L.w;
      ctx.strokeStyle = `rgba(${r},${g},${b},${L.a})`;
      ctx.fillStyle = `rgba(${r},${g},${b},${Math.min(1, L.a + 0.3)})`;
      ctx.beginPath();
      for (const d of L.drops) {
        if (snow) {
          d.y += d.v * 0.16 * dt - dy * L.par;
          d.x += (Math.sin(now * 0.0012 + d.p) * 0.5 - state.wind / 100 * 1.4) * dt;   // Schweben + Wind
        } else {
          d.y += d.v * dt - dy * L.par;
          d.x -= d.v * dt * wv;
        }
        if (d.y > H + d.l) { d.y = -d.l - rnd(0, H * 0.15); d.x = rnd(-40, W + 40); d.v = rnd(...L.v); }
        else if (d.y < -d.l - H * 0.2) { d.y = H + d.l * 0.5; d.x = rnd(-40, W + 40); }
        if (d.x < -40) d.x += W + 80; else if (d.x > W + 40) d.x -= W + 80;
        if (snow) { const rr = L.w * 1.3; ctx.moveTo(d.x + rr, d.y); ctx.arc(d.x, d.y, rr, 0, 6.283); }
        else { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.l * wv, d.y + d.l); }
      }
      if (snow) ctx.fill(); else ctx.stroke();
    }
  }

  seed();
  requestAnimationFrame(frame);
  let t = 0, lw = innerWidth;
  addEventListener('resize', () => {
    clearTimeout(t);
    t = window.setTimeout(() => { if (innerWidth !== lw) { lw = innerWidth; seed(); } }, 200);   // mobile Adressleiste: Höhenänderung ignorieren
  });
  return {
    get,
    set(patch) {
      const redo = (patch.intensity !== undefined && patch.intensity !== state.intensity) || (patch.mode !== undefined && patch.mode !== state.mode);
      Object.assign(state, patch);
      if (redo) seed();
    },
  };
}
