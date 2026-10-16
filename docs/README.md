<p align="center">
  <img src="assets/logo.svg" width="72" height="54" alt="beb">
</p>

# Best Email Builder — documentation

Start with *Getting started*: in three steps you have a library and an editor
that save to your server. Each page after it covers one subject, and you can
read them in any order.

| Page | What it covers |
|---|---|
| [Getting started](GETTING-STARTED.md) | Install, put the component in a page, add the server routes. |
| [Editor and library](EDITOR.md) | The editor, the template library or both. Every prop, and theming. |
| [Server](SERVER.md) | The routes, the handler's options, the storage contract and your database. |
| [Variables and sending](VARIABLES.md) | Merge tags, variables your users create, and personalizing at send time. |
| [AI](AI.md) | *Generate*, *Rewrite with AI*, *Suggest subjects*. Where the model runs, and the providers. |
| [Your own AI agent](AGENT.md) | Use the assistant your application already has, through the `agent@1` protocol. |
| [Brand](BRAND.md) | The *Brand* dialog: read a website's logo, colors and font, and repaint emails. |
| [Languages](LANGUAGES.md) | The seven built-in languages, your own strings, and adding a language. |
| [Security model](SECURITY-MODEL.md) | What the server accepts, what it refuses, and the limits. |
| [Architecture](ARCHITECTURE.md) | The source tree and the rules of the code, for contributors. |

## How it fits together

```
React UI ─► EmailEditor ─► NativeAdapter ─► the email: an MJML tree
 (ui/)        (core/)        (engine/)        │  canvas = the email compiled
                                              │  by mjml-browser
                                              │ project JSON + MJML
Server: validation ─► MJML compilation ─► variables ─► links ─► final HTML
```

- **In the browser**, you edit a tree of MJML elements. The canvas shows that
  tree compiled, so you see the email your recipients get.
- **On save**, the browser sends the project (JSON) and its MJML. It never
  sends HTML.
- **The server** validates both, compiles them to HTML and stores the
  template with a new version.
- **When you send**, your code takes the stored HTML and fills in each
  recipient's values with `personalize`.

The package has six entry points and one stylesheet. An application imports
only the ones it uses:

| Entry | What it brings |
|---|---|
| `best-email-builder` | Everything for the browser: `EmailStudio`, `EmailBuilder`, `TemplateLibrary`, storage, variables. |
| `best-email-builder/builder` | The editor only. |
| `best-email-builder/library` | The library only. It does not load the editor's engine or MJML. |
| `best-email-builder/server` | The route handler, repositories, compilation and `personalize`. |
| `best-email-builder/ai` | The AI buttons and the in-page providers. |
| `best-email-builder/ai/server` | The AI on your server: the generator, the providers, the agent protocol. |
| `best-email-builder/styles.css` | The one stylesheet, shared by all of them. |
