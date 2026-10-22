# AI

The AI is an optional module with its own entry point,
`best-email-builder/ai`. If your application does not import it, there is no
AI button anywhere, and none of the AI's code or texts end up in your bundle.

Given to the editor, the module adds four things:

| Feature | Where | What it does |
|---|---|---|
| **Proofread** | the toolbar | Finds the spelling, grammar and punctuation mistakes of every text in the email, and shows each correction word by word, to apply. |
| **Write with AI** | the properties of a text or a button | One field: writes that text on a topic you give, or changes it as you say, to fit the rest of the email. One click makes it shorter, longer, fixed, friendlier, more formal or translated. |
| **Suggest subjects** | under the subject | Proposes three other subject lines drawn from the email. |

```jsx
import { createAi } from 'best-email-builder/ai';

<EmailBuilder storage={storage} ai={createAi(/* where the model runs, below */)} />
```

Pass `proofread: false`, `rewrite: false` or `suggestSubjects: false` to leave
a feature out, along with its button (`rewrite: false` removes *Write with
AI*). You can also pass functions of your own for any of them.

## Where the model runs

There are four options. Choose by who holds the key.

### On your server

The key stays on your server. This is the right choice for production.

```js
// server
import { createEmailBuilderHandler } from 'best-email-builder/server';
import { createEmailGenerator, providerEmailModel } from 'best-email-builder/ai/server';

const handler = createEmailBuilderHandler({
  /* … */
  generator: createEmailGenerator({
    model: providerEmailModel({ provider: 'openrouter', apiKey: process.env.OPENROUTER_API_KEY }),
  }),
  rateLimits: { proofreadPerHour: 60, rewritePerHour: 200, subjectsPerHour: 100 }, // per user (defaults)
});
```

```jsx
// browser: the handler's /proofread, /rewrite and /subjects routes
<EmailBuilder storage={createHttpStorage()} ai={createAi()} />
```

`createAi({ baseUrl, headers })` points at the same routes somewhere else, or
sends the user's credentials. Without a `generator`, those routes answer 501.

Most answers take a few seconds; proofreading a long email with a slow model
can take a minute. Give the routes that long: `maxDuration` on Vercel, or your
proxy's timeout.

### In the page, with each user's own key

No server is needed. The first AI action opens a *Connect* dialog: the
provider, a link to get a key, and what is free. The key is kept in that
browser and sent only to the provider. If the provider refuses the key, the
builder forgets it and asks again. This mode is off by default:

```jsx
const ai = createAi({ provider: 'openrouter', askKey: true });
```

Give a list, and each user chooses. The dialog shows the providers as cards:
name, model, and a dot on those whose key this browser keeps. Under them,
the chosen provider's link to get a key and what it offers for free.
The choice and one key per provider are remembered, so going back to a
provider needs nothing pasted again.

```jsx
const ai = createAi({ provider: ['openai', 'mistral', 'gemini', 'openrouter'], askKey: true });
```

Under the key, the user can choose the model. The field opens the provider's
own list (asked with the key; OpenRouter's needs none). The default model
comes first, then the free ones, marked, then the newest. The list is
searchable, has a *Free only* filter, and accepts an id it does not contain.
Embedding, speech, image and video models are left out. The chosen model is
remembered for each provider. Without the list, the default model still
works.

Add `'openai-compatible'` to the list for an API of the user's own: LM
Studio, vLLM, Ollama on another machine, a company proxy. The dialog then
asks for its address (`http://localhost:1234/v1`), a key only if it needs
one, and a model from its `/models` list. The address is remembered like the
key. The API must accept requests from the page (CORS).

```jsx
const ai = createAi({ provider: ['openrouter', 'gemini', 'openai-compatible'], askKey: true });
```

`ai.key` reads and changes this state:

| Member | What it does |
|---|---|
| `provider`, `providers` | The provider in use, and all of them. |
| `choose(id)` | Switch provider. |
| `get(id?)`, `set(key)`, `forget()` | Read, store or forget a key. |
| `model(id?)`, `chooseModel(model, id?)` | Read or set the model of a provider. |
| `listModels(id?, { apiKey, address, signal })` | The provider's models, as the dialog shows them. |
| `address(id?)`, `setAddress(url, id?)` | Read or set the address of an OpenAI-compatible API. |
| `ready()` | Whether the provider in use can write: key, address, model. |
| `request()` | Open the dialog, for example to change provider or model. |
| `subscribe(fn)`, `state()` | Follow `{ asking, refused, connected }`. |

The live demo works this way.

### In the page, with one key for everyone

Use this only for prototypes and internal tools, because the key is in the
page's code:

```jsx
const ai = createAi({ provider: 'groq', apiKey });
```

### Your own AI agent

The assistant your application already has (its model, its tools, its
knowledge base, its users' rights) can become the builder's AI. *Proofread*,
*Write with AI*, *Rewrite with AI* and *Suggest subjects* then go through it. The agent
speaks a small HTTP protocol, `best-email-builder/agent@1`: one POST per
model turn, with `{ task, system, messages, schema }` in and `{ text }` out.
The builder still writes the prompts and checks every answer, so the agent
needs to know nothing about MJML.

```js
generator: createEmailGenerator({
  model: agentEmailModel({
    url: 'http://agent.internal:8800/email-builder',
    headers: ({ user }) => ({ 'X-Auth-User': signFor(user) }), // who asks: the user authorize returned
  }),
}),
```

The agent's side is one FastAPI file to copy
([`examples/agent/python`](../examples/agent/python)), or
`createAgentEndpoint` in JavaScript. `checkAgent({ url, headers })` tests an
agent with the builder's own checks. The protocol, the errors and both sides
are in [AGENT.md](AGENT.md).

## Providers

Every provider below speaks the OpenAI *chat completions* API, so there is
nothing to install. `provider` is an id from the table, or
`{ id, model, baseUrl, headers, maxTokens, body }` to change the model or
reach an endpoint of your own. `AI_PROVIDERS` lists them with their name,
address, default model, where to get a key and what is free.

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

Good to know:

- **Model names change often.** The defaults were current at this release.
  Pass `model` to be sure of yours.
- **`openrouter/free` costs nothing but is slow.** Most free models reason
  before they answer, so a proofread takes one to a few minutes, and some
  days a free model is busy upstream. The builder asks OpenRouter for less reasoning
  (`reasoning: { effort: 'low' }`) and gives it room for it
  (`maxTokens: 32000`; 16 000 elsewhere). For answers in seconds, use a free
  tier with its own key (Gemini, Groq, Cerebras) or a paid model.
- **Listing models.** `listProviderModels({ provider, apiKey })` lists the
  models a provider offers for writing, as the dialog does (`{ id, name, free }`,
  the default first). It uses the provider's `/models`, or the provider's own
  `listModels` (`claudeProvider` has one).
- **Extra request fields.** `body` adds fields of your own to each request,
  for example OpenRouter's fallback list:
  `providerEmailModel({ provider: 'openrouter', apiKey, body: { models: [...] } })`.
  It cannot change the model, the messages or the output limit.
- **Structured output.** The answer is requested as structured output (a JSON
  schema). If a model refuses it, the builder asks for a JSON object, then for
  plain JSON, once, and remembers what worked. Some models break the JSON in
  structured output (on the quotes of HTML); tell the builder to skip it with
  `provider: { …, format: 'text' }`.
- **Errors.** The provider's failures become errors the interface explains in
  its own language:
  - `KEY_MISSING`, `KEY_REFUSED`;
  - `MODEL_UNAVAILABLE`: the provider does not have that model, or no longer;
  - `MODEL_CREDITS`: an exhausted quota, even when it comes as a 429
    (OpenAI's `insufficient_quota`) or a 400 (Anthropic's credit balance);
  - `MODEL_BUSY`;
  - `MODEL_ERROR`, with the provider's own text in `detail`.

  None of them is a 401, because the key belongs to the AI, not to the user's
  session. A 403 about the model (not available here, or in this region) or
  about the content is not `KEY_REFUSED`, so with `askKey` the user's key is
  kept. `failureCode(status, message)` applies these rules, for a model of
  your own.

### Claude

On your server, use `claudeEmailModel({ client: new Anthropic() })` with the
Anthropic SDK (`npm install @anthropic-ai/sdk`). It uses `claude-opus-5-5` by
default, with `effort: 'low'` (pass `effort` for more care) and structured
output, and streams so that a long proofread does not hit a request timeout. You can also reach Claude through
OpenRouter with an `anthropic/…` model and one key for every model.

With `askKey`, Claude is one more provider to choose, with the user's own
Anthropic key. The SDK loads only when the user chooses Claude:

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

### Any other model

A model is a function `({ system, messages, schema, signal, task }) => Promise<string>`
that returns the JSON text. Pass it as `createEmailGenerator({ model })` on
the server, or `createAi({ model })` in the page.

## Proofread

*Proofread*, in the toolbar, reads every text the reader sees in one call:
the subject, the preview text, the text blocks, the buttons and the menu
links. It lists the texts that have a mistake, with the old words struck out
and the new ones next to them. Each correction is applied on its own, or all
at once with *Apply all*, and nothing changes before. The corrections applied
together are one step of the history, so Ctrl+Z brings the texts back. A text
edited after it was read is left as it is, because its correction was for the
old words. *Check again* reads the email anew.

The model's answer is never trusted as it is. A correction is kept only when:

- it changes words (markup moved alone is dropped, since it may lose bold or
  a link);
- it keeps the same markup, links and merge tags, and passes the validator;
- it stays small: words touched in at most a third of the text (three in a
  short one). More would be a rewrite, not a correction.

What fails goes back to the model once, with the list of problems. What fails
again is left out, and the other corrections still come back.

- On a server, it is `POST {base}/proofread` (`generator.proofread`), 60 per
  user per hour. The request is `{ texts: [{ id, kind, format, text }], language }`
  (up to 120 texts, 30 000 characters in all); the answer is
  `{ fixes: [{ id, text }] }`, only the texts with a mistake.
- A model of your own gets `task: 'rewrite'`, so an agent written for 0.9
  answers it too.
- `PROOFREAD_SYSTEM_PROMPT`, `createProofreader` and `reviewFix` are exported
  from `best-email-builder/ai/server`, and `diffWords` (the word-by-word
  difference the dialog shows) from both entries.

## Write with AI

The same generator writes or rewrites one text. Select a text block or a
button, and its properties show *Write with AI*: ONE field for your words.
Say what to change ("in two lines", "mention free delivery") and the text is
changed so; give a topic ("the sale ends Sunday") and a new text is written
in its place — the model tells which. Either way it fits the rest of the
email (its language, its tone, nothing it already says), a title stays one
line, and where a fact is missing (a date, a price, a name) the model writes
a `[placeholder]` instead of inventing it. The field takes several lines:
Enter sends, Shift+Enter starts a new line.

Under it, one click: *Shorter*, *Longer*, *Fix mistakes*, *Friendlier*,
*More formal*, *Translate* (13 languages, each under its own name).

While the AI works, the text shimmers on the canvas; its answer comes in word
by word (at once with reduced motion). It replaces the text as one step of
the history: Ctrl+Z brings the previous text back, so there is nothing to
accept or compare. Selecting another element cancels a rewrite in progress.
If the user edits the text in the meantime, their words win and the answer
is dropped.

- On a server, it is `POST {base}/rewrite`. A generator without `rewrite`
  answers 501.
- Every link (the same `href`, none added) and every variable (the same keys,
  none added) must survive, and the HTML must pass the validator. A fallback
  after `|` may be translated. Otherwise the model gets one more turn, and
  then nothing changes. A button label comes back as plain words.
- A model of your own gets `task: 'rewrite'` in its request. The field sends
  `{ action: 'custom', instruction, context, role, language }`: on a text
  with no words yet the instruction is a topic to write about. `{ action:
  'write', instruction: topic }` still writes a text anew.
- `REWRITE_ACTIONS`, `REWRITE_LANGUAGES` and `REWRITE_SYSTEM_PROMPT` are
  exported.

## Suggest subjects

Under the email's subject, *Suggest subjects* asks for three other subject
lines. They are drawn from the words of the email, each from its own angle:
clear, curious, personal or timely. They appear as a list, with the user's
own subject first. A click puts one in the field, another click another one,
and the first row brings the user's subject back. *More ideas* asks for three
new ones, and *Done* closes the list.

- On a server, it is `POST {base}/subjects` (`generator.suggestSubjects`),
  100 per user per hour.
- The subjects are plain lines in the language of the email, different from
  the current subject and from each other. They may contain merge tags only
  from the server's catalog. Otherwise the model gets one more turn. Fewer
  than three good ones are still shown.
- A model of your own gets `task: 'subjects'`. `emailWords(mjml)` (the words a reader sees) and `SUBJECTS_SYSTEM_PROMPT`
  are exported.

## The live demo

The live demo has no server. Its AI runs in the page, with the visitor's own
key, for the provider they choose: OpenAI, Claude, Mistral, Gemini,
OpenRouter or an OpenAI-compatible API of their own.

```js
createAi({ provider: ['openai', claude, 'mistral', 'gemini', 'openrouter', 'openai-compatible'], askKey: true });
```
