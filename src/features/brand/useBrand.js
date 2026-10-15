// @ts-check
/**
 * The workspace's brand, read once per storage and shared by every screen
 * using that storage (the library and the builder show the same brand, and
 * a brand saved in one is seen by the other).
 */

import { useCallback, useEffect, useState } from 'react';
import { cleanBrand } from './brand.js';

/**
 * @typedef {import('./brand.js').Brand} Brand
 * @typedef {{value: Brand, loaded: Promise<Brand>, listeners: Set<(brand: Brand) => void>}} BrandEntry
 */

/** @type {WeakMap<object, BrandEntry>} */
const entries = new WeakMap();

/**
 * The brand of a storage: `loaded` resolves once it is known ({} when the
 * storage keeps none, or could not be read — the builder then uses its own look).
 * @param {any} storage
 * @returns {BrandEntry}
 */
export function brandOf(storage) {
  let entry = entries.get(storage);
  if (entry) return entry;
  /** @type {BrandEntry} */
  const created = { value: {}, loaded: Promise.resolve({}), listeners: new Set() };
  created.loaded =
    typeof storage?.loadBrand === 'function'
      ? Promise.resolve()
          .then(() => storage.loadBrand())
          .then(
            (brand) => cleanBrand(brand),
            () => /** @type {Brand} */ ({})
          )
          .then((brand) => {
            created.value = brand;
            created.listeners.forEach((listener) => listener(brand));
            return brand;
          })
      : created.loaded;
  if (storage && typeof storage === 'object') entries.set(storage, created);
  return created;
}

/**
 * @param {any} storage
 * @returns {{brand: Brand, setBrand: (brand: Brand) => void}}
 *   `setBrand`: tells every screen of this storage about a brand just saved.
 */
export function useBrand(storage) {
  const [brand, setState] = useState(() => brandOf(storage).value);
  useEffect(() => {
    const entry = brandOf(storage);
    setState(entry.value);
    entry.listeners.add(setState);
    return () => {
      entry.listeners.delete(setState);
    };
  }, [storage]);
  const setBrand = useCallback(
    (/** @type {Brand} */ value) => {
      const entry = brandOf(storage);
      entry.value = cleanBrand(value);
      entry.listeners.forEach((listener) => listener(entry.value));
    },
    [storage]
  );
  return { brand, setBrand };
}
