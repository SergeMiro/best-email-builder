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
- **No account, no vendor.** It is a React component and a server handler
  you run in your own app, against your own database. The AI generation is
  optional and runs on your server, with your own key.
- **Readable from end to end.** The engine is hidden behind one adapter, every
  block and feature is a registry entry, and the rules a template must obey
  live in one validation folder — so it is easy to change what you need.
- **Open to contributions.** Bug reports, new blocks, new locales, storage
  recipes for your database and fixes for a mail client that renders something
  oddly are all welcome — see [Contributing](#contributing).

- **MJML under the hood** — every block compiles to battle-tested, table-based
  email HTML. You never write a `<table>` by hand. Every template is checked
  against what Outlook (MSO tables, VML backgrounds), Gmail (102 KB clipping,
  dropped CSS) and Apple Mail need, and rendered at desktop and phone widths
  in the test suite.
- **The blocks emails are made of**: heading, text, image, button, divider,
  spacer, social links, menu, 1 to 4 columns, image + text, and a hero banner
  with a background image — sections take a background image too.
  Columns take a share of the row (1/4 to 3/4), a section's background can
  span the whole screen, an image can take the full width on phones.
- **Its own editor, end to end.** The interface, the canvas and the drag and
  drop are the builder's own; the email is a tree of MJML elements, and MJML
  alone turns it into HTML. The canvas shows the real compiled email — what you
  see is what Outlook, Gmail and Apple Mail receive. Templates are stored by
  *your* backend, as a versioned JSON project (the source of truth) plus
  server-compiled HTML.
- **Editing that behaves**: drag a block, a line shows exactly where it will
  land; double-click a text to type in place, with bold, italic, underline,
  links; every element has its name, its toolbar (parent, move, duplicate,
  delete) and its keyboard shortcuts; an empty field of the panel shows the
  value MJML will really use.
- **Server-side rendering only.** The browser never sends HTML: the server
  validates the project and the MJML, compiles, and stores its own HTML.
- **An email written from scratch by AI** — the user picks what it is for
  among 68 purposes (sale, Christmas, password reset, meeting reminder, order
  shipped…), adds a line of details if they want, and a complete email opens in
  the editor, subject and preview text included, ready to edit and save. The
  model's MJML is cleaned and checked like any template before it gets there.
  OpenRouter, Gemini, Groq, Mistral, OpenAI, DeepSeek, Cerebras, Ollama or any
  OpenAI-compatible API by its key — free tiers included — and Claude through
  its SDK; on your server, or in the page with each user's own key — and the
  provider they choose.
- **Any text rewritten in one click** — select a text or a button: *Shorter*,
  *Longer*, *Fix mistakes*, *Friendlier*, *More formal*, *Translate* into 13
  languages, or say what to change in your own words. The text changes in
  place, links and variables kept; Ctrl+Z brings the previous one back.
- **Three subject lines on demand** — drawn from the words of the email, each
  from its own angle; a click puts one in the subject, your own stays in the
  list to come back to.
- **The AI is optional** — a module of its own (`best-email-builder/ai`):
  without it, no AI button, and none of its code in your bundle.
- **Your brand in every email** — give your website: the logo, colors and
  font are read from it (or set by hand), and new emails, templates and
  blocks start in them.
- **A gallery of ready-made emails** — newsletter, welcome, promotion, event
  invitation… each one with the sender's footer and the unsubscribe link, so
  nobody starts from a blank page or forgets the legal mentions.
- **Production features**: undo/redo, desktop/mobile canvas, autosave and local
  drafts, versions, conflict detection between concurrent editors, image
  uploads, server preview with quality checks (missing alt text, missing
  unsubscribe link, unknown variables, Gmail clipping…) and a dark-mode view
  (as the Gmail and Outlook apps repaint emails), test sends.
- **Merge-tag variables your users create themselves** — searchable menu
  (Ctrl K, like every search of the builder),
  insertion at the caret, in the subject line too, sample values for the
  preview and fallbacks for recipients without a value.
- **Framework-agnostic server**: one Fetch-API handler for Next.js, Hono, Bun,
  Deno, Cloudflare Workers — and Express / Node `http` through a bridge.
- **English and French** built in, any other language through a dictionary.

```
React UI ─► EmailEditor ─► NativeAdapter ─► the email: an MJML tree
 (ui/)        (core/)        (engine/)        │  canvas = the email compiled
                                              │  by mjml-browser
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
| A — the library | `import { TemplateLibrary } from 'best-email-builder/library'` | Your templates and the ready-made bases in a searchable list, the selected one's details, its rendered preview (desktop / mobile, light / dark). *Edit*, *New template* and *Start from this base* only call `onEdit(template)` / `onCreate(start)` — it never mounts an editor, and loads neither the editor's engine nor its MJML compiler. |
| B — the editor | `import { EmailBuilder } from 'best-email-builder/builder'` | The editor (above). Opens whatever the host hands it; knows nothing of the library. |
| A + B | `import { EmailStudio } from 'best-email-builder'` | The two wired together: the library, then the editor, then back to the library with the template just saved selected. The editor has no *Templates* button there — the bases are in the library. |

`best-email-builder` (the main entry) still exports everything; the two
sub-entries are for an application that wants one block only. Both use the
same stylesheet, `best-email-builder/styles.css`.

#### A + B, nothing to wire

```jsx
import { EmailStudio, createHttpStorage } from 'best-email-builder';

<EmailStudio storage={createHttpStorage()} locale="fr" sender={sender} />
```

#### Block B with your own library

Your library (a table, a sidebar, a modal — anything) only decides what the
editor opens, and hears back when it saves or closes:

| Your library wants to… | Pass to `EmailBuilder` |
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
  const [open, setOpen] = useState(null); // null = my library

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

### 4. AI (an optional module)

The AI is a module of its own, `best-email-builder/ai`. An application that
does not import it has no AI button anywhere, and none of the AI's code or
texts in its bundle. Given to the builder, it brings three things:

- **Generate** (toolbar) — asks one thing: what the email is for (a badge
  among 68, grouped: sales, holidays, events, news, account, orders,
  relationship, organization), with an optional line of details. The email is
  written in the interface's language, with the builder's sender and
  variables, and replaces the one being edited — the dialog says so before,
  not after.
- **Rewrite with AI** (properties of a text or a button) and **Suggest
  subjects** (under the subject), below.

```jsx
import { createAi } from 'best-email-builder/ai';

<EmailBuilder storage={storage} ai={createAi(/* where the model runs, below */)} />
```

Pass `generate: false`, `rewrite: false` or `suggestSubjects: false` to leave
a part out (its button with it), or functions of your own for any of them.

#### Where the model runs

**On your server** — the key stays there; the right choice for production:

```js
// server
import { createEmailBuilderHandler, compileMjml } from 'best-email-builder/server';
import { createEmailGenerator, providerEmailModel } from 'best-email-builder/ai/server';

const handler = createEmailBuilderHandler({
  /* … */
  generator: createEmailGenerator({
    model: providerEmailModel({ provider: 'openrouter', apiKey: process.env.OPENROUTER_API_KEY }),
    compile: compileMjml, // MJML's own warnings go back to the model
  }),
  rateLimits: { generatePerHour: 30, rewritePerHour: 200, subjectsPerHour: 100 }, // per user (defaults)
});
```

```jsx
// browser: the handler's /generate, /rewrite and /subjects routes
<EmailBuilder storage={createHttpStorage()} ai={createAi()} />
```

`createAi({ baseUrl, headers })` points at the same routes elsewhere, or with
the user's credentials. Without a `generator`, those routes answer 501.

**In the page, with each user's own key** — no server needed: the first AI
action opens a *Connect* dialog (the provider, a link to get a key, what is
free), the key is kept in that browser and sent only to the provider. A key
the provider refuses is forgotten and asked again. Off by default:

```jsx
const ai = createAi({ provider: 'openrouter', askKey: true });
```

Give a list and each user chooses: the dialog shows the providers as cards
(name, model, free or not, a dot on those whose key this browser keeps). The
choice and one key per provider are remembered; going back to a provider whose
key is kept needs nothing pasted.

```jsx
const ai = createAi({ provider: ['openai', 'mistral', 'gemini', 'openrouter'], askKey: true });
```

`ai.key` reads and changes it: `provider` (the one in use), `providers`,
`choose(id)`, `get(id?)`, `set(key)`, `forget()`, `request()` (opens the
dialog — to change provider, for one), `subscribe(fn)`, `state()`
(`{ asking, refused, connected }`). This is what the live demo does.

**In the page, with one key for everyone** — prototypes and internal tools
only, the key is in the page's code: `createAi({ provider: 'groq', apiKey })`.

#### Providers

Every provider here speaks the OpenAI *chat completions* API; nothing to
install. `provider` is an id below, or `{ id, model, baseUrl, headers, maxTokens, body }`
to change the model or reach an endpoint of your own. `AI_PROVIDERS` lists them
(name, address, default model, where to get a key, what is free).

| `provider` | Default model | Free to start | Key |
|---|---|---|---|
| `'openrouter'` | `openrouter/free` (a router over the free models of the day) | free models, with a free account | [openrouter.ai/keys](https://openrouter.ai/keys) |
| `'gemini'` | `gemini-3.5-flash-lite` | free tier, rate-limited | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| `'groq'` | `openai/gpt-oss-120b` | free tier, rate-limited | [console.groq.com/keys](https://console.groq.com/keys) |
| `'cerebras'` | `gpt-oss-120b` | free tier, rate-limited | [cloud.cerebras.ai](https://cloud.cerebras.ai/) |
| `'mistral'` | `mistral-small-latest` | free *Experiment* plan | [console.mistral.ai/api-keys](https://console.mistral.ai/api-keys) |
| `'openai'` | `gpt-5-mini` | — | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `'deepseek'` | `deepseek-chat` | — | [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys) |
| `'ollama'` | — (give `model`) | runs on your machine, no key | — |
| `'openai-compatible'` | — (give `baseUrl` and `model`) | LM Studio, vLLM, Together, a proxy of your own… | as it needs |

```js
providerEmailModel({ provider: { id: 'groq', model: 'llama-4-scout' }, apiKey });
providerEmailModel({ provider: { baseUrl: 'http://localhost:1234/v1', model: 'qwen3' } });
```

- Model names change often: the defaults were current at this release —
  pass `model` to be sure of yours.
- `openrouter/free` costs nothing and is slow: most free models reason before
  they write, so an email takes two to six minutes, and some days a free
  model is busy upstream. OpenRouter is asked for less reasoning
  (`reasoning: { effort: 'low' }`) and given room for it (`maxTokens: 32000`;
  16 000 elsewhere). For drafts in seconds, use a free tier with a key of its
  own (Gemini, Groq, Cerebras) or a paid model.
- `body` adds fields of your own to each request — OpenRouter's fallback list,
  for one: `providerEmailModel({ provider: 'openrouter', apiKey, body: { models: [...] } })`.
  It cannot change the model, the messages or the output limit.
- The answer is asked as structured output (a JSON schema); a model that
  refuses it is asked for a JSON object, then for plain JSON — once, then
  remembered. A model whose structured output breaks the JSON (some do on the
  quotes of HTML) can be told to skip it: `provider: { …, format: 'text' }`.
- The provider's failures become errors the interface explains, in its
  language: `KEY_MISSING`, `KEY_REFUSED`, `MODEL_CREDITS`, `MODEL_BUSY`,
  `MODEL_ERROR` (with the provider's own text in `detail`). An exhausted
  quota is `MODEL_CREDITS`, not `MODEL_BUSY`, even when it comes as a 429
  (OpenAI's `insufficient_quota`) or a 400 (Anthropic's credit balance);
  `failureCode(status, message)` is that rule, for a model of your own. None is a 401:
  the key is the AI's, not the user's session. A 403 about the model (not
  available here, in this region) or the content is not `KEY_REFUSED`: with
  `askKey`, the user's key is not thrown away for it.
- **Claude**: `claudeEmailModel({ client: new Anthropic() })` with the
  Anthropic SDK (`npm install @anthropic-ai/sdk`) — `claude-opus-5-5` by
  default, `effort: 'medium'`, structured output, streamed so a long email
  does not hit a request timeout — or through OpenRouter with an
  `anthropic/…` model and one key for every model. With `askKey`, Claude is
  one more provider to choose, with the user's own Anthropic key and the SDK
  loaded only when it is chosen:

  ```js
  import { claudeProvider, createAi } from 'best-email-builder/ai';

  const claude = claudeProvider({
    client: async (apiKey) => {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    },
  });
  createAi({ provider: ['openai', claude, 'gemini'], askKey: true });
  ```
- **Anything else** is a function `({ system, messages, schema, signal, task })
  => Promise<string>` returning the JSON text — `createEmailGenerator({ model })`
  on the server, `createAi({ model })` in the page.

A generation takes from 20 seconds to a minute or two: on a server, give the
route that long (`maxDuration` on Vercel, the proxy's timeout).

What comes out is never trusted as is: shorthand padding is expanded,
elements the builder does not edit (`mj-hero`, `mj-wrapper`, `mj-head`…) are
turned into sections and columns, stock photos are removed (the user picks
real images; the alt text stays), unknown variables become visible
`[placeholders]`, and the result must pass the same validation as a saved
template. When a problem remains, the model gets one more turn with the list.
The prompt (`SYSTEM_PROMPT`, `buildUserPrompt`) and the purposes
(`EMAIL_PURPOSES`) are exported from `best-email-builder/ai/server`.

**Rewrite with AI.** The same generator rewrites one text: with it, selecting
a text block or a button shows a *Rewrite with AI* section in its properties —
*Shorter*, *Longer*, *Fix mistakes*, *Friendlier*, *More formal*, *Translate*
(13 languages, under their own names) and a field to say what to change. The
answer replaces the text at once, in one step of the history: Ctrl+Z brings
the previous text back, so there is nothing to accept or compare. Selecting
another element cancels a rewrite in progress; if the text was edited
meanwhile, the user's words win and the answer is dropped.

- On a server it is `POST {base}/rewrite`; a generator without `rewrite`
  answers 501.
- Every link (the same `href`, none added) and every variable (the same keys,
  none added; a fallback after `|` may be translated) must survive, and the
  HTML must pass the validator — otherwise the model gets one more turn, then
  nothing is changed. A button label comes back as plain words.
- `claudeEmailModel` asks a rewrite for `rewriteEffort: 'low'` (a few seconds);
  a model of your own gets `task: 'rewrite'` in its request to tell the two apart.
- `REWRITE_ACTIONS`, `REWRITE_LANGUAGES` and `REWRITE_SYSTEM_PROMPT` are
  exported.

**Suggest subjects.** Under the subject of the email, *Suggest subjects* asks
for three other subject lines, drawn from the words of the email, each from
its own angle (clear, curious, personal or timely). They come as a list to
pick from, with the user's own subject first: a click puts one in the field,
another click another one, the first row brings the user's subject back.
*More ideas* asks for three new ones, *Done* closes the list.

- On a server it is `POST {base}/subjects` (`generator.suggestSubjects`);
  100 per user per hour.
- The subjects are plain lines, different from the current subject and from
  each other, in the language of the email; a merge tag is allowed only from
  the server's catalog. Otherwise the model gets one more turn; fewer than
  three good ones are still shown.
- `claudeEmailModel` uses `rewriteEffort` for them as well (`task: 'subjects'`).
  `emailWords(mjml)` (the words a reader sees) and `SUBJECTS_SYSTEM_PROMPT`
  are exported.

The live demo has no server: there, the AI runs in the page with the
visitor's own key, for the provider they choose — OpenAI, Claude, Mistral,
Gemini or OpenRouter (`createAi({ provider: ['openai', claude, 'mistral', 'gemini', 'openrouter'], askKey: true })`).

### 5. Your brand (optional)

The *Brand* button opens one dialog. Its first field is the company's
website: *Get my brand* reads its logo, main color, headings color, font and
name, and fills the fields below. Everything can then be changed by hand
(upload a logo, pick a color), and a small preview follows every change.
*Save* keeps the brand for the whole workspace:

- the email being edited is repainted (the box *Also apply to this email* is
  ticked by default) — one step of the history, Ctrl+Z brings the previous
  look back;
- new emails, gallery templates, inserted blocks and AI-generated emails
  start in the brand: the logo (or the name) at the top, the name in the
  footer, buttons and banners in the main color, headings in their color.

Emails are repainted by **role**, not by exact color, so any email works —
a template, a generated one, one built by hand: filled buttons and colored
banners take the main color, and their text switches to white or dark
whichever reads; bold headings take the headings color; colored links take
the main color (or the headings color when the main one is too light to read
on white); gray footers and body text keep theirs.

```js
import {
  createBrandImporter,
  createMemoryBrandRepository,
} from 'best-email-builder/server';

const handler = createEmailBuilderHandler({
  // …
  brandStore: createMemoryBrandRepository(), // one row: { get(), save(brand) }
  brandImporter: createBrandImporter(),      // optional: "Get my brand"
  rateLimits: { brandImportsPerHour: 20 },   // per user (default)
});

// In the browser:
const storage = createHttpStorage({ brand: true }); // { brand: { import: false } } without an importer
```

- Routes: `GET {base}/brand`, `PUT {base}/brand` (write permission),
  `POST {base}/brand/import` with `{ url }` (write permission). The import
  saves nothing: the user reviews the result first. A logo found on the site
  is stored like an upload (PNG, JPEG or GIF; SVG and WebP logos are skipped,
  since most email apps do not show them — the dialog says so).
- Without `brandImporter` the dialog has no website field; without
  `brandStore` there is no *Brand* button.
- Some websites refuse automated readers (bot protection answers 403): the
  dialog says so, and the brand is filled in by hand.
- `applyBrand(mjml, brand)` and `cleanBrand(brand)` are exported for your
  own pipeline (e.g. rebranding stored templates).

The live demo keeps the brand in `localStorage` and has no website field
(reading a website needs a server).

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
| `ai` | — | The AI module, `createAi()` from `best-email-builder/ai` (see *AI*). Without it, no AI button and no AI code. |

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
  loadBrand?(): Promise<Brand>;                          // enable the Brand button
  saveBrand?(brand): Promise<Brand>;
  importBrand?(url, { signal }): Promise<{ brand; notes }>; // enables "Get my brand"
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
- Reading a brand from a website is a request your server makes to an address
  a user typed, so it is fenced: http(s) on ports 80 and 443 only, no
  credentials in the address, and every address the name resolves to must be
  public — loopback, private networks, link-local and cloud metadata
  (`169.254.169.254`), carrier-grade NAT, multicast and IPv4 hidden in IPv6
  (mapped, NAT64, 6to4) are refused, at the lookup itself so a DNS answer
  cannot slip through. Redirects (4 at most) are checked the same way. Pages,
  stylesheets and logos have size limits after decompression, the whole
  reading 8 seconds, and imports are limited per user (20 per hour).
- Generated emails pass the same MJML validation as saved ones; generation is
  limited per user (30 per hour by default) and needs the `write` permission.
  A rewritten text keeps its links and variables (none added) and passes the
  same validation; rewrites are limited too (200 per user per hour), and so
  are subject ideas (100), whose merge tags come from the server's catalog.

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

[MIT](LICENSE). MJML and mjml-browser are MIT.

## Author

Built and maintained by [Sergiy Miro](https://smiro.dev/projects) — more
open-source work and case studies on [smiro.dev](https://smiro.dev/projects).
