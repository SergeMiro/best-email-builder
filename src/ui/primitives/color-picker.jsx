import { useState } from 'react';
import { HexAlphaColorPicker, HexColorPicker } from 'react-colorful';
import { Check } from 'lucide-react';
import { useT } from '../context.jsx';
import { Input } from './fields.jsx';
import { Popover, PopoverContent, PopoverTrigger } from './overlays.jsx';
import { cn } from './cn.js';

const PRESET_COLORS = [
  '#8B5CF6', '#A78BFA', '#6366F1', '#3B82F6', '#06B6D4', '#17A2B8',
  '#10B981', '#22C55E', '#28A745', '#84CC16', '#EAB308', '#FFC107',
  '#F59E0B', '#F97316', '#EF4444', '#DC3545', '#EC4899', '#6B7280',
];

// Shown by the picker while the typed value is not a colour yet ("#8B", empty).
const FALLBACK_COLOR = '#8B5CF6';

const isValidHex = (v) => /^#([0-9A-Fa-f]{8}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{4}|[0-9A-Fa-f]{3})$/.test(v || '');

function normalizeHex(v) {
  if (!v) return '';
  let s = v.trim();
  if (s && !s.startsWith('#')) s = `#${s}`;
  return s.toUpperCase();
}

const RGBA = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(\d*\.?\d+)(%?)\s*)?\)$/i;

/**
 * A colour as the hex code the fields show: `rgba(r, g, b, a)` (how a colour
 * with transparency is kept in the email) is `#RRGGBBAA`, `#RRGGBB` when
 * opaque; anything else is returned as is.
 *
 * @param {string|null|undefined} value
 */
export function colorToHex(value) {
  const text = String(value || '').trim();
  const m = RGBA.exec(text);
  if (!m) return text;
  const alpha = m[4] === undefined ? 1 : Number(m[4]) / (m[5] ? 100 : 1);
  const byte = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${byte(Number(m[1]))}${byte(Number(m[2]))}${byte(Number(m[3]))}${alpha < 1 ? byte(alpha * 255) : ''}`.toUpperCase();
}

/**
 * Colour field: a swatch opening a full-spectrum picker, a hex input and
 * presets. `value` is `#RRGGBB`, `#RRGGBBAA` or `rgba()`.
 *
 * `onChange(hex, { live })`: `live` while the colour is dragged in the
 * picker or picked from the presets — what it paints should follow at once —
 * not while a code is typed. `alpha`: the transparency slider (off for a
 * colour that must stay opaque). `dense`: the height of the properties
 * panel's fields.
 */
export function ColorPicker({ value, onChange, id, className, placeholder = '', alpha = true, dense = false }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const hex = colorToHex(value);
  const valid = isValidHex(hex);
  const normalized = valid ? normalizeHex(hex) : '';
  const Picker = alpha ? HexAlphaColorPicker : HexColorPicker;

  return (
    <div className={cn('eb:flex eb:gap-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t('Pick a colour')}
            title={t('Pick a colour')}
            className={cn(
              'eb-checker eb:relative eb:h-8 eb:w-[44px] eb:shrink-0 eb:overflow-hidden eb:rounded-md eb:shadow-sm eb:ring-1 eb:ring-black/10 eb:ring-inset eb:transition-transform eb:hover:scale-[1.04]',
              dense && 'eb:h-6.5 eb:w-9'
            )}
          >
            {/* Empty: the colour MJML renders by default, faded. */}
            <span
              className="eb:absolute eb:inset-0"
              style={{ backgroundColor: valid ? hex : colorToHex(placeholder) || 'transparent', opacity: valid ? 1 : 0.45 }}
              aria-hidden
            />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="eb:w-64 eb:space-y-3 eb:p-3">
          <div className="eb-picker">
            <Picker color={valid ? hex : FALLBACK_COLOR} onChange={(next) => onChange(normalizeHex(next), { live: true })} />
          </div>
          <div className="eb:flex eb:items-center eb:gap-2">
            <span
              className="eb-checker eb:relative eb:size-8 eb:shrink-0 eb:overflow-hidden eb:rounded-lg2 eb:ring-1 eb:ring-black/10 eb:ring-inset"
              aria-hidden
            >
              <span className="eb:absolute eb:inset-0" style={{ backgroundColor: valid ? hex : 'transparent' }} />
            </span>
            <Input
              value={hex}
              onChange={(e) => onChange(normalizeHex(e.target.value))}
              placeholder="#RRGGBB"
              maxLength={9}
              aria-label={t('Hex code')}
              className="eb:h-8 eb:flex-1 eb:font-mono eb:text-[12px] eb:uppercase"
            />
          </div>
          <div className="eb:grid eb:grid-cols-6 eb:gap-1.5 eb:border-t eb:border-border eb:pt-2.5">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onChange(c, { live: true })}
                title={c}
                aria-label={c}
                className="eb:relative eb:size-6 eb:rounded-lg2 eb:ring-1 eb:ring-black/10 eb:ring-inset eb:transition-transform eb:hover:scale-110"
                style={{ backgroundColor: c }}
              >
                {normalized === c && (
                  <Check className="eb:absolute eb:inset-0 eb:m-auto eb:size-3.5 eb:text-white eb:drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]" />
                )}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <Input
        id={id}
        value={hex}
        onChange={(e) => onChange(e.target.value)}
        maxLength={9}
        placeholder={colorToHex(placeholder) || '#RRGGBB'}
        dense={dense}
        className={cn('eb:flex-1 eb:font-mono', dense ? 'eb:text-[12px]' : 'eb:text-[13px]')}
      />
    </div>
  );
}
