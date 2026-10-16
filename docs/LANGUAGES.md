# Languages

The interface comes in seven languages. You can add strings or override them,
and add any other language with a dictionary.

| `locale` | Language |
|---|---|
| `'en'` | English, the source language |
| `'fr'` | French |
| `'de'` | German |
| `'es'` | Spanish |
| `'pt'` | Portuguese (Brazil) |
| `'ru'` | Russian |
| `'zh'` | Chinese (Simplified) |

## In the browser

`EmailStudio`, `EmailBuilder` and `TemplateLibrary` take the same two props:

- `locale`: a code from the table, or any BCP 47 tag. A regional tag finds
  its language (`'fr-FR'` uses `fr`, `'pt-PT'` uses `pt`). A language with no
  dictionary shows English.
- `messages`: your own strings, which take precedence over the built-in ones.
  The keys are the English texts of the interface.

```jsx
<EmailStudio locale="de" messages={{ 'Save': 'Sichern' }} />
```

The same props show the interface in a language that is not built in. Missing
strings fall back to English:

```jsx
import it from './email-builder.it.js'; // { 'Save': 'Salva', … }

<EmailBuilder locale="it" messages={it} />
```

The AI module keeps its texts in dictionaries of its own (`AI_MESSAGES`), so
an application without the AI does not load them. When you give the module
to the editor, its texts are merged under your `messages`, so `messages` can
override them too.

The AI writes in the interface's language: *Generate* writes the email in it,
and *Suggest subjects* uses the language of the email.

## On the server

The handler's error and validation messages follow its own `locale`:

```js
createEmailBuilderHandler({
  /* … */
  locale: 'de',
  messages: { /* your own strings */ },
  lang: 'de', // <html lang> of compiled emails (default: locale.slice(0, 2))
});
```

When the handler has an AI `generator`, the generator's texts are merged
under the server's `messages` in the same way.

## Exports

| Export | From | What it is |
|---|---|---|
| `LOCALES` | `best-email-builder`, `/builder`, `/library`, `/server` | The built-in dictionaries, by code. English is `{}`. |
| `translatorFor(locale, messages)` | the same | A `t(text, params)` function for a locale, with your strings on top. |
| `messagesOf(dictionaries, locale)` | `best-email-builder`, `/server` | The dictionary of a locale among several. `'fr-FR'` finds `fr`; none gives `{}`. |
| `createTranslator(messages)` | `best-email-builder`, `/builder`, `/library`, `/server` | A `t()` function over one dictionary. |
| `AI_MESSAGES` | `best-email-builder/ai`, `/ai/server` | The AI module's dictionaries, by code. |

Placeholders use `{name}`: `t('Saved — version {n}.', { n: 3 })`.

## Adding a language to the package

A language is two dictionaries: one for the core and one for the AI module.

1. Copy `src/i18n/fr.js` to `src/i18n/<code>.js`, and `src/ai/i18n/fr.js` to
   `src/ai/i18n/<code>.js`. Translate the values and keep the keys and the
   `{placeholders}` as they are.
2. Register the language in `src/i18n/index.js` (`LOCALES`) and
   `src/ai/i18n/index.js` (`AI_MESSAGES`).
3. Run `node scripts/i18n-keys.mjs <code>`. It lists the keys that are
   missing. Then add the code to the `check:i18n` script in `package.json`.
4. Run `npm test`. The unit tests check that every language has the same keys
   as French and the same placeholders as the English text.

Counts are written as "Label: {count}", so no plural rules are needed.

Every built-in language is part of the bundle and adds about 15 KB gzipped.
