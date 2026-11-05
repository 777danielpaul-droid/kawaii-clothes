/* GESTASHT: Wolken-Header (6 Schichten, Canvas-Kacheln, Parallax). Nicht eingebunden.
   Wieder einbauen: Inhalt in src/main.ts einfügen (nach dem Preloader; braucht $, reduce, root), clouds.css in main.css, clouds.html in <header class="bar"> als erstes Kind. */
/* ---- Wolken-Header: volumetrische Wolken, einmalig als nahtlose Kachel (5:1) per fbm-Rauschen + Lichtberechnung erzeugt ---- */
type RGB = [number, number, number];
interface CloudOpts { seed: number; n: number; size: number; soft: number; base: number; gain: number }
const PASTEL: RGB[] = [[190, 170, 255], [156, 180, 255], [170, 208, 255], [178, 196, 250], [204, 176, 250]];  // lila · blau
function cloudTile(o: CloudOpts): Promise<string> {
  const Wp = 1000, Hp = 200, cv = document.createElement('canvas'); cv.width = Wp; cv.height = Hp;
  const ctx = cv.getContext('2d')!, img = ctx.createImageData(Wp, Hp);
  const hash = (x: number, y: number) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(o.seed, 2147483647)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const noise = (x: number, y: number, cx: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
    const x0 = ((xi % cx) + cx) % cx, x1 = (x0 + 1) % cx, a = hash(x0, yi), b = hash(x1, yi), c = hash(x0, yi + 1), d = hash(x1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  const fbm = (x: number, y: number) => { let s = 0, a = 0.5, n = 0; for (let k = 0, cx = 5; k < 4; k++, cx *= 2, a *= 0.5) { s += a * noise(x / Wp * cx, y / Wp * cx, cx); n += a; } return s / n; };
  const sm = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  /* Einzelne Wolken = Haufen aus 5–7 weichen Kugeln, je Wolke ein Pastellton; zwischen den Wolken bleibt Himmel */
  const rnd = (i: number, j: number) => hash(i * 7 + 3, j * 13 + 5), cs: { x: number; y: number; r: number; t: RGB }[] = [];
  for (let i = 0; i < o.n; i++) {
    const cx = (i + 0.15 + 0.7 * rnd(i, 0)) / o.n * Wp, w = Hp * o.size * (1.2 + 0.8 * rnd(i, 1)), m = 5 + Math.floor(rnd(i, 2) * 3), t = PASTEL[Math.floor(rnd(i, 3) * PASTEL.length)];
    for (let j = 0; j < m; j++) {
      const u = (j / (m - 1)) * 2 - 1;
      cs.push({ x: cx + u * w, y: Hp * 0.08 + Hp * o.size * (0.2 * (1 - Math.abs(u)) + 0.15 * rnd(i, 4 + j)), r: Hp * o.size * (0.9 + 0.5 * rnd(i, 10 + j)) * (1 - 0.5 * Math.abs(u)), t });
    }
  }
  const dens = new Float32Array(Wp * Hp), cr = new Float32Array(Wp * Hp), cg = new Float32Array(Wp * Hp), cb = new Float32Array(Wp * Hp);
  for (let y = 0; y < Hp; y++) for (let x = 0; x < Wp; x++) {
    let d = 0, sr = 0, sg = 0, sb = 0;
    for (const c of cs) {
      const dx = ((x - c.x + Wp / 2) % Wp + Wp) % Wp - Wp / 2, dy = y - c.y, q = (dx * dx + dy * dy) / (c.r * c.r);
      if (q < 1) { const f = (1 - q) * (1 - q); d += f; sr += c.t[0] * f; sg += c.t[1] * f; sb += c.t[2] * f; }
    }
    const i = y * Wp + x;
    if (d > 0) { dens[i] = d + (fbm(x, y) - 0.5) * 0.42 * Math.min(1, d * 4); cr[i] = sr / d; cg[i] = sg / d; cb[i] = sb / d; }
  }
  const at = (x: number, y: number) => dens[Math.min(Hp - 1, Math.max(0, y)) * Wp + (((x % Wp) + Wp) % Wp)];
  for (let y = 0; y < Hp; y++) for (let x = 0; x < Wp; x++) {
    const i = y * Wp + x, d = dens[i], lit = Math.min(1, Math.max(0, o.base + (d - at(x - 6, y - 10)) * o.gain)), p = i * 4;   // Licht von links oben, weich wie Zuckerwatte
    const k = (v: number) => { const t = v + (255 - v) * o.soft, sh = t * 0.9; return sh + (255 - sh) * lit; };
    img.data[p] = k(cr[i]); img.data[p + 1] = k(cg[i]); img.data[p + 2] = k(cb[i]);
    img.data[p + 3] = sm(0.1, 0.4, d) * (1 - sm(0.9, 1, y / Hp)) * 255;
  }
  ctx.putImageData(img, 0, 0);
  return new Promise(res => cv.toBlob(b => res(URL.createObjectURL(b!)), 'image/png'));
}

/* 6 Wolkenschichten, hinten → vorn. k = Scroll-Faktor, drift = Eigenbewegung px/s (edge-Schichten stehen still), m = Maus-Parallax, h = Höhe (Anteil Himmel), edge = nur in den oberen Ecken links/rechts verdichtet; n = Wolken pro Kachel, size = Wolkengröße, soft = Aufhellung zu Pastell */
interface Layer extends CloudOpts { m: number; k: number; drift: number; h: number; o: number; edge: boolean }
const SKY: Layer[] = [
  { seed: 41, n: 5, size: 0.17, soft: 0.05, base: 0.7,  gain: 1.2, m: 0.1, k: 0.006, drift: 0.6, h: 0.62, o: 0.75, edge: false },
  { seed: 23, n: 5, size: 0.2,  soft: 0.1,  base: 0.72, gain: 1.4, m: 0.15, k: 0.02, drift: 1.5, h: 0.8,  o: 0.85, edge: false },
  { seed: 58, n: 4, size: 0.26, soft: 0.15, base: 0.74, gain: 1.6, m: 0.25, k: 0, drift: 0, h: 1,    o: 0.9,  edge: true },
  { seed: 7,  n: 3, size: 0.3,  soft: 0.2,  base: 0.78, gain: 1.8, m: 0.35, k: 0.07, drift: 4, h: 0.8,  o: 0.92, edge: false },
  { seed: 91, n: 3, size: 0.36, soft: 0.25, base: 0.8,  gain: 2,   m: 0.5, k: 0, drift: 0, h: 1,    o: 0.95, edge: true },
  { seed: 12, n: 2, size: 0.3,  soft: 0.3,  base: 0.84, gain: 2,   m: 0.7, k: 0, drift: 0, h: 0.7,  o: 0.9,  edge: true },
];
const skyEl = $('sky');
const skyLayers = SKY.map((c, i) => {
  const wrap = document.createElement('div'), el = document.createElement('i');
  wrap.className = 'cl-wrap' + (c.edge ? ' edge' : ''); el.className = 'cl';
  wrap.style.cssText = `--h:${c.h * 100}%;--o:${c.o};--bob:${5 + i * 1.3}s`;
  wrap.appendChild(el); skyEl.appendChild(wrap);
  return { el, k: c.k, drift: c.drift, m: c.m, W: 0 };
});
const skyLayout = () => skyLayers.forEach(l => { l.W = l.el.offsetHeight * 5; l.el.style.width = innerWidth + l.W + 240 + 'px'; });
skyLayout(); addEventListener('resize', skyLayout); addEventListener('load', skyLayout);
SKY.forEach((c, i) => setTimeout(() => cloudTile(c).then(u => { skyLayers[i].el.style.backgroundImage = `url(${u})`; skyLayout(); }), 30 + i * 70));
if (!reduce) {
  let nx = 0, ny = 0;
  addEventListener('pointermove', e => { nx = e.clientX / innerWidth - 0.5; ny = e.clientY / innerHeight - 0.5; });
  (function skyLoop(now: number) {
    if (!root.classList.contains('menu-open')) {
      skyLayers.forEach(l => {
        const x = -((((scrollY * l.k + now / 1000 * l.drift) % l.W) + l.W) % l.W) - nx * l.m * 60;
        l.el.style.transform = `translate3d(${x.toFixed(1)}px,${(ny * l.m * 8).toFixed(1)}px,0)`;
      });
    }
    requestAnimationFrame(skyLoop);
  })(performance.now());
}

