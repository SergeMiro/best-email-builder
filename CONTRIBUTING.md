# Contributing

Thanks for helping! A few rules keep the project healthy.

## Setup

```bash
npm install
npx playwright install chromium
npm run dev        # playground (Ladle) on http://localhost:61010
```

## Before opening a pull request

```bash
npm run lint
npm run typecheck
npm test
npm run test:stories
npm run test:e2e
```

All must pass. Add or update tests with every behaviour change.

## Architecture rules

- **React never touches the engine.** UI components talk to the `EmailEditor`
  contract (`src/core/EmailEditor.js`); the model, the canvas and the gestures
  live in `src/engine/`. MJML alone turns the email into HTML.
- **Blocks and features are registry entries** (`src/blocks/index.js`,
  `src/features/index.js`). Adding or removing one must not require touching
  the core.
- **The server compiles.** No route may accept HTML from the browser.
- **Strings are English in the code** and go through `t()`; add the French
  translation to `src/i18n/fr.js` (`node scripts/i18n-keys.mjs fr` lists what
  is missing). Utility classes carry the `eb:` prefix.

## Commits

Small, focused commits with a descriptive message. One topic per pull request.
