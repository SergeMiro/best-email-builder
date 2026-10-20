# Server

The whole server side is one function, `(request: Request) => Promise<Response>`,
returned by `createEmailBuilderHandler`. It uses the Fetch API, so it runs as
it is in Next.js route handlers, Hono, Bun, Deno and Cloudflare Workers. With
Express or Node's `http`, wrap it in `toNodeListener`
(see [Getting started](GETTING-STARTED.md#3-the-server-routes)).

The handler applies the rules: validation, compilation, versions and
concurrency. It leaves storage to a few small repositories that you write for
your database.

## Routes

`{base}` is the handler's `basePath`, `/api/email-builder` by default. The
*Permission* column is the `action` your `authorize` function receives.

| Method | Path | Permission | What it does |
|---|---|---|---|
| `GET` | `{base}/templates` | read | List the templates, each with its `tags` (ids) when there is a `tagStore`. |
| `POST` | `{base}/templates` | write | Create a template, or copy one with `{ duplicateOf }`. |
| `GET` | `{base}/templates/:id` | read | Read a template. |
| `PUT` | `{base}/templates/:id` | write | Save a template. |
| `DELETE` | `{base}/templates/:id` | write | Delete a template. |
| `PUT` | `{base}/templates/:id/tags` | write | Set a template's tags, `{ tags: [ids] }`, three at most (needs `tagStore`). |
| `GET` | `{base}/templates/:id/versions` | read | List a template's versions. |
| `GET` | `{base}/templates/:id/versions/:vid` | read | Read one version, with its project. |
| `POST` | `{base}/render` | read | Preview: render on the server and run the quality checks. |
| `POST` | `{base}/test` | write | Send a test email (needs `transport`). |
| `POST` | `{base}/assets` | write | Upload an image (multipart, field `file`). |
| `POST` | `{base}/proofread` | write | Find the mistakes of an email's texts (needs `generator`, see [AI](AI.md)). |
| `POST` | `{base}/rewrite` | write | Write or rewrite one text of an email (needs `generator`). |
| `POST` | `{base}/subjects` | write | Suggest three other subject lines (needs `generator`). |
| `GET` | `{base}/variables` | read | List the custom variables. |
| `POST` | `{base}/variables` | write | Create a custom variable. |
| `PUT` | `{base}/variables/:key` | write | Edit a variable (label, group, sample, fallback). |
| `DELETE` | `{base}/variables/:key` | write | Delete a variable. |
| `GET` | `{base}/brand` | read | Read the workspace's brand. |
| `PUT` | `{base}/brand` | write | Save the brand (needs `brandStore`). |
| `POST` | `{base}/brand/import` | write | Read a brand from a website (needs `brandImporter`). |
| `GET` | `{base}/tags` | read | List the workspace's tags, by name. |
| `POST` | `{base}/tags` | write | Create a tag, `{ label, color }` (needs `tagStore`). |
| `PUT` | `{base}/tags/:id` | write | Rename a tag or change its color. |
| `DELETE` | `{base}/tags/:id` | write | Delete a tag, from every template too. |
| `GET` | `{assetsPath}:key` | **public** | Serve an uploaded image. |

Images are public on purpose, because mail clients download them without a
session. Their keys are content hashes, so nobody can guess them, and they
are served with headers that allow nothing but an image.

## Options

```js
const handler = createEmailBuilderHandler({
  templates, assets, authorize,   // required
  /* everything below is optional */
});
```

| Option | Default | Description |
|---|---|---|
| `templates` | **required** | The template repository (see [Repositories](#repositories)). |
| `assets` | **required** | The image repository. |
| `authorize` | **required** | `(request, { action }) => user \| null`. Return the user (any object with `id` and `name`, recorded as the author) or `null` to answer 401. Throw `HttpError(403, …)` to answer with another status. |
| `basePath` | `'/api/email-builder'` | Where the routes live. |
| `assetsPath` | `{basePath}/assets/` | Where images are served. |
| `publicUrl` | `null` | Your site's address. Image URLs in compiled emails become absolute with it. |
| `transport` | `null` | `{ send({ to, subject, html, text }) }`. Turns on *Send test*. |
| `generator` | `null` | The AI, `createEmailGenerator(…)` from `best-email-builder/ai/server`. Without it, the AI routes answer 501. |
| `variables` | `DEFAULT_VARIABLES` | The system variables: by default only the unsubscribe link. Pass the same list to the editor. |
| `variableStore` | `null` | The repository of user-created variables. Without it, users cannot create variables. |
| `brandStore` | `null` | `{ get(), save(brand) }`. Turns on the *Brand* button. |
| `brandImporter` | `null` | `createBrandImporter()`. Turns on *Get my brand*. |
| `tagStore` | `null` | The repository of tags. Turns on tags in the library. |
| `locale` | `'en'` | The language of error messages (see [Languages](LANGUAGES.md)). |
| `messages` | — | Extra or overriding translations for those messages. |
| `lang` | `locale.slice(0, 2)` | The `<html lang>` of compiled emails. The AI also writes in this language when the browser does not send one. |
| `previewUnsubscribeUrl` | `'#'` | Where the unsubscribe link points in previews. |
| `maxVersions` | `50` | How many versions each template keeps. |
| `maxTestRecipients` | `10` | The most addresses one test send accepts. |
| `rateLimits` | see below | Per user, per hour. |
| `onError` | `console.error` | `(error, request) => void`, for unexpected errors. They reach the browser as a plain 500, or a 502 from the AI. |

| `rateLimits` key | Default |
|---|---|
| `testPerHour` | 20 |
| `uploadsPerHour` | 100 |
| `proofreadPerHour` | 60 |
| `rewritePerHour` | 200 |
| `subjectsPerHour` | 100 |
| `brandImportsPerHour` | 20 |

The limits are counted in memory, in one process. With several instances,
each one counts on its own.

The handler also has a method, `handler.catalog()`. It returns the system and
custom variables together, for your own sending pipeline (see
[Variables and sending](VARIABLES.md)).

## Storage contract

This contract is what connects the component to a backend. `createHttpStorage()`
implements it with the handler's routes. You can also implement it yourself to
talk to any other backend:

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
  listTags?(): Promise<Tag[]>;                           // enable tags in the library
  saveTag?(tag, { create }): Promise<Tag>;
  deleteTag?(id): Promise<void>;
  setTemplateTags?(id, tagIds): Promise<string[]>;
}
```

`createHttpStorage({ baseUrl, headers, fetch, brand, tags })` takes these options:

| Option | Default | Description |
|---|---|---|
| `baseUrl` | `'/api/email-builder'` | The handler's `basePath`, or a full URL. |
| `headers` | `{}` | Added to every request. Can be a function, to send a fresh token each time. |
| `fetch` | the global `fetch` | Your own `fetch`. |
| `brand` | `false` | `true` turns on the *Brand* button. Use `{ import: false }` when the server has no `brandImporter`. |
| `tags` | `false` | `true` turns on tags in the library. The server needs a `tagStore`. |

`createMemoryStorage()` implements the contract in memory. It is meant for
demos, tests and playgrounds. Give it `compile` (`({ mjml, subject, preheader })
=> ({ html })`) and its templates keep their HTML, as the server does: the
library then shows *Copy HTML* and *Download*.

## Repositories

The handler leaves persistence to small repositories. The memory versions are
the reference: `createMemoryTemplateRepository`, `createMemoryAssetRepository`,
`createMemoryVariableRepository`, `createMemoryBrandRepository` and
`createMemoryTagRepository`. Copy their shape for SQL, MongoDB, S3 and so on.

- `templates.update(id, fields, { expectedRevision })` must be **atomic**
  (`UPDATE … WHERE id = ? AND revision = ?`). On a mismatch it must return
  `{ conflict: true, current }`. This stops two editors from overwriting each
  other's work.
- `templates.addVersion(templateId, version, { keep })` numbers the versions
  and keeps the latest `keep` (50 by default).
- `assets.findBySha256`, `insert` and `get` store images. Images are
  deduplicated by the hash of their content.
- The tags are two tables: the tags (`list`, `insert`, `update`, `remove`)
  and the links between a template and its tags (`listLinks`, `setLinks`).
  `remove` deletes a tag's links too; the handler clears a deleted
  template's links.

The full contracts are JSDoc types in
[`src/server/templates.js`](../src/server/templates.js),
[`src/server/assets.js`](../src/server/assets.js),
[`src/server/variables.js`](../src/server/variables.js),
[`src/server/brand.js`](../src/server/brand.js) and
[`src/server/tags.js`](../src/server/tags.js).
