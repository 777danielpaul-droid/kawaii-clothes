import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: false,         // Sonst setzt Vite die Host-Nachricht auf den Proxy-Ziel-Host
      },
    }, // CMS-Server
    // Der Dev-Server liefert sonst jede Datei im Projektordner aus, auch das Geheimnis und die Daten des CMS
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/data/**', 'server/**', 'scripts/**'] },
  },
});
