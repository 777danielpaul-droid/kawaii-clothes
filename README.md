# kawaii clothes

Vite + TypeScript, Locomotive Scroll v5 (Lenis + Parallax), selbst gehostete Fonts.

    npm install
    npm run dev      # Entwicklung
    npm run build    # Produktion -> dist/

- `src/main.ts` Einstieg: Scroll, Preloader, Menü, Cursor
- `src/frames.ts` scroll-gesteuerter Augen-Hintergrund (Canvas)
- `src/lens.ts` Linsen-Tropfen: ab und zu Einschlag mit Splash auf dem Bildschirm, Tropfen läuft runter und verschwindet (Intervall `spawnIn` in `frame()`)
- `src/rain.ts` Regen-Canvas hinter allem (3 Tiefenebenen, Scroll-Parallax, Theme-Farbe)
- `src/data.ts` Produkte, `src/styles/main.css` Design
- `public/frames/` 38 Frames in zwei Sets als WebP mit Alpha (Dino freigestellt, Canvas transparent): `xl` 2560 px (KI-hochskaliert, seitlich auf den Dino zugeschnitten, für alle Querformat-Schirme; kleinere Schirme dekodieren es herunterskaliert) und `mob` 1056 px (KI-hochskaliert, Hochformat). Set-Wahl und Dekodier-Fenster in `src/frames.ts`; es sind nur die Frames rund um die Scrollposition dekodiert
- Styling-Panel (◈): Highlight-Farbe, Auge mitfärben, Flackern; ◐ = Dark/Light (echter Dark Mode über CSS-Variablen, keine Invertierung), alles in localStorage
- Karten (Shop + Lookbook) sind Blurred Glass in beiden Modi: `--glass-tint/-edge/-shadow` in `main.css`; Shirt-Motive sind freigestelltes WebP mit Alpha
- `src/data.ts`: `jp` = wörtliche japanische Übersetzung des Namens, wird in Karte und Lookbook gezeigt
- Hintergrund-Timing: `setAnchors` in `src/main.ts` (Blinzeln = Frames 16–44 bei „Über uns“)
- Wolken-Header: `cloudTile` in `src/main.ts` (2 Ebenen, Rauschen + Licht, Parallax über Scroll/Drift/Maus), Farben `--sky-*`/`--cloud*` in `main.css`
- Parallax: `data-scroll data-scroll-speed="0.2"` an beliebige Elemente
- Lookbook-Hover: Karten schalten beim Hovern Motiv → Rückendruck (`<img>-back.webp`, generiert) → Model-Foto (`<img>-model.webp`, optional, wird übersprungen solange die Datei fehlt) durch. Alle Artikel sind Oversize Tees.

## CMS (Texte, Farben, Hero, Wetter, Shop-Steuerung)

Die Seite ist ein über ein CMS einstellbares Shopify-Frontend: Produkte kommen automatisch aus Shopify, alles andere
(Texte, Farben, Hero-Animation, Wetter, Auswahl und Reihenfolge der Produkte) stellt man in einem Panel ein.
Gespeichert wird auf einem kleinen Node-Server (`server/index.js`) in `data/` (Datei `site.json` plus die Hero-Frames).

**Einrichten** (nichts von Hand eintragen)

1. `npm install`
2. `npm run dev:all` startet CMS-Server und Seite zusammen. Beim ersten Start wird automatisch ein langes Passwort
   erzeugt, in `.env` gespeichert und einmal im Terminal angezeigt (`npm run setup` macht nur diesen Schritt).
   Produktiv: `npm start` baut die Seite und liefert sie samt API auf Port 3001 aus.

**Bedienen:** Adresse mit `?cms` öffnen (z. B. `http://localhost:5173/?cms`), auf ✎ klicken, anmelden. Änderungen
wirken sofort und werden nach einer halben Sekunde auf dem Server gespeichert. Alle Besucher sehen den gespeicherten Stand.

**Sicherheit:** Das Passwort steht nur auf dem Server (kein `VITE_`-Präfix). Die Sitzung ist ein signiertes HttpOnly-Cookie
(8 Stunden), nach 5 Fehlversuchen gibt es 60 s Pause. Der Server prüft und begrenzt alle Eingaben und akzeptiert Schreibzugriffe nur von
der eigenen Seite. Der Server hört standardmäßig nur auf `127.0.0.1` (auf einem Server `HOST=0.0.0.0`), setzt eine Content-Security-Policy und
sichere Header; hinter HTTPS und einem Proxy `TRUST_PROXY=1` setzen. Texte werden nie als HTML eingefügt.
Sichere `data/` regelmäßig, dort liegt der gesamte Inhalt.

Ungenutzte Shirt-Bilder (alte Motive und Rückseiten) liegen zur Sicherheit in `archive/unused-shirts/` und werden nicht mit ausgeliefert.

**Feuerwerk-Ton:** `public/sounds/firework-small.mp3` spielt bei jeder normalen Explosion, `public/sounds/firework-big.mp3` bei der großen Bombe
(1. und jeder 3. Klick auf den Footer-Button). Die Dateien lassen sich einfach austauschen; Lautstärke und Startpunkt stehen oben in
`src/fx/fireworks-sound.ts`. Ton gibt es erst nach dem ersten Klick/Tippen auf der Seite (Browser-Regel), der Schalter „♪ Ton“ im Footer schaltet ihn aus.

**Rechtstexte:** Impressum, Datenschutzerklärung, Versand & Rückgabe (mit Widerrufsbelehrung) und Kontakt stehen in `src/legal.ts`
und öffnen sich aus den Footer-Links als Karte (auch per Adresse, z. B. `/#impressum`). Name, Anschrift, E-Mail usw. trägst du im CMS
unter „Rechtliches“ ein; fehlende Angaben erscheinen gelb markiert. Das sind Mustertexte, bitte vor dem Verkauf rechtlich prüfen lassen.
Seit 19.06.2026 ist außerdem eine elektronische Widerrufsfunktion („Vertrag widerrufen“, § 356a BGB) Pflicht, die in dieser Version noch nicht eingebaut ist.

