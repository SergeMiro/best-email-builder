# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.18.0] — 2026-10-27

### Added
- Variable groups can be renamed and deleted: the pencil beside a group's
  "+". Renamed, its variables follow it; deleted, they go back to their
  default group (the application's, or Custom). A group its variables belong
  to by default cannot be deleted.
- Storage: `renameVariableGroup(from, name)` and `deleteVariableGroup(name)`;
  server: `PUT` and `DELETE {base}/variable-groups/:name`, with the
  repository's `renameGroup` and `removeGroup`.

## [0.17.1] — 2026-10-26

### Changed
- No browser up/down arrows on number fields (corner radius, size, line
  height, padding…): the arrow keys still step them.
- The unit of a field (px or %) is picked in the builder's own list, as the
  font is, not the browser's. The variable dialog's group field no longer
  opens the browser's suggestions: the groups are the buttons under it.

## [0.17.0] — 2026-10-26

### Added
- A "+" on the canvas, as in Unlayer. Under the selected element, it opens
  the blocks, and the one picked goes after the element (at the end of a
  selected column). After the last icon of a social block, it opens the
  networks with their icons; after a menu's last link, it adds a link at
  once. The new icon or link copies the last one's look and is selected.
- `editor.addItem(choice, id)`: one more item in a row (a social block's
  icons, a menu's links). A block declares its row's choices in `items`;
  the canvas's "+" emits the editor's `add-menu` event with where it is on
  screen.
- Variables move by drag and drop: a badge dragged onto another group of
  the *Variables* panel moves there and is saved, as its dialog would save
  it. The other groups are outlined, the one under the pointer lit; Esc
  cancels, and a click still inserts.

### Changed
- The template library, wide: the list takes a fifth of the width (never
  under 260 px), and the template's details and its preview share the rest
  equally.
- One corner for every control, the button's (10 px): fields, selects and
  their lists, filter chips, the ribbon's buttons, cards. Badges under
  24 px tall (tags, variables, the AI's quick actions) take 6 px instead of
  a pill, and items inside a list 6 px, following its corners. The rule is
  written next to the radius tokens in `styles.css`.

### Removed
- The formatting bar over a text being edited in the canvas: the ribbon
  above the canvas has the same tools (bold, italic, underline, strike,
  link, unlink, clear) and stays the one place for them. Its link field
  now takes an address without `https://` too, as the bar did.

## [0.16.0] — 2026-10-26

### Added
- A ribbon above the canvas, always open, as in a word processor: bold,
  italic, underline, strikethrough, link, remove the link, clear formatting,
  font size (typed or picked), line height and alignment, each tool
  named in a tooltip. The word tools act on the selection of the text being
  edited, or on the whole of a selected text, and show what is pressed at the
  caret. `editor.formatText(command, value)` drives them; the editor's
  `format` event reports the format at the caret.
- An emoji panel, opened from the end of the ribbon: every emoji up to
  Unicode 14 by group, searchable by name or keyword in the interface's
  language (accents optional), the recently used first. Like a variable, an
  emoji under the pointer shows in the text, a click inserts it. The names
  are loaded on first use, one language at a time (emojibase-data, MIT — see
  THIRD-PARTY-NOTICES.md), and only the rows near the scroll are drawn.
- A feature may declare `drawer: {icon, label, title, panel}`: its button at
  the end of the ribbon opens its panel beside the canvas, one at a time.
- The Spacing section of the properties is a box diagram, as in a browser's
  developer tools: the margin outside, the border, the padding inside, the
  content in the middle, each zone with its four sides typed in place and a
  line saying what it sets. Every built-in block has the three zones.
- Borders: a width per side, a style (solid, dashed, dotted, double, groove,
  ridge) and a color. On sections, columns, images and buttons, equal widths
  write one `border` attribute; different ones write `border-top`,
  `border-right`… A double, groove or ridge line starts at 3 px, the least
  that draws it. A block property may take `type: 'border'`, and `box:
  'margin' | 'border' | 'padding'` to place it in the diagram.
- Spacing MJML has no attribute for (a section's margin, a text's border or
  margin…) is kept in valid MJML: a section's margin as an `mj-wrapper`
  (`css-class="eb-section-margin"`) around it, the others in an encoded
  `eb-box-…` CSS class. The package's compiler (`compileMjml`, the server
  handler) turns them into email tables; another MJML compiler ignores them.
- Vertical alignment on every block: on a content block it aligns its
  column, on a layout all its columns. Columns of one desktop row now have
  equal heights in the compiled email, their content where it is aligned;
  stacked on mobile, they keep their own height. Outlook keeps MJML's table.
- The corner radius takes pixels or percentages, with no upper limit (a size
  property may give `units: ['px', '%']`).
- Variable groups: the *Variables* panel lists the variables under their
  group; the **+** beside *Group* creates an empty group, a group's **+** a
  variable in it. A storage may give `listVariableGroups()` and
  `saveVariableGroup(name)` (HTTP: `GET` and `POST /variable-groups`); a
  server repository `listGroups()` and `insertGroup(name)`. New error codes:
  `INVALID_GROUP`, `DUPLICATE_GROUP`, `NO_GROUP_STORE`.
- `--eb-accent-color`, set on `:root`, gives the accent of every screen (the
  primary color, the focus ring and the light accent come from it).
- The storage may give `imageUrl(path)`: where the canvas, and the *Brand*
  dialog for a logo, show an uploaded image when the page cannot load its
  path itself (images on another origin, no server). The template and the
  brand keep the path.

- The unsubscribe link is edited like the other variables, since each email
  provider has its own: its *value if empty* is used when the sending gives
  no `unsubscribeUrl` (an address, or the provider's tag such as `*|UNSUB|*`),
  its *sample value* in the preview and test sends (`#` otherwise). Both must
  be an address or a tag, never `javascript:`.
- Colors keep their transparency: the picker's alpha slider is written
  `rgba()` in the email (MJML refuses `#RRGGBBAA`) and shown as `#RRGGBBAA` in
  the field. Classic Outlook, which reads no `rgba()`, gets in `bgcolor` the
  opaque color it looks like over white.
- *Background under the content* (Email → Colors): a color painted under the
  sections, at the email's width. The rounded corners of a section show it
  instead of the page background. MJML has no such attribute: it is written
  as an `mj-wrapper` (`css-class="eb-content-layer"`) around the sections and
  read back as `content-background-color` on `mj-body`. A full-width band or
  an `mj-wrapper` of your own interrupts it. Left empty, the MJML is exactly
  as before.
- *Proofread* without AI: `createLanguageToolProofreader({ url })` (from
  `best-email-builder/ai` and `/ai/server`) is a `proofread` function that
  asks a LanguageTool server. Its corrections show in the same dialog, as the
  smallest change of their words: markup, links and merge tags stay. Style
  suggestions, brands and acronyms, and a capital asked of a subject or a
  button are left out; `ignoreWords` adds your own. Alone, it is the only
  check, with no key; beside a provider, LanguageTool proofreads and the AI
  writes. `LANGUAGETOOL_PUBLIC_API` is LanguageTool's free API, to try it
  out (limited, and the texts go to LanguageTool). New error codes:
  `CHECKER_UNAVAILABLE`, `CHECKER_BUSY`.

### Fixed
- A color dragged in the picker (the area, the hue or the transparency
  slider) paints the block as it moves, rather than when the mouse is
  released. The whole drag is one undo step.
- Bold, italic… on a text only selected (not being edited) formatted it but
  left it open with everything selected: the next emoji or variable replaced
  the whole text. The format is applied to the whole text and the text is
  closed at once; the ribbon shows the format of its words.
- An emoji clicked in the panel showed twice for a moment, and the grid moved
  under the pointer as *Recently used* appeared.
- The live demo showed no uploaded image: it had no server to serve
  `/email-assets/`. It now keeps uploads in the browser (Cache Storage, so
  they outlive a reload) and shows them in the canvas, the preview and the
  exported HTML.
- Removing the last column of a section left an empty section behind, shown
  as a phantom block: the section goes with it.
- Dialogs, menus and tooltips could open under the host page's layers or the
  canvas: they stay above.

### Changed
- The space around a button, an image, a divider or the social icons is
  called its margin (MJML's `padding` of these blocks); the button's inner
  padding is its padding.
- The *Email provider variables* bar above the canvas is now the *Variables*
  panel beside it, opened by the *Variables* button at the end of the ribbon.
  It stays open while you insert, rather than growing under the pointer.
- *Write with AI* and *Rewrite with AI* are one section with ONE field: say
  what to change in the text, or give a topic to write about — the model
  tells which (`action: 'custom'` now does both; on a text with no words, the
  words are a topic). The one-click rewrites stay under it.
- While the AI works on a text, it shimmers on the canvas; the answer comes
  in word by word (at once with reduced motion). `editor.setContent` takes
  `{ reveal: true }` for that, and `editor.showWorking(id)` shows the shimmer.
- The **×** of a variable cut over two lines sits at the variable's end, top
  right of its last line, rather than after its first piece.
- The *Variables* panel shows the unsubscribe link among the others, with
  its pencil, without a line between them. The panels beside the canvas show
  no heading (their button names them), only their **×**; no line before the
  ribbon's *Emojis* and *Variables* buttons.
- The *Brand* dialog: its fields are as high as the properties panel's; the
  logo's square, larger and square, opens the file explorer (the *Upload*
  button is gone); the preview is as tall as the fields beside it; the color
  pickers have no transparency slider (brand colors stay opaque).
- `unsubscribeUrl` is optional: without it, `personalize` and `renderEmail`
  use the link's value if empty, `sendTestEmail` its sample; the handler's
  `previewUnsubscribeUrl` defaults to `null` (the sample, otherwise `#`).
- The *Proofread* dialog no longer says the AI reads the email: "Every text
  is checked for spelling, grammar and punctuation mistakes", whoever checks.

## [0.15.0] — 2026-10-22

### Added
- A variable in the email, under the pointer, swaps its colors (line by line
  when it runs over two, never the words beside it) and shows a **×** in its
  top-right corner. The × takes the tag out, with the space before it, in a
  text (being edited or not) or a button's label. Ctrl+Z brings it back.
- The side panels are resized by dragging their border towards the canvas or
  away from it (or with the arrow keys once it is focused; a double-click
  restores the default width), and fold to a narrow rail with the round button
  on that border; the same button, on the rail's border, unfolds them. The
  editor remembers both in the browser.
- Every variable of the bar can be edited, not only the user's own: the
  pencil of an application's variable changes its name, group, sample value
  and value if empty — never its tag. The storage keeps the edit under the
  variable's key (`PUT /variables/:key`, `saveVariable`) and *Restore the
  default* deletes it. The unsubscribe link stays as it is.
- *Font size* in the *Brand* dialog, next to the font: paragraphs take it
  (13 to 18 px, line height scaled to match), while headings, buttons and
  footers keep their sizes. `cleanBrand` keeps `fontSize`, `applyBrand` applies
  it.
- System variables' keys may keep the capitals of an email provider's tags,
  as Brevo's `contact.FIRSTNAME` (custom variables keep lowercase keys).
- The live demo offers Brevo's contact attributes (first name, last name,
  email address, mobile number) in the variables bar, inserted as Brevo's own
  tags (`{{ contact.FIRSTNAME }}`) and shown with their samples in the
  preview.

### Changed
- The side panels fold and unfold smoothly, in the time the canvas takes to
  switch to the mobile view (350 ms): their content keeps its width and slides
  out under the border, fading, instead of disappearing at once. With reduced
  motion, they still fold at once. The panel keeps the border with the canvas
  in both states, so no line doubles while it moves.
- The *Email provider variables* bar no longer covers the email when it
  opens: the email moves down to make room, and back up when the bar closes.
  Under the pointer, it opens after a short pause, so crossing it on the way
  to the email does not move the email.
- Wider side panels by default: three blocks in a row on the left, and the
  properties about 40% wider.
- The properties panel no longer has the *Move up* / *Move down* /
  *Duplicate* / *Delete* row: the toolbar of the selection frame on the canvas
  does it. Columns, social icons and menu links, which are not dragged, get
  arrows in that toolbar to move them among their siblings. With every block
  selected (Ctrl+A), the panel keeps a *Delete* button. Its title no longer
  has a line under it.
- Denser properties: fields, lists and color pickers are 26 px high (all the
  same), the AI action chips 22 px, with less space between the fields.
- *Write with AI* and *Rewrite with AI* take the instruction in a box of
  several lines: Enter sends it, Shift+Enter starts a new line.
- A text box (the preview text, a variable's description…) is resized in
  height only: its width stays the panel's, like the other fields.

### Fixed
- The email preview (the *Preview* dialog and the template library) had two
  scrollbars, the frame's and its box's. The frame now fills the box, so only
  the email scrolls. On a narrow screen, it takes the height the points to
  check leave.
- The live demo's preview listed its points to check in English whatever the
  page's language; they now follow it, after a switch too.

## [0.14.0] — 2026-10-20

### Changed
- The *Email provider variables* bar above the canvas (formerly
  *Personalization fields*) is the one place to insert a variable: the
  toolbar's *Variables* menu is gone. The bar now also offers the unsubscribe
  link, *New variable*, and a pencil to edit or delete a custom variable.
  The `{ }` buttons next to *Subject* and *Preview text* keep their search.
- No variables by default: `DEFAULT_VARIABLES` holds only the unsubscribe
  link, and users create the others with the bar's new **+** button (and edit
  them with the pencil of their badge). The former five (first name, last
  name, email address, company, campaign name) are exported as
  `EXAMPLE_VARIABLES`: pass `[...EXAMPLE_VARIABLES, ...DEFAULT_VARIABLES]` to
  `<EmailBuilder variables>` and `createEmailBuilderHandler({ variables })` to
  keep them.
- The starter template and the *Welcome* template hold no variable: the
  greeting is "Hello," and the heading "Welcome aboard!".

## [0.13.1] — 2026-10-20

### Fixed
- Deleting a template in the library selects the next one of the list (the
  one before it when it was the last). Deleting the first template showed
  *Template not found*, and deleting another one jumped to the first.

## [0.13.0] — 2026-10-20

### Added
- A *Personalization fields* bar above the canvas. It is thin until the
  pointer comes over it (or a click opens it), then lists the variables as
  badges, whose tooltip names their tag. A badge under the pointer types its
  tag into the selected text or button, as it will look, and wipes it out
  when the pointer leaves; a click inserts it. The unsubscribe link stays in
  the *Variables* menu.
- `editor.previewText(text)` and `editor.clearPreview()`: show a text where
  `insertText` would put it, without changing the email. An adapter opts in
  with `previewText` and `clearPreview`.
- A feature may declare `canvasBar`: a component shown as a bar above the
  canvas, like `toolbar` in the toolbar.

## [0.12.0] — 2026-10-20

### Changed
- The tag filters of the library and of the *Templates* dialog have no
  *All* chip: with no tag picked, every template shows. A reset icon next to
  the tags unpicks them all (it rests, dimmed, while none is picked).

## [0.11.0] — 2026-10-19

The library loses its bases and gains tags, which also filter it; the
editor's *Templates* dialog gains a search and tag filters. This breaks
code that passed `sender` or `templates` to `TemplateLibrary`, or read
`onCreate`'s argument (see *Changed* and *Removed*).

### Added
- **Tags** on templates, in the library: up to three per template
  (`MAX_TEMPLATE_TAGS`), shown in the list before the template's date, and
  found by the search. The *Tags* line of the details opens a dialog to tick
  them and to create, rename, recolor or delete the workspace's tags (a name
  of 24 characters at most, unique case aside, one of the twelve
  `TAG_COLORS`). Each change is saved at once; a deleted tag leaves every
  template; a copy keeps its template's tags.
- The storage methods `listTags()`, `saveTag(tag, { create })`,
  `deleteTag(id)` and `setTemplateTags(id, tagIds)`, in the memory storage
  and in `createHttpStorage({ tags: true })`. `list()` and `load()` give each
  template's `tags` (ids).
- On the server: the `tagStore` option (`createMemoryTagRepository()` is the
  reference), the routes `GET`/`POST {base}/tags`, `PUT`/`DELETE
  {base}/tags/:id` and `PUT {base}/templates/:id/tags`, `createTagService`.
  `validateTag`, `TAG_COLORS`, `TAG_LIMITS`, `MAX_TEMPLATE_TAGS` and
  `MAX_TAGS` are exported (`validateTag`, `TAG_COLORS` and
  `MAX_TEMPLATE_TAGS` from the browser entries too).
- `TemplateLibrary`'s `deleteDisabled`: a sentence shown instead of deleting,
  *Delete* staying in place, dimmed. For a public demo.
- `createMemoryStorage({ compile })`: the templates keep their compiled HTML,
  as on the server, so the library shows *Copy HTML* and *Download*.
- Tag filters under the library's search: the tags some template carries,
  one or several (a template with any of them), or *All*; with the search,
  both apply.
- The editor's *Templates* dialog has a search (names, descriptions, tags)
  and the bases' tags as filters: one or several (a base with any of them),
  or *All*. A gallery entry takes `tags`, translated like its name.

### Changed
- `TemplateLibrary` lists only the templates; a new one starts from a base
  with the editor's *Templates* button. `onCreate()` takes no argument.
- `EmailStudio` passes `sender` and `templates` to the editor only, which
  keeps its *Templates* button.
- The live demo opens on five templates of the gallery, three of them
  tagged; its *Delete* is turned off.
- The *Templates* dialog's cards all have the same height: a name or a
  description too long fades out at the card's edge, and the thumbnails show
  no scrollbar. Only the cards scroll; the search and the tags stay.

### Removed
- The *Builder* badge of every row of the library: the same on every
  template, it only looked like a tag. The details still give the origin.
- The *Bases* section of the library, its *Start from this base* button, and
  `TemplateLibrary`'s `sender` and `templates` props.
- `TEMPLATE_GALLERY` and `buildGallery` from `best-email-builder/library`
  (they stay in `best-email-builder/builder` and `best-email-builder`).

## [0.10.0] — 2026-10-19

The AI no longer writes whole emails: it checks and writes their texts.
This breaks code that used *Generate* (see *Removed*).

### Added
- **Proofread**, in the toolbar: the spelling, grammar and punctuation
  mistakes of every text the reader sees (subject, preview text, text
  blocks, buttons, menu links), found in one call. The dialog lists the
  texts with a mistake, the old words struck out and the new ones next to
  them; each correction is applied on its own or all at once, and the
  corrections applied together are one step of the history. A text edited
  since it was read is left as it is. A correction is kept only when it
  changes words, keeps the markup, links and merge tags, and touches at most
  a third of the text; otherwise the model gets one repair turn, then it is
  left out.
- `ai.proofread`, `generator.proofread` and the handler's
  `POST {base}/proofread` (60 per user per hour, `rateLimits.proofreadPerHour`).
  `PROOFREAD_SYSTEM_PROMPT`, `createProofreader` and `reviewFix` are exported
  from `best-email-builder/ai/server`, `diffWords` from both AI entries.
- **Write with AI**, in the properties of a text block: a topic ("the sale
  ends Sunday"), and the text is written anew to fit the rest of the email,
  a title as one line, a `[placeholder]` where a fact is missing. It is the
  `write` action of `rewrite` (`{ action: 'write', instruction, context }`).
- `editor.setContents([{ id, content }])`: the contents of several
  elements changed in one step of the history.

### Changed
- `claudeEmailModel` uses `effort: 'low'` for every task by default (every
  answer is a short one now); `effort` changes it. `rewriteEffort` still
  works as its old name.
- The agent protocol (`best-email-builder/agent@1`) has two tasks,
  `rewrite` and `subjects`: a proofread is sent as `rewrite`, so agents
  written for 0.9 keep working. `checkAgent` tries a proofread, a rewrite
  and subject ideas.
- The live demo explains Proofread and Write with AI.

### Removed
- **Generate**: the toolbar button, `ai.generate`, `generator.generate`, the
  handler's `POST {base}/generate` (now 404) and `rateLimits.generatePerHour`.
  `createAi({ generate: fn })` throws; `generate: false` is still accepted.
- The 68 purposes and the email prompt: `EMAIL_PURPOSES`,
  `PURPOSE_CATEGORIES`, `purposeById`, `purposesByCategory`, `SYSTEM_PROMPT`,
  `EMAIL_DRAFT_SCHEMA`, `buildUserPrompt`, `cleanGenerateInput`,
  `MAX_DETAILS_LENGTH`, `normalizeGeneratedMjml`, `parseDraft` and
  `reviewDraft`.
- The `compile` option of `createEmailGenerator` and `checkAgent`: nothing
  compiles MJML any more.

### Fixed
- The gallery's *Welcome*, *Event invitation* and *Newsletter* were
  translated only when the AI module was loaded (its dictionary had the same
  words). The core has them now, and `npm run check:i18n` checks the
  gallery's names and descriptions.

## [0.9.0] — 2026-10-16

### Added
- **An OpenAI-compatible API of the user's own** in the Connect dialog: add
  `'openai-compatible'` to `createAi({ provider: [...], askKey: true })`
  and the user gives its address (LM Studio, vLLM, Ollama on another
  machine, a proxy…), a key only if it needs one, and a model from its
  `/models` list. The address is remembered like the key. `ai.key` gains
  `address(id?)`, `setAddress(url, id?)` and `ready()`; `listModels` takes
  an `address`. A provider without a key of its own (Ollama) connects
  without one, once a model is chosen.
- The live demo offers it too, and its language list is now a list of its
  own instead of the browser's: by mouse, or by keyboard (arrows, Home/End,
  type a letter, Enter, Esc).

### Changed
- The Connect dialog and the list of models show what is free in words
  only: no gift icons.
- `ai.key.state().connected` is true once the provider in use can write:
  its key (unless it needs none), its address and its model.

## [0.8.0] — 2026-10-16

### Added
- **German, Spanish, Portuguese (Brazil), Russian and Chinese** (Simplified),
  built in next to English and French: `locale="de"`, `"es"`, `"pt"`, `"ru"`
  or `"zh"` (`"de-AT"`, `"pt-PT"`, `"zh-CN"`… find them too). Every text is translated — the interface, the
  starting templates, the server's messages and the AI module — and counts
  are written so that no language needs plural forms.
- The live demo offers the seven languages in a list and opens in the
  visitor's: their browser's language, else the country of their device's
  time zone (read in the page, nothing is sent), else English; a language
  picked is remembered. Its code samples follow the page: their comments and
  `locale` change with the language.
- `npm run check:i18n` checks every built-in language.

### Changed
- **Documentation.** The README is now a short front page: what the
  builder is, a quick start and where to read next. The reference moved to
  `docs/`, one page per subject: getting started, editor and library,
  server, variables and sending, AI, brand, languages and the security
  model, with an index in `docs/README.md`. The project has a logo.

## [0.7.0] — 2026-10-15

### Added
- **The user chooses the model.** In the Connect dialog, under the key, a
  field opens the provider's list of models in place: the default first,
  then the free ones (marked, with a *Free only* filter), then the newest;
  searchable, and an id the list does not have can be used as typed. The
  list is asked with the key (OpenRouter's needs none, so it shows before
  any key); embeddings, speech, pictures and video are left out. The model
  chosen is remembered for each provider and sent with each request.
  `ai.key` gains `model(id?)`, `chooseModel(model, id?)` and
  `listModels(id?, { apiKey, signal })`.
- **`listProviderModels({ provider, apiKey })`** — the models a provider
  offers for writing, from `/ai` and `/ai/server`. `claudeProvider` lists
  Claude's through the application's SDK and takes the model chosen.
- The live demo says which model is connected, and its link is now *Change
  provider or model*.
- **Your own AI agent as the builder's AI** — `agentEmailModel({ url, headers })`
  sends each model turn to an agent of the application's own over a small
  HTTP protocol, `best-email-builder/agent@1` (`{ task, system, messages,
  schema }` in, `{ text }` out, errors as codes the interface explains).
  Generate, Rewrite and Subjects then go through the agent (its tools, its
  knowledge, its users' rights) and its answers are checked like any model's.
  On the server, `headers({ task, user })` gets the user `authorize` returned,
  to forward who asks; the handler now hands that user to the generator and
  its model. The agent's side: `createAgentEndpoint({ complete })` in
  JavaScript, a FastAPI router to copy in `examples/agent/python`;
  `checkAgent({ url, headers })` tries an agent with the builder's own checks.
  See docs/AGENT.md.
- **`MODEL_UNAVAILABLE`** — a model the provider does not have, or no longer
  (a 404 about the model, OpenRouter's "not a valid model ID"): *Choose
  another one*, instead of *Try again*.

### Changed
- *Get a key* opens the provider's page in a new tab with `window.open`,
  also where a link's target is ignored (some embedded browsers).

## [0.6.0] — 2026-10-15

### Added
- **The user chooses the provider.** `createAi({ provider: [...], askKey: true })`
  takes a list: the Connect dialog shows the providers as cards (name, model,
  free or not, a dot on those whose key this browser keeps; arrows move
  through them). The choice and one key per provider are remembered, and a
  provider whose key is kept needs nothing pasted. `ai.key` gains `provider`,
  `providers`, `choose(id)` and `get(id)`; `ai.key.request()` opens the dialog
  to change provider.
- **`claudeProvider({ client })`** — Claude as one of those providers, with
  the user's own Anthropic key; the application's SDK is loaded when Claude
  is chosen.
- **`failureCode(status, message)`** — the rule that turns a provider's
  failure into the interface's error, exported for a model of your own.
- The live demo offers OpenAI, Claude, Mistral, Gemini and OpenRouter, says
  which one is connected, and has a *Change provider* link.

### Fixed
- **An exhausted quota said "busy, try again".** OpenAI answers a quota
  spent with a 429 (`insufficient_quota`), Anthropic an empty credit balance
  with a 400: both are now `MODEL_CREDITS`.
- **Claude's failures were all "could not answer".** The SDK's errors are now
  read like every provider's: a refused key is `KEY_REFUSED` (asked again with
  `askKey`), no credits `MODEL_CREDITS`, overloaded (529) `MODEL_BUSY`.

## [0.5.1] — 2026-10-15

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
