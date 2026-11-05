/* Kirschblüten: scroll-getriggert. Beim Scrollen lösen sich oben neue Blütenblätter und segeln nach unten.
   Jedes Blatt hat sein eigenes, unberechenbares Verhalten: es kippt und dreht sich (3D-Flip), fällt schneller wenn es
   kantig steht und langsamer wenn es flach liegt, wird von zufälligen Böen seitlich getragen und bekommt ab und zu
   Aufwind. Scrollen selbst wirkt als Windstoß. Danach schweben die Blätter noch aus, bis sie unten verschwinden. */

interface Petal {
  x: number; y: number; s: number; depth: number;
  vy: number; vx: number; tvx: number; nextGust: number; lift: number;
  rot: number; rotV: number; flip: number; flipV: number;
  sw: number; swF: number; swPh: number; t: number; tone: number;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const MAX = 80;                 // maximal gleichzeitig sichtbare Blätter
const STEP = 200;               // alle X px Scrollweg kommen neue Blätter dazu

/* Blütenblatt-Umriss: Spitze mit der typischen Kirschblüten-Kerbe oben, runde Basis unten (Einheitsgröße, Mitte = 0/0) */
const PETAL = new Path2D('M0 .5C-.5 .3-.62-.25-.2-.5L0-.34L.2-.5C.62-.25.5 .3 0 .5Z');

const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const DEEP = [246, 148, 188], PINK = [255, 192, 214], LIGHT = [255, 234, 243];

export function initPetals(canvas: HTMLCanvasElement, reduceMotion: boolean) {
  if (reduceMotion) return { burst: (_n?: number) => {}, setEnabled: (_v: boolean) => {} };
  const ctx = canvas.getContext('2d')!;
  const petals: Petal[] = [];
  let W = 0, H = 0, dpr = 1, running = false, last = 0;
  let sY = scrollY, pendingDy = 0, accum = 0, wind = 0;
  let enabled = true;             // im CMS abschaltbar

  function size() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }

  function spawn(spread = 120) {
    if (!enabled || petals.length >= MAX) return;
    const s = rnd(12, 27), depth = s / 27;                       // große Blätter = nah = schneller
    petals.push({
      x: rnd(-20, W + 20), y: -s * 2 - rnd(0, spread), s, depth,
      vy: rnd(38, 72) * (0.6 + depth * 0.6), vx: 0, tvx: rnd(-30, 30), nextGust: rnd(0.3, 1.5), lift: 0,
      rot: rnd(0, Math.PI * 2), rotV: rnd(-1.1, 1.1), flip: rnd(0, Math.PI * 2), flipV: rnd(1.2, 3.6) * (Math.random() < .5 ? -1 : 1),
      sw: rnd(10, 38), swF: rnd(0.8, 2.2), swPh: rnd(0, 6.28), t: 0, tone: Math.random(),
    });
  }

  function burst(n = 26) {
    for (let i = 0; i < n; i++) spawn(H * 0.7);              // gestaffelt über dem Bildrand, regnen nacheinander rein
    kick();
  }

  function draw(p: Petal) {
    const c = Math.cos(p.flip), broad = Math.abs(c);
    const base = mix(PINK, DEEP, p.tone * 0.55);
    const col = c > 0 ? mix(base, LIGHT, 0.45 * broad) : mix(base, DEEP, 0.25 + 0.2 * (1 - broad));   // Rückseite etwas satter
    ctx.save();
    ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(p.s * Math.max(0.12, broad), p.s * 1.15);
    ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
    ctx.globalAlpha = 0.62 + 0.3 * p.depth;
    ctx.fill(PETAL);
    ctx.lineWidth = 1.3 / p.s; ctx.strokeStyle = 'rgba(214,100,146,.5)';
    ctx.stroke(PETAL);
    ctx.restore();
  }

  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const dy = pendingDy; pendingDy = 0;
    const sv = dt > 0 ? dy / dt : 0;
    wind += (-clamp(Math.abs(sv) * 0.035, 0, 90) - wind) * Math.min(1, dt * 3);   // schnelles Scrollen = Böe nach links

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    for (let i = petals.length - 1; i >= 0; i--) {
      const p = petals[i];
      p.t += dt;
      p.flip += p.flipV * dt * (0.7 + 0.5 * Math.sin(p.t * 0.9 + p.swPh));   // Kippen mal schneller, mal langsamer
      const broad = Math.abs(Math.cos(p.flip));
      if (p.t > p.nextGust) {                                                // neue Böe: zufällige Richtung + Dauer
        p.tvx = rnd(-60, 60); p.nextGust = p.t + rnd(0.7, 2.6);
        if (Math.random() < 0.14) p.lift = rnd(35, 80);                      // gelegentlich Aufwind: Blatt steigt kurz
        if (Math.random() < 0.2) p.rotV = rnd(-1.6, 1.6);
      }
      p.vx += (p.tvx - p.vx) * Math.min(1, dt * 1.5);
      p.lift *= Math.pow(0.35, dt);
      const fall = p.vy * (0.35 + 0.9 * (1 - broad)) - p.lift;               // flach = Luftwiderstand, kantig = Sturz
      p.x += (p.vx + Math.sin(p.t * p.swF + p.swPh) * p.sw + wind * (0.4 + p.depth)) * dt;
      p.y += fall * dt - dy * (0.12 + 0.4 * p.depth);                        // Scroll schiebt Blätter leicht gegen den Inhalt
      p.rot += (p.rotV + Math.sin(p.t * 1.7 + p.swPh) * 0.9) * dt;
      if (p.y > H + p.s * 2 || p.y < -H * 1.5 || p.x < -140 || p.x > W + 140) { petals.splice(i, 1); continue; }
      if (p.y > -p.s * 2) draw(p);
    }

    if (petals.length || Math.abs(pendingDy) > 0) requestAnimationFrame(frame);
    else running = false;
  }

  function kick() {
    if (running) return;
    running = true; last = performance.now(); requestAnimationFrame(frame);
  }

  function onScroll() {
    const d = scrollY - sY; sY = scrollY;
    pendingDy += d; accum += Math.abs(d);
    while (accum > STEP) { accum -= STEP; const n = Math.random() < 0.4 ? 2 : 1; for (let i = 0; i < n; i++) spawn(); }
    kick();
  }

  size();
  addEventListener('scroll', onScroll, { passive: true });
  let t = 0;
  addEventListener('resize', () => { clearTimeout(t); t = window.setTimeout(size, 150); });
  return { burst, setEnabled(v: boolean) { enabled = v; if (!v) { petals.length = 0; ctx.clearRect(0, 0, W, H); } } };
}
