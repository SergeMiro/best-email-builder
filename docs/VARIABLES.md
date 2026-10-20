# Variables and sending

The editor only inserts tags like `{{contact.firstname}}`. The values are
filled in on the server when you send. A raw tag never reaches a recipient.

## System variables

System variables come from your application. Users can insert them but
cannot change them.

| Tag | Sample |
|---|---|
| `{{contact.firstname}}`, `{{contact.lastname}}`, `{{contact.email}}` | Jane, Doe, jane.doe@example.com |
| `{{company.name}}` | Example Inc. |
| `{{campaign.name}}` | Newsletter |
| `{{ unsubscribe }}` | the unsubscribe link (`unsubscribeUrl`) |

To use your own list, define it with `defineVariables([...])` and pass the
same list to both sides: `<EmailBuilder variables>` and
`createEmailBuilderHandler({ variables })`.

## Custom variables

Users create custom variables from the *Variables* menu, with *New variable*.
A custom variable has:

- a **name**, for example "Order number";
- a **tag** proposed from the name, for example `{{order_number}}`. The tag
  cannot change once the variable exists, because templates contain it;
- a **group**;
- a **sample value**, used by the preview and by test sends;
- a **value if empty**, used for recipients without a value.

Custom variables are shared by every template. The server keeps them in the
`variableStore` repository (`createMemoryVariableRepository` is the
reference).

## Inserting a variable

- The menu has a search field (Ctrl K). ↑, ↓ and Enter work in it. A search
  with no result offers to create a variable with that name.
- A click inserts the tag at the caret of the text being edited. The
  unsubscribe link becomes the URL of a selected button.
- The *Personalization fields* bar above the canvas lists the variables as
  small badges, without the unsubscribe link. It grows under the pointer, or
  on a click. A badge's tooltip shows its tag. With a text or a button
  selected, a badge under the pointer types its tag where it would go, and
  wipes it out when the pointer leaves. Nothing is saved until you click the
  badge, which inserts the tag like the menu does.
- The `{ }` buttons next to *Subject* and *Preview text* insert a tag there.
- `{{contact.firstname|there}}` sets a fallback for that one place.
- The preview flags unknown tags, such as `{{contact.fistname}}`, before they
  reach anyone.

## Sending a campaign

The builder stores the compiled HTML of each template. When you send, fill
in each recipient's values with `personalize`:

```js
import { personalize, applyVariablesToText } from 'best-email-builder/server';

const variables = await handler.catalog();   // system + user-created variables
const values = { 'contact.firstname': 'Ada', 'contact.email': 'ada@example.com' };
const html = personalize(template.html, {
  values,
  variables,
  unsubscribeUrl: signedUnsubscribeUrl(recipient),
  baseUrl: 'https://app.example.com',   // makes uploaded images absolute
});
const subject = applyVariablesToText(template.subject, values, variables);
```

Values are HTML-escaped. When a recipient has no value, the builder uses, in
order:

1. the fallback written in the tag (`|there`);
2. the variable's *value if empty*;
3. an empty string.

Some email providers do their own merge. For those, map the tags to the
provider's syntax instead:

```js
mapVariables(html, { 'contact.firstname': '{{ contact.FIRSTNAME }}' });
```
