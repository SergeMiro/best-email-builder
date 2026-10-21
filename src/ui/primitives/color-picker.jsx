import { useState } from 'react';
import { HexAlphaColorPicker } from 'react-colorful';
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

/**
 * Colour field: a swatch opening a full-spectrum picker (with alpha), a hex
 * input and presets. `value` is `#RRGGBB` or `#RRGGBBAA`; `onChange(hex)`.
 * `dense`: the height of the properties panel's fields.
 */
export function ColorPicker({ value, onChange, id, className, placeholder = '', dense = false }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const valid = isValidHex(value);
  const normalized = valid ? normalizeHex(value) : '';
  const emit = (hex) => onChange(normalizeHex(hex));

  return (
    <div className={cn('eb:flex eb:gap-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t('Pick a colour')}
            title={t('Pick a colour')}
            className={cn(
              'eb-checker eb:relative eb:h-8 eb:w-[44px] eb:shrink-0 eb:overflow-hidden eb:rounded-lg2 eb:shadow-sm eb:ring-1 eb:ring-black/10 eb:ring-inset eb:transition-transform eb:hover:scale-[1.04]',
              dense && 'eb:h-6.5 eb:w-9'
            )}
          >
            {/* Empty: the colour MJML renders by default, faded. */}
            <span
              className="eb:absolute eb:inset-0"
              style={{ backgroundColor: valid ? value : placeholder || 'transparent', opacity: valid ? 1 : 0.45 }}
              aria-hidden
            />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="eb:w-64 eb:space-y-3 eb:p-3">
          <div className="eb-picker">
            <HexAlphaColorPicker color={valid ? value : FALLBACK_COLOR} onChange={emit} />
          </div>
          <div className="eb:flex eb:items-center eb:gap-2">
            <span
              className="eb-checker eb:relative eb:size-8 eb:shrink-0 eb:overflow-hidden eb:rounded-lg2 eb:ring-1 eb:ring-black/10 eb:ring-inset"
              aria-hidden
            >
              <span className="eb:absolute eb:inset-0" style={{ backgroundColor: valid ? value : 'transparent' }} />
            </span>
            <Input
              value={value || ''}
              onChange={(e) => emit(e.target.value)}
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
                onClick={() => onChange(c)}
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
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        maxLength={9}
        placeholder={placeholder || '#RRGGBB'}
        dense={dense}
        className={cn('eb:flex-1 eb:font-mono', dense ? 'eb:text-[12px]' : 'eb:text-[13px]')}
      />
    </div>
  );
}
