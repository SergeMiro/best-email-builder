# Getting started

A working builder needs three things: the package, the component in a page,
and the server routes the component calls. This page covers all three. It
ends with a library and an editor that save templates to your server.

## 1. Install

```bash
npm install best-email-builder
```

Peer dependencies: `react` and `react-dom` 18.2 or later. The server entry
needs Node 20 or later, or any runtime with the Fetch API and `node:crypto`.

## 2. The component

`EmailStudio` shows the template library first. *Edit* or *New template*
opens the editor, where the *Templates* button offers ready-made bases, and
*Back* returns to the library:

```jsx
import { EmailStudio, createHttpStorage } from 'best-email-builder';
import 'best-email-builder/styles.css';

const storage = createHttpStorage(); // the routes of step 3, at /api/email-builder

export default function Emails() {
  return (
    <div style={{ height: '100vh' }}>
      <EmailStudio storage={storage} locale="en" />
    </div>
  );
}
```

You can also mount the editor alone and open one template:

```jsx
import { EmailBuilder, createHttpStorage } from 'best-email-builder';
import 'best-email-builder/styles.css';

const storage = createHttpStorage({ baseUrl: '/api/email-builder' });

export default function TemplateEditor({ templateId, onClose }) {
  return (
    <div style={{ height: '100vh' }}>
      <EmailBuilder
        storage={storage}
        templateId={templateId}        // omit to create a new template
        onClose={onClose}
        onSaved={(template) => console.log('saved', template.id)}
      />
    </div>
  );
}
```

**Layout.** The builder fills its parent, so give the parent a height. The
layout follows the width of that parent, not the width of the window:

- from 1180 px: three columns (blocks, canvas, properties);
- below that: the properties open in a drawer;
- on a phone: only the canvas, with *Add a block* and *Edit* drawers.

**Next.js and other server renderers.** The builder runs only in the browser,
because the canvas needs the DOM. Render it from a `'use client'` component,
or load it with `dynamic(() => import(...), { ssr: false })`.

[Editor and library](EDITOR.md) shows the other ways to mount the two blocks,
and every prop.

## 3. The server routes

All the routes are one handler. It works with the Fetch API, so it fits
Next.js route handlers, Hono, Bun, Deno and Cloudflare Workers as it is:

```js
// app/api/email-builder/[...path]/route.js (Next.js App Router)
import {
  createEmailBuilderHandler,
  createMemoryTemplateRepository,
  createMemoryAssetRepository,
  createMemoryVariableRepository,
} from 'best-email-builder/server';

const handler = createEmailBuilderHandler({
  templates: createMemoryTemplateRepository(), // replace with your database
  assets: createMemoryAssetRepository(),       // replace with your database / object storage
  variableStore: createMemoryVariableRepository(), // optional: user-created variables
  authorize: async (request, { action }) => {
    const user = await getUserFromSession(request); // your auth
    return user ? { id: user.id, name: user.email } : null; // null → 401
  },
  publicUrl: process.env.PUBLIC_URL,            // absolute image URLs in sent emails
  transport: {                                  // optional: enables "Send test"
    send: ({ to, subject, html, text }) => mailer.sendMail({ from: 'no-reply@example.com', to, subject, html, text }),
  },
});

export { handler as GET, handler as POST, handler as PUT, handler as DELETE };
```

The memory repositories keep everything in memory and lose it on restart.
Replace them with your database before going to production.
[Server → Repositories](SERVER.md#repositories) describes the shape they must
have.

With Express or plain Node, wrap the handler with `toNodeListener`:

```js
import express from 'express';
import { createEmailBuilderHandler, toNodeListener } from 'best-email-builder/server';

const app = express();
app.use(toNodeListener(createEmailBuilderHandler({ /* … */ })));
```

**Images are public.** The server serves uploaded images at
`GET {basePath}/assets/<key>` without a session, because mail clients
download them without one. Do not put that path behind your authentication
middleware.

## Next steps

- [Variables and sending](VARIABLES.md): personalize the stored HTML for each recipient.
- [AI](AI.md): add *Proofread*, *Write with AI*, *Rewrite with AI* and *Suggest subjects*.
- [Brand](BRAND.md): start every email with your logo, colors and font.
- [Languages](LANGUAGES.md): show the interface in another language.
- [Server](SERVER.md): all the handler's options and the storage contract.
