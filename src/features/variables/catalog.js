// @ts-check
/**
 * Variables catalog — the merge tags a template can contain.
 *
 * The editor only inserts TAGS (`{{contact.firstname}}`); it never knows a
 * value. Rendering (server side) replaces them:
 *
 *   preview, test  → sample values (`sample`), the real address for a test;
 *   sending        → each recipient's values (`applyVariables`), or the merge
 *                    tags of an email provider (`mapVariables`).
 *
 * A missing value falls back to the tag's inline default
 * (`{{contact.firstname|there}}`), then to the variable's `fallback`, then to
 * an empty string — never to the raw tag.
 *
 * Two kinds of variables:
 *   - SYSTEM variables, given by the application (`variables` prop / option).
 *     None by default (`DEFAULT_VARIABLES` holds the unsubscribe link only);
 *     `EXAMPLE_VARIABLES` is a ready-made set. Users may edit their name,
 *     group, sample and value if empty, never their tag (`validateVariableEdit`):
 *     the storage keeps the edit beside the custom variables, under the same
 *     key, and `mergeVariables` lays it over the application's. The
 *     unsubscribe link is edited as well: each email provider has its own;
 *   - CUSTOM variables, created by users in the builder and kept by the
 *     storage (`listVariables` / `saveVariable` / `deleteVariable`), shared by
 *     every template.
 *
 * The unsubscribe link is `{{ unsubscribe }}`: the sending pipeline replaces it
 * with the right link (see `applyServiceLinks`); without one, with the link's
 * value if empty — the email provider's own tag (`*|UNSUB|*`) or an address —
 * and its sample in a preview or a test.
 *
 * Dependency-free: shared by the browser and the server.
 */

import { identity } from '../../i18n/index.js';

/**
 * @typedef {{
 *   key: string,
 *   label: string,
 *   group: string,
 *   sample: string,
 *   fallback?: string,
 *   description?: string,
 *   token?: string,
 *   kind?: 'text'|'link',
 *   custom?: boolean,
 *   edited?: boolean,
 * }} EmailVariable
 */

/**
 * A ready-made set of system variables: the recipient's name, email address
 * and company, the campaign's name. Not given by default; an application
 * that wants them passes `[...EXAMPLE_VARIABLES, ...DEFAULT_VARIABLES]` to
 * the builder and to the server.
 *
 * @type {EmailVariable[]}
 */
export const EXAMPLE_VARIABLES = [
  { key: 'contact.firstname', label: 'First name', group: 'Recipient', sample: 'Jane' },
  { key: 'contact.lastname', label: 'Last name', group: 'Recipient', sample: 'Doe' },
  { key: 'contact.email', label: 'Email address', group: 'Recipient', sample: 'jane.doe@example.com' },
  { key: 'company.name', label: 'Company', group: 'Recipient', sample: 'Example Inc.' },
  { key: 'campaign.name', label: 'Campaign name', group: 'Campaign', sample: 'Newsletter' },
];

/**
 * The default system variables: the unsubscribe link only. The variables of
 * the email provider are created by users in the builder.
 *
 * @type {EmailVariable[]}
 */
export const DEFAULT_VARIABLES = [
  {
    key: 'unsubscribe',
    label: 'Unsubscribe link',
    group: 'Links',
    sample: '',
    token: '{{ unsubscribe }}',
    kind: 'link',
  },
];

/** Group of custom variables created without a group. */
export const CUSTOM_GROUP = 'Custom';

/** Keys reserved by the sending pipeline. */
const RESERVED_KEYS = new Set(['unsubscribe', 'mirror']);

export const VARIABLE_LIMITS = { key: 60, label: 80, group: 40, sample: 200, fallback: 200, description: 200 };

const KEY_SHAPE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/;
/** An application's keys may keep the capitals of its email provider's tags: Brevo's `contact.FIRSTNAME`. */
const SYSTEM_KEY_SHAPE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)*$/;

/** What a user may change in a system variable: its tag, kind and token stay the application's. */
const EDITABLE_FIELDS = /** @type {const} */ (['label', 'group', 'sample', 'fallback', 'description']);

/** A link's fields that hold a link. */
const LINK_VALUES = /** @type {const} */ (['sample', 'fallback']);

/**
 * The name shown: a system variable's is translated, unless a user wrote it.
 *
 * @param {EmailVariable} variable
 * @param {import('../../i18n/index.js').Translate} [t]
 */
export const labelOf = (variable, t = identity) => (variable.custom || variable.edited ? variable.label : t(variable.label));

/** Tag inserted by the editor. @param {EmailVariable} variable */
export function tokenOf(variable) {
  return variable.token || `{{${variable.key}}}`;
}

/**
 * @param {string} key
 * @param {EmailVariable[]} [variables]
 */
export function findVariable(key, variables = DEFAULT_VARIABLES) {
  return variables.find((v) => v.key === key) || null;
}

/**
 * A key proposed from a label: "Order number" → `order_number`,
 * "Numéro de commande" → `numero_de_commande`.
 *
 * @param {string} label
 */
export function keyFromLabel(label) {
  const key = String(label || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^[^a-z]+/, '')
    .slice(0, VARIABLE_LIMITS.key)
    .replace(/_+$/, '');
  return key || 'variable';
}

/**
 * Checks an application-provided catalog (keys must be unique and safe to
 * embed in a tag; capitals are allowed, as in Brevo's `contact.FIRSTNAME`).
 *
 * @param {EmailVariable[]} variables
 * @returns {EmailVariable[]}
 */
export function defineVariables(variables) {
  const seen = new Set();
  for (const variable of variables) {
    if (!variable || !SYSTEM_KEY_SHAPE.test(variable.key || '')) {
      throw new Error(`variables: invalid key "${variable?.key}"`);
    }
    if (seen.has(variable.key)) throw new Error(`variables: duplicate key "${variable.key}"`);
    seen.add(variable.key);
  }
  return variables;
}

const clean = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * A link's value: an address, an anchor, or an email provider's own tag
 * (`*|UNSUB|*`, `[[UNSUB_LINK_EN]]`) — never another scheme (`javascript:`).
 * The scheme is read without whitespace or control characters ("java\tscript:").
 *
 * @param {string|null|undefined} value
 */
export function isLinkValue(value) {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is stripped
  const compact = String(value ?? '').replace(/[\s\u0000-\u001f\u007f]+/g, '').toLowerCase();
  return /^(https?:|mailto:)/.test(compact) || !/^[a-z][a-z0-9+.-]*:/.test(compact);
}

/**
 * Validates and normalizes a CUSTOM variable typed by a user.
 * Returns `{ variable }` or `{ errors: { field: message } }`.
 *
 * @param {Partial<EmailVariable>} input
 * @param {{
 *   existing?: EmailVariable[],
 *   editing?: string|null,
 *   t?: import('../../i18n/index.js').Translate,
 * }} [options]  `editing`: key of the variable being edited (its key cannot change)
 */
export function validateCustomVariable(input, { existing = [], editing = null, t = identity } = {}) {
  /** @type {Record<string, string>} */
  const errors = {};
  const label = clean(input?.label, VARIABLE_LIMITS.label);
  const key = editing || String(input?.key || '').trim();
  if (!label) errors.label = t('Name is required');
  if (!editing) {
    if (!key) errors.key = t('Key is required');
    else if (key.length > VARIABLE_LIMITS.key || !KEY_SHAPE.test(key)) {
      errors.key = t('Lowercase letters, digits, "_" and "." only, starting with a letter');
    } else if (RESERVED_KEYS.has(key) || existing.some((v) => v.key === key)) {
      errors.key = t('This key is already used');
    }
  }
  if (Object.keys(errors).length) return { errors };
  return {
    variable: {
      key,
      label,
      group: clean(input?.group, VARIABLE_LIMITS.group) || CUSTOM_GROUP,
      sample: clean(input?.sample, VARIABLE_LIMITS.sample),
      fallback: clean(input?.fallback, VARIABLE_LIMITS.fallback),
      description: clean(input?.description, VARIABLE_LIMITS.description),
      custom: true,
    },
  };
}

/**
 * Validates a user's edit of a SYSTEM variable (`validateCustomVariable`'s
 * rules; its key cannot change, an empty group is the application's; a link's
 * sample and value if empty are links, see `isLinkValue`).
 * Returns `{ variable }`, the edit to store under its key, or `{ errors }`.
 *
 * @param {EmailVariable} system
 * @param {Partial<EmailVariable>} input
 * @param {{t?: import('../../i18n/index.js').Translate}} [options]
 */
export function validateVariableEdit(system, input, { t = identity } = {}) {
  const group = clean(input?.group, VARIABLE_LIMITS.group) || system.group;
  const checked = validateCustomVariable({ ...system, ...input, group }, { editing: system.key, t });
  /** @type {Record<string, string>} */
  const errors = { ...checked.errors };
  if (system.kind === 'link') {
    for (const field of LINK_VALUES) {
      if (!isLinkValue(input?.[field] ?? system[field])) errors[field] = t('An address, or your email provider’s tag');
    }
  }
  if (Object.keys(errors).length) return { errors };
  const { custom: _custom, ...edit } = /** @type {EmailVariable} */ (checked.variable);
  return { variable: edit };
}

/**
 * System variables first, then custom ones. A stored variable under a system
 * variable's key is a user's edit of it: it changes its name, group, sample,
 * value if empty and description, never its tag, kind or token, and marks it
 * `edited`. A link keeps only a link (see `isLinkValue`).
 *
 * @param {EmailVariable[]} system
 * @param {EmailVariable[]} custom
 */
export function mergeVariables(system, custom = []) {
  const keys = new Set(system.map((v) => v.key));
  const edits = new Map(custom.filter((v) => keys.has(v.key)).map((v) => [v.key, v]));
  const withEdit = (/** @type {EmailVariable} */ variable) => {
    const edit = edits.get(variable.key);
    if (!edit) return variable;
    // A forged link value is dropped: the application's stays.
    const kept = (field) => edit[field] !== undefined && (variable.kind !== 'link' || !LINK_VALUES.includes(field) || isLinkValue(edit[field]));
    const fields = Object.fromEntries(EDITABLE_FIELDS.filter(kept).map((field) => [field, edit[field]]));
    return { ...variable, ...fields, edited: true };
  };
  return [...system.map(withEdit), ...custom.filter((v) => !keys.has(v.key)).map((v) => ({ ...v, custom: true }))];
}
