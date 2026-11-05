/* Scroll-gesteuerte Frame-Sequenz auf Canvas (Dino-Hero, freigestellt, Regen läuft dahinter).
   Sets: xl 2560 px (auf den Dino-Bereich zugeschnitten, für alle Querformat-Schirme; kleinere Schirme dekodieren herunterskaliert) · mob (Hochformat).
   Alle 38 Frames liegen komprimiert im Speicher, dekodiert ist nur ein Fenster rund um die Scrollposition
   (spart Arbeitsspeicher, damit die Frames in voller Auflösung dekodiert werden können). */
const FRAME_COUNT = 38;
const SRC_W = 1920, SRC_H = 984;   // Bezugsraster der Layout-Mathematik (oben 96 px Wasserzeichen abgeschnitten)
const EYE_IN_FRAME = 0.17, EYE_IN_VIEW = 0.45;
const MOB_W = 1056, MOB_H = 1041;  // Hochformat: Ausschnitt um den Dino (x 16–68 %), füllt die Bildschirmhöhe, schwenkt beim Scrollen von Gesicht zu Monokel
/* full/fh: Größe des ganzen Frames in px · x/w: Bereich, den die Bilddatei abdeckt (im 1920er-Raster) */
interface SetInfo { full: number; fh: number; x: number; w: number }
const SETS: Record<string, SetInfo> = {
  xl: { full: 2560, fh: 1312, x: 0, w: 1587 },
  mob: { full: MOB_W, fh: MOB_H, x: 0, w: SRC_W },
};
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export const HERO_FRAME_COUNT = FRAME_COUNT;

export function initFrames(canvas: HTMLCanvasElement, reduceMotion: boolean, onProgress: (p: number) => void) {
  const ctx = canvas.getContext('2d')!;   // mit Alpha: der Dino ist freigestellt, dahinter läuft der Regen
  const bitmaps: (ImageBitmap | null)[] = new Array(FRAME_COUNT).fill(null);
  const blobs: (Blob | null)[] = new Array(FRAME_COUNT).fill(null);
  const pending = new Set<number>();
  let blobSet = '', fetched = 0, lastC = -1;
  let portrait = false, dx = 0, dy = 0, dw = 0, dh = 0, decW = 0, set = 'xl';
  let fpos = 0, anchors: [number, number][] = [], last = '', dirty = true, queued = false, token = 0;
  /* Eigene Hero-Animation (CMS): ersetzt die Dino-Frames; undurchsichtig, füllt den Bildschirm (cover), sw/sh = Bezugsraster */
  let custom: { blobs: Blob[]; w: number; h: number } | null = null, sw = SRC_W, sh = SRC_H;

  const url = (i: number) => `${import.meta.env.BASE_URL}frames/${set}/${String(i).padStart(2, '0')}.webp`;
  const radius = () => (set === 'mob' ? 5 : 4);
  const nearest = (i: number) => {
    if (bitmaps[i]) return bitmaps[i];
    for (let d = 1; d < FRAME_COUNT; d++) { const b = bitmaps[i - d] ?? bitmaps[i + d]; if (b) return b; }
    return null;
  };

  function draw() {
    const f = clamp(fpos, 0, FRAME_COUNT - 1), fl = Math.min(FRAME_COUNT - 1, Math.floor(f)), frac = f - fl;
    const info = SETS[set], k = dw / sw;
    const ddx = portrait ? (canvas.width - dw) * (0.3 + 0.7 * f / (FRAME_COUNT - 1)) : dx;
    const rx = ddx + info.x * k, rw = info.w * k;   // Ausschnitt-Versatz (xl ist seitlich zugeschnitten)
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const a = nearest(fl); if (!a) return;
    const b = fl + 1 < FRAME_COUNT ? bitmaps[fl + 1] : null;
    if (b && frac > 0.015) {
      /* Überblendung freigestellter Frames: (1-t)·A + t·B addiert (premultiplied), sonst bliebe A als Geisterbild stehen, wo B transparent ist */
      ctx.globalAlpha = 1 - frac; ctx.drawImage(a, rx, dy, rw, dh);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = frac; ctx.drawImage(b, rx, dy, rw, dh);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    } else ctx.drawImage(a, rx, dy, rw, dh);
  }

  /* Stückweise linear zwischen Ankern [scrollY, Frame]; ohne Anker: linear über die ganze Seite */
  function frameAt(y: number) {
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const pts: [number, number][] = [[0, 0], ...anchors, [max, FRAME_COUNT - 1]];
    for (let i = 1; i < pts.length; i++) {
      if (y <= pts[i][0] || i === pts.length - 1) {
        const [x0, f0] = pts[i - 1], [x1, f1] = pts[i];
        return f0 + (f1 - f0) * clamp((y - x0) / Math.max(1, x1 - x0), 0, 1);
      }
    }
    return 0;
  }

  /* Dekodier-Fenster: nur Frames nahe der Scrollposition liegen als Bitmap vor, die übrigen werden freigegeben */
  async function decode(i: number) {
    const blob = blobs[i]; if (!blob) return;
    pending.add(i);
    const my = token, s = set, info = SETS[s], sc = Math.min(1, decW / info.full);
    try {
      const bm = sc > 0.995
        ? await createImageBitmap(blob)
        : await createImageBitmap(blob, { resizeWidth: Math.round(info.full * info.w / sw * sc), resizeHeight: Math.round(info.fh * sc), resizeQuality: 'high' });
      if (my !== token || s !== set || Math.abs(i - Math.round(fpos)) > radius() + 2) bm.close();
      else { bitmaps[i]?.close(); bitmaps[i] = bm; dirty = true; request(); }
    } catch { /* Frame defekt: ignorieren */ }
    pending.delete(i);
    ensure(Math.round(fpos));
  }
  function ensure(c: number) {
    const r = radius();
    for (let i = 0; i < FRAME_COUNT; i++) if (bitmaps[i] && Math.abs(i - c) > r + 2) { bitmaps[i]!.close(); bitmaps[i] = null; }
    for (let d = 0; d <= r && pending.size < 3; d++) {
      for (const i of d ? [c - d, c + d] : [c]) {
        if (i < 0 || i >= FRAME_COUNT || bitmaps[i] || pending.has(i) || !blobs[i] || pending.size >= 3) continue;
        decode(i);
      }
    }
  }

  function render() {
    queued = false;
    fpos = reduceMotion ? 0 : frameAt(scrollY);
    const c = Math.round(fpos);
    if (c !== lastC) { lastC = c; ensure(c); }
    const key = fpos.toFixed(3);
    if (dirty || key !== last) { draw(); last = key; dirty = false; }
  }
  const request = () => { if (!queued) { queued = true; requestAnimationFrame(render); } };

  function layout() {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    const cw = canvas.width, ch = canvas.height;
    if (custom) {
      sw = custom.w; sh = custom.h; set = 'custom'; portrait = false;
      SETS.custom = { full: custom.w, fh: custom.h, x: 0, w: custom.w };
      const scale = Math.max(cw / sw, ch / sh);   // cover, mittig
      dw = Math.round(sw * scale); dh = Math.round(sh * scale);
      dx = Math.round((cw - dw) / 2); dy = Math.round((ch - dh) / 2);
    } else {
      sw = SRC_W; sh = SRC_H;
      const cover = cw / ch >= 1.5;
      const scale = cover ? Math.max(cw / SRC_W, ch / SRC_H) : cw / (SRC_W * 0.72);   // Hochformat: Dino (linke ~70 %) füllt die Breite
      dw = Math.round(SRC_W * scale); dh = Math.round(SRC_H * scale); dx = cover ? Math.round((cw - dw) / 2) : 0;
      dy = ch * EYE_IN_VIEW - dh * EYE_IN_FRAME;
      dy = Math.round(cover ? Math.min(0, Math.max(ch - dh, dy)) : Math.min(ch - dh, Math.max(0, dy)));
      set = 'xl';
      portrait = cw / ch < 0.9;
      if (portrait) { dh = ch; dw = Math.round(ch * MOB_W / MOB_H); dx = 0; dy = 0; set = 'mob'; }
    }
    decW = Math.min(dw, SETS[set].full);   // nie über die Originalauflösung des Sets hinaus dekodieren
    bitmaps.forEach((b, i) => { b?.close(); bitmaps[i] = null; });
    lastC = -1; dirty = true;
  }

  async function load() {
    const my = ++token, s = set;
    if (blobSet !== s) { blobs.fill(null); fetched = 0; blobSet = s; }
    onProgress(fetched / FRAME_COUNT);
    const center = Math.round(fpos);
    const order = [...Array(FRAME_COUNT).keys()].filter(i => !blobs[i]).sort((a, b) => Math.abs(a - center) - Math.abs(b - center));
    ensure(center);
    const one = async (i: number) => {
      try {
        const blob = custom ? custom.blobs[i] : await (await fetch(url(i))).blob();
        if (my !== token || s !== set) return;
        blobs[i] = blob; fetched++;
        onProgress(fetched / FRAME_COUNT); ensure(Math.round(fpos));
      } catch { /* Frame fehlt: ignorieren */ }
    };
    if (!order.length) return;
    await one(order[0]);
    let n = 1;
    const worker = async () => { while (n < order.length && my === token) await one(order[n++]); };
    await Promise.all([worker(), worker(), worker()]);
  }

  layout(); render(); load();
  const api = {
    setAnchors(a: [number, number][]) { anchors = a; dirty = true; request(); },
    /** Ersetzt die Hero-Animation durch eigene Frames (genau FRAME_COUNT Stück); null = Original-Dino. */
    setCustom(frames: Blob[] | null, w = 0, h = 0) {
      custom = frames && frames.length === FRAME_COUNT && w > 0 && h > 0 ? { blobs: frames, w, h } : null;
      token++; blobs.fill(null); fetched = 0; blobSet = ''; pending.clear();
      bitmaps.forEach((b, i) => { b?.close(); bitmaps[i] = null; });
      document.documentElement.classList.toggle('hero-custom', !!custom);
      layout(); render(); load();
    },
  };
  if (!reduceMotion) addEventListener('scroll', request, { passive: true });
  let t = 0, lw = innerWidth, lh = innerHeight;
  addEventListener('resize', () => {
    clearTimeout(t);
    t = window.setTimeout(() => {
      if (innerWidth === lw && Math.abs(innerHeight - lh) < 150) return request();
      lw = innerWidth; lh = innerHeight; layout(); render(); load();
    }, 200);
  });
  return api;
}
