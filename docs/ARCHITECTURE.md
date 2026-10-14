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
| `features/` | one folder per feature + the `emailBuilderFeatures` registry (generate, variables, autosave, versions, preview, test send) and the starter template |
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
or the MJML compiler).
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

## Generation

`features/generate/` writes an email from a purpose, in four separate steps:

| File | Role |
|---|---|
| `purposes.js` | the 68 purposes and their 8 categories; each has a `kind` (marketing, transactional, security) that decides the footer, and a `brief` for the model |
| `prompt.js` | the system prompt (the MJML the builder edits, email rules) and the JSON schema of a draft |
| `draft.js` | reading the answer, cleaning the MJML for the builder (`normalizeGeneratedMjml`), the checks (`reviewDraft`: blocking = `validateMjml`, advice = footer, subject, MJML warnings) |
| `generator.js` | the loop: ask, clean, check, at most one repair turn |
| `claude.js` | the model for Claude (Anthropic SDK client passed in, never imported); `task: 'rewrite'` asks for less effort |
| `GenerateButton.jsx` | the toolbar button and the dialog |
| `rewrite.js` | rewriting one text: the actions and languages, its prompt, `reviewRewrite` (same links, same variables, valid markup) and the loop with one repair turn |
| `RewriteText.jsx` | the *Rewrite with AI* section of the properties of a text or a button |
| `chip.js` | the badge button both use |

The model is a plain function, so the browser (the demo), the server (the
handler's `POST /generate` and `POST /rewrite`) and the tests (a fake model)
run the same generator. The interface only calls `storage.generate` and
`storage.rewrite`; each control is shown when the storage has the function.

A rewrite replaces the text through `editor.setContent` — one step of the
history, so Ctrl+Z is the undo — and the section is keyed by the selected
element: selecting another one aborts the request. The text sent is the
stored one (`describe(id).html` for a text block, `content` for a button
label), so links and variables are compared on the source, not on what the
canvas shows.

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
