import { useEffect, useRef, useState } from 'react';
import { Input } from './primitives/fields.jsx';
import { Textarea } from './primitives/fields.jsx';
import { Label } from './primitives/fields.jsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './primitives/overlays.jsx';
import { TooltipWrap } from './primitives/misc.jsx';
import { ColorPicker, colorToHex } from './primitives/color-picker.jsx';
import { Button } from './primitives/button.jsx';
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Loader2, Upload } from 'lucide-react';
import { cn } from './primitives/cn.js';
import { isSafeUrl } from '../validation/urls.js';
import { imageUploadError } from '../validation/images.js';
import { parseSpacing, formatSpacing } from '../core/mjmlAttributes.js';
import { useT } from './context.jsx';

/**
 * Properties panel fields - one per `BlockProperty` type.
 *
 * -- ONE EDIT = ONE UNDO STEP -----------------------------------------------
 * Each field keeps a local draft and only hands it to the editor once the
 * edit is FINISHED: on blur or Enter for text, after a 250 ms pause for a
 * color being dragged. Typing "Hello" must not leave five steps in the
 * history, nor recompile the canvas on every keystroke. Escape restores the
 * original value.
 *
 * -- WHAT CANNOT BE SENT IS REJECTED HERE -----------------------------------
 * An address the server would refuse (`javascript:`, non-https image) is
 * flagged under the field and not passed on. A color with transparency is
 * written `rgba()`, which MJML accepts (not `#RRGGBBAA`); classic Outlook,
 * which reads neither, gets the opaque color it looks like over white (see
 * server/compileMjml.js).
 *
 * -- AN EMPTY FIELD IS NOT ZERO ----------------------------------------------
 * A property left empty is rendered by MJML with its default (a section's
 * padding is 20 px above and below). `fallback` carries that default: it is
 * shown greyed in the empty field, and a padding edited on one side keeps
 * the defaults of the others instead of turning them into 0.
 *
 * -- IMAGES -----------------------------------------------------------------
 * An image is UPLOADED (application storage, `uploadImage`) or given as an
 * https address. Never `data:`: it would bloat the email.
 */

/** A typed color code is committed after this pause. */
const COLOR_DEBOUNCE_MS = 250;
/** A color dragged in the picker paints the email at this pace: one undo step in all. */
const COLOR_LIVE_MS = 60;

/**
 * `#RGB` or `#RRGGBB`; with transparency (`#RGBA`, `#RRGGBBAA`, `rgba()`),
 * `rgba(r, g, b, a)` — fully opaque, `#rrggbb`.
 */
export function emailColor(value) {
  let v = colorToHex(value);
  if (/^#[0-9a-f]{3}$/i.test(v) || /^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  if (/^#[0-9a-f]{4}$/i.test(v)) v = `#${[...v.slice(1)].map((c) => c + c).join('')}`;
  if (!/^#[0-9a-f]{8}$/i.test(v)) return null;
  const [r, g, b, a] = [1, 3, 5, 7].map((at) => parseInt(v.slice(at, at + 2), 16));
  if (a === 255) return v.slice(0, 7).toLowerCase();
  return `rgba(${r}, ${g}, ${b}, ${Math.round((a / 255) * 100) / 100})`;
}

/**
 * A field's draft, realigned with the editor value when it changes from
 * elsewhere (undo, redo) - except while typing, which must not be
 * overwritten under the user's fingers.
 */
export function useDraft(value, toDraft) {
  const [draft, setDraft] = useState(() => toDraft(value));
  const ref = useRef(null);
  const convert = useRef(toDraft);
  convert.current = toDraft;
  useEffect(() => {
    const el = ref.current;
    const focused = el && el.ownerDocument?.activeElement && el.contains(el.ownerDocument.activeElement);
    if (!focused) setDraft(convert.current(value));
  }, [value]);
  return [draft, setDraft, ref];
}

const asText = (v) => v || '';

function FieldLabel({ id, children }) {
  return (
    <Label htmlFor={id} className="eb:text-[12px] eb:font-normal eb:text-foreground-lighter">
      {children}
    </Label>
  );
}

function FieldError({ children }) {
  return children ? <p className="eb:text-[12px] eb:text-destructive">{children}</p> : null;
}

/** Text, address, long text: draft committed on blur or Enter. */
function TextField({ id, property, value, fallback = '', onCommit, addon = null, error = null }) {
  const t = useT();
  const [draft, setDraft, ref] = useDraft(value, asText);
  const isUrl = property.type === 'url' || property.type === 'image';
  const kind = property.type === 'image' ? 'image' : 'link';
  const invalid = isUrl && draft.trim() !== '' && !isSafeUrl(draft, kind);

  const commit = () => {
    const next = draft.trim();
    if (invalid || next === (value || '')) return;
    onCommit(next || null);
  };
  const keyDown = (e) => {
    if (e.key === 'Escape') {
      setDraft(value || '');
      e.currentTarget.blur();
    } else if (e.key === 'Enter' && property.type !== 'textarea') {
      e.preventDefault();
      commit();
    }
  };

  const shared = {
    id,
    value: draft,
    placeholder: property.placeholder ? t(property.placeholder) : fallback || property.placeholder,
    onChange: (e) => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown: keyDown,
    'aria-invalid': invalid || undefined,
  };
  return (
    <div ref={ref} className="eb:space-y-1">
      <FieldLabel id={id}>{t(property.label)}</FieldLabel>
      {property.type === 'textarea' ? (
        <Textarea rows={3} dense {...shared} />
      ) : addon ? (
        <div className="eb:flex eb:gap-2">
          <Input {...shared} dense className="eb:min-w-0 eb:flex-1" />
          {addon}
        </div>
      ) : (
        <Input {...shared} dense />
      )}
      <FieldError>{invalid ? (kind === 'image' ? t('An https:// address is required') : t('Address not allowed')) : error}</FieldError>
    </div>
  );
}

/** Image: https address, or a file uploaded to the application storage. */
function ImageField({ id, property, value, onCommit, services }) {
  const t = useT();
  const inputRef = useRef(/** @type {HTMLInputElement|null} */ (null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(/** @type {string|null} */ (null));
  const upload = services?.uploadImage;

  const pick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !upload) return;
    const refused = imageUploadError(file, { t });
    setError(refused);
    if (refused) return;
    setBusy(true);
    try {
      const { path } = await upload(file);
      onCommit(path);
    } catch (err) {
      setError(err?.message || t('Upload failed'));
    } finally {
      setBusy(false);
    }
  };

  const addon = upload ? (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif"
        className="eb:sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid={`${id}-file`}
        onChange={pick}
      />
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="eb:h-6.5"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <Loader2 className="eb:animate-spin" /> : <Upload />}
        {t('Upload')}
      </Button>
    </>
  ) : null;

  return <TextField id={id} property={property} value={value} onCommit={onCommit} addon={addon} error={error} />;
}

/** Number in pixels, clamped. Empty = MJML default value. */
const asNumber = (v) => {
  const n = Number.parseFloat(String(v || ''));
  return Number.isFinite(n) ? String(n) : '';
};

function SizeField({ id, property, value, fallback = '', onCommit }) {
  const t = useT();
  const [draft, setDraft, ref] = useDraft(value, asNumber);

  const commit = (raw = draft) => {
    if (String(raw).trim() === '') {
      if (value) onCommit(null);
      return;
    }
    let n = Number.parseFloat(String(raw));
    if (!Number.isFinite(n)) return;
    if (property.min !== undefined) n = Math.max(property.min, n);
    if (property.max !== undefined) n = Math.min(property.max, n);
    setDraft(String(n));
    const next = `${n}${property.unit || 'px'}`;
    if (next !== value) onCommit(next);
  };

  return (
    <div ref={ref} className="eb:space-y-1">
      <FieldLabel id={id}>{t(property.label)}</FieldLabel>
      <div className="eb:relative">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={property.min}
          max={property.max}
          value={draft}
          placeholder={asNumber(fallback)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setDraft(asNumber(value));
          }}
          dense
          className="eb:pr-8 eb:tabular-nums"
        />
        <span className="eb:pointer-events-none eb:absolute eb:right-2.5 eb:top-1/2 eb:-translate-y-1/2 eb:text-[12px] eb:text-foreground-muted">
          {property.unit || 'px'}
        </span>
      </div>
    </div>
  );
}

/**
 * Color: swatch + hex code. Dragged in the picker, the color paints the email
 * as it moves; typed, it is committed after a short pause.
 */
function ColorField({ id, property, value, fallback = '', onCommit }) {
  const t = useT();
  const [draft, setDraft, ref] = useDraft(value, colorToHex);
  const timer = useRef(null);
  const lastCommit = useRef(0);
  const latest = useRef({ value, onCommit });
  latest.current = { value, onCommit };

  useEffect(() => () => clearTimeout(timer.current), []);

  const commit = (next) => {
    lastCommit.current = Date.now();
    const color = emailColor(next);
    if (!String(next || '').trim()) {
      if (latest.current.value) latest.current.onCommit(null);
    } else if (color && color !== latest.current.value) {
      latest.current.onCommit(color);
    }
  };

  const change = (next, { live = false } = {}) => {
    setDraft(next);
    clearTimeout(timer.current);
    const wait = live ? COLOR_LIVE_MS - (Date.now() - lastCommit.current) : COLOR_DEBOUNCE_MS;
    if (wait <= 0) commit(next);
    else timer.current = setTimeout(() => commit(next), wait);
  };

  return (
    <div ref={ref} className="eb:space-y-1">
      <FieldLabel id={id}>{t(property.label)}</FieldLabel>
      <ColorPicker id={id} value={draft} placeholder={emailColor(fallback) || ''} onChange={change} dense />
    </div>
  );
}

/** Radix does not accept an empty option ("default value"): use a sentinel. */
const DEFAULT_OPTION = '__default__';

function SelectField({ id, property, value, fallback = '', onCommit }) {
  const t = useT();
  const current = value || DEFAULT_OPTION;
  // "Default (Top)": what MJML renders when nothing is chosen.
  // (MJML writes some defaults in another word order: "top center" = "center top".)
  const words = (v) => String(v || '').trim().split(/\s+/).sort().join(' ');
  const fallbackOption = (property.options || []).find((o) => o.value && words(o.value) === words(fallback));
  const defaultLabel = fallbackOption ? t('Default ({value})', { value: t(fallbackOption.label) }) : t('Default');
  return (
    <div className="eb:space-y-1">
      <FieldLabel id={id}>{t(property.label)}</FieldLabel>
      <Select
        value={current}
        onValueChange={(next) => {
          const v = next === DEFAULT_OPTION ? '' : next;
          if (v !== (value || '')) onCommit(v || null);
        }}
      >
        <SelectTrigger id={id} dense className="eb:w-full">
          <SelectValue placeholder={defaultLabel} />
        </SelectTrigger>
        <SelectContent>
          {!(property.options || []).some((o) => !o.value) && (
            <SelectItem value={DEFAULT_OPTION}>{defaultLabel}</SelectItem>
          )}
          {(property.options || []).map((o) => (
            <SelectItem key={o.value || DEFAULT_OPTION} value={o.value || DEFAULT_OPTION}>
              {t(o.label)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

const ALIGN_ICONS = { left: AlignLeft, center: AlignCenter, right: AlignRight, justify: AlignJustify };

/** Alignment: toggle group (solid `bg-primary` on the active one). */
function AlignField({ id, property, value, fallback = '', onCommit }) {
  const t = useT();
  return (
    <div className="eb:space-y-1">
      <FieldLabel id={id}>{t(property.label)}</FieldLabel>
      <div
        id={id}
        role="radiogroup"
        aria-label={t(property.label)}
        className="eb:flex eb:w-fit eb:items-center eb:gap-0.5 eb:rounded-lg2 eb:border eb:border-border-strong eb:bg-surface-75 eb:p-0.5"
      >
        {(property.options || []).map((option) => {
          const Icon = ALIGN_ICONS[option.value] || AlignLeft;
          // Nothing chosen: MJML's default is what renders, so it shows as current.
          const active = (value || fallback) === option.value;
          return (
            <TooltipWrap key={option.value} label={t(option.label)}>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={t(option.label)}
                onClick={() => option.value !== value && onCommit(option.value)}
                className={cn(
                  'eb:inline-flex eb:h-5 eb:w-6 eb:items-center eb:justify-center eb:rounded-md eb:transition-colors',
                  active
                    ? 'eb:bg-primary eb:text-primary-foreground'
                    : 'eb:text-foreground-lighter eb:hover:bg-surface-200 eb:hover:text-foreground'
                )}
              >
                <Icon className="eb:h-3.5 eb:w-3.5" />
              </button>
            </TooltipWrap>
          );
        })}
      </div>
    </div>
  );
}

const SIDE_LABELS = [
  ['top', 'Top'],
  ['right', 'Right'],
  ['bottom', 'Bottom'],
  ['left', 'Left'],
];

/**
 * Spacing: four sides in pixels, rewritten in their shortest form. Empty
 * (nothing set): the four inputs are empty, MJML's default greyed in each.
 */
const asSides = (v) => (v ? parseSpacing(v).map((s) => String(Number.parseFloat(s) || 0)) : ['', '', '', '']);

/**
 * Four sides typed → the spacing to commit, or null when it does not change.
 * Untouched sides keep what MJML renders (its default, `defaults`), never 0.
 * @param {string[]} sides @param {string} value @param {string[]} defaults
 */
export function spacingFromSides(sides, value, defaults) {
  if (!value && sides.every((s) => String(s).trim() === '')) return null;
  const next = formatSpacing(
    sides.map((s, i) => {
      const raw = String(s).trim() === '' ? defaults[i] : s;
      return `${Math.max(0, Math.min(200, Number.parseFloat(raw) || 0))}px`;
    })
  );
  return next !== (value || '') ? next : null;
}

function SpacingField({ id, property, value, fallback = '', onCommit }) {
  const t = useT();
  const [draft, setDraft, ref] = useDraft(value, asSides);
  const defaults = parseSpacing(fallback || '0px').map((s) => String(Number.parseFloat(s) || 0));

  const commit = (sides = draft) => {
    const next = spacingFromSides(sides, value, defaults);
    if (next !== null) onCommit(next);
  };

  return (
    <fieldset ref={ref} className="eb:space-y-1">
      <legend className="eb:mb-1 eb:text-[12px] eb:text-foreground-lighter">{t(property.label)}</legend>
      <div className="eb:grid eb:grid-cols-4 eb:gap-1.5">
        {SIDE_LABELS.map(([side, label], i) => (
          <div key={side} className="eb:space-y-1">
            <Input
              id={`${id}-${side}`}
              type="number"
              min={0}
              max={200}
              aria-label={t('{label} — {side}', { label: t(property.label), side: t(label) })}
              title={t(label)}
              value={draft[i]}
              placeholder={defaults[i]}
              onChange={(e) => setDraft((d) => d.map((v, j) => (j === i ? e.target.value : v)))}
              onBlur={() => commit()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
              }}
              dense
              className="eb:px-2 eb:text-center eb:tabular-nums"
            />
            <span className="eb:block eb:text-center eb:text-[10.5px] eb:text-foreground-muted">{t(label)}</span>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

const FIELDS = {
  text: TextField,
  textarea: TextField,
  url: TextField,
  image: ImageField,
  size: SizeField,
  color: ColorField,
  select: SelectField,
  align: AlignField,
  spacing: SpacingField,
};

/**
 * Field of a property. The caller's `key` (element + property) remounts it on
 * every selection change: a draft never carries over from one element to another.
 */
export function PropertyField({ property, value, fallback = '', onCommit, idPrefix = 'eb', services = null }) {
  const Field = FIELDS[property.type] || TextField;
  const id = `${idPrefix}-${property.key}`;
  return <Field id={id} property={property} value={value} fallback={fallback} onCommit={onCommit} services={services} />;
}
