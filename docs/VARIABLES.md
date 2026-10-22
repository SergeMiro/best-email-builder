# Variables and sending

The editor only inserts tags like `{{contact.firstname}}`. The values are
filled in on the server when you send. A raw tag never reaches a recipient.

## System variables

System variables come from your application. Users insert them, and may
edit their name, group, sample value and value if empty with the pencil of
their badge, but never their tag (see [Editing a system
variable](#editing-a-system-variable)).

There are none by default, apart from the unsubscribe link
`{{ unsubscribe }}` (`DEFAULT_VARIABLES`), which the sending pipeline fills
with `unsubscribeUrl`. Users then create their own from the variables bar
(see [Custom variables](#custom-variables)).

To give them a list of your own, define it with `defineVariables([...])`,
keep the unsubscribe link, and pass the same list to both sides:

```js
import { DEFAULT_VARIABLES, defineVariables } from 'best-email-builder';

const variables = defineVariables([
  { key: 'contact.firstname', label: 'First name', group: 'Recipient', sample: 'Jane' },
  ...DEFAULT_VARIABLES,
]);

<EmailBuilder variables={variables} />;               // the editor
createEmailBuilderHandler({ variables, ... });        // the server
```

`EXAMPLE_VARIABLES` is a ready-made set to start from:

| Tag | Sample |
|---|---|
| `{{contact.firstname}}`, `{{contact.lastname}}`, `{{contact.email}}` | Jane, Doe, jane.doe@example.com |
| `{{company.name}}` | Example Inc. |
| `{{campaign.name}}` | Newsletter |

## Custom variables

Users create custom variables from the variables bar above the canvas, with
its **+** button (*New variable*), and edit or delete them with the pencil of
their badge.
A custom variable has:

- a **name**, for example "Order number";
- a **tag** proposed from the name, for example `{{order_number}}`. The tag
  cannot change once the variable exists, because templates contain it;
- a **group**;
- a **sample value**, used by the preview and by test sends;
- a **value if empty**, used for recipients without a value.

Custom variables are shared by every template. The server keeps them in the
`variableStore` repository (`createMemoryVariableRepository` is the
reference). Without it, the server answers 501 *Custom variables are not
configured* when a user creates one.

## Editing a system variable

The pencil of a system variable's badge opens the same dialog as for a
custom one, with its tag frozen. What the user changes (name, group, sample
value, value if empty) is stored like a custom variable, under the system
variable's key: `PUT {base}/variables/:key` on the server, `saveVariable` in
the storage. `mergeVariables` lays it over your variable and marks it
`edited`; its tag, kind and token stay yours, and the unsubscribe link is
never edited. Once edited, the dialog offers *Restore the default*: it
deletes the edit (`DELETE {base}/variables/:key`) and your values are back.
This needs the `variableStore` repository, as custom variables do.

## Inserting a variable

- The *Email provider variables* bar above the canvas is the one place to
  insert a variable. It grows under the pointer, or on a click, and lists the
  variables as small badges, moving the email down rather than covering it.
  A badge's tooltip shows its tag.
- With a text or a button selected, a badge under the pointer types its tag
  where it would go, and wipes it out when the pointer leaves. Nothing is
  saved until you click the badge.
- A click inserts the tag at the caret of the text being edited, otherwise at
  the end of the selected text or button. The unsubscribe link is inserted as
  a link, or becomes the URL of a selected button.
- The `{ }` buttons next to *Subject* and *Preview text* insert a tag there.
- `{{contact.firstname|there}}` sets a fallback for that one place.
- The preview flags unknown tags, such as `{{contact.fistname}}`, before they
  reach anyone.

## Removing a variable

In the email, a tag under the pointer swaps its colors, line by line when it
runs over two (the words beside it keep theirs), and shows a **×** at its
end, top right (on its last line). The × takes the
tag out of the text or the button's label, with the space before it, so no
double space or space before a comma is left. Ctrl+Z brings it back.

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
mapVariables(html, { 'contact.firstname': '{{ contact.FIRSTNAME }}' }, variables);
```

Or have the editor insert the provider's tags from the start: a system
variable's key may keep the provider's capitals, and its `token` is the tag
inserted. The live demo does this with Brevo's contact attributes:

```js
const variables = defineVariables([
  { key: 'contact.FIRSTNAME', label: 'First name', group: 'Brevo', sample: 'Jane', token: '{{ contact.FIRSTNAME }}' },
  ...DEFAULT_VARIABLES,
]);
```

The preview and a test send still fill these tags with their samples; for
the real sending, the provider fills them. Custom variables, typed by users,
keep lowercase keys.
