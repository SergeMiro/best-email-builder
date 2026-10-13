// @ts-check
/**
 * A dynamically imported module → the value it exports by default.
 *
 * `mjml-browser` (the canvas compiler) is a CommonJS/UMD module. How
 * `import()` hands such a module over depends on the bundler:
 *
 *   Vite, esbuild               { default: value }
 *   webpack (Next.js), from an   { default: { __esModule: true, default: value } }
 *   ES module package
 *
 * so a single `.default` once returned an object instead of the function under
 * Next.js (0.1.1: "mjmlPlugin is not a function"). Every interop layer is peeled —
 * a module namespace or an `__esModule` object — never the value itself.
 *
 * @param {any} mod
 * @returns {any}
 */
export function unwrapModule(mod) {
  let value = mod;
  for (let depth = 0; depth < 3 && isInteropLayer(value); depth += 1) value = value.default;
  return value;
}

/** @param {any} value */
function isInteropLayer(value) {
  if (value === null || typeof value !== 'object' || !('default' in value)) return false;
  return value.__esModule === true || Object.prototype.toString.call(value) === '[object Module]';
}

/**
 * A module whose export is a FUNCTION (`mjml-browser`) → that function, under
 * any bundler. On top of `unwrapModule`, Vite's dynamic import of a CommonJS
 * module hands over a plain object `{ ...props, default: fn }` (no module
 * flag): since a function is expected, `default` is followed while the value
 * is not one.
 *
 * @param {any} mod
 * @returns {Function|null}
 */
export function functionExport(mod) {
  let value = unwrapModule(mod);
  for (let depth = 0; depth < 3 && typeof value !== 'function' && value && typeof value === 'object' && 'default' in value; depth += 1) {
    value = value.default;
  }
  return typeof value === 'function' ? value : null;
}
