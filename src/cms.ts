/* CMS-Oberfläche. Zwei Aufgaben:
   1. Für ALLE Besucher: die auf dem Server gespeicherten Einstellungen anwenden (Texte, Farben, Wetter, Hero-Animation;
      die Produktauswahl übernimmt main.ts).
   2. Für den Admin: ✎ in der Kopfleiste öffnet nach dem Login ein Panel, in dem alles live bearbeitet und auf dem
      Server gespeichert wird. Der Button erscheint nur, wenn man angemeldet ist oder ?cms an die Adresse hängt. */
import { HERO_FRAME_COUNT } from './frames';
import { LEGAL_DEFAULTS, LEGAL_FIELDS, missingLegal, setLegalData } from './legal';
import type { Weather, WeatherApi } from './rain';
import {
  sitePromise, saveConfig, login, logout, uploadHero, deleteHero, fetchHeroBlobs, defaultConfig,
  type SiteConfig, type ShopConfig,
} from './site';

interface Deps {
  frames: { setCustom(frames: Blob[] | null, w?: number, h?: number): void };
  rain: WeatherApi;
  petals: { setEnabled(v: boolean): void };
  setSiteAccent(hex: string | undefined, force?: boolean): void;
  setSiteTint(on: boolean | undefined, force?: boolean): void;
  refreshProducts(cfg: ShopConfig): Promise<void>;
  listProducts(): { handle: string; title: string }[];
}

/* Bearbeitbare Texte: key, Beschriftung im Panel, Selektor auf der Seite */
const TEXTS = [
  { key: 'brand',   label: 'Hero-Titel',          sel: '#brand' },
  { key: 'lead',    label: 'Hero-Untertitel',     sel: '.lead' },
  { key: 'cta',     label: 'Hero-Button',         sel: '.hero-text .btn span' },
  { key: 'eyebrow', label: 'Kollektion: Label',   sel: '.sheet-head .eyebrow' },
  { key: 'shop',    label: 'Kollektion: Titel',   sel: '#shop-title' },
  { key: 'look',    label: 'Lookbook: Label',     sel: '.look-eyebrow' },
  { key: 'about',   label: 'Über-uns-Titel',      sel: '#about-title' },
  { key: 'bye',     label: 'Schlusswort',         sel: '.goodnight' },
  { key: 'copy',    label: 'Copyright',           sel: '.copy' },
];
const DEFAULT_ACCENT = '#8bd16b';
const HERO_MAX_W = 1920;       // Hero-Frames werden auf diese Breite begrenzt
const HERO_QUALITY = 0.85;

const root = document.documentElement;
const $ = <T extends HTMLElement>(sel: string, scope: ParentNode = document) => scope.querySelector(sel) as T;
const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const themeKey = () => (root.dataset.theme === 'dark' ? 'dark' : 'light') as 'light' | 'dark';

/* ---------- Texte ---------- */
const defaults: Record<string, string> = {};

function setText(el: HTMLElement, value: string, reveal: boolean) {
  if (el.hasAttribute('data-split')) {
    // Wort-Reveal wie in main.ts; auf Wunsch sofort sichtbar
    el.innerHTML = value.trim().split(/\s+/).map((w, i) => `<span class="w"><i style="--d:${i}">${esc(w)}</i></span>`).join(' ');
    if (reveal) el.classList.add('in');
  } else {
    clearInterval(Number(el.dataset.iv));
    el.textContent = value;
    el.dataset.txt = value;   // der Scramble-Effekt (main.ts) spielt sonst den alten Text wieder ab
  }
}
function applyText(config: SiteConfig, key: string, reveal: boolean) {
  const def = TEXTS.find(t => t.key === key);
  const el = def && document.querySelector<HTMLElement>(def.sel);
  if (!el) return;
  setText(el, config.texts[key] ?? defaults[key], reveal);
  if (key === 'brand') document.querySelectorAll('.jp-flash-text').forEach(f => { f.textContent = config.texts.brand ?? defaults.brand; });   // Leuchtschriftzug zeigt denselben Titel
  window.dispatchEvent(new Event('resize'));   // Länge ändert das Hero-Layout: neu berechnen lassen
}

/* ---------- Farben ---------- */
const colorStyle = document.createElement('style');
colorStyle.id = 'cms-colors';
document.head.appendChild(colorStyle);

function applyColors(config: SiteConfig) {
  const rule = (sel: string, c: { paper?: string; ink?: string }) => {
    const d = [c.paper && `--paper:${c.paper}`, c.ink && `--ink:${c.ink}`].filter(Boolean).join(';');
    return d ? `${sel}{${d}}` : '';
  };
  // :root.js schlägt die Standardwerte in main.css, ohne !important. Die Werte sind vom Server als #rrggbb geprüft.
  colorStyle.textContent = rule(':root.js:not([data-theme="dark"])', config.colors.light) + rule(':root.js[data-theme="dark"]', config.colors.dark);
}

const probe = document.createElement('canvas').getContext('2d')!;
function toHex(value: string, fallback: string) {
  probe.fillStyle = '#000000';
  probe.fillStyle = value.trim();
  const out = String(probe.fillStyle);
  return /^#[0-9a-f]{6}$/i.test(out) ? out : fallback;
}

/* ---------- Hero: Video oder Bildfolge -> 38 JPEG-Frames (im Browser) ---------- */
interface HeroData { blobs: Blob[]; w: number; h: number }
const once = (el: HTMLElement, ev: string, ms = 8000) => new Promise<void>((res, rej) => {
  const t = window.setTimeout(() => rej(new Error('Zeitüberschreitung')), ms);
  el.addEventListener(ev, () => { clearTimeout(t); res(); }, { once: true });
  el.addEventListener('error', () => { clearTimeout(t); rej(new Error('Datei nicht lesbar')); }, { once: true });
});
const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('Frame konnte nicht erzeugt werden'))), 'image/jpeg', HERO_QUALITY));
const fit = (w: number, h: number) => { const k = Math.min(1, HERO_MAX_W / w); return { w: Math.round(w * k), h: Math.round(h * k) }; };

async function framesFromVideo(file: File, progress: (i: number) => void): Promise<HeroData> {
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    await once(v, 'loadeddata');
    const { w, h } = fit(v.videoWidth, v.videoHeight);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d')!;
    const dur = v.duration || 1;
    const blobs: Blob[] = [];
    for (let i = 0; i < HERO_FRAME_COUNT; i++) {
      progress(i + 1);
      v.currentTime = Math.min(Math.max(0.001, dur * i / (HERO_FRAME_COUNT - 1)), Math.max(0.001, dur - 0.05));
      await once(v, 'seeked');
      g.drawImage(v, 0, 0, w, h);
      blobs.push(await toBlob(c));
    }
    return { blobs, w, h };
  } finally { URL.revokeObjectURL(url); }
}

async function framesFromImages(files: File[], progress: (i: number) => void): Promise<HeroData> {
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const first = await createImageBitmap(sorted[0]);
  const { w, h } = fit(first.width, first.height);
  first.close();
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  const blobs: Blob[] = [];
  for (let i = 0; i < HERO_FRAME_COUNT; i++) {
    progress(i + 1);
    const src = sorted[sorted.length === 1 ? 0 : Math.round(i * (sorted.length - 1) / (HERO_FRAME_COUNT - 1))];   // auf 38 Frames verteilen
    const bm = await createImageBitmap(src);
    const k = Math.max(w / bm.width, h / bm.height);                                                               // cover
    g.clearRect(0, 0, w, h);
    g.drawImage(bm, (w - bm.width * k) / 2, (h - bm.height * k) / 2, bm.width * k, bm.height * k);
    bm.close();
    blobs.push(await toBlob(c));
  }
  return { blobs, w, h };
}

/* ---------- Start ---------- */
export async function initCms(deps: Deps) {
  TEXTS.forEach(t => {
    const el = document.querySelector<HTMLElement>(t.sel);
    if (el) defaults[t.key] = (el.textContent ?? '').trim();
  });

  const site = await sitePromise;
  let config: SiteConfig = site.config;
  let authed = site.authed;

  /* --- 1. Für alle: gespeicherten Stand anwenden --- */
  Object.keys(config.texts).forEach(k => applyText(config, k, false));
  applyColors(config);
  setLegalData(config.legal);
  deps.setSiteAccent(config.colors.accent);
  deps.setSiteTint(config.colors.tint);
  deps.rain.set(config.weather);
  deps.petals.setEnabled(config.petals);
  if (site.hero) {
    fetchHeroBlobs(site.hero, HERO_FRAME_COUNT)
      .then(blobs => deps.frames.setCustom(blobs, site.hero!.w, site.hero!.h))
      .catch(err => console.warn('[CMS] Hero-Animation nicht geladen, Original bleibt:', err));
  }

  /* --- 2. Admin-Oberfläche --- */
  const wantsAdmin = /[?&]cms\b/.test(location.search) || location.hash === '#cms';
  if (!authed && !wantsAdmin) return;

  const btn = document.createElement('button');
  btn.className = 'icon-btn'; btn.id = 'cms-btn'; btn.type = 'button';
  btn.textContent = '✎'; btn.title = 'CMS'; btn.setAttribute('aria-label', 'CMS');
  btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'cms');
  document.getElementById('style-btn')?.before(btn);

  const panel = document.createElement('aside');
  panel.className = 'panel cms'; panel.id = 'cms';
  panel.setAttribute('aria-label', 'CMS'); panel.setAttribute('inert', ''); panel.setAttribute('data-lenis-prevent', '');
  panel.innerHTML = `
    <header><span>// CMS</span><span class="cms-head-r"><button type="button" id="cms-logout" hidden>Abmelden</button><button type="button" id="cms-x" aria-label="Schließen">×</button></span></header>
    <form id="cms-login" class="cms-login" hidden>
      <p class="cms-note" id="cms-login-note">Zum Bearbeiten bitte anmelden.</p>
      <label class="cms-f"><span>Passwort</span><input type="password" id="cms-pw" autocomplete="current-password" required></label>
      <button class="reset" type="submit">Anmelden</button>
      <p class="cms-note cms-err" id="cms-login-err" role="alert"></p>
    </form>
    <div id="cms-editor" hidden>
      <p class="cms-save" id="cms-save" role="status">Alles gespeichert</p>
      <details open><summary>Texte</summary>
        ${TEXTS.map(t => `<label class="cms-f"><span>${t.label}</span><input type="text" data-text="${t.key}" maxlength="300" autocomplete="off"></label>`).join('')}
      </details>
      <details><summary>Farben</summary>
        <p class="cms-note" id="cms-theme-note"></p>
        <label class="row"><span>Highlight</span><input type="color" id="cms-accent"></label>
        <label class="row"><span>Auge mitfärben</span><input type="checkbox" id="cms-tint"></label>
        <p class="cms-note">Mitfärben: Die Hero-Animation (Dino) nimmt den Farbton des Highlights an.</p>
        <label class="row"><span>Hintergrund</span><input type="color" id="cms-paper"></label>
        <label class="row"><span>Text</span><input type="color" id="cms-ink"></label>
        <button class="reset" id="cms-colors-reset" type="button">Farben zurücksetzen</button>
      </details>
      <details><summary>Shop</summary>
        <p class="cms-note">Die Produkte kommen automatisch aus Shopify. Hier steuerst du, welche und in welcher Reihenfolge.</p>
        <label class="cms-f"><span>Kollektion (Handle, leer = alle)</span><input type="text" id="cms-collection" maxlength="100" autocomplete="off" placeholder="z. B. frontpage"></label>
        <label class="row"><span>Reihenfolge</span><select id="cms-sort"><option value="shopify">Neueste zuerst</option><option value="price-asc">Preis aufsteigend</option><option value="price-desc">Preis absteigend</option><option value="name">Name A–Z</option></select></label>
        <label class="row"><span>Anzahl (0 = alle)</span><input type="number" id="cms-limit" min="0" max="50" step="1"></label>
        <div class="cms-products" id="cms-products"></div>
      </details>
      <details><summary>Hero-Animation</summary>
        <p class="cms-note">Ein Video oder mehrere Bilder (als Bildfolge nach Dateiname sortiert) wählen. Der Browser zerlegt es in 38 Bilder, sie werden auf dem Server gespeichert und beim Scrollen abgespielt.</p>
        <input type="file" id="cms-hero-file" accept="video/*,image/*" multiple>
        <p class="cms-note" id="cms-hero-status"></p>
        <button class="reset" id="cms-hero-reset" type="button">Original-Dino wiederherstellen</button>
      </details>
      <details><summary>Rechtliches</summary>
        <p class="cms-note">Angaben für Impressum, Datenschutz, Versand &amp; Rückgabe und Kontakt. Fehlende Pflichtangaben erscheinen auf der Seite gelb markiert. Die Texte sind Muster und ersetzen keine Rechtsberatung, bitte vor dem Verkauf prüfen lassen.</p>
        <p class="cms-note" id="cms-legal-missing" role="status"></p>
        ${LEGAL_FIELDS.map(f => `<label class="cms-f"><span>${f.label}${f.required ? '' : ' (optional)'}</span><input type="text" data-legal-key="${f.key}" maxlength="300" autocomplete="off" placeholder="${f.hint.replace(/"/g, '&quot;')}"></label>`).join('')}
      </details>
      <details><summary>Wetter</summary>
        <label class="row"><span>Wetter</span><select id="cms-mode"><option value="clear">Klar</option><option value="rain">Regen</option><option value="snow">Schnee</option></select></label>
        <label class="row"><span>Menge</span><input type="range" id="cms-intensity" min="20" max="200" step="10"></label>
        <label class="row"><span>Wind</span><input type="range" id="cms-wind" min="-100" max="100" step="5"></label>
        <label class="row"><span>Blütenblätter</span><input type="checkbox" id="cms-petals"></label>
      </details>
      <button class="reset" id="cms-reset-all" type="button">Alles zurücksetzen</button>
    </div>`;
  document.body.appendChild(panel);

  const loginForm = $<HTMLFormElement>('#cms-login', panel), editor = $('#cms-editor', panel), logoutBtn = $('#cms-logout', panel);
  const pAccent = $<HTMLInputElement>('#cms-accent', panel), pPaper = $<HTMLInputElement>('#cms-paper', panel), pInk = $<HTMLInputElement>('#cms-ink', panel);
  const tintIn = $<HTMLInputElement>('#cms-tint', panel);
  const note = $('#cms-theme-note', panel), status = $('#cms-hero-status', panel), saveNote = $('#cms-save', panel);
  const modeSel = $<HTMLSelectElement>('#cms-mode', panel), intensity = $<HTMLInputElement>('#cms-intensity', panel);
  const wind = $<HTMLInputElement>('#cms-wind', panel), petalsIn = $<HTMLInputElement>('#cms-petals', panel);
  const collectionIn = $<HTMLInputElement>('#cms-collection', panel), sortSel = $<HTMLSelectElement>('#cms-sort', panel), limitIn = $<HTMLInputElement>('#cms-limit', panel);
  const productsBox = $('#cms-products', panel);

  /* Ansicht: Login oder Editor */
  function showView() {
    loginForm.hidden = authed; editor.hidden = !authed; logoutBtn.hidden = !authed;
    if (!authed) {
      $('#cms-login-note', panel).textContent = site.online ? 'Zum Bearbeiten bitte anmelden.' : 'CMS-Server nicht erreichbar. Läuft „npm run server“?';
    } else { syncControls(); renderProductList(); }
  }
  function setOpen(open: boolean) {
    panel.classList.toggle('open', open);
    panel.toggleAttribute('inert', !open);
    btn.setAttribute('aria-expanded', String(open));
    if (open) { showView(); if (!authed) $<HTMLInputElement>('#cms-pw', panel).focus(); }
  }
  btn.addEventListener('click', () => setOpen(!panel.classList.contains('open')));
  $('#cms-x', panel).addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });

  /* Login / Logout */
  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#cms-login-err', panel), pw = $<HTMLInputElement>('#cms-pw', panel);
    err.textContent = '';
    try {
      await login(pw.value);
      pw.value = ''; authed = true; site.online = true;
      showView();
    } catch (ex) {
      err.textContent = ex instanceof Error && ex.name !== 'AbortError' ? ex.message : 'CMS-Server nicht erreichbar';
    }
  });
  logoutBtn.addEventListener('click', async () => { try { await logout(); } catch { /* egal */ } authed = false; showView(); });

  /* Speichern: kurz nach der letzten Änderung, vom Server geprüft */
  let saveTimer = 0, saving: Promise<void> = Promise.resolve();
  function scheduleSave() {
    saveNote.textContent = 'Speichert …';
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saving = saving.then(async () => {
        try {
          await saveConfig(config);
          saveNote.textContent = 'Alles gespeichert';
        } catch (ex) {
          if (ex instanceof Error && /angemeldet/.test(ex.message)) { authed = false; showView(); return; }
          saveNote.textContent = `Nicht gespeichert: ${ex instanceof Error ? ex.message : 'Fehler'}`;
        }
      });
    }, 500);
  }

  /* Eingabefelder mit dem aktuellen Stand füllen */
  function syncControls() {
    TEXTS.forEach(t => {
      const inp = panel.querySelector<HTMLInputElement>(`[data-text="${t.key}"]`)!;
      if (document.activeElement !== inp) inp.value = config.texts[t.key] ?? defaults[t.key] ?? '';
    });
    const cs = getComputedStyle(root);
    pAccent.value = toHex(cs.getPropertyValue('--accent'), DEFAULT_ACCENT);
    tintIn.checked = !!config.colors.tint;
    pPaper.value = toHex(cs.getPropertyValue('--paper'), '#ffffff');
    pInk.value = toHex(cs.getPropertyValue('--ink'), '#000000');
    note.textContent = `Hintergrund und Text gelten für den ${themeKey() === 'dark' ? 'Dark' : 'Light'}-Modus (der andere Modus hat eigene Farben, Umschalten über ◐).`;
    for (const f of LEGAL_FIELDS) {
      const inp = panel.querySelector<HTMLInputElement>(`[data-legal-key="${f.key}"]`)!;
      if (document.activeElement !== inp) inp.value = config.legal[f.key] ?? LEGAL_DEFAULTS[f.key] ?? '';
    }
    updateLegalNote();
    modeSel.value = config.weather.mode;
    intensity.value = String(config.weather.intensity);
    wind.value = String(config.weather.wind);
    petalsIn.checked = config.petals;
    if (document.activeElement !== collectionIn) collectionIn.value = config.shop.collection;
    sortSel.value = config.shop.sort;
    limitIn.value = String(config.shop.limit);
  }

  /* Rechtliches */
  function updateLegalNote() {
    const n = missingLegal(config.legal);
    $('#cms-legal-missing', panel).textContent = n ? `Noch ${n} Pflichtangabe${n === 1 ? '' : 'n'} offen.` : 'Alle Pflichtangaben sind ausgefüllt.';
  }
  panel.addEventListener('input', e => {
    const inp = e.target as HTMLInputElement;
    const lk = inp.dataset.legalKey;
    if (!lk) return;
    if (inp.value.trim()) config.legal[lk] = inp.value.trim(); else delete config.legal[lk];
    setLegalData(config.legal); updateLegalNote(); scheduleSave();
  });

  /* Texte */
  panel.addEventListener('input', e => {
    const inp = e.target as HTMLInputElement;
    const key = inp.dataset.text;
    if (!key) return;
    if (inp.value.trim() === '' || inp.value === defaults[key]) delete config.texts[key]; else config.texts[key] = inp.value;
    applyText(config, key, true);
    scheduleSave();
  });

  /* Farben */
  pAccent.addEventListener('input', () => { config.colors.accent = pAccent.value; deps.setSiteAccent(pAccent.value, true); scheduleSave(); });
  tintIn.addEventListener('change', () => { config.colors.tint = tintIn.checked || undefined; deps.setSiteTint(tintIn.checked, true); scheduleSave(); });
  pPaper.addEventListener('input', () => { config.colors[themeKey()].paper = pPaper.value; applyColors(config); scheduleSave(); });
  pInk.addEventListener('input', () => { config.colors[themeKey()].ink = pInk.value; applyColors(config); scheduleSave(); });
  $('#cms-colors-reset', panel).addEventListener('click', () => {
    config.colors = { light: {}, dark: {} };
    applyColors(config); deps.setSiteAccent(undefined, true); deps.setSiteTint(undefined, true);
    syncControls(); scheduleSave();
  });
  // Theme oder Highlight wurden an anderer Stelle geändert (◐, Styling-Panel): Farbfelder nachziehen
  document.getElementById('accent-in')?.addEventListener('input', () => setTimeout(syncControls, 0));
  document.getElementById('swatches')?.addEventListener('click', () => setTimeout(syncControls, 0));
  new MutationObserver(() => { if (panel.classList.contains('open') && authed) setTimeout(syncControls, 0); }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  /* Wetter */
  const applyWeather = () => { deps.rain.set(config.weather); deps.petals.setEnabled(config.petals); scheduleSave(); };
  modeSel.addEventListener('change', () => { config.weather.mode = modeSel.value as Weather['mode']; applyWeather(); });
  intensity.addEventListener('input', () => { config.weather.intensity = +intensity.value; applyWeather(); });
  wind.addEventListener('input', () => { config.weather.wind = +wind.value; applyWeather(); });
  petalsIn.addEventListener('change', () => { config.petals = petalsIn.checked; applyWeather(); });

  /* Shop: Kollektion, Reihenfolge, Anzahl, einzelne Produkte ein-/ausblenden */
  function renderProductList() {
    const list = deps.listProducts();
    productsBox.innerHTML = list.length
      ? list.map(p => `<label class="cms-prod"><input type="checkbox" data-handle="${esc(p.handle)}" ${config.shop.hidden.includes(p.handle) ? '' : 'checked'}><span>${esc(p.title)}</span></label>`).join('')
      : '<p class="cms-note">Keine Produkte gefunden.</p>';
  }
  let shopTimer = 0;
  function shopChanged(reload = false) {
    scheduleSave();
    clearTimeout(shopTimer);
    shopTimer = window.setTimeout(async () => { await deps.refreshProducts(config.shop); if (reload) renderProductList(); }, 400);
  }
  collectionIn.addEventListener('input', () => { config.shop.collection = collectionIn.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, ''); shopChanged(true); });
  sortSel.addEventListener('change', () => { config.shop.sort = sortSel.value as ShopConfig['sort']; shopChanged(); });
  limitIn.addEventListener('input', () => { config.shop.limit = Math.min(50, Math.max(0, Math.round(+limitIn.value) || 0)); shopChanged(); });
  productsBox.addEventListener('change', e => {
    const inp = e.target as HTMLInputElement;
    const h = inp.dataset.handle;
    if (!h) return;
    config.shop.hidden = inp.checked ? config.shop.hidden.filter(x => x !== h) : [...new Set([...config.shop.hidden, h])];
    shopChanged();
  });
  panel.addEventListener('toggle', e => { if ((e.target as HTMLElement).tagName === 'DETAILS') renderProductList(); }, true);

  /* Hero */
  const heroFile = $<HTMLInputElement>('#cms-hero-file', panel);
  heroFile.addEventListener('change', async () => {
    const files = [...(heroFile.files ?? [])];
    if (!files.length) return;
    heroFile.disabled = true;
    try {
      const video = files.find(f => f.type.startsWith('video/'));
      const images = files.filter(f => f.type.startsWith('image/'));
      if (!video && !images.length) throw new Error('Bitte ein Video oder Bilder wählen');
      const make = (i: number) => { status.textContent = `Bild ${i} von ${HERO_FRAME_COUNT} wird erzeugt …`; };
      const data = video ? await framesFromVideo(video, make) : await framesFromImages(images, make);
      await uploadHero(data.blobs, data.w, data.h, i => { status.textContent = `Lade hoch: ${i} von ${HERO_FRAME_COUNT} …`; });
      deps.frames.setCustom(data.blobs, data.w, data.h);
      status.textContent = video ? `Fertig: ${video.name}` : `Fertig: ${images.length} ${images.length === 1 ? 'Bild' : 'Bilder'}`;
    } catch (err) {
      status.textContent = `Fehler: ${err instanceof Error ? err.message : 'unbekannt'}`;
    } finally {
      heroFile.disabled = false; heroFile.value = '';
    }
  });
  async function resetHero() {
    try {
      await deleteHero();
      deps.frames.setCustom(null);
      status.textContent = 'Original-Dino ist wieder aktiv.';
    } catch (err) { status.textContent = `Fehler: ${err instanceof Error ? err.message : 'unbekannt'}`; }
  }
  $('#cms-hero-reset', panel).addEventListener('click', resetHero);
  if (site.hero) status.textContent = 'Eigene Hero-Animation aktiv.';

  /* Alles zurücksetzen */
  $('#cms-reset-all', panel).addEventListener('click', async () => {
    if (!confirm('Alle CMS-Einstellungen auf den Anfangszustand zurücksetzen?')) return;
    const keys = Object.keys(config.texts);
    const legal = config.legal;                  // Betreiberangaben bleiben beim Zurücksetzen erhalten
    config = defaultConfig();
    config.legal = legal;
    keys.forEach(k => applyText(config, k, true));
    applyColors(config); deps.setSiteAccent(undefined, true); deps.setSiteTint(undefined, true);
    deps.rain.set(config.weather); deps.petals.setEnabled(config.petals);
    shopChanged(true);
    await resetHero();
    syncControls();
  });
}
