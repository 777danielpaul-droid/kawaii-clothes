// Häschen: blendet ein, spielt seine kurze Animation (springt in die Pfütze) und blendet wieder aus.
// Zwei Auftritte: neben dem Feuerwerk-Button (große Bombe) und neben dem „+“-Button, wenn etwas in den Warenkorb kommt.
// Die Animation liegt als transparentes Sprite (6 × 6 Bilder) in public/hase/.
const FRAMES = 36, COLS = 6, FW = 240, FH = 236, FPS = 24;   // muss zu public/hase/hase-sprite.webp passen
const HOLD_S = 0.5;                                           // letztes Bild bleibt kurz stehen, dann blendet es aus
const FADE_S = 0.5;                                           // Dauer des Ausblendens (passt zur CSS-Transition)
const CART_W = 92, CART_H = 90;                              // Größe des Häschens neben dem „+“-Button (CSS-Pixel)

/* Das Sprite wird einmal geladen und von allen Auftritten geteilt */
let sprite: HTMLImageElement | null = null;
let spriteReady: Promise<boolean> | null = null;
function loadSprite(): Promise<boolean> {
  if (!spriteReady) {
    sprite = new Image();
    sprite.src = `${import.meta.env.BASE_URL}hase/hase-sprite.webp`;
    spriteReady = sprite.decode().then(() => true, () => false);   // nicht ladbar: still bleiben
  }
  return spriteReady;
}
const preloadSoon = () => (window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500)))(() => void loadSprite());

/** Spielerfunktion für ein Canvas. `follow` wird pro Bild aufgerufen (z. B. um dem Button beim Scrollen zu folgen). */
function makePlayer(canvas: HTMLCanvasElement, follow?: () => void) {
  const ctx = canvas.getContext('2d')!;
  canvas.width = FW; canvas.height = FH;                      // volle Sprite-Auflösung, per CSS klein dargestellt (scharf auch auf Retina)
  let raf = 0, clearTimer = 0;
  return async function play() {
    if (!(await loadSprite())) return;
    cancelAnimationFrame(raf); clearTimeout(clearTimer);
    follow?.();
    canvas.classList.add('show');                              // CSS blendet ein
    const start = performance.now();
    const loop = () => {
      const t = (performance.now() - start) / 1000;
      const f = Math.max(0, Math.min(FRAMES - 1, Math.floor(t * FPS)));
      follow?.();
      ctx.clearRect(0, 0, FW, FH);
      ctx.drawImage(sprite!, (f % COLS) * FW, Math.floor(f / COLS) * FH, FW, FH, 0, 0, FW, FH);
      if (t < FRAMES / FPS + HOLD_S) { raf = requestAnimationFrame(loop); return; }
      canvas.classList.remove('show');                         // ausblenden, danach Canvas leeren
      clearTimer = window.setTimeout(() => ctx.clearRect(0, 0, FW, FH), FADE_S * 1000 + 50);
    };
    raf = requestAnimationFrame(loop);
  };
}

/** Häschen neben dem Feuerwerk-Button (feste Position per CSS). */
export function initHase(canvas: HTMLCanvasElement, reduceMotion: boolean): () => void {
  if (reduceMotion) return () => {};
  preloadSoon();
  return makePlayer(canvas);
}

/** Häschen, das neben einem Button hüpft (hier: „+“ in der Kollektion). Es folgt dem Button, auch beim Scrollen und bei der Parallax-Bewegung der Karten. */
export function initCartHase(reduceMotion: boolean): (anchor: HTMLElement) => void {
  if (reduceMotion) return () => {};
  preloadSoon();
  const canvas = document.createElement('canvas');
  canvas.className = 'hase hase-float';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  let anchor: HTMLElement | null = null;
  let x = 0, y = 0;
  const follow = () => {
    if (anchor?.isConnected) {                                 // wurde die Karte neu gerendert, bleibt es an der letzten Stelle
      const r = anchor.getBoundingClientRect();
      x = r.right + 8;
      if (x + CART_W > innerWidth - 8) x = r.left - CART_W - 8;                      // rechts kein Platz: auf die linke Seite
      y = Math.min(r.bottom - CART_H + 30, innerHeight - CART_H - 4);                // Pfütze knapp unter dem Button (deckt weniger Text ab), aber im Bild
    }
    canvas.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
  };
  const play = makePlayer(canvas, follow);
  return a => { anchor = a; void play(); };
}
