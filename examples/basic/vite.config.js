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
  createEmailBuilderHandler,
  createMemoryAssetRepository,
  createMemoryTemplateRepository,
  createMemoryVariableRepository,
  toNodeListener,
} from '../../src/server/index.js';

const src = fileURLToPath(new URL('../../src/', import.meta.url));

function emailBuilderApi() {
  return {
    name: 'mailblocks-api',
    configureServer(server) {
      const handler = createEmailBuilderHandler({
        templates: createMemoryTemplateRepository(),
        assets: createMemoryAssetRepository(),
        variableStore: createMemoryVariableRepository(),
        // Demo only: everyone is "demo". Plug your session check here.
        authorize: () => ({ id: 'demo', name: 'demo' }),
        publicUrl: 'http://localhost:5174',
        locale: process.env.MAILBLOCKS_LOCALE || 'en',
        transport: {
          async send({ to, subject, text }) {
            console.log(`\n[mailblocks example] test email to ${to}: ${subject}\n${text.slice(0, 400)}\n`);
          },
        },
      });
      server.middlewares.use(toNodeListener(handler));
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), tailwindcss(), emailBuilderApi()],
  resolve: {
    alias: [
      { find: /^mailblocks\/styles\.css$/, replacement: `${src}styles.css` },
      { find: /^mailblocks$/, replacement: `${src}index.js` },
    ],
  },
  server: { port: 5174, strictPort: true },
});
