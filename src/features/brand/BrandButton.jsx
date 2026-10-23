import { useEffect, useRef, useState } from 'react';
import { Globe, ImageOff, Loader2, Palette, Trash2, TriangleAlert, WandSparkles } from 'lucide-react';
import { useUi } from '../../ui/context.jsx';
import { Button } from '../../ui/primitives/button.jsx';
import { Input, Label } from '../../ui/primitives/fields.jsx';
import { ColorPicker } from '../../ui/primitives/color-picker.jsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/primitives/overlays.jsx';
import { cn } from '../../ui/primitives/cn.js';
import { FONT_OPTIONS, FONT_STACK, PALETTE } from '../../blocks/shared.js';
import { imageUploadError } from '../../validation/images.js';
import { isSafeUrl } from '../../validation/urls.js';
import { logoWidthFor } from './extract.js';
import { BRAND_FONT_SIZES, applyBrand, cleanBrand, contrastRatio, hasBrand, readableOn } from './brand.js';
import { BRAND_NOTES } from './messages.js';

/**
 * BRAND — toolbar button and dialog: the company's look, set once.
 *
 * The quickest way is the first field: the company's website, read by the
 * server (logo, colors, font filled in, nothing saved yet). Everything can
 * then be changed by hand, and the small preview shows the result at once.
 * A click on the logo's square picks an image. The colors are opaque: the
 * text on a button or a banner is chosen by their contrast.
 *
 * Saving keeps the brand for every new email, template and block, and (the
 * box is ticked by default) repaints the email being edited: one step, Ctrl+Z
 * brings the previous look back.
 */


/** @typedef {import('./brand.js').Brand} Brand */

/** The form's text fields: '' rather than undefined, so inputs stay controlled. */
const toForm = (/** @type {Brand} */ brand) => ({
  name: brand.name || '',
  logoUrl: brand.logoUrl || '',
  logoWidth: brand.logoWidth || 0,
  primary: brand.primary || '',
  heading: brand.heading || '',
  font: brand.font || '',
  fontSize: brand.fontSize || 0,
  website: brand.website || '',
});

/** The builder's own paragraph size: what the size list shows until one is picked. */
const TEXT_SIZE = 15;

const LOGO_SQUARE =
  'eb-checker eb:flex eb:size-20 eb:shrink-0 eb:items-center eb:justify-center eb:overflow-hidden eb:rounded-lg2 eb:ring-1 eb:ring-border eb:ring-inset';

/** A logo address the builder accepts: uploaded (relative) or https. @param {string} url */
const isLogoUrl = (url) => !url || url.startsWith('/') || (/^https:\/\//i.test(url) && isSafeUrl(url, 'image'));

export default function BrandButton({ context }) {
  const { editor, ready, storage, brand, setBrand, hostSender } = context;
  const { t, notify } = useUi();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => toForm(brand || {}));
  const [applyNow, setApplyNow] = useState(true);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState('');
  const [notes, setNotes] = useState(/** @type {string[]} */ ([]));
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef(/** @type {AbortController|null} */ (null));
  const fileRef = useRef(/** @type {HTMLInputElement|null} */ (null));
  const canRead = typeof storage.importBrand === 'function';
  const canUpload = typeof storage.uploadImage === 'function';

  useEffect(() => () => abortRef.current?.abort(), []);

  // The width a logo is shown at follows its own proportions.
  const logoUrl = form.logoUrl;
  // Keep the stored asset path in the brand; only resolve it for display.
  const logoSrc = logoUrl ? (storage.imageUrl?.(logoUrl) ?? logoUrl) : '';
  useEffect(() => {
    if (!logoUrl || !isLogoUrl(logoUrl)) return undefined;
    let live = true;
    const image = new Image();
    image.onload = () => {
      if (live && image.naturalWidth) {
        setForm((f) => (f.logoUrl === logoUrl ? { ...f, logoWidth: logoWidthFor({ width: image.naturalWidth, height: image.naturalHeight }) } : f));
      }
    };
    image.src = logoSrc;
    return () => {
      live = false;
    };
  }, [logoUrl, logoSrc]);

  const set = (/** @type {Partial<ReturnType<typeof toForm>>} */ patch) => setForm((f) => ({ ...f, ...patch }));

  const openDialog = () => {
    setForm(toForm(brand || {}));
    setApplyNow(true);
    setReadError('');
    setNotes([]);
    setError('');
    setOpen(true);
  };

  const close = (/** @type {boolean} */ next) => {
    if (next) return;
    abortRef.current?.abort();
    setReading(false);
    setOpen(false);
  };

  const readWebsite = async () => {
    const url = form.website.trim();
    if (!url || reading) return;
    setReadError('');
    setNotes([]);
    setReading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await storage.importBrand(url, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const found = cleanBrand(result?.brand);
      // What the website did not give keeps what the user had.
      setForm((f) => ({
        ...f,
        ...Object.fromEntries(Object.entries(toForm(found)).filter(([, value]) => value)),
        website: found.website || f.website,
      }));
      setNotes(Array.isArray(result?.notes) ? result.notes.filter((note) => note in BRAND_NOTES) : []);
    } catch (err) {
      if (!controller.signal.aborted) setReadError(err?.message ? t(err.message) : t('The website could not be read.'));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setReading(false);
    }
  };

  const pickLogo = async (/** @type {import('react').ChangeEvent<HTMLInputElement>} */ event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const refused = imageUploadError(file, { t });
    setError(refused || '');
    if (refused) return;
    setUploading(true);
    try {
      const { path } = await storage.uploadImage(file);
      set({ logoUrl: path, logoWidth: 0 });
      setNotes((list) => list.filter((note) => !note.startsWith('LOGO_')));
    } catch (err) {
      setError(err?.message || t('Upload failed'));
    } finally {
      setUploading(false);
    }
  };

  const draft = cleanBrand(form);
  const logoInvalid = !isLogoUrl(form.logoUrl.trim());

  const save = async () => {
    if (saving || logoInvalid) return;
    setSaving(true);
    setError('');
    try {
      const saved = cleanBrand(await storage.saveBrand(draft));
      const before = brand || {};
      setBrand(saved);
      let applied = false;
      if (applyNow && ready && hasBrand(saved)) {
        const current = editor.exportMjml();
        const next = applyBrand(current, saved, {
          header: true,
          previous: {
            names: [hostSender?.name, before.name, t('Your company')],
            logos: [hostSender?.logoUrl, before.logoUrl],
          },
        });
        if (next !== current) {
          editor.setMjml(next);
          applied = true;
        }
      }
      setOpen(false);
      notify(
        'success',
        applied ? t('Brand applied. Ctrl+Z brings back the previous look.') : t('Brand saved. New emails and blocks use it.')
      );
    } catch (err) {
      setError(err?.message || t('The brand could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  const swatch = brand?.primary;
  const logoShown = uploading ? (
    <Loader2 className="eb:size-4 eb:animate-spin eb:text-foreground-muted" aria-hidden="true" />
  ) : form.logoUrl && !logoInvalid ? (
    <img src={logoSrc} alt={t('Logo')} className="eb:max-h-16 eb:max-w-16 eb:object-contain" />
  ) : (
    <ImageOff className="eb:size-4 eb:text-foreground-muted" aria-hidden="true" />
  );

  return (
    <>
      <Button variant="outline" size="sm-compact" disabled={!ready} onClick={openDialog} data-testid="eb-brand-button">
        <Palette />
        {t('Brand')}
        {swatch && (
          <span
            aria-hidden="true"
            className="eb:size-2.5 eb:shrink-0 eb:rounded-full eb:ring-1 eb:ring-black/10"
            style={{ backgroundColor: swatch }}
          />
        )}
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent
          className="eb:flex eb:max-h-[calc(100dvh-2rem)] eb:flex-col eb:gap-0 eb:p-0 eb:sm:max-w-2xl"
          data-testid="eb-brand"
        >
          <DialogHeader className="eb:gap-1.5 eb:px-6 eb:pt-6 eb:pb-4">
            <DialogTitle>{t('Your brand')}</DialogTitle>
            <DialogDescription>
              {t('Set it once: new emails, templates and blocks take your logo, colors and font.')}
            </DialogDescription>
          </DialogHeader>

          <div className="eb:min-h-0 eb:flex-1 eb:overflow-y-auto eb:border-y eb:border-border eb:px-6 eb:py-5">
            {canRead && (
              <form
                className="eb:mb-5 eb:flex eb:flex-col eb:gap-1.5"
                onSubmit={(event) => {
                  event.preventDefault();
                  readWebsite();
                }}
              >
                <Label htmlFor="eb-brand-website">{t('Your website')}</Label>
                <div className="eb:flex eb:flex-col eb:gap-2 eb:sm:flex-row">
                  <div className="eb:relative eb:min-w-0 eb:flex-1">
                    <Globe className="eb:pointer-events-none eb:absolute eb:top-1/2 eb:left-2.5 eb:size-3.5 eb:-translate-y-1/2 eb:text-foreground-muted" aria-hidden="true" />
                    <Input
                      id="eb-brand-website"
                      value={form.website}
                      onChange={(event) => set({ website: event.target.value })}
                      placeholder="acme.com"
                      inputMode="url"
                      autoComplete="url"
                      dense
                      className="eb:pl-8"
                      disabled={reading}
                    />
                  </div>
                  <Button type="submit" size="sm" className="eb:h-6.5" disabled={reading || !form.website.trim()}>
                    {reading ? <Loader2 className="eb:animate-spin" /> : <WandSparkles />}
                    {t('Get my brand')}
                  </Button>
                </div>
                {reading ? (
                  <p role="status" className="eb:text-[12px] eb:text-foreground-muted">
                    {t('Reading the website…')}
                  </p>
                ) : readError ? (
                  <p role="alert" className="eb:flex eb:items-start eb:gap-1.5 eb:text-[12px] eb:text-destructive">
                    <TriangleAlert className="eb:mt-px eb:size-3.5 eb:shrink-0" aria-hidden="true" />
                    {readError}
                  </p>
                ) : notes.length ? (
                  <ul className="eb:flex eb:flex-col eb:gap-1 eb:text-[12px] eb:text-foreground-muted" data-testid="eb-brand-notes">
                    {notes.map((note) => (
                      <li key={note}>{t(BRAND_NOTES[note])}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="eb:text-[12px] eb:text-foreground-muted">
                    {t('The logo, colors and font are read from it. You can change them before saving.')}
                  </p>
                )}
              </form>
            )}

            <div className="eb:grid eb:gap-6 eb:sm:grid-cols-[minmax(0,1fr)_240px]">
              <fieldset disabled={reading} className="eb:m-0 eb:flex eb:min-w-0 eb:flex-col eb:gap-4 eb:border-0 eb:p-0">
                <legend className="eb:sr-only">{t('Your brand')}</legend>

                <div className="eb:flex eb:flex-col eb:gap-1.5">
                  <Label htmlFor="eb-brand-logo">{t('Logo')}</Label>
                  <div className="eb:flex eb:items-start eb:gap-3">
                    {/* The square itself picks an image: the file explorer opens. */}
                    {canUpload ? (
                      <button
                        type="button"
                        disabled={uploading}
                        onClick={() => fileRef.current?.click()}
                        aria-label={t('Choose a logo image')}
                        title={t('Choose a logo image')}
                        data-testid="eb-brand-logo-pick"
                        className={cn(LOGO_SQUARE, 'eb:cursor-pointer eb:outline-none eb:transition-shadow eb:hover:ring-primary/60 eb:focus-visible:ring-2 eb:focus-visible:ring-ring/50 eb:disabled:cursor-wait')}
                      >
                        {logoShown}
                      </button>
                    ) : (
                      <div className={LOGO_SQUARE}>{logoShown}</div>
                    )}
                    {canUpload && (
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/png,image/jpeg,image/gif"
                        className="eb:sr-only"
                        tabIndex={-1}
                        aria-hidden="true"
                        data-testid="eb-brand-logo-file"
                        onChange={pickLogo}
                      />
                    )}
                    <div className="eb:flex eb:min-w-0 eb:flex-1 eb:flex-col eb:items-start eb:gap-1.5">
                      <Input
                        id="eb-brand-logo"
                        dense
                        value={form.logoUrl}
                        onChange={(event) => set({ logoUrl: event.target.value.trim(), logoWidth: 0 })}
                        placeholder={t('or an image address: https://…')}
                        aria-invalid={logoInvalid || undefined}
                        className="eb:text-[12px]"
                      />
                      {logoInvalid && <p className="eb:text-[12px] eb:text-destructive">{t('An https:// address is required')}</p>}
                      {form.logoUrl && (
                        <Button type="button" variant="ghost" size="xs" onClick={() => set({ logoUrl: '', logoWidth: 0 })}>
                          <Trash2 />
                          {t('Remove')}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="eb:flex eb:flex-col eb:gap-1.5">
                  <Label htmlFor="eb-brand-name">{t('Company name')}</Label>
                  <Input
                    id="eb-brand-name"
                    dense
                    value={form.name}
                    maxLength={80}
                    onChange={(event) => set({ name: event.target.value })}
                    placeholder={hostSender?.name || t('Your company')}
                  />
                </div>

                <div className="eb:grid eb:gap-4 eb:sm:grid-cols-2">
                  <div className="eb:flex eb:flex-col eb:gap-1.5">
                    <Label htmlFor="eb-brand-primary">{t('Main color')}</Label>
                    <ColorPicker id="eb-brand-primary" value={form.primary} onChange={(primary) => set({ primary })} placeholder={PALETTE.navy} alpha={false} dense />
                    <p className="eb:text-[11px] eb:text-foreground-muted">{t('Buttons, banners, links')}</p>
                  </div>
                  <div className="eb:flex eb:flex-col eb:gap-1.5">
                    <Label htmlFor="eb-brand-heading">{t('Headings color')}</Label>
                    <ColorPicker id="eb-brand-heading" value={form.heading} onChange={(heading) => set({ heading })} placeholder={PALETTE.navy} alpha={false} dense />
                  </div>
                </div>

                <div className="eb:grid eb:gap-4 eb:sm:grid-cols-2">
                  <div className="eb:flex eb:flex-col eb:gap-1.5">
                    <Label htmlFor="eb-brand-font">{t('Font')}</Label>
                    <Select value={form.font || FONT_STACK} onValueChange={(font) => set({ font })}>
                      <SelectTrigger id="eb-brand-font" dense>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FONT_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            <span style={{ fontFamily: option.value }}>{option.label}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="eb:flex eb:flex-col eb:gap-1.5">
                    <Label htmlFor="eb-brand-font-size">{t('Font size')}</Label>
                    <Select value={String(form.fontSize || TEXT_SIZE)} onValueChange={(size) => set({ fontSize: Number(size) })}>
                      <SelectTrigger id="eb-brand-font-size" dense aria-describedby="eb-brand-font-size-hint">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BRAND_FONT_SIZES.map((size) => (
                          <SelectItem key={size} value={String(size)}>
                            {size} px
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p id="eb-brand-font-size-hint" className="eb:text-[11px] eb:text-foreground-muted">
                      {t('Paragraphs; headings keep theirs')}
                    </p>
                  </div>
                </div>
              </fieldset>

              <BrandPreview brand={draft} logoSrc={logoInvalid ? '' : logoSrc} fallbackName={hostSender?.name || t('Your company')} />
            </div>
          </div>

          <div className="eb:flex eb:flex-col eb:gap-3 eb:px-6 eb:pt-3 eb:pb-6">
            {error && (
              <p role="alert" className="eb:flex eb:items-start eb:gap-1.5 eb:text-[12px] eb:text-destructive">
                <TriangleAlert className="eb:mt-px eb:size-3.5 eb:shrink-0" aria-hidden="true" />
                {error}
              </p>
            )}
            <div className="eb:flex eb:flex-col eb:gap-3 eb:sm:flex-row eb:sm:items-center">
              <label className="eb:flex eb:cursor-pointer eb:items-center eb:gap-2 eb:text-[13px] eb:sm:mr-auto">
                <input
                  type="checkbox"
                  checked={applyNow}
                  onChange={(event) => setApplyNow(event.target.checked)}
                  className="eb:size-4 eb:accent-primary"
                  data-testid="eb-brand-apply"
                />
                {t('Also apply to this email')}
              </label>
              <div className="eb:flex eb:justify-end eb:gap-2">
                <Button variant="outline" size="sm" onClick={() => close(false)}>
                  {t('Cancel')}
                </Button>
                <Button size="sm" onClick={save} disabled={saving || reading || uploading || logoInvalid} data-testid="eb-brand-save">
                  {saving && <Loader2 className="eb:animate-spin" />}
                  {t('Save')}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * A small email in the brand's look: logo or name, a banner, a heading, a
 * line of text and a button. Plain markup: it follows every keystroke.
 * @param {{brand: Brand, logoSrc: string, fallbackName: string}} props
 */
function BrandPreview({ brand, logoSrc, fallbackName }) {
  const t = useUi().t;
  const primary = brand.primary || PALETTE.navy;
  const onPrimary = readableOn(primary);
  const heading = brand.heading || PALETTE.navy;
  const link = contrastRatio(primary, PALETTE.white) >= 3 ? primary : heading;
  const font = brand.font || FONT_STACK;
  // The preview is drawn at 60%: 15 px of text, 9 px here.
  const textSize = ((brand.fontSize || TEXT_SIZE) * 3) / 5;
  const name = brand.name || fallbackName;
  return (
    <div className="eb:flex eb:flex-col eb:gap-1.5">
      <span className="eb:text-[12px] eb:font-medium eb:text-foreground-muted">{t('Preview')}</span>
      {/* As tall as the fields beside it: the email's body takes the room. */}
      <div
        className="eb:flex eb:flex-1 eb:flex-col eb:overflow-hidden eb:rounded-lg2 eb:p-2.5 eb:ring-1 eb:ring-border"
        style={{ backgroundColor: PALETTE.canvas, fontFamily: font }}
        data-testid="eb-brand-preview"
        aria-hidden="true"
      >
        <div className="eb:flex eb:flex-1 eb:flex-col eb:overflow-hidden eb:rounded-[3px]" style={{ backgroundColor: PALETTE.white }}>
          <div className="eb:px-3 eb:pt-3 eb:pb-2">
            {logoSrc ? (
              <img src={logoSrc} alt="" style={{ width: Math.round((brand.logoWidth || 140) * 0.45), maxWidth: '100%' }} />
            ) : (
              <span className="eb:text-[11px] eb:font-bold" style={{ color: PALETTE.ink }}>
                {name}
              </span>
            )}
          </div>
          <div className="eb:px-3 eb:py-4 eb:text-center" style={{ backgroundColor: primary, color: onPrimary }}>
            <div className="eb:text-[13px] eb:leading-tight eb:font-bold">{t('Big news')}</div>
            <div className="eb:mt-1 eb:text-[9px] eb:opacity-90">{t('A short line under the title.')}</div>
          </div>
          <div className="eb:flex eb:flex-1 eb:flex-col eb:gap-1.5 eb:px-3 eb:py-3">
            <div className="eb:text-[11px] eb:leading-tight eb:font-bold" style={{ color: heading }}>
              {t('A headline')}
            </div>
            <div className="eb:leading-snug" style={{ color: PALETTE.ink, fontSize: textSize }}>
              {t('Some text, with')}{' '}
              <span className="eb:underline" style={{ color: link }}>
                {t('a link')}
              </span>
              .
            </div>
            <span
              className={cn('eb:mt-1 eb:self-start eb:rounded-[3px] eb:px-2.5 eb:py-1 eb:text-[9px] eb:font-bold')}
              style={{ backgroundColor: primary, color: onPrimary }}
            >
              {t('Learn more')}
            </span>
          </div>
          <div className="eb:px-3 eb:pb-2.5 eb:text-center eb:text-[7px]" style={{ color: '#6d7484' }}>
            {name}
          </div>
        </div>
      </div>
    </div>
  );
}
