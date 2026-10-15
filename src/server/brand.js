// @ts-check
/**
 * BRAND — the look every email of the workspace starts from (name, logo,
 * main color, headings color, font), shared by all users like the custom
 * variables. What it does to an email: features/brand/brand.js.
 *
 * Storage is a REPOSITORY supplied by the application (one row is enough);
 * `createMemoryBrandRepository` is the reference implementation.
 */

import { identity } from '../i18n/index.js';
import { cleanBrand } from '../features/brand/brand.js';
import { HttpError } from './errors.js';

/**
 * @typedef {import('../features/brand/brand.js').Brand} Brand
 *
 * @typedef {{
 *   get: () => Promise<Brand|null>,
 *   save: (brand: Brand & {updatedBy: string|null}) => Promise<void>,
 * }} BrandRepository
 */

/**
 * @param {{repository?: BrandRepository|null, t?: import('../i18n/index.js').Translate}} options
 */
export function createBrandService({ repository = null, t = identity }) {
  return {
    /** The brand, `{}` when none was set (or no repository). */
    async get() {
      return repository ? cleanBrand(await repository.get()) : {};
    },

    /** @param {unknown} input @param {{id?: string|number, name?: string}|null} [user] */
    async save(input, user = null) {
      if (!repository) throw new HttpError(501, t('The brand is not configured'), 'NO_BRAND_STORE');
      if (!input || typeof input !== 'object') throw new HttpError(400, t('Invalid JSON'), 'INVALID_JSON');
      const brand = cleanBrand(input);
      await repository.save({ ...brand, updatedBy: user ? String(user.name ?? user.id ?? '') || null : null });
      return brand;
    },
  };
}

/** @returns {BrandRepository} */
export function createMemoryBrandRepository() {
  /** @type {any} */
  let row = null;
  return {
    async get() {
      return row ? { ...row } : null;
    },
    async save(brand) {
      row = { ...brand, updatedAt: new Date() };
    },
  };
}
