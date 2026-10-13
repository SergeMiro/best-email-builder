# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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
  and the editor full screen — each page has its own address (`#/templates`,
  `#/editor/…`), so a reload keeps it. The bank and the editor share one
  window of the same size, under a bar with the steps and a *Full screen* /
  *Exit full screen* button. Type: Geist, Bricolage Grotesque for the title.
- Scrollbars as in the Fimainfo extranet, everywhere in the builder and the
  bank, inside the canvas and the preview frames (preview only, never the
  saved HTML): a 5.6 px gutter, a thin thumb, no arrows, shown only while the
  pointer is over the block. They also replace GrapesJS's own dark ones.
- The preview (in the bank and in the editor's *Preview*) switches device
  with the editor toolbar's switch, and narrows and widens like the canvas
  (350 ms).
- `EmailBuilder` no longer imports the package entry
  (`createDefaultEmailEditor` lives in its own module).

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
