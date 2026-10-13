/**
 * Static demo (GitHub Pages): no server. Templates are kept in the browser's
 * localStorage and the preview is compiled with mjml-browser — a real
 * application compiles on the server (`best-email-builder/server`).
 *
 *   npm run demo         → http://localhost:5175
 *   npm run demo:build   → examples/demo/dist (base path from DEMO_BASE)
 */

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const src = fileURLToPath(new URL('../../src/', import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: process.env.DEMO_BASE || '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^best-email-builder\/styles\.css$/, replacement: `${src}styles.css` },
      { find: /^best-email-builder\/builder$/, replacement: `${src}builder.js` },
      { find: /^best-email-builder\/library$/, replacement: `${src}library.js` },
      { find: /^best-email-builder$/, replacement: `${src}index.js` },
    ],
  },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 4000 },
  server: { port: 5175, strictPort: true },
});
