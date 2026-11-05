/* Linsen-Tropfen: ab und zu klatscht ein Regentropfen gegen die "Kameralinse" (= der Bildschirm, über allem).
   Ablauf: Einschlag mit Ring + Spritzern → Tropfen setzt sich → rutscht ruckelnd nach unten, zieht eine
   Spur, wird dabei kleiner → verschwindet. Nur Canvas, kein Eingriff in Layout oder Klicks. */
type Drop = {
  x: number; y: number; r: number; r0: number; t: number; phase: 'impact' | 'sit' | 'run' | 'fade';
  sit: number; v: number; stick: number; next: number; run: number; maxRun: number; fade: number; wob: number;
  trail: { x: number; y: number; w: number; t: number }[]; parts: { x: number; y: number; vx: number; vy: number; r: number; life: number }[];
};
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const IMPACT = 0.42;     // s

export function initLens(canvas: HTMLCanvasElement, reduceMotion: boolean) {
  if (reduceMotion) return;
  const ctx = canvas.getContext('2d')!;
  const root = document.documentElement;
  const drops: Drop[] = [];
  let W = 0, H = 0, dpr = 1, last = performance.now(), spawnIn = rnd(2.5, 5);

  function size() {
    dpr = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  size();
  let lw = innerWidth;
  addEventListener('resize', () => { if (innerWidth !== lw) { lw = innerWidth; size(); } });   // mobile Adressleiste: Höhenänderung ignorieren

  function spawn() {
    const r0 = rnd(9, 15) * (W < 700 ? 0.85 : 1);
    drops.push({
      x: rnd(0.08, 0.92) * W, y: rnd(0.1, 0.55) * H, r: r0, r0, t: 0, phase: 'impact',
      sit: rnd(0.7, 1.9), v: 0, stick: 0, next: rnd(0.3, 0.8), run: 0, maxRun: rnd(0.22, 0.5) * H, fade: 1, wob: rnd(0, 6.28),
      trail: [],
      parts: Array.from({ length: Math.round(rnd(8, 13)) }, () => {
        const a = rnd(0, 6.283), s = rnd(1.4, 4.6);
        return { x: 0, y: 0, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.6, r: rnd(0.9, 2.5), life: rnd(0.6, 1) };
      }),
    });
  }

  function palette() {
    const dark = root.dataset.theme === 'dark';
    return dark
      ? { edge: '12,20,30', body: '170,205,255', hi: '255,255,255', rim: '200,225,255' }
      : { edge: '30,52,96', body: '120,160,220', hi: '255,255,255', rim: '255,255,255' };
  }

  /* Ein Linsentropfen: dunklerer oberer Rand, heller Boden (Lichtbrechung), Glanzpunkt oben links */
  function bead(x: number, y: number, r: number, a: number, stretch: number, c: ReturnType<typeof palette>) {
    if (r < 0.4 || a <= 0) return;
    ctx.save(); ctx.translate(x, y); ctx.scale(1, stretch); ctx.globalAlpha = a;
    const g = ctx.createRadialGradient(r * 0.1, r * 0.35, r * 0.1, 0, 0, r);
    g.addColorStop(0, `rgba(${c.body},.10)`); g.addColorStop(0.65, `rgba(${c.body},.16)`); g.addColorStop(1, `rgba(${c.edge},.42)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.2832); ctx.fill();
    ctx.lineWidth = Math.max(0.7, r * 0.09); ctx.strokeStyle = `rgba(${c.edge},.34)`; ctx.stroke();
    // heller Bogen unten (Brechung)
    ctx.beginPath(); ctx.arc(0, 0, r * 0.78, 0.35, 2.8); ctx.lineWidth = Math.max(0.8, r * 0.16); ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(${c.rim},.5)`; ctx.stroke();
    // Glanzpunkt
    ctx.globalAlpha = a * 0.95; ctx.fillStyle = `rgba(${c.hi},.95)`;
    ctx.beginPath(); ctx.ellipse(-r * 0.36, -r * 0.4, r * 0.2, r * 0.13, -0.6, 0, 6.2832); ctx.fill();
    ctx.restore();
  }

  /* Spur als gefülltes Band (links/rechts versetzt) mit vertikalem Alpha-Verlauf nach Alter */
  function trailBand(d: Drop, now: number, c: ReturnType<typeof palette>, fade: number) {
    const tr = d.trail, n = tr.length;
    if (n < 2) return;
    const y0 = tr[0].y, y1 = tr[n - 1].y;
    if (y1 - y0 < 1) return;
    const layers: [number, string, number][] = [   // [halbe Breite × w, Farbe, max. Alpha]
      [1.9, c.body, 0.030], [1.3, c.body, 0.045], [0.8, c.body, 0.060], [0.32, c.rim, 0.20],
    ];
    for (const [k, rgb, a] of layers) {
      const g = ctx.createLinearGradient(0, y0, 0, y1), S = Math.min(n, 14);
      for (let s = 0; s < S; s++) {
        const p = tr[Math.round(s * (n - 1) / (S - 1))], age = (now - p.t) / 2600;
        g.addColorStop((p.y - y0) / (y1 - y0), `rgba(${rgb},${(Math.max(0, 1 - age) * a * fade).toFixed(3)})`);
      }
      ctx.beginPath();
      for (let i = 0; i < n; i++) ctx.lineTo(tr[i].x - tr[i].w * k, tr[i].y);
      for (let i = n - 1; i >= 0; i--) ctx.lineTo(tr[i].x + tr[i].w * k, tr[i].y);
      ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    }
  }

  function step(d: Drop, dt: number, now: number) {
    d.t += dt;
    if (d.phase === 'impact') { if (d.t >= IMPACT) { d.phase = 'sit'; d.t = 0; } return; }
    if (d.phase === 'sit') { if (d.t >= d.sit) { d.phase = 'run'; d.t = 0; } return; }
    if (d.phase === 'run') {
      d.next -= dt;
      if (d.stick > 0) { d.stick -= dt; d.v *= Math.pow(0.82, dt * 60); }
      else {
        d.v = Math.min(d.v + 260 * dt * (d.r / d.r0 + 0.3), 150 * (0.55 + d.r / d.r0 * 0.6));   // px/s, größerer Tropfen = schneller
        if (d.next <= 0) { d.stick = rnd(0.12, 0.38); d.next = rnd(0.35, 0.9); }
      }
      const dy = d.v * dt;
      if (dy > 0) {
        d.y += dy; d.x += Math.sin(d.wob + d.run * 0.04) * dy * 0.07; d.run += dy;
        d.r = Math.max(2, d.r - dy * (d.r0 * 0.0042));     // verliert Wasser an die Spur
        d.trail.push({ x: d.x, y: d.y, w: d.r * 0.5, t: now });
      }
      if (d.run >= d.maxRun || d.r <= 2.3) { d.phase = 'fade'; d.t = 0; }
      return;
    }
    d.fade = Math.max(0, 1 - d.t / 0.9);
  }

  function draw(d: Drop, now: number, c: ReturnType<typeof palette>) {
    // Spur: ein weicher Streifen statt vieler Einzelstriche (keine Überlappungs-Punkte, kein dunkler Rand).
    // Mehrere breite, sehr blasse Lagen ergeben eine weiche Kante; Alpha fällt per Verlauf mit dem Alter ab.
    d.trail = d.trail.filter(p => now - p.t < 2600);
    trailBand(d, now, c, d.phase === 'fade' ? d.fade : 1);
    if (d.phase === 'impact') {
      const k = d.t / IMPACT, e = 1 - Math.pow(1 - k, 3);
      // Ring
      ctx.save(); ctx.globalAlpha = (1 - k) * 0.7; ctx.lineWidth = 2.2 - k * 1.6; ctx.strokeStyle = `rgba(${c.rim},.8)`;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r * (0.8 + e * 2.9), 0, 6.2832); ctx.stroke(); ctx.restore();
      // Spritzer
      for (const p of d.parts) {
        const tt = Math.min(1, d.t / (IMPACT * p.life));
        bead(d.x + p.vx * tt * 8.5, d.y + p.vy * tt * 8.5 + tt * tt * 6, p.r * (1 - tt * 0.5), (1 - tt) * 0.95, 1, c);
      }
      // Platsch: erst flach und breit, dann zum runden Tropfen
      const sq = 1 + (1 - e) * 0.9;
      ctx.save(); ctx.translate(d.x, d.y); ctx.scale(sq, 1 / Math.sqrt(sq)); ctx.translate(-d.x, -d.y);
      bead(d.x, d.y, d.r * (0.55 + 0.45 * e), Math.min(1, 0.35 + k), 1, c); ctx.restore();
      return;
    }
    const stretch = d.phase === 'run' && d.stick <= 0 ? 1 + Math.min(0.22, d.v / 700) : 1;
    bead(d.x, d.y, d.r, d.fade, stretch, c);
  }

  function frame(now: number) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    spawnIn -= dt; if (spawnIn <= 0) { spawn(); spawnIn = rnd(6, 13); if (Math.random() < 0.18) spawnIn = rnd(1.2, 2.4); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    if (!drops.length) return;
    const c = palette();
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i]; step(d, dt, now); draw(d, now, c);
      if (d.phase === 'fade' && d.fade <= 0 && !d.trail.length) drops.splice(i, 1);
    }
  }
  requestAnimationFrame(frame);
}
