// Richtet die lokale Konfiguration ein, ohne dass etwas von Hand eingetragen werden muss:
// fehlt ADMIN_PASSWORD in .env, wird ein langes zufälliges Passwort erzeugt, gespeichert und einmalig angezeigt.
// Läuft automatisch vor "npm run server", "npm run dev:all" und "npm start". Mit "npm run setup" auch einzeln.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const file = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), '.env');
let text = '';
try { text = fs.readFileSync(file, 'utf8'); } catch { /* .env gibt es noch nicht */ }

if (/^\s*ADMIN_PASSWORD\s*=\s*\S+/m.test(text)) process.exit(0);   // schon eingerichtet

const password = crypto.randomBytes(18).toString('base64url');       // 24 Zeichen
const line = `ADMIN_PASSWORD=${password}`;
text = /^\s*ADMIN_PASSWORD\s*=\s*$/m.test(text)
  ? text.replace(/^\s*ADMIN_PASSWORD\s*=\s*$/m, line)
  : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`;
fs.writeFileSync(file, text, { mode: 0o600 });

console.log('\n  CMS-Passwort wurde erzeugt und in .env gespeichert:\n');
console.log(`    ${password}\n`);
console.log('  Anmelden: Seite mit ?cms öffnen (z. B. http://localhost:5173/?cms), auf ✎ klicken.\n');
