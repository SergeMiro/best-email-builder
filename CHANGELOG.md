# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

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
