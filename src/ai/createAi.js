// @ts-check
/**
 * THE AI MODULE — `createAi()`, given to the builder as `ai`.
 *
 *   import { createAi } from 'best-email-builder/ai';
 *   <EmailBuilder storage={storage} ai={createAi()} />
 *
 * Without it, the builder has no AI button, and none of the AI's code or
 * texts is in the application's bundle: the core never imports this folder.
 * With it, the builder gets what the module can do:
 *
 *   generate         the Generate button (an email written from a purpose)
 *   rewrite          "Rewrite with AI" in the properties of a text or a button
 *   suggestSubjects  "Suggest subjects" under the subject
 *
 * Where the model runs:
 *
 *   createAi()                          the routes of createEmailBuilderHandler({ generator })
 *   createAi({ baseUrl, headers })      the same routes elsewhere, or with the user's credentials
 *   createAi({ provider, askKey: true }) the AI runs in the page with each user's own key
 *                                       (OpenRouter, Gemini, Groq… — see providers.js);
 *                                       the builder asks for it once (the Connect dialog)
 *   createAi({ provider: [...], askKey: true })
 *                                       the same, the user choosing the provider in that
 *                                       dialog (Claude too: claudeProvider in claude.js),
 *                                       and the model among those the provider lists
 *   createAi({ provider, apiKey })      the same with one key for all (prototypes: the key
 *                                       is then in the page)
 *   createAi({ model })                 the generator runs in the page with this model
 *   createAi({ generate, rewrite, … })  functions of your own: only those given are on
 *
 * Each of `generate`, `rewrite` and `suggestSubjects` can also be `false`,
 * to leave that part out — its button with it.
 */

import { createHttpCaller } from '../storage/client.js';
import { createEmailGenerator } from './generator.js';
import { AI_MESSAGES } from './i18n/index.js';
import { createKeyStore } from './keys.js';
import { providerEmailModel, resolveProvider } from './providers.js';
import ConnectAi from './ConnectAi.jsx';
import GenerateButton from './GenerateButton.jsx';
import RewriteText from './RewriteText.jsx';
import SubjectIdeas from './SubjectIdeas.jsx';

/**
 * @typedef {import('./generator.js').GenerateInput} GenerateInput
 * @typedef {import('./generator.js').GeneratedEmail} GeneratedEmail
 * @typedef {import('./rewrite.js').RewriteInput} RewriteInput
 * @typedef {import('./subjects.js').SubjectsInput} SubjectsInput
 * @typedef {{signal?: AbortSignal}} CallOptions
 * @typedef {(input: GenerateInput, options?: CallOptions) => Promise<GeneratedEmail | Omit<GeneratedEmail, 'warnings'|'attempts'>>} GenerateFn
 * @typedef {(input: RewriteInput, options?: CallOptions) => Promise<{text: string}>} RewriteFn
 * @typedef {(input: SubjectsInput, options?: CallOptions) => Promise<{subjects: string[]}>} SuggestSubjectsFn
 *
 * @typedef {{
 *   baseUrl?: string,
 *   headers?: Record<string, string> | (() => Record<string, string>),
 *   fetch?: typeof fetch,
 *   model?: import('./generator.js').EmailModel,
 *   provider?: ProviderOption | ProviderOption[],
 *   apiKey?: string,
 *   askKey?: boolean,
 *   compile?: (mjml: string) => Promise<{warnings?: {message: string}[]}>,
 *   maxAttempts?: number,
 *   generate?: GenerateFn | boolean,
 *   rewrite?: RewriteFn | boolean,
 *   suggestSubjects?: SuggestSubjectsFn | boolean,
 * }} AiOptions
 *   `provider`: an id of `AI_PROVIDERS` ('openrouter', 'gemini', 'groq'…), or
 *   `{ id, model, baseUrl, headers }` for another model or an endpoint of your
 *   own — or a list of them, with `askKey`: the user chooses (the first is
 *   offered first). `apiKey`: one key for every user. `askKey`: each user
 *   connects their own (off by default). `compile`: with `provider` or `model`, MJML's own
 *   warnings fed back to the model (see createEmailGenerator).
 *
 * @typedef {Readonly<{
 *   generate: GenerateFn | null,
 *   rewrite: RewriteFn | null,
 *   suggestSubjects: SuggestSubjectsFn | null,
 *   key: import('./keys.js').AiKey | null,
 *   messages: Record<string, Record<string, string>>,
 *   components: Readonly<{Generate: typeof GenerateButton, Rewrite: typeof RewriteText, Subjects: typeof SubjectIdeas, Connect: typeof ConnectAi | null}>,
 * }>} EmailBuilderAi
 *   What the builder reads. `key`: the user's key, with `askKey` (keys.js).
 *   `messages`: the module's own translations, by locale, merged under the
 *   host's `messages`. `components.Connect`: the dialog that asks for the key.
 */

/** @typedef {string | Partial<import('./providers.js').AiProvider>} ProviderOption */

const PARTS = /** @type {const} */ (['generate', 'rewrite', 'suggestSubjects']);
const ROUTES = { generate: '/generate', rewrite: '/rewrite', suggestSubjects: '/subjects' };

/**
 * @param {AiOptions} [options]
 * @returns {EmailBuilderAi}
 */
export function createAi(options = {}) {
  if (!options || typeof options !== 'object') throw new TypeError('createAi: options must be an object');
  const { model, maxAttempts, compile, baseUrl, headers, fetch: fetchImpl, provider: providerOption, apiKey, askKey = false } = options;
  const usesProvider = providerOption !== undefined;
  const http = baseUrl !== undefined || headers !== undefined || (fetchImpl !== undefined && !usesProvider);
  if (model !== undefined && typeof model !== 'function') throw new TypeError('createAi: `model` must be a function');
  if (model && http) throw new TypeError('createAi: pass `model` (the AI runs in the page) or `baseUrl` (on the server), not both');
  if (usesProvider && (model || http)) {
    throw new TypeError('createAi: `provider` runs the AI in the page — not with `model`, `baseUrl` or `headers` (give the provider `{ id, model, baseUrl, headers }`)');
  }
  if (!usesProvider && (apiKey !== undefined || options.askKey !== undefined)) {
    throw new TypeError('createAi: `apiKey` and `askKey` go with a `provider` (e.g. provider: "openrouter")');
  }
  if (apiKey !== undefined && (typeof apiKey !== 'string' || !apiKey)) throw new TypeError('createAi: `apiKey` must be a non-empty string');
  if (compile !== undefined && (typeof compile !== 'function' || (!model && !usesProvider))) {
    throw new TypeError('createAi: `compile` must be a function, and goes with `provider` or `model` (the AI in the page)');
  }
  if (typeof askKey !== 'boolean') throw new TypeError('createAi: `askKey` must be true or false');
  if (apiKey && askKey) throw new TypeError('createAi: `apiKey` (one key for all) or `askKey` (each user\'s own), not both');
  const choice = Array.isArray(providerOption);
  if (choice && (!providerOption.length || !askKey)) {
    throw new TypeError('createAi: a list of providers is for `askKey: true` — each user chooses one and connects their own key');
  }
  /** @type {import('./providers.js').AiProvider[]} */
  const providers = usesProvider ? (choice ? providerOption : [providerOption]).map(providerOf) : [];
  if (new Set(providers.map((provider) => provider.id)).size !== providers.length) throw new TypeError('createAi: each provider once');
  const [provider = null] = providers;
  if (provider && !apiKey && !askKey && !provider.keyless) {
    throw new TypeError(`createAi: ${provider.name} needs a key — \`apiKey\`, or \`askKey: true\` to let each user connect their own`);
  }
  for (const part of PARTS) {
    const value = options[part];
    if (value !== undefined && typeof value !== 'boolean' && typeof value !== 'function') {
      throw new TypeError(`createAi: \`${part}\` must be a function, true or false`);
    }
  }

  // Functions of the host's own and nothing else: only those are on.
  const ownOnly = !model && !http && PARTS.some((part) => typeof options[part] === 'function');
  /** @type {Partial<Record<typeof PARTS[number], Function>>} */
  let transport = {};
  const key = provider && askKey ? createKeyStore(providers, { fetch: fetchImpl }) : null;
  if (provider) {
    /** @type {Map<string, import('./generator.js').EmailModel>} */
    const models = new Map();
    const keyFor = () => (key ? key.get() : apiKey || '');
    /** The model the user chose of the provider in use, made once. @param {string} id */
    const modelOf = (id) => {
      const chosen = /** @type {import('./providers.js').AiProvider} */ (providers.find((item) => item.id === id));
      const name = key ? key.model(id) : chosen.model;
      const slot = `${id}\n${name}`;
      if (!models.has(slot)) {
        models.set(
          slot,
          chosen.createModel
            ? chosen.createModel({ apiKey: keyFor, fetch: fetchImpl, ...(name ? { model: name } : {}) })
            : providerEmailModel({ provider: chosen, fetch: fetchImpl, apiKey: keyFor, ...(name ? { model: name } : {}) })
        );
      }
      return /** @type {import('./generator.js').EmailModel} */ (models.get(slot));
    };
    /** @type {import('./generator.js').EmailModel} */
    const model = async (request) => {
      // The user's key, asked when there is none — they may choose another
      // provider there ('' when they cancel: KEY_MISSING).
      if (key && !key.get() && !providers.find((item) => item.id === key.provider.id)?.keyless) await key.request();
      return modelOf(key ? key.provider.id : provider.id)(request);
    };
    const generator = createEmailGenerator({ model, maxAttempts, compile });
    for (const part of PARTS) transport[part] = key ? askedAgain(generator[part], key) : generator[part];
  } else if (model) {
    transport = createEmailGenerator({ model, maxAttempts, compile });
  } else if (!ownOnly) {
    const { call } = createHttpCaller({ baseUrl, headers, fetch: fetchImpl });
    for (const part of PARTS) {
      transport[part] = (/** @type {object} */ input, /** @type {CallOptions} */ { signal } = {}) =>
        call(ROUTES[part], { method: 'POST', body: JSON.stringify(input), signal });
    }
  }

  /** @param {typeof PARTS[number]} part */
  const resolve = (part) => {
    const value = options[part];
    if (typeof value === 'function') return value;
    if (value === false) return null;
    return transport[part] || null;
  };

  return Object.freeze({
    generate: /** @type {GenerateFn|null} */ (resolve('generate')),
    rewrite: /** @type {RewriteFn|null} */ (resolve('rewrite')),
    suggestSubjects: /** @type {SuggestSubjectsFn|null} */ (resolve('suggestSubjects')),
    key,
    messages: AI_MESSAGES,
    components: Object.freeze({ Generate: GenerateButton, Rewrite: RewriteText, Subjects: SubjectIdeas, Connect: key ? ConnectAi : null }),
  });
}

/**
 * A provider of the list: an id, `{ id, model, … }`, or one with its own
 * `createModel` (claudeProvider) taken as it is.
 * @param {ProviderOption} option
 * @returns {import('./providers.js').AiProvider}
 */
function providerOf(option) {
  if (option && typeof option === 'object' && typeof option.createModel === 'function') {
    if (!option.id || !option.name) throw new TypeError('createAi: a provider with `createModel` needs an `id` and a `name`');
    return /** @type {import('./providers.js').AiProvider} */ (option);
  }
  return resolveProvider(/** @type {any} */ (option));
}

/**
 * A key the provider refuses is forgotten and asked again, once, in the same
 * action: the user pastes a good one and the email still comes.
 * @param {Function} run
 * @param {import('./keys.js').AiKey} key
 */
function askedAgain(run, key) {
  return async (/** @type {any} */ input, /** @type {any} */ options) => {
    try {
      return await run(input, options);
    } catch (error) {
      if (/** @type {any} */ (error)?.code !== 'KEY_REFUSED' || options?.signal?.aborted) throw error;
      key.refuse();
      try {
        return await run(input, options);
      } catch (again) {
        if (/** @type {any} */ (again)?.code === 'KEY_REFUSED') key.refuse();
        throw again;
      }
    }
  };
}
