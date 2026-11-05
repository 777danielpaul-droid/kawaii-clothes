import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  server: {
    proxy: { '/api': 'http://localhost:3001' },   // CMS-Server
    // Der Dev-Server liefert sonst jede Datei im Projektordner aus, auch das Geheimnis und die Daten des CMS
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/data/**', 'server/**', 'scripts/**'] },
  },
});
