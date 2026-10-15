# Your own AI agent — `best-email-builder/agent@1`

An application that already has an AI assistant (its own model, its tools,
its knowledge base, its users' rights) can make it the builder's AI:
**Generate**, **Rewrite with AI** and **Suggest subjects** then go through
that agent instead of a model called directly.

The agent only answers questions. The builder still writes the prompts, reads
the answers, cleans and checks them, and gives the agent one repair turn when
an answer has problems. So the agent needs to know nothing about MJML or
about the builder.

```
browser ──► your server: createEmailBuilderHandler({ generator })   ← authorize() says who asks
                └─► createEmailGenerator({ model: agentEmailModel({ url, headers }) })
                        └─► POST {url}  ─────────────►  your agent: its model, its tools, its rights
                            ◄─ { text } ─────────────┘
                        checked like any model's answer (one repair turn at most)
```

## The builder's side

On the server, where `authorize` already knows the user:

```js
import { compileMjml, createEmailBuilderHandler } from 'best-email-builder/server';
import { agentEmailModel, createEmailGenerator } from 'best-email-builder/ai/server';

const handler = createEmailBuilderHandler({
  /* templates, assets, … */
  authorize: async (request) => {
    const session = await yourSession(request);
    return session ? { id: session.userId, name: session.login, session } : null;
  },
  generator: createEmailGenerator({
    model: agentEmailModel({
      url: 'http://agent.internal:8800/email-builder',
      // Who asks, in the form your agent trusts (here, a token signed for that user).
      headers: async ({ user, task }) => ({ 'X-Auth-User': await signFor(user.session) }),
    }),
    compile: compileMjml,
  }),
});
```

```jsx
// The page: the handler's /generate, /rewrite and /subjects routes.
<EmailBuilder storage={storage} ai={createAi({ baseUrl: '/api/email-builder' })} />
```

The handler checks the user's rights and rate limits before anything reaches
the agent. The `user` that `authorize` returned is passed to `headers` and is
never sent in the request body.

Without a server of the builder's own, the generator can run in the page and
reach the agent through a route of your application that adds the session:

```jsx
<EmailBuilder storage={storage} ai={createAi({ model: agentEmailModel({ url: '/api/agent/email-builder' }) })} />
```

`agentEmailModel({ url, headers?, fetch?, timeout?, name? })`

| Option | |
|---|---|
| `url` | the agent's endpoint |
| `headers` | an object, or `({ task, user }) => object` (may be async) |
| `timeout` | the longest wait for one answer, in ms. Default 180 000 (3 minutes); `0` means no limit. When it expires the call fails with `MODEL_BUSY` |
| `name` | the agent's name, used in the details of its errors |

## The protocol

There is one `POST` for each model turn. Generating one email takes one turn,
or two when a repair is needed.

**Request** (`Content-Type: application/json`):

```json
{
  "protocol": "best-email-builder/agent@1",
  "task": "generate",
  "system": "You write emails… # Answer format\nAnswer with ONE JSON object…",
  "messages": [{ "role": "user", "content": "Write the email…" }],
  "schema": { "type": "object", "properties": { "name": {}, "subject": {}, "preheader": {}, "mjml": {} } }
}
```

| Field | |
|---|---|
| `task` | `generate` (a whole email), `rewrite` (one text) or `subjects` (three subject lines). `rewrite` and `subjects` are lighter jobs, so a smaller or faster model can answer them |
| `system` | the instructions, including the answer format. Given to a chat model exactly as they are, together with `messages`, they produce a valid answer |
| `messages` | `user` / `assistant` turns. A repair turn adds the previous answer and the list of problems found in it |
| `schema` | the JSON schema of the answer, for models that take structured output |

**Answer**: `200` with one of these:

- `{ "text": "<the model's answer>" }`. This is the usual case: the text of the model, which is JSON matching `schema`. Code fences and prose around the JSON are tolerated.
- `{ "output": { … } }`: the answer as an object.
- the answer itself as the body (a plain text, or the JSON object).

**Failure**: any status other than 2xx, with `{ "error": "what happened", "code": "…" }`.
A `code` from this list is shown to the user in their language:

| `code` | shown as |
|---|---|
| `REFUSED` | the AI declined (the dialog suggests other details) |
| `TRUNCATED` | the answer was cut, so ask for a shorter one |
| `MODEL_UNAVAILABLE` | the model is not there |
| `MODEL_CREDITS` | no credits left |
| `MODEL_BUSY` | busy, try again in a minute |
| `MODEL_ERROR` | could not answer, try again |

When there is no `code`, the status decides: `429`, `503`, `504` and `529`
mean `MODEL_BUSY`, and anything else means `MODEL_ERROR`. A `401` or `403`
from the agent is also `MODEL_ERROR`: it concerns your session, not an AI
key, so the user is not asked for one.

**Who asks** is never in the body. Read it from the headers you chose
(`headers` above) and apply that user's rights to every tool the agent calls.

## The agent's side

### Python (FastAPI)

Copy [`examples/agent/python/email_builder_agent.py`](../examples/agent/python/email_builder_agent.py)
(one file, FastAPI only):

```python
from fastapi import Depends
from email_builder_agent import AgentError, email_builder_router

async def complete(task, system, messages, schema, request):
    user_token = request.headers["x-auth-user"]
    convo = [{"role": "system", "content": system}, *messages]
    # Your agent: one model call, or its tools first (search, the customer's data).
    return await your_llm(convo, user_token, use_tools=(task == "generate"))

app.include_router(email_builder_router(complete, dependencies=[Depends(require_user)]))
```

Raise `AgentError("MODEL_BUSY", "…")` for a failure the builder explains.
Any other exception is logged and answered as `MODEL_ERROR` without its
message, and an `HTTPException` of your own (a 401) goes out as it is. A
runnable agent on a free model is [`examples/agent/python/app.py`](../examples/agent/python/app.py);
its tests are next to it (`pytest examples/agent/python`).

### JavaScript

```js
import { createAgentEndpoint } from 'best-email-builder/ai/server';

export const POST = createAgentEndpoint({
  complete: async ({ task, system, messages, schema, request, signal }) => {
    const who = await sessionOf(request);
    return yourAgent.answer({ system, messages, who, signal }); // text, or the answer as an object
  },
});
```

Throw an error whose `code` is one of the codes above for a failure the
builder explains. `onError(error, request)` logs the others. With Express,
use `toNodeListener` from `best-email-builder/server`.

## Trying an agent

`checkAgent` asks for one email, one rewrite and three subject lines, the way
the builder does (with the repair turn), and checks the answers with the
builder's own checks:

```js
import { checkAgent } from 'best-email-builder/ai/server';
import { compileMjml } from 'best-email-builder/server';

const report = await checkAgent({
  url: 'http://localhost:8800/email-builder',
  headers: () => ({ 'X-Auth-User': token }),
  compile: compileMjml,
  language: 'fr',
});
// { ok: true, results: [{ task: 'generate', ok: true, ms: 25900, attempts: 1, sample: { subject: … } }, …] }
```

A failed task reports its code and the reason, for example `INVALID_OUTPUT`
(prose instead of an email) or `REWRITE_UNUSABLE` (a link was lost).
