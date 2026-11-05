// Feuerwerk-Sound aus echten Aufnahmen (public/sounds):
//  - firework-small.mp3 ("Sound 1"): jede normale Explosion
//  - firework-big.mp3   ("Sound 2"): die große Bombe, lauter und druckvoller
// Browser erlauben Ton erst nach einer Berührung der Seite: unlockAudio() wird beim ersten Klick/Tippen/Tastendruck
// aufgerufen und lädt dabei auch die Aufnahmen. Solange der Ton gesperrt oder stumm geschaltet ist, wird nichts
// geplant, damit nichts verspätet losgeht.

// --- Anpassbar -------------------------------------------------------------
const SAMPLES = {
  small: { url: 'sounds/firework-small.mp3', skip: 0.02, gain: 1.4 },   // skip: Stille am Anfang überspringen, damit der Knall genau beim Platzen kommt
  big:   { url: 'sounds/firework-big.mp3',   skip: 0.12, gain: 1.3 },
};
const MASTER = 0.9;                   // Gesamtlautstärke vor dem Begrenzer
const POP_GAIN = 0.75;                // Plopp der Knistersterne ("Popping Flowers") nach der großen Bombe
const VARIATION = 0.06;               // normale Explosionen: Tonhöhe ±6 %, damit drei Knalle in einer Salve nicht identisch klingen
// ----------------------------------------------------------------------------

export interface Chain { master: GainNode }

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Klangkette: Gesamtlautstärke und ein Begrenzer, damit die große Bombe laut, aber nie verzerrt ist. */
export function buildChain(c: BaseAudioContext): Chain {
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -10; comp.knee.value = 8; comp.ratio.value = 10; comp.attack.value = 0.002; comp.release.value = 0.2;
  const master = c.createGain();
  master.gain.value = MASTER;
  master.connect(comp); comp.connect(c.destination);
  return { master };
}

/** Spielt eine Aufnahme zum Zeitpunkt `when`. pan: -1 links … 1 rechts. */
export function playSample(c: BaseAudioContext, ch: Chain, buf: AudioBuffer, when: number, big: boolean, pan: number) {
  const cfg = big ? SAMPLES.big : SAMPLES.small;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = big ? 1 : 1 + rand(-VARIATION, VARIATION);
  const g = c.createGain();
  g.gain.value = cfg.gain * (big ? 1 : rand(0.85, 1));
  src.connect(g);
  route(c, ch, g, pan);
  src.start(when, cfg.skip);
}

/** Hängt einen Knoten über die Stereoposition an die Klangkette. */
function route(c: BaseAudioContext, ch: Chain, node: AudioNode, pan: number) {
  let last: AudioNode = node;
  if (typeof c.createStereoPanner === 'function') {
    const p = c.createStereoPanner();
    p.pan.value = clamp(pan, -0.8, 0.8);
    node.connect(p); last = p;
  }
  last.connect(ch.master);
}

/* ---------- Live-Betrieb ---------- */
let live: { ctx: AudioContext; chain: Chain; bufs: { small?: AudioBuffer; big?: AudioBuffer } } | null = null;
let muted = false;
try { muted = localStorage.getItem('kc-fx-sound') === '0'; } catch { /* ignorieren */ }

function ensure() {
  if (live) return live;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();
  live = { ctx, chain: buildChain(ctx), bufs: {} };
  // Aufnahmen laden und dekodieren (jeweils ca. 40 KB); bis sie da sind, bleibt es still
  for (const key of ['small', 'big'] as const) {
    fetch(`${import.meta.env.BASE_URL}${SAMPLES[key].url}`)
      .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then(data => ctx.decodeAudioData(data))
      .then(buf => { if (live) live.bufs[key] = buf; })
      .catch(err => console.warn(`[Sound] ${SAMPLES[key].url} nicht geladen:`, err));
  }
  return live;
}
/** Nur planen, wenn der Ton wirklich läuft (sonst würde alles gestaut und verspätet nachgeholt). */
function ready() {
  const l = ensure();
  return l && !muted && l.ctx.state === 'running' ? l : null;
}

/** Beim ersten Klick/Tippen/Tastendruck aufrufen: erlaubt dem Browser, Ton abzuspielen, und lädt die Aufnahmen. */
export function unlockAudio() {
  const l = ensure();
  if (l && l.ctx.state === 'suspended') void l.ctx.resume();
}
export const isSoundOn = () => !muted;
export function setSoundOn(on: boolean) {
  muted = !on;
  try { localStorage.setItem('kc-fx-sound', on ? '1' : '0'); } catch { /* ignorieren */ }
  if (on) unlockAudio();
}

export function playBang(big: boolean, pan: number) {
  const l = ready();
  const buf = l && (big ? l.bufs.big : l.bufs.small);
  if (l && buf) playSample(l.ctx, l.chain, buf, l.ctx.currentTime + 0.01, big, pan);
}

/** Kleiner, heller Plopp eines Knistersterns: Sound 1, höher gepitcht und kurz abgeschnitten, damit sich mehrere nicht verschmieren. */
export function playPop(pan: number) {
  const l = ready();
  const buf = l && l.bufs.small;
  if (!l || !buf) return;
  const c = l.ctx, t = c.currentTime + 0.01;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rand(1.35, 1.9);
  const hp = c.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 500;
  const g = c.createGain();
  g.gain.setValueAtTime(POP_GAIN * rand(0.7, 1), t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
  src.connect(hp); hp.connect(g);
  route(c, l.chain, g, pan);
  src.start(t, SAMPLES.small.skip); src.stop(t + 0.6);
}
