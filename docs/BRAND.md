# Brand

The *Brand* button gives every new email the company's logo, colors and
font, and can repaint the email being edited.

## The dialog

The first field is the company's website. *Get my brand* reads the site's
logo, main color, headings color, font and name, and fills in the fields
below. You can then change everything by hand (upload a logo, pick a color).
A small preview follows every change.

*Save* keeps the brand for the whole workspace:

- **The email being edited is repainted.** The box *Also apply to this email*
  is ticked by default. Repainting is one step of the history, so Ctrl+Z
  brings the previous look back.
- **New emails start in the brand.** This covers new templates, gallery
  templates, inserted blocks and AI-generated emails. The logo (or the name)
  goes at the top and the name in the footer. Buttons and banners take the
  main color, and headings take the headings color.

## How emails are repainted

Emails are repainted by **role**, not by exact color. So it works on any
email: a gallery template, a generated one, or one built by hand.

- Filled buttons and colored banners take the main color. Their text switches
  to white or dark, whichever is easier to read.
- Bold headings take the headings color.
- Colored links take the main color. If the main color is too light to read
  on white, they take the headings color instead.
- Gray footers and body text keep their colors.

## Setup

```js
import {
  createEmailBuilderHandler,
  createBrandImporter,
  createMemoryBrandRepository,
} from 'best-email-builder/server';

const handler = createEmailBuilderHandler({
  // …
  brandStore: createMemoryBrandRepository(), // one row: { get(), save(brand) }
  brandImporter: createBrandImporter(),      // optional: "Get my brand"
  rateLimits: { brandImportsPerHour: 20 },   // per user (default)
});

// In the browser:
const storage = createHttpStorage({ brand: true }); // { brand: { import: false } } without an importer
```

- **Routes:** `GET {base}/brand`, `PUT {base}/brand` (write permission) and
  `POST {base}/brand/import` with `{ url }` (write permission).
- **The import saves nothing.** The user reviews the result first.
- **Logos.** A logo found on the site is stored like an upload: PNG, JPEG or
  GIF. SVG and WebP logos are skipped, because most email apps do not show
  them. The dialog tells the user.
- **What turns what on.** Without `brandImporter`, the dialog has no website
  field. Without `brandStore`, there is no *Brand* button.
- **Bot protection.** Some websites refuse automated readers and answer 403.
  The dialog says so, and the user fills in the brand by hand.
- **Your own pipeline.** `applyBrand(mjml, brand)` and `cleanBrand(brand)` are
  exported, for example to rebrand stored templates.

Reading a website is a request your server makes to an address a user typed.
[Security model](SECURITY-MODEL.md) lists the checks around it.

The live demo has no server. It keeps the brand in `localStorage` and has no
website field.
