# Architecture

```
React UI ─► EmailEditor ─► NativeAdapter ─► the email: an MJML tree with ids
 (ui/)        (core/)        (engine/)        │  canvas = that tree compiled by
                                              │  mjml-browser, in a frame
                                              │ project JSON + MJML
Server: validation ─► MJML compilation ─► variables ─► links ─► final HTML
```

**Rule.** The interface, the engine, storage, business logic and rendering all
belong to Best Email Builder; MJML alone turns the email into HTML. No React
component knows the model or the canvas: everything goes through the
`EmailEditor` contract (`core/EmailEditor.js`), and the engine lives in
`engine/`. Replacing the engine means writing another adapter.

## Source tree (`src/`)

| Folder | Role |
|---|---|
| `core/` | `EmailEditor` contract, versioned document envelope (`document.js`), registries, events |
| `engine/` | the builder's own engine: the email model (`model.js`), MJML ⇄ model (`mjml.js`), where blocks go (`placement.js`), the canvas MJML (`canvasMjml.js`), the canvas and its gestures (`canvas/`), the adapter (`NativeAdapter.js`) |
| `blocks/` | one folder per block (heading, text, image, button, divider, spacer, social links, menu, 1–4 columns, image + text, hero banner, structure) + the `emailBlocks` registry |
| `features/` | one folder per feature + the `emailBuilderFeatures` registry (brand, variables, autosave, versions, preview, test send) and the starter template |
| `ai/` | the AI module, an entry of its own (`best-email-builder/ai`, `/ai/server`): proofreading, writing and rewriting, subject ideas, the providers, their buttons and texts — see *AI* |
| `ui/` | the React interface: the editor (`EmailBuilder` — toolbar, blocks sidebar, canvas, properties), the template library (`library/TemplateLibrary`), the two wired together (`EmailStudio`), and the primitives |
| `storage/` | browser storage contract — HTTP and memory implementations |
| `renderer/` | MJML preparation, service links, uploaded image URLs (shared browser/server) |
| `validation/` | what a template may contain (MJML, project, URLs, images, quality checks) |
| `server/` | handler, services, repositories, compilation, test send (`best-email-builder/server`) |
| `i18n/` | translator and built-in locales |

Removing a block or a feature = removing its line from the registry; the core
never refers to one by name.

The two screens do not import each other: `TemplateLibrary` reports *Edit* /
*New* through callbacks and never mounts an editor, `EmailBuilder` knows
nothing of a library. Only `EmailStudio` (a few lines of state) knows both, so
an application can install either screen alone. Each has its own entry —
`src/library.js` (`best-email-builder/library`) and `src/builder.js`
(`best-email-builder/builder`) — and `tests/unit/entries.test.mjs` bundles
both and fails if one reaches the other (or if the library reaches the engine
or the MJML compiler — only the engine's text parser, `model.js` and
`mjml.js`, which the brand uses to repaint the gallery, is allowed).
Hence no module under `ui/` imports `src/index.js`: the default editor is
built in `src/defaultEditor.js`.

## The document

What gets stored is the engine **project**, wrapped in a versioned envelope:

```json
{ "schemaVersion": 1, "engine": "beb-mjml", "engineVersion": "0.4.0",
  "builderVersion": "0.4.0",
  "project": { "format": 1, "root": { "id": "n…", "tag": "mjml", "children": [ … ] } } }
```

The project is the email's MJML tree: one node per element (`tag`,
`attributes`, `children`, or `content` for `mj-text`, `mj-button`…), each with
an id. A document from another engine, a future schema or malformed is
**refused** on load rather than half-loaded: a template silently emptied and
saved again would be lost. The one exception is a template saved before 0.4.0
by the GrapesJS engine: its project cannot be read, but its stored MJML can, so
it opens from the MJML (`loadDocument(document, { mjml })`) and its next save
writes the new format. Schema migrations go into `MIGRATIONS` in
`core/document.js`.

Next to the project, each template stores its MJML export (for inspection) and
the HTML **compiled by the server**.

## The engine

- **Model** (`engine/model.js`): the email is an MJML tree; every change is a
  pure function returning a new tree that shares the untouched branches. The
  undo history is a list of trees; typing in a text, or nudging one field,
  merges into one step while it goes on.
- **MJML ⇄ model** (`engine/mjml.js`): a small scanner reads MJML (the inside
  of `mj-text`, `mj-button`… is kept as HTML) and writes it back, attributes
  encoded. Reading then writing any template gives the same MJML.
- **Canvas** (`engine/canvas/`): a frame showing the email compiled by
  `mjml-browser` — the real HTML, not an imitation. Each element is found in
  it by a marker class MJML copies (`css-class="eb-node eb-id-<id>"`, canvas
  only). Updates are morphed into the frame (images do not reload, the caret
  stays). The canvas adds what only an editor needs, never exported: a frame
  for an image without file, "Drop a block here" in an empty column, the
  selection, labels, toolbars and the drop line.
- **Gestures**: click selects; double-click (or a click on a selected text)
  edits a text in place, with its own formatting bar (bold, italic,
  underline, strike, link, clear) — pasted content arrives as plain text,
  Enter is a line break, and the HTML is reduced to what an email accepts
  (`engine/richText.js`). Blocks are dragged with pointer events (the pointer
  stays captured over the frame): a line shows where the block lands, the
  frame scrolls near its edges, Esc cancels. Keyboard: Delete, Ctrl+Z / Ctrl+Y,
  Ctrl+C / Ctrl+V, Ctrl+D, Escape (parent), Enter (edit the text).
- **Placement** (`engine/placement.js`): MJML's hierarchy decides. A content
  block goes into a column (between two elements, by their middle); over a
  section's top or bottom padding, or outside the sections, it gets a section
  of its own. A layout goes between sections. Social icons, menu links and
  columns only move among their siblings.

## Saving

- "Save" (or Ctrl/Cmd+S) sends the project and its MJML; the server validates
  both, compiles, stores and creates a version.
- Autosave (saved templates only) stores without creating a version; a new
  template keeps a local draft in `localStorage`, offered at the next opening.
- Every write carries the `revision` read at load time. The repository refuses
  the write when it changed (409): the user can save a copy instead.

## AI

`src/ai/` is a module the core never imports: `tests/unit/entries.test.mjs`
checks that no entry of the core (`.`, `/builder`, `/library`, `/server`)
bundles a file of it, nor its texts (`src/ai/i18n/`, checked apart by
`npm run check:i18n`). The builder takes what `createAi()` makes as its `ai`
prop and renders the module's own components; without it, there is nothing of
the AI on screen.

| File | Role |
|---|---|
| `createAi.js` | the module given to the builder: where the model runs (the handler's routes, a provider in the page, a model or functions of one's own), which parts are on, its components and texts |
| `providers.js` | `providerEmailModel`: any OpenAI-compatible API by its key (`AI_PROVIDERS`: OpenRouter, Gemini, Groq, Cerebras, Mistral, OpenAI, DeepSeek, Ollama…), the answer format stepped down when refused, the provider's failures as `EmailGenerationError` codes |
| `keys.js`, `ConnectAi.jsx` | the user's own key (`askKey`): kept per provider in localStorage, asked by the *Connect* dialog, forgotten when refused |
| `ModelPicker.jsx` | the model field of the *Connect* dialog: the provider's list, searched in place, the free ones marked |
| `agent.js`, `agentEndpoint.js` | an AI agent of the application's own as the model (`best-email-builder/agent@1`, see [AGENT.md](AGENT.md)): `agentEmailModel` the builder's side, `createAgentEndpoint` the agent's, `checkAgent` a trial with the builder's own checks |
| `server.js`, `index.js` | the two entries |
| `i18n/` | the module's texts, merged under the host's when it is given |

What the AI does for the texts of an email, each part with its own checks:

| File | Role |
|---|---|
| `generator.js` | `createEmailGenerator({ model })`: the three parts below around one model |
| `errors.js` | `EmailGenerationError` and its codes, the messages the interface shows |
| `claude.js` | the model for Claude (Anthropic SDK client passed in, never imported), `effort: 'low'` by default |
| `proofread.js` | the mistakes of the whole email: the texts sent, the prompt, `reviewFix` (words changed, a third at most; same markup, links and variables) and the loop with one repair turn |
| `diff.js` | `diffWords`, `changedWords`: the word-by-word difference of a correction |
| `ProofreadButton.jsx` | the toolbar button and the dialog: the corrections, applied one by one or all at once (`editor.setContents`, one step of the history) |
| `rewrite.js` | writing on a topic or rewriting one text: the actions and languages, its prompt, `reviewRewrite` (same links, same variables, valid markup) and the loop with one repair turn |
| `RewriteText.jsx` | the *Write with AI* and *Rewrite with AI* sections of the properties of a text or a button |
| `subjects.js` | subject ideas: the words of the email (`emailWords`), the prompt, `reviewSubjects` (distinct, known merge tags) and the loop with one repair turn |
| `SubjectIdeas.jsx` | *Suggest subjects* under the subject field: the list to pick from, the user's subject first |
| `chip.js` | the badge button they use |

The model is a plain function, so the browser (the demo, `createAi({ provider })`),
the server (the handler's `POST /proofread`, `POST /rewrite` and
`POST /subjects`) and the tests (a fake model) run the same generator. The
interface only calls `ai.proofread`, `ai.rewrite` and `ai.suggestSubjects`;
each control is shown when the module has the function.

A rewrite replaces the text through `editor.setContent`, and the corrections
of a proofread through `editor.setContents` — one step of the history either
way, so Ctrl+Z is the undo. The rewrite section is keyed by the selected
element: selecting another one aborts the request. The text sent is the
stored one (`describe(id).html` for a text block, `content` for a button
label), so links and variables are compared on the source, not on what the
canvas shows.

## Dark-mode preview

`features/preview/darkMode.js` repaints the compiled HTML the way the apps
that force dark mode do (Gmail and Outlook apps, Outlook.com): in `style`
attributes, `<style>` sheets and `bgcolor`, a light background or border
(relative luminance above 0.45) becomes a dark one of the same hue, a dark
text color (below 0.3) a light one; brand colors, light text and images stay.
It works on the string — the preview frame keeps its empty `sandbox`, no
script runs. `EmailPreview` (the editor's preview and the library's) switches
between the two with a sun / moon control.

## Brand

`features/brand/` keeps a company's look (name, logo, main color, headings
color, font) and applies it:

| File | Role |
|---|---|
| `brand.js` | colors (parse, contrast, what reads on what), `cleanBrand`, and `applyBrand`: repaints an email by role — filled buttons and colored banners, bold headings, colored links, fonts — and optionally puts the logo or the name in the header and the name in the footer |
| `extract.js` | what a home page says: `readPage` (name, logo candidates, stylesheets, inline styles, theme color) and `brandFromCss` (custom properties, weights by selector, noise filtered, near colors clustered); `imageSize`, `logoWidthFor` |
| `messages.js` | why a website could not be read, and the notes about what it did not give |
| `useBrand.js` | the brand of a storage, read once and shared by the screens using it |
| `BrandButton.jsx` | the toolbar button and the dialog |

The brand reaches every way an email starts: the starter and the gallery
(`brandTemplate`, in `EmailBuilder` and `TemplateLibrary`) and inserted blocks
(`editor.setBrand` paints a block's MJML before the adapter gets it).
Applying it to the open email is `editor.setMjml` — one commit, so Ctrl+Z is
the undo.

Reading a website is the server's job (`server/brandImport.js`), because the
browser cannot read another site and the server must not read just anything:
`isPublicAddress` refuses every non-public range (IPv6 forms of IPv4
included), a custom DNS lookup refuses a name if any of its addresses is
refused, each redirect is checked again, and downloads are bounded in size
(after decompression) and time. The page is read as text (no DOM, no script
run); the logo, if it is a PNG, JPEG or GIF, is stored through the asset
service like an upload.

## Variables

The editor only inserts tags (`{{contact.firstname}}`); rendering replaces
them per recipient, HTML-escaped, never leaving a raw tag. The unsubscribe link
(`{{ unsubscribe }}`) is replaced by the sending pipeline (`unsubscribeUrl`);
previews and tests get an inert link.

## Images

Uploads are type-checked from their bytes (PNG/JPEG/GIF), at most 2 MB, keyed
by content hash (`<32 hex>.<ext>`, deduplicated). Templates keep a **relative**
path; `absoluteAssetUrls` / `personalize({ baseUrl })` make it absolute at
send time, so the same template works across environments.

## Styles

`src/styles.css` is compiled by Tailwind CSS v4 with the `mb` prefix
(`eb:flex`): utilities and theme variables cannot collide with the host
application. The reset is scoped to `.eb-root` (the builder) and `.eb-scope`
(overlays rendered in portals). Theme tokens are `--eb-*` custom properties.

## Tests

| Command | What |
|---|---|
| `npm test` | unit tests — core, blocks, features, validation, storage, server |
| `npm run typecheck` | JSDoc types of the files marked `// @ts-check` |
| `npm run test:stories` | Playwright against the Ladle playground (real engine, memory storage) |
| `npm run test:e2e` | Playwright against the example app (real server handler) |
