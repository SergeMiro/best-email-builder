# mailblocks

A drag-and-drop **email builder for React** that produces emails which actually
render in Outlook, Gmail, Apple Mail and on mobile.

**[Live demo](https://OWNER.github.io/mailblocks/)** — runs entirely in your
browser (templates are kept in `localStorage`).

- **MJML under the hood** — every block compiles to battle-tested, table-based
  email HTML. You never write a `<table>` by hand.
- **Your UI, your storage, your rendering.** The builder is a React component
  with its own interface; GrapesJS is only the internal canvas engine, hidden
  behind an adapter. Templates are stored by *your* backend, as a versioned JSON
  project (the source of truth) plus server-compiled HTML.
- **Server-side rendering only.** The browser never sends HTML: the server
  validates the project and the MJML, compiles, and stores its own HTML.
- **Production features**: undo/redo, desktop/mobile canvas, autosave and local
  drafts, versions, conflict detection between concurrent editors, image
  uploads, server preview with quality checks (missing alt text, missing
  unsubscribe link, unknown variables, Gmail clipping…), test sends.
- **Merge-tag variables your users create themselves** — searchable menu,
  insertion at the caret, in the subject line too, sample values for the
  preview and fallbacks for recipients without a value.
- **Framework-agnostic server**: one Fetch-API handler for Next.js, Hono, Bun,
  Deno, Cloudflare Workers — and Express / Node `http` through a bridge.
- **English and French** built in, any other language through a dictionary.

```
React UI ─► EmailEditor ─► GrapesJsAdapter ─► GrapesJS + grapesjs-mjml
 (ui/)        (core/)        (adapters/)          internal engine
                                                         │ project JSON + MJML
Server: validation ─► MJML compilation ─► variables ─► links ─► final HTML
```

## Install

```bash
npm install mailblocks
```

Peer dependencies: `react` and `react-dom` ≥ 18.2. The server entry needs
Node ≥ 20 (or any runtime with the Fetch API and `node:crypto`).

## Quick start

### 1. The component

```jsx
import { EmailBuilder, createHttpStorage } from 'mailblocks';
import 'mailblocks/styles.css';

const storage = createHttpStorage({ baseUrl: '/api/email-builder' });

export default function TemplateEditor({ templateId, onClose }) {
  return (
    <div style={{ height: '100vh' }}>
      <EmailBuilder
        storage={storage}
        templateId={templateId}        // omit to create a new template
        onClose={onClose}
        onSaved={(template) => console.log('saved', template.id)}
      />
    </div>
  );
}
```

The builder fills its parent: give the parent a height. It is a client-only
component (the canvas needs the DOM). With Next.js, load it with
`dynamic(() => import(...), { ssr: false })` or render it from a
`'use client'` component.

### 2. The server routes

```js
// app/api/email-builder/[...path]/route.js (Next.js App Router)
import {
  createEmailBuilderHandler,
  createMemoryTemplateRepository,
  createMemoryAssetRepository,
  createMemoryVariableRepository,
} from 'mailblocks/server';

const handler = createEmailBuilderHandler({
  templates: createMemoryTemplateRepository(), // replace with your database
  assets: createMemoryAssetRepository(),       // replace with your database / object storage
  variableStore: createMemoryVariableRepository(), // optional: user-created variables
  authorize: async (request, { action }) => {
    const user = await getUserFromSession(request); // your auth
    return user ? { id: user.id, name: user.email } : null; // null → 401
  },
  publicUrl: process.env.PUBLIC_URL,            // absolute image URLs in sent emails
  transport: {                                  // optional: enables "Send test"
    send: ({ to, subject, html, text }) => mailer.sendMail({ from: 'no-reply@example.com', to, subject, html, text }),
  },
});

export { handler as GET, handler as POST, handler as PUT, handler as DELETE };
```

Express or plain Node:

```js
import express from 'express';
import { createEmailBuilderHandler, toNodeListener } from 'mailblocks/server';

const app = express();
app.use(toNodeListener(createEmailBuilderHandler({ /* … */ })));
```

Uploaded images are served **publicly** at `GET {basePath}/assets/<key>`
(mail clients download them without a session). Make sure that path is not
behind your authentication middleware.

### 3. Sending a campaign

The builder stores the compiled HTML; at send time, personalize it per
recipient:

```js
import { personalize, applyVariablesToText } from 'mailblocks/server';

const variables = await handler.catalog();   // system + user-created variables
const values = { 'contact.firstname': 'Ada', 'contact.email': 'ada@example.com' };
const html = personalize(template.html, {
  values,
  variables,
  unsubscribeUrl: signedUnsubscribeUrl(recipient),
  baseUrl: 'https://app.example.com',   // makes uploaded images absolute
});
const subject = applyVariablesToText(template.subject, values, variables);
```

With an email provider that does its own merge, map the tags instead:
`mapVariables(html, { 'contact.firstname': '{{ contact.FIRSTNAME }}' })`.

## Component props

| Prop | Default | Description |
|---|---|---|
| `storage` | `createHttpStorage()` | Where templates and images go (see *Storage*). |
| `templateId` | `null` | Template to open; `null` starts from the starter template (or a local draft). |
| `locale` | `'en'` | `'en'`, `'fr'`, or any BCP 47 tag used with `messages`. |
| `messages` | — | Extra or overriding translations (`{ 'Save': 'Speichern', … }`). |
| `onNotify` | built-in notices | `(level, message) => void` to use your own toaster. |
| `variables` | `DEFAULT_VARIABLES` | Merge tags offered in the *Variables* menu. Pass the same list to the server. |
| `sender` | — | `{ name, address, logoUrl, logoWidth }` used by the starter template footer. |
| `starterMjml` | — | Replace the starter template entirely. |
| `testRecipients` | `[]` | Addresses pre-filled in the *Send test* dialog. |
| `onClose` | — | Shows a *Back* button; called after confirming unsaved changes. |
| `onSaved` | — | Called with the saved template. |
| `onDirtyChange` | — | Called when the unsaved state changes. |
| `dirtyCheckRef` | — | Ref receiving a function `() => boolean` (synchronous dirty check). |

## Storage

The component only knows this contract — implement it to talk to any backend,
or use `createHttpStorage()` with the server handler:

```ts
interface TemplateStorage {
  load(id): Promise<Template>;
  create(payload): Promise<{ template; warnings }>;
  duplicate(id): Promise<{ template; warnings }>;
  save(id, payload): Promise<{ template; warnings; version }>;
  listVersions(id): Promise<Version[]>;
  getVersion(id, versionId): Promise<Version & { document; mjml }>;
  uploadImage(file): Promise<{ path }>;
  render?(input): Promise<{ html; warnings; quality }>;   // enables Preview
  sendTest?(input): Promise<{ sent; failed; invalid; results }>; // enables Send test
  listVariables?(): Promise<Variable[]>;                 // enable user-created variables
  saveVariable?(variable, { create }): Promise<Variable>;
  deleteVariable?(key): Promise<void>;
}
```

`createMemoryStorage()` implements it in memory (demos, tests, Storybook-like
playgrounds).

## Server repositories

The handler applies the business rules (validation, compilation, versions,
concurrency); persistence is delegated to two small repositories. The memory
implementations (`createMemoryTemplateRepository`, `createMemoryAssetRepository`)
are the reference: copy their shape for SQL, MongoDB, S3…

- `templates.update(id, fields, { expectedRevision })` must be **atomic**
  (`UPDATE … WHERE id = ? AND revision = ?`) and return `{ conflict: true, current }`
  on mismatch — this is what prevents two editors from overwriting each other.
- `templates.addVersion(templateId, version, { keep })` numbers versions and
  keeps the latest `keep` (50 by default).
- `assets.findBySha256 / insert / get` — images are deduplicated by content hash.

The full contracts are documented as JSDoc types in
[`src/server/templates.js`](src/server/templates.js) and
[`src/server/assets.js`](src/server/assets.js).

## Variables

The editor only inserts tags; values are filled on the server.

**System variables** come from your application (read-only in the interface):

| Tag | Sample |
|---|---|
| `{{contact.firstname}}`, `{{contact.lastname}}`, `{{contact.email}}` | Jane, Doe, jane.doe@example.com |
| `{{company.name}}` | Example Inc. |
| `{{campaign.name}}` | Newsletter |
| `{{ unsubscribe }}` | the unsubscribe link (`unsubscribeUrl`) |

Define your own list with `defineVariables([...])` and pass it to both
`<EmailBuilder variables>` and `createEmailBuilderHandler({ variables })`.

**Custom variables** are created by users from the *Variables* menu
(*New variable*): a name ("Order number"), a tag proposed from it
(`{{order_number}}`, frozen once created since templates contain it), a group,
a **sample value** used by the preview and test sends, and a **value if empty**
for recipients without one. They are shared by every template and stored by the
`variableStore` repository (`createMemoryVariableRepository` is the reference).

Using them:

- the menu has a search field (↑/↓ and Enter work), and a search without
  result offers to create the variable under that name;
- a click inserts the tag at the caret of the text being edited; the
  unsubscribe link becomes the URL of a selected button;
- the `{ }` buttons next to *Subject* and *Preview text* insert a tag there;
- `{{contact.firstname|there}}` sets an inline fallback for one place;
- the preview flags unknown tags (`{{contact.fistname}}`) before they reach anyone.

Values are HTML-escaped. A missing value falls back to the inline fallback,
then to the variable's *value if empty*, then to an empty string — a raw tag
never reaches a recipient.

## Theming

All colours, radii and fonts are CSS custom properties prefixed `--mb-`
(see [`src/styles.css`](src/styles.css)). Override them on `:root`:

```css
:root {
  --mb-primary: #0f766e;
  --mb-primary-foreground: #fff;
  --mb-font-sans: 'Inter', sans-serif;
}
```

A dark theme applies under a `.dark` ancestor. The stylesheet uses Tailwind
CSS v4 with an `mb:` prefix and a reset scoped to the builder: it does not
touch the rest of your page, whether or not you use Tailwind yourself.

## Security model

- The server never stores HTML from the browser: it compiles its own.
- MJML and projects are validated against an allow-list (no scripts, event
  handlers, `javascript:` URLs, `mj-include`, conditional comments…).
- Uploaded images are type-checked from their bytes (PNG, JPEG, GIF; SVG is
  refused), limited to 2 MB, keyed by content hash and served with
  `nosniff` and a sandboxing CSP.
- Previews are rendered in an iframe with an empty `sandbox`.
- Test sends are limited (10 addresses, 20 sends per user per hour by default).

## Development

```bash
npm install
npm run dev            # Ladle playground on http://localhost:61010
npm test               # unit tests (node:test)
npm run lint
npm run typecheck
npm run test:stories   # Playwright against the playground
npm run example        # full example app (React + server)
npm run demo           # static demo (the GitHub Pages one)
npm run test:e2e       # Playwright against the example app
npm run build          # dist/ (ESM + styles.css + types)
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the internals and
[CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## License

[MIT](LICENSE). GrapesJS and grapesjs-mjml are BSD-3-Clause, MJML is MIT.
