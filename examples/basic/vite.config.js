/**
 * Example application: the builder and its server routes in one Vite dev
 * server. Templates and images live in memory (lost on restart); test emails
 * are printed to the console instead of being sent.
 *
 *   npm run example   →   http://localhost:5174
 */

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {
  createBrandImporter,
  createEmailBuilderHandler,
  createMemoryAssetRepository,
  createMemoryBrandRepository,
  createMemoryTemplateRepository,
  createMemoryVariableRepository,
  toNodeListener,
} from '../../src/server/index.js';

const src = fileURLToPath(new URL('../../src/', import.meta.url));

function emailBuilderApi() {
  return {
    name: 'best-email-builder-api',
    configureServer(server) {
      const handler = createEmailBuilderHandler({
        templates: createMemoryTemplateRepository(),
        assets: createMemoryAssetRepository(),
        variableStore: createMemoryVariableRepository(),
        brandStore: createMemoryBrandRepository(),
        // Reads public websites only (private and local addresses are refused).
        brandImporter: createBrandImporter(),
        // Demo only: everyone is "demo". Plug your session check here.
        authorize: () => ({ id: 'demo', name: 'demo' }),
        publicUrl: 'http://localhost:5174',
        locale: process.env.EXAMPLE_LOCALE || 'en',
        transport: {
          async send({ to, subject, text }) {
            console.log(`\n[best-email-builder example] test email to ${to}: ${subject}\n${text.slice(0, 400)}\n`);
          },
        },
      });
      server.middlewares.use(toNodeListener(handler));
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  // Its own dependency cache: the tests run this server beside Ladle, and two
  // Vite servers sharing node_modules/.vite overwrite each other's optimized
  // dependencies (the other one then answers 504 "Outdated Optimize Dep").
  cacheDir: fileURLToPath(new URL('../../node_modules/.vite-example', import.meta.url)),
  plugins: [react(), tailwindcss(), emailBuilderApi()],
  resolve: {
    alias: [
      { find: /^best-email-builder\/styles\.css$/, replacement: `${src}styles.css` },
      { find: /^best-email-builder$/, replacement: `${src}index.js` },
    ],
  },
  server: { port: 5174, strictPort: true },
});
