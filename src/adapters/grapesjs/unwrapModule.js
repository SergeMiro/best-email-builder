// @ts-check
/**
 * A dynamically imported module → the value it exports by default.
 *
 * `grapesjs-mjml` and its locales are CommonJS/UMD modules flagged
 * `__esModule`. How `import()` hands them over depends on the bundler:
 *
 *   Vite, esbuild               { default: value }
 *   webpack (Next.js), from an   { default: { __esModule: true, default: value } }
 *   ES module package
 *
 * so a single `.default` returned an object instead of the plugin under
 * Next.js ("mjmlPlugin is not a function"). Every interop layer is peeled —
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
