// Startet CMS-Server und Vite-Entwicklungsserver zusammen (ein Befehl: npm run dev:all).
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import('./setup.mjs');                                   // Passwort bei Bedarf erzeugen

const run = args => spawn(process.execPath, args, { cwd: root, stdio: 'inherit' });
const server = run(['server/index.js']);
const vite = run([path.join('node_modules', 'vite', 'bin', 'vite.js')]);

const stop = () => { server.kill(); vite.kill(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of [server, vite]) child.on('exit', code => { stop(); process.exit(code ?? 0); });
