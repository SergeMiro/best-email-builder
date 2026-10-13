# Best Email Builder

[![npm version](https://img.shields.io/npm/v/best-email-builder?color=cb3837&logo=npm)](https://www.npmjs.com/package/best-email-builder)
[![npm downloads](https://img.shields.io/npm/dm/best-email-builder?color=cb3837)](https://www.npmjs.com/package/best-email-builder)
[![CI](https://github.com/SergeMiro/best-email-builder/actions/workflows/ci.yml/badge.svg)](https://github.com/SergeMiro/best-email-builder/actions/workflows/ci.yml)
[![Demo](https://img.shields.io/badge/demo-live-5b4fe0)](https://sergemiro.github.io/best-email-builder/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

A drag-and-drop **email builder for React** that produces emails which actually
render in Outlook, Gmail, Apple Mail and on mobile.

**[Live demo](https://sergemiro.github.io/best-email-builder/)** — runs entirely in your
browser (templates are kept in `localStorage`). ·
**[npm](https://www.npmjs.com/package/best-email-builder)** — `npm install best-email-builder`

## Built for the whole developer community

Every product that talks to its users ends up needing an email editor, and the
choice is usually between a paid SaaS widget you cannot style or own, and a
canvas you have to wire to MJML, storage, validation and sending yourself.
Best Email Builder is the second option done once, properly, and given away:

- **Free and MIT-licensed** — use it in commercial products, fork it, ship it.
- **No account, no API key, no vendor.** It is a React component and a server
  handler you run in your own app, against your own database.
- **Readable from end to end.** The engine is hidden behind one adapter, every
  block and feature is a registry entry, and the rules a template must obey
  live in one validation folder — so it is easy to change what you need.
- **Open to contributions.** Bug reports, new blocks, new locales, storage
  recipes for your database and fixes for a mail client that renders something
  oddly are all welcome — see [Contributing](#contributing).

- **MJML under the hood** — every block compiles to battle-tested, table-based
  email HTML. You never write a `<table>` by hand.
- **The blocks emails are made of**: heading, text, image, button, divider,
  spacer, social links, menu, 1 to 4 columns, image + text, and a hero banner
  with a background image — sections take a background image too.
- **Your UI, your storage, your rendering.** The builder is a React component
  with its own interface; GrapesJS is only the internal canvas engine, hidden
  behind an adapter. Templates are stored by *your* backend, as a versioned JSON
  project (the source of truth) plus server-compiled HTML.
- **Server-side rendering only.** The browser never sends HTML: the server
  validates the project and the MJML, compiles, and stores its own HTML.
- **A gallery of ready-made emails** — newsletter, welcome, promotion, event
  invitation… each one with the sender's footer and the unsubscribe link, so
  nobody starts from a blank page or forgets the legal mentions.
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
npm install best-email-builder
```

Peer dependencies: `react` and `react-dom` ≥ 18.2. The server entry needs
Node ≥ 20 (or any runtime with the Fetch API and `node:crypto`).

## Quick start

### 1. The component

```jsx
import { EmailBuilder, createHttpStorage } from 'best-email-builder';
import 'best-email-builder/styles.css';

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

The builder fills its parent: give the parent a height. It adapts to the
width it is given — not the window's: three columns from 1180 px, properties
in a drawer below that, and on a phone the canvas alone with *Add a block* /
*Edit* drawers. It is a client-only
component (the canvas needs the DOM). With Next.js, load it with
`dynamic(() => import(...), { ssr: false })` or render it from a
`'use client'` component.

### Two blocks, each one on its own

The package has two blocks. An application installs one, the other, or both,
and each has its own entry point, so one never brings the other's code:

| Block | Import | What it is |
|---|---|---|
| A — the bank | `import { TemplateLibrary } from 'best-email-builder/library'` | Your templates and the ready-made bases in a searchable list, the selected one's details, its rendered preview (desktop / mobile). *Edit*, *New template* and *Start from this base* only call `onEdit(template)` / `onCreate(start)` — it never mounts an editor, and does not load GrapesJS. |
| B — the editor | `import { EmailBuilder } from 'best-email-builder/builder'` | The editor (above). Opens whatever the host hands it; knows nothing of the bank. |
| A + B | `import { EmailStudio } from 'best-email-builder'` | The two wired together: the bank, then the editor, then back to the bank with the template just saved selected. The editor has no *Templates* button there — the bases are in the bank. |

`best-email-builder` (the main entry) still exports everything; the two
sub-entries are for an application that wants one block only. Both use the
same stylesheet, `best-email-builder/styles.css`.

#### A + B, nothing to wire

```jsx
import { EmailStudio, createHttpStorage } from 'best-email-builder';

<EmailStudio storage={createHttpStorage()} locale="fr" sender={sender} />
```

#### Block B with your own bank

Your bank (a table, a sidebar, a modal — anything) only decides what the
editor opens, and hears back when it saves or closes:

| Your bank wants to… | Pass to `EmailBuilder` |
|---|---|
| open a saved template | `templateId={id}` (the editor loads it from `storage`) |
| start from content it has (a base, an import, a copy) | `initialMjml={mjml}` and, optionally, `initialMeta={{ subject, preheader }}` |
| start from a blank email | neither |
| refresh its list after a save | `onSaved={(template) => …}` — `template.id` is set from the first save on |
| show itself again | `onClose={() => …}` (the *Back* button) |
| hide the editor's own gallery of bases | `templates={[]}` |

Give the editor a `key` that changes with what it opens, so switching from one
template to another starts a fresh editor.

```jsx
import { useState } from 'react';
import { EmailBuilder, createHttpStorage } from 'best-email-builder/builder';

const storage = createHttpStorage();

function Emails() {
  const [open, setOpen] = useState(null); // null = my bank

  if (!open) {
    return (
      <MyTemplateList                                     // your block A
        onOpen={(id) => setOpen({ key: id, templateId: id })}
        onNew={() => setOpen({ key: `new-${Date.now()}` })}
      />
    );
  }
  return (
    <EmailBuilder
      key={open.key}
      storage={storage}
      locale="fr"
      templates={[]}
      templateId={open.templateId ?? null}
      initialMjml={open.mjml}
      initialMeta={open.meta}
      onSaved={() => refreshMyList()}
      onClose={() => setOpen(null)}
    />
  );
}
```

Your list can read the same templates with `storage.list()` (summaries, newest
first) or from your own API — the editor only needs the `id`.

#### Block A with your own editor

```jsx
import { TemplateLibrary, createHttpStorage } from 'best-email-builder/library';

<TemplateLibrary
  storage={createHttpStorage()}
  locale="fr"
  onEdit={(template) => router.push(`/emails/${template.id}`)}
  onCreate={(start) => openMyEditor(start)}   // start: null (new), or { baseId, mjml, meta: { subject, preheader } }
  onClose={closeModal}                        // optional: shows a close button
/>
```

The library needs `storage.list()`; *Delete* appears when the storage has
`remove()`, the preview uses `render()` (else the HTML compiled at the last
save). Its props: `storage`, `locale`, `messages`, `onNotify`, `sender`,
`templates` (the bases, `[]` hides them), `title`, `description`,
`selectedId`, `favoritesKey` (the star of the details moves an entry to a
*Favorites* section at the top; kept in `localStorage` under this key, `null`
turns favorites off), `onEdit`, `onCreate`, `onClose`, `className`. Like the
builder, it fills its parent and follows its own width (three columns, then
two, then list and details as two screens).

### 2. The server routes

```js
// app/api/email-builder/[...path]/route.js (Next.js App Router)
import {
  createEmailBuilderHandler,
  createMemoryTemplateRepository,
  createMemoryAssetRepository,
  createMemoryVariableRepository,
} from 'best-email-builder/server';

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
import { createEmailBuilderHandler, toNodeListener } from 'best-email-builder/server';

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
import { personalize, applyVariablesToText } from 'best-email-builder/server';

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
| `templates` | `TEMPLATE_GALLERY` | Ready-made emails offered by the *Templates* button (blank, simple, newsletter, welcome, promotion, event invitation). Pass your own `{ id, name, description, create({ sender, t }), meta?(t) }` entries, or `[]` to hide the gallery. |
| `initialMjml`, `initialMeta` | — | Open a NEW template on given MJML and metadata (`{ name, subject, preheader, description }`) — e.g. a template converted from another format. Ignored with `templateId`. |
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
  list?(): Promise<Template[]>;            // TemplateLibrary: newest first, no document/MJML
  load(id): Promise<Template>;
  remove?(id): Promise<void>;              // TemplateLibrary: enables Delete
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

All colours, radii and fonts are CSS custom properties prefixed `--eb-`
(see [`src/styles.css`](src/styles.css)). Override them on `:root`:

```css
:root {
  --eb-primary: #0f766e;
  --eb-primary-foreground: #fff;
  --eb-font-sans: 'Inter', sans-serif;
}
```

A dark theme applies under a `.dark` ancestor. The stylesheet uses Tailwind
CSS v4 with an `eb:` prefix and a reset scoped to the builder: it does not
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

## Contributing

This project is built for and with the developer community. Good first
contributions:

- **a new block** — one folder in `src/blocks/` and one line in its registry;
- **a new interface language** — a dictionary like `src/i18n/fr.js`
  (`npm run check:i18n` lists the missing keys);
- **a storage recipe** — the memory repositories are the reference shape for
  PostgreSQL, MongoDB, S3 and friends;
- **a rendering report** — a template that looks wrong in a given mail client,
  with a screenshot and the client version.

Open an [issue](https://github.com/SergeMiro/best-email-builder/issues) to
discuss a larger change first. Security problems go through the private
channel described in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). GrapesJS and grapesjs-mjml are BSD-3-Clause, MJML is MIT.

## Author

Built and maintained by [Sergiy Miro](https://smiro.dev/projects) — more
open-source work and case studies on [smiro.dev](https://smiro.dev/projects).
