# Architecture

```
React UI ─► EmailEditor ─► GrapesJsAdapter ─► GrapesJS + grapesjs-mjml
 (ui/)        (core/)        (adapters/)          internal engine
                                                         │ project JSON + MJML
Server: validation ─► MJML compilation ─► variables ─► links ─► final HTML
```

**Rule.** The interface, storage, business logic and rendering belong to
mailblocks; GrapesJS is only an internal engine. No React component calls
GrapesJS: everything goes through the `EmailEditor` contract
(`core/EmailEditor.js`), and all GrapesJS code lives in `adapters/grapesjs/`.
Replacing the engine means writing another adapter.

## Source tree (`src/`)

| Folder | Role |
|---|---|
| `core/` | `EmailEditor` contract, versioned document envelope (`document.js`), registries, events |
| `adapters/grapesjs/` | the engine — the only place that knows it |
| `blocks/` | one folder per block (text, image, button, divider, spacer, 1/2/3 columns, structure) + the `emailBlocks` registry |
| `features/` | one folder per feature + the `emailBuilderFeatures` registry (variables, autosave, versions, preview, test send) and the starter template |
| `ui/` | the React interface (toolbar, blocks sidebar, canvas, properties) and its primitives |
| `storage/` | browser storage contract — HTTP and memory implementations |
| `renderer/` | MJML preparation, service links, uploaded image URLs (shared browser/server) |
| `validation/` | what a template may contain (MJML, project, URLs, images, quality checks) |
| `server/` | handler, services, repositories, compilation, test send (`mailblocks/server`) |
| `i18n/` | translator and built-in locales |

Removing a block or a feature = removing its line from the registry; the core
never refers to one by name.

## The document

What gets stored is the engine **project**, wrapped in a versioned envelope:

```json
{ "schemaVersion": 1, "engine": "grapesjs", "engineVersion": "0.22.16",
  "builderVersion": "1.0.0", "project": { … } }
```

A document from another engine, a future schema or malformed is **refused**
on load rather than half-loaded: a template silently emptied and saved again
would be lost. Schema migrations go into `MIGRATIONS` in `core/document.js`.

Next to the project, each template stores its MJML export (for inspection) and
the HTML **compiled by the server**.

## Saving

- "Save" (or Ctrl/Cmd+S) sends the project and its MJML; the server validates
  both, compiles, stores and creates a version.
- Autosave (saved templates only) stores without creating a version; a new
  template keeps a local draft in `localStorage`, offered at the next opening.
- Every write carries the `revision` read at load time. The repository refuses
  the write when it changed (409): the user can save a copy instead.

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
(`mb:flex`): utilities and theme variables cannot collide with the host
application. The reset is scoped to `.mb-root` (the builder) and `.mb-scope`
(overlays rendered in portals). Theme tokens are `--mb-*` custom properties.

## Tests

| Command | What |
|---|---|
| `npm test` | unit tests — core, blocks, features, validation, storage, server |
| `npm run typecheck` | JSDoc types of the files marked `// @ts-check` |
| `npm run test:stories` | Playwright against the Ladle playground (real engine, memory storage) |
| `npm run test:e2e` | Playwright against the example app (real server handler) |
