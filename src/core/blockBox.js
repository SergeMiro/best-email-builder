// @ts-check
/** Editor-only box properties travel through valid MJML as a CSS class. */
const PREFIX = 'eb-box-';
const KEYS = new Set(['margin', 'box-padding', 'box-border', 'box-border-top', 'box-border-right', 'box-border-bottom', 'box-border-left']);

/** @param {string} tag @param {Record<string, string>} attributes */
export function encodeBox(tag, attributes) {
  const custom = Object.fromEntries(Object.entries(attributes).filter(([key]) => KEYS.has(key) && !(tag === 'mj-section' && key === 'margin')));
  if (!Object.keys(custom).length) return attributes;
  const out = { ...attributes };
  for (const key of Object.keys(custom)) delete out[key];
  const code = [...JSON.stringify(custom)].map((c) => c.charCodeAt(0).toString(16).padStart(4, '0')).join('');
  out['css-class'] = `${out['css-class'] || ''} ${PREFIX}${code}`.trim();
  return out;
}

/** @param {Record<string, string>} attributes */
export function decodeBox(attributes) {
  const classes = String(attributes['css-class'] || '').split(/\s+/);
  const out = { ...attributes };
  const kept = classes.filter((name) => {
    if (!name.startsWith(PREFIX) || !/^(?:[a-f0-9]{4})+$/.test(name.slice(PREFIX.length))) return true;
    try {
      const json = name.slice(PREFIX.length).replace(/.{4}/g, (hex) => String.fromCharCode(parseInt(hex, 16)));
      const values = JSON.parse(json);
      for (const [key, value] of Object.entries(values)) if (KEYS.has(key) && typeof value === 'string') out[key] = value;
      return false;
    } catch { return true; }
  });
  if (kept.filter(Boolean).length) out['css-class'] = kept.filter(Boolean).join(' ');
  else delete out['css-class'];
  return out;
}

/** The native outer padding of visual blocks already means outside spacing. @param {string} tag */
export function boxKeys(tag) {
  const outside = ['mj-image', 'mj-button', 'mj-divider', 'mj-social'].includes(tag);
  return {
    margin: outside ? 'padding' : 'margin',
    border: ['mj-image', 'mj-button', 'mj-column', 'mj-section'].includes(tag) ? 'border' : 'box-border',
    padding: tag === 'mj-button' ? 'inner-padding' : outside || ['mj-spacer', 'mj-navbar', 'mj-social-element'].includes(tag) ? 'box-padding' : 'padding',
  };
}
