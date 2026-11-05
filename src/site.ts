/* Verbindung zum CMS-Server (server/index.js): Einstellungen der Seite laden und speichern, Login, Hero-Upload.
   Ist der Server nicht erreichbar (z. B. reines Static-Hosting), läuft die Seite mit den Standardwerten weiter. */
import type { Weather } from './rain';
import { WEATHER_DEFAULT } from './rain';

export interface ThemeColors { paper?: string; ink?: string }
export interface ShopConfig {
  sort: 'shopify' | 'price-asc' | 'price-desc' | 'name';   // Reihenfolge der Produkte in der Kollektion
  limit: number;                                           // 0 = alle
  hidden: string[];                                        // Handles ausgeblendeter Produkte
  collection: string;                                      // Handle einer Shopify-Kollektion, leer = alle Produkte
}
export interface SiteConfig {
  texts: Record<string, string>;
  colors: { accent?: string; tint?: boolean; light: ThemeColors; dark: ThemeColors };
  weather: Weather;
  petals: boolean;
  shop: ShopConfig;
  legal: Record<string, string>;   // Betreiberangaben für Impressum, Datenschutz, Versand & Rückgabe, Kontakt (siehe legal.ts)
}
export interface HeroMeta { v: string; w: number; h: number }
export interface Site { config: SiteConfig; hero: HeroMeta | null; authed: boolean; online: boolean }

export const defaultConfig = (): SiteConfig => ({
  texts: {},
  colors: { light: {}, dark: {} },
  weather: { ...WEATHER_DEFAULT },
  petals: true,
  shop: { sort: 'shopify', limit: 0, hidden: [], collection: '' },
  legal: {},
});

async function api(path: string, init: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const ctl = new AbortController();
  const t = window.setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(`/api${path}`, { credentials: 'same-origin', ...init, signal: ctl.signal });
  } finally { clearTimeout(t); }
}
async function fail(res: Response): Promise<never> {
  let msg = `Fehler ${res.status}`;
  try { msg = (await res.json()).error ?? msg; } catch { /* kein JSON */ }
  throw new Error(msg);
}

export async function loadSite(): Promise<Site> {
  try {
    const res = await api('/site', {}, 2500);
    if (!res.ok) throw new Error(String(res.status));
    const j = await res.json();
    return { config: { ...defaultConfig(), ...j.config }, hero: j.hero ?? null, authed: !!j.authed, online: true };
  } catch {
    return { config: defaultConfig(), hero: null, authed: false, online: false };
  }
}
/** Wird beim Laden der Seite sofort gestartet, damit Texte, Farben und Produktauswahl früh bereitstehen. */
export const sitePromise: Promise<Site> = loadSite();

export async function login(password: string): Promise<void> {
  const res = await api('/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
  if (!res.ok) await fail(res);
}
export async function logout(): Promise<void> {
  await api('/logout', { method: 'POST' });
}
/** Speichert die Konfiguration; der Server prüft und begrenzt alle Werte und gibt die gültige Fassung zurück. */
export async function saveConfig(config: SiteConfig): Promise<SiteConfig> {
  const res = await api('/site', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) });
  if (!res.ok) await fail(res);
  return { ...defaultConfig(), ...(await res.json()).config };
}

export const heroFrameUrl = (m: HeroMeta, i: number) => `/api/hero/${m.v}/${String(i).padStart(2, '0')}.jpg`;

/** Lädt die 38 Hero-Frames hoch und setzt sie in Kraft. */
export async function uploadHero(blobs: Blob[], w: number, h: number, onProgress: (done: number) => void): Promise<HeroMeta> {
  for (let i = 0; i < blobs.length; i++) {
    const res = await api(`/hero/frame/${i}`, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: blobs[i] }, 30000);
    if (!res.ok) await fail(res);
    onProgress(i + 1);
  }
  const res = await api('/hero/commit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ w, h }) });
  if (!res.ok) await fail(res);
  return (await res.json()).hero as HeroMeta;
}
export async function deleteHero(): Promise<void> {
  const res = await api('/hero', { method: 'DELETE' });
  if (!res.ok) await fail(res);
}

/** Holt die Hero-Frames der Seite (für alle Besucher) als Blobs. */
export async function fetchHeroBlobs(m: HeroMeta, count: number): Promise<Blob[]> {
  const out: Blob[] = new Array(count);
  let next = 0;
  const worker = async () => {
    while (next < count) {
      const i = next++;
      const res = await fetch(heroFrameUrl(m, i));
      if (!res.ok) throw new Error(`Hero-Frame ${i} fehlt`);
      out[i] = await res.blob();
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return out;
}
