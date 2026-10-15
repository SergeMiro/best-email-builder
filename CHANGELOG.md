# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed
- **An image with no picture yet is left out of the email.** `<mj-image>`
  without `src` (AI drafts leave them for the user, so do the gallery's
  newsletter and promotion) compiled to `<img src="">` — a broken image in
  every inbox, a red cross in Outlook. Saving, exporting and sending now leave
  it out; the canvas and the preview (`/render`) still draw the frame to fill.
  Saving says how many are left out. `prepareMjml(…, { emptyImages: 'keep' })`
  keeps them; `countImagesWithoutPicture(mjml)` counts them.
- **Drafts through `openrouter/free` were cut short.** Most free models
  reason first — 5 000 to 12 000 tokens before the email — and hit the limit
  of 16 000 (`TRUNCATED`). OpenRouter now asks for less reasoning
  (`reasoning: { effort: 'low' }`) and allows 32 000 tokens.
- **AI drafts, what free models get wrong, fixed without asking again:** an
  `<mj-image>` put inside a text (dead HTML there) becomes an image block in
  its place; attributes MJML reports as illegal (`align` on a column) are
  removed after compiling; a button whose words do not read on its fill (a
  text color given, the fill forgotten) gets white or ink words. The prompt
  shows the greeting's default in three languages: a French email no longer
  starts with "Hello … there".
- **A 403 was always the key.** One about the model (only for some apps, not
  in this region), the content (moderation) or the money now says so
  (`MODEL_ERROR`, `REFUSED`, `MODEL_CREDITS`), and `askKey` keeps the user's
  key. Gemini's wrong key (a 400) is `KEY_REFUSED`.

### Added
- `providerEmailModel({ body })` and `provider: { body, maxTokens }`: fields
  of your own in each request (OpenRouter's `models` fallback list, `reasoning`)
  and a provider's own output limit.

## [0.5.0] — 2026-10-15

### Changed — the AI is a module (breaking)
- Everything AI moved to its own entries: `best-email-builder/ai` (the
  builder's side) and `best-email-builder/ai/server` (the generator, the
  prompts, `claudeEmailModel`). An application that does not import them has
  no AI button anywhere, and none of the AI's code or texts in its bundle.
- The builder takes the module as a prop: `<EmailBuilder ai={createAi()} />`
  (`EmailStudio` passes it on). `createAi()` calls the handler's routes;
  `createAi({ baseUrl, headers })` other ones; `generate`, `rewrite` and
  `suggestSubjects` can each be `false` (no button) or a function of your own.
- Removed: `createHttpStorage({ generate: true })` and the storage's
  `generate`, `rewrite` and `suggestSubjects`; `createEmailGenerator`,
  `claudeEmailModel` and the prompts are no longer exported by
  `best-email-builder/server` — import them from `best-email-builder/ai/server`.
  The handler still takes the generator as `generator`.

### Added
- **AI providers by their key**, nothing to install: `providerEmailModel({ provider, apiKey })`
  and `createAi({ provider, … })` for OpenRouter (default `openrouter/free`,
  free models), Google Gemini, Groq, Cerebras, Mistral, OpenAI, DeepSeek,
  Ollama and any OpenAI-compatible API (`{ baseUrl, model }`). Structured
  output where the model takes it, stepped down to a JSON object, then plain
  JSON, once. `AI_PROVIDERS` lists them with their default model, where to get
  a key and what is free. New errors, translated: `KEY_MISSING`,
  `KEY_REFUSED`, `MODEL_CREDITS`, `MODEL_BUSY`, `MODEL_ERROR`.
- **Each user's own key**: `createAi({ provider, askKey: true })` (off by
  default) — the first AI action opens a *Connect* dialog (the provider, a
  link to get a key, what is free, the key hidden or shown), the key is kept
  in that browser and sent only to the provider; a refused key is forgotten
  and asked again in the same action. `ai.key` reads and changes it.
- **Ctrl K** (⌘K on Apple) puts the cursor in the search of *Generate* and of
  the variables menu, as in the template library; each search shows the hint.
- The live demo runs the AI with the visitor's own OpenRouter key, asked in
  the *Connect* dialog instead of the browser's prompt; its code samples have
  a *With AI* tab.

### Fixed
- Dark-mode preview: text and lines are now decided against the background
  they really sit on (nested tables, `bgcolor`, CSS), by contrast; legacy
  attributes (`<font color>`, `<body text link>`, `bgcolor` without `#`),
  `hsl()` colors and per-rule CSS are handled; comments, Outlook-only blocks
  and the doctype are left alone; the dark sheet goes in the real `<head>`.
- *Suggest subjects*: a subject quoting itself, a list introduced by a line of
  prose, entities in the email's words, a merge tag of another tool
  (`*|FNAME|*`, `%name%`), more than 90 characters, capitals the email does not
  use, "!!" or the preheader repeated are no longer offered; the language
  falls back to the server's. In the list, what the user types becomes
  "yours", another email loaded closes it, "More ideas" avoids every idea
  already shown and keeps the chosen one, the arrows move through it, and a
  cancelled request can no longer end the one after it.
- MJML a model escaped twice (`\"`, `\n` left in the markup — some free
  models do) is read as MJML instead of failing the draft or the rewrite.
- Types: `createEmailGenerator()`'s `rewrite` and `suggestSubjects` named
  input types the declaration file did not import (a TypeScript error without
  `skipLibCheck`).

## [0.4.0] — 2026-10-15

### Changed — the builder's own engine (breaking)
- **GrapesJS is gone.** The interface, the canvas, the drag and drop and the
  text editing are the builder's own (`src/engine/`); the email is a tree of
  MJML elements, and MJML alone turns it into HTML. The canvas shows the email
  compiled by `mjml-browser` 5.4.1 (the same MJML version as the server): what
  is seen is what is sent. The package lost GrapesJS and grapesjs-mjml from its
  dependencies, and its stylesheet their CSS.
- Stored documents are written by the engine `beb-mjml` (project: the MJML
  tree). **Templates saved before** (engine `grapesjs-mjml`) open from their
  stored MJML, versions included, and are saved in the new format next time;
  a local draft of the old format is dropped.
- `editor.exportHtml()` returns a Promise (MJML 5 compiles asynchronously).
- `createGrapesJsAdapter` is replaced by `createNativeAdapter`; `parseMjml`,
  `parseMjmlFragment` and `serializeMjml` are exported.
- `createEmailEditor({ …, t })` takes the interface's translator: the texts a
  block brings and the names in the canvas follow the language. A block's
  `mjml` / `sectionMjml` may be a function of `t`.

### Added
- **Generate an email with AI.** A *Generate* button opens a dialog with 68
  purposes as badges in 8 groups (sales, holidays, events, news, account,
  orders, relationship, organization), a search field and an optional line of
  details. The email is written in the interface's language with the
  builder's sender and variables, cleaned for the builder (longhand padding,
  sections and columns only, no stock photos, unknown variables as visible
  placeholders), validated like a saved template, and opens in the editor with
  its subject and preview text. Server: `createEmailGenerator({ model })`,
  `claudeEmailModel({ client })` (Claude Opus 5.5, structured output,
  streamed), the `generator` option of the handler (`POST /generate`, 30 per
  user per hour); client: `createHttpStorage({ generate: true })`. Any other
  provider plugs in as a function. The live demo generates with the visitor's
  own Anthropic key.
- **Rewrite with AI.** Selecting a text or a button shows, in its properties,
  *Shorter*, *Longer*, *Fix mistakes*, *Friendlier*, *More formal*,
  *Translate* (13 languages) and a field to say what to change. The text is
  replaced in place, in one step of the history (Ctrl+Z). Links and variables
  must survive and the HTML must pass the validator, or the model gets one more
  turn and then nothing changes; a button label stays plain text. Server:
  `generator.rewrite` (`createEmailGenerator` returns it), `POST /rewrite`
  (200 per user per hour, `rateLimits.rewritePerHour`), `claudeEmailModel`'s
  `rewriteEffort` (`'low'`); client: `storage.rewrite`, given by
  `createHttpStorage({ generate: true })`. `editor.getElement(id).html` returns
  the stored HTML of a text block.
- **Your brand.** A *Brand* button opens one dialog: the company's website
  first (*Get my brand* reads its logo, main color, headings color, font and
  name), then every field by hand, with a live preview. Saving keeps the
  brand for the workspace and repaints the email being edited in one step
  (Ctrl+Z); new emails, gallery templates, inserted blocks and generated
  emails start in it. Emails are repainted by role (filled buttons and
  colored banners, bold headings, colored links, fonts; gray footers and body
  text kept), and the text on a colored background switches to what reads.
  Server: `brandStore` (`createMemoryBrandRepository`), `brandImporter`
  (`createBrandImporter`: public http(s) addresses on ports 80/443 only,
  private, link-local, metadata and IPv4-in-IPv6 addresses refused at the
  DNS lookup and on every redirect, size and time limits), routes
  `GET/PUT /brand` and `POST /brand/import` (20 per user per hour,
  `rateLimits.brandImportsPerHour`); client: `createHttpStorage({ brand: true })`,
  `storage.loadBrand / saveBrand / importBrand`. `applyBrand`, `cleanBrand`,
  `brandedSender`, `isPublicAddress`, `editor.setBrand` and `editor.setMjml`
  (replace the email in one undoable step) are exported. The live demo keeps
  the brand in `localStorage`.
- **Suggest subjects.** Under the subject, one click gives three other
  subject lines drawn from the words of the email, each from its own angle.
  They are a list to pick from, the user's own subject first to come back to;
  *More ideas* asks for three new ones. Plain lines, distinct, in the email's
  language, merge tags only from the catalog (one repair turn, fewer than
  three still shown). Server: `generator.suggestSubjects`, `POST /subjects`
  (100 per user per hour, `rateLimits.subjectsPerHour`); client:
  `storage.suggestSubjects`, given by `createHttpStorage({ generate: true })`.
  `emailWords` and `SUBJECTS_SYSTEM_PROMPT` are exported.
- **Dark mode in the preview.** A sun / moon switch next to Desktop / Mobile
  shows the email as the apps that repaint it in dark mode do (Gmail and
  Outlook apps, Outlook.com): light backgrounds and borders turn dark of the
  same hue, dark text turns light, brand colors, light text and images stay —
  a dark logo on a transparent background disappears there as it does in
  those apps. Simulated on the compiled HTML, without script: the frame stays
  sandboxed. In the editor's preview and in the template library.
  `simulateDarkMode(html)` is exported.
- Drag and drop with pointer events: a line shows where the block lands
  (between two elements of a column, or between two sections — a content block
  then gets a section of its own), the canvas scrolls near its edges, Esc
  cancels. Sections and elements move by the ✥ handle of their toolbar.
- On the selection: its name, and a toolbar — select the parent, move,
  duplicate, delete. Keyboard: Delete, Ctrl+Z / Ctrl+Y, Ctrl+C / Ctrl+V,
  Ctrl+D, Escape (parent), Enter (edit the text).
- Ctrl+A selects every block of the email (each section outlined, "All
  blocks" in the panel); Delete — or the panel's delete button — removes them
  in one step, Ctrl+Z brings them back. Inside a text being edited or a field,
  Ctrl+A keeps selecting the text. `editor.selectAll()` does the same.
- The toolbar's first button names where it goes ("⤴ Column", "⤴ 2 columns"):
  it selects the parent element; a bare up arrow read as "move up".
- Panel features for well-made emails: **column widths** (1/4 to 3/4; the
  other columns of the section share the rest, "Equal" resets), a section
  **background across the whole screen**, an image **full width on mobile**,
  menu links **as typed or in capitals** (MJML capitalised them; new menus
  are written as typed).
- The server's HTML gets `x-apple-disable-message-reformatting` and
  `format-detection` (Apple Mail does not rescale the email, iOS does not turn
  dates, addresses and phone numbers into blue links).
- Email-client checks on the compiled HTML of every template and of an email
  holding every block (tests/unit/email-clients.test.mjs): Outlook's MSO
  tables and VML backgrounds, Gmail's 102 KB clipping and dropped CSS, images
  (alt, width, no border), mobile media queries and the fallback without
  `<style>`, links, and the same body from the canvas compiler and the
  server's. And rendered in a browser at 640 px, 375 px and without `<style>`
  (e2e/rendering.stories.spec.js).
- The template library is called a library everywhere ("Bibliothèque de
  modèles e-mail" in French, instead of "Banque").
- Text edited in place (double-click, or a click on a selected text) with a
  formatting bar: bold, italic, underline, strike, link, unlink, clear. Pasted
  content arrives as plain text, Enter is a line break, the HTML is reduced to
  what an email accepts.
- The panel shows MJML's own default in an empty field (a section's padding:
  20 px above and below) and keeps it for the sides not edited.
- New layouts start with empty columns showing "Drop a block here" (canvas
  only); an image without file shows a frame sized to its column.

### Fixed
- Dropping an image opened an empty "Select an image" dialog of the old engine.
- A 2-column layout was named "Section" in the canvas and the panel; it is now
  "2 columns", and every element carries its block's name, in both languages.
- Blocks inserted English texts ("Your text.", "Column 1", "Learn more"…) in a
  French interface; their texts now follow the interface's language.
- An empty padding showed 0 while MJML renders 20 px (sections) or 10 px
  (texts, top and bottom); editing one side set the others to 0.
- The button's "Label" field was not translated.
- The server-side project check now also reads the new project's `tag` field
  (an `mj-raw` or `script` element in a tampered project is refused).

## [0.3.0] — 2026-10-13

### Added
- **`TemplateLibrary`** — the first screen: a template bank in three columns
  (searchable list of your templates and of the ready-made bases, details of
  the selected one, rendered preview on desktop / mobile). *Edit*, *New
  template* and *Start from this base* hand the template to the host through
  `onEdit` / `onCreate`; *Duplicate*, *Delete*, *Copy HTML* and *Download*
  work in place. *Favorites*: the star of the details moves an entry to a
  section at the top (`favoritesKey`). Search with Ctrl+K, Esc clears it.
  Follows its own width down to phones. French included.
- **`EmailStudio`** — `TemplateLibrary` and `EmailBuilder` wired together.
  Each screen still works alone.
  The editor opened from the bank has no *Templates* button: the bases are
  picked in the bank, and the gallery would replace the email being edited
  (`builderProps.templates` brings it back).
- **Two entry points, one per block**: `best-email-builder/library` (block A,
  the bank — no editor, no GrapesJS) and `best-email-builder/builder`
  (block B, the editor — nothing of the bank). A unit test bundles each one
  and fails if it reaches the other. The README shows block B under a bank
  of your own (what to pass in, what comes back) and block A with your own
  editor; a story drives block B from a home-made bank.
- Storage contract: optional `list()` and `remove(id)`, implemented by
  `createHttpStorage()` (the server already had the routes) and
  `createMemoryStorage()`.
- `withPlaceholderImages(html)` draws a grey frame for images not chosen yet
  in compiled HTML.

### Changed
- Demo, three pages: a landing page (a background that follows the pointer,
  a marquee of the editors it can replace, a new mark), the template bank,
  and the editor — each page has its own address (`#/templates`,
  `#/editor/…`), so a reload keeps it. The bank and the editor share one
  window of the same size, under a bar with the steps and a *Full screen* /
  *Exit full screen* button. Type: Geist, Bricolage Grotesque for the title.
- Thin scrollbars everywhere in the builder and the
  bank, inside the canvas and the preview frames (preview only, never the
  saved HTML): a 5.6 px gutter, a thin thumb, no arrows, shown only while the
  pointer is over the block. They also replace GrapesJS's own dark ones.
- The preview (in the bank and in the editor's *Preview*) switches device
  with the editor toolbar's switch, and narrows and widens like the canvas
  (350 ms).
- `types` and `typesVersions` in `package.json`: TypeScript projects still on
  `moduleResolution: "node"` find the types of every entry (`.`, `/builder`,
  `/library`, `/server`).
- `EmailBuilder` no longer imports the package entry
  (`createDefaultEmailEditor` lives in its own module).

### Fixed
- Demo: after a first save, switching the language reopened a blank editor
  (or the base), and saving again created a duplicate; it now reopens the
  saved template.

## [0.2.0] — 2026-10-12

### Added
- Blocks: **Heading**, **Social links** (Facebook, Instagram, LinkedIn, X,
  YouTube, GitHub — each icon selectable, duplicable, its network and link
  editable), **Menu** (a row of links, each label edited in the panel),
  **4 columns**, **Image + text** and **Hero banner** (a section with a
  background image under a title, a sentence and a button).
- Sections take a background image, with its size and position; the color
  underneath stays for clients that block images.
- Text: a *Weight* property (normal / bold).
- **Template gallery**: a *Templates* button opens six ready-made emails
  (blank, simple, newsletter, welcome, promotion, event invitation), shown as
  rendered thumbnails. Picking one replaces the email (after confirmation if
  it was modified) and fills the subject and preview text when empty.
  `templates` prop to offer your own, `[]` to hide it; `TEMPLATE_GALLERY` and
  `buildGallery` are exported.
- **Phones and tablets**: the layout follows the builder's own width. Below
  1180 px the properties open in a drawer and the toolbar takes two rows (its
  actions scroll sideways); below 760 px the blocks move to a drawer too and a
  bar under the canvas offers *Add a block* and *Edit: <element>*. Adding a
  block opens its properties; saving without a name opens the settings.
- `editor.exportHtml(mjml)` compiles the given MJML with the canvas compiler
  (display only — what is stored and sent is still compiled by the server).

### Changed
- **Breaking:** `compileMjml`, `compileTemplate` and `renderEmail` from
  `best-email-builder/server` now return a Promise — MJML 5 compiles
  asynchronously. Add `await` where you call them.
- MJML 5.4 on the server (htmlnano/cssnano instead of html-minifier, stricter
  includes), GrapesJS 0.23.6 in the canvas, lucide-react 1.x, radix-ui 1.8.
  Templates saved with GrapesJS 0.22 open unchanged.

## [0.1.1] — 2026-10-12

### Fixed
- The builder did not start under webpack (Next.js): `grapesjs-mjml` arrived
  wrapped twice by the bundler's CommonJS interop ("mjmlPlugin is not a
  function"), and its French labels were lost the same way. Every interop
  layer is now unwrapped, whatever the bundler.
- The published package no longer carries stale chunks from earlier builds:
  `npm run build` starts from an empty `dist/`.

## [0.1.0] — 2026-10-10

First public release.

### Added
- `<EmailBuilder>` React component: blocks (text, image, button, divider,
  spacer, 1/2/3 columns), drag and drop, element actions (move, duplicate,
  delete), undo/redo, desktop/mobile canvas, properties panel.
- Save / load with versions, conflict detection, autosave and local drafts.
- Merge-tag variables, server preview with quality checks, test sends, image uploads.
- `best-email-builder/server`: Fetch-API handler, template and asset services, memory
  repositories, MJML rendering, personalization helpers, Node bridge.
- English and French interfaces; `--eb-*` theming; dark theme.
