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
 */
export function ColorPicker({ value, onChange, id, className }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const valid = isValidHex(value);
  const normalized = valid ? normalizeHex(value) : '';
  const emit = (hex) => onChange(normalizeHex(hex));

  return (
    <div className={cn('mb:flex mb:gap-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t('Pick a colour')}
            title={t('Pick a colour')}
            className="mb-checker mb:relative mb:h-8 mb:w-[44px] mb:shrink-0 mb:overflow-hidden mb:rounded-lg2 mb:shadow-sm mb:ring-1 mb:ring-black/10 mb:ring-inset mb:transition-transform mb:hover:scale-[1.04]"
          >
            <span className="mb:absolute mb:inset-0" style={{ backgroundColor: valid ? value : 'transparent' }} aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="mb:w-64 mb:space-y-3 mb:p-3">
          <div className="mb-picker">
            <HexAlphaColorPicker color={valid ? value : FALLBACK_COLOR} onChange={emit} />
          </div>
          <div className="mb:flex mb:items-center mb:gap-2">
            <span
              className="mb-checker mb:relative mb:size-8 mb:shrink-0 mb:overflow-hidden mb:rounded-lg2 mb:ring-1 mb:ring-black/10 mb:ring-inset"
              aria-hidden
            >
              <span className="mb:absolute mb:inset-0" style={{ backgroundColor: valid ? value : 'transparent' }} />
            </span>
            <Input
              value={value || ''}
              onChange={(e) => emit(e.target.value)}
              placeholder="#RRGGBB"
              maxLength={9}
              aria-label={t('Hex code')}
              className="mb:h-8 mb:flex-1 mb:font-mono mb:text-[12px] mb:uppercase"
            />
          </div>
          <div className="mb:grid mb:grid-cols-6 mb:gap-1.5 mb:border-t mb:border-border mb:pt-2.5">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onChange(c)}
                title={c}
                aria-label={c}
                className="mb:relative mb:size-6 mb:rounded-lg2 mb:ring-1 mb:ring-black/10 mb:ring-inset mb:transition-transform mb:hover:scale-110"
                style={{ backgroundColor: c }}
              >
                {normalized === c && (
                  <Check className="mb:absolute mb:inset-0 mb:m-auto mb:size-3.5 mb:text-white mb:drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]" />
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
        placeholder="#RRGGBB"
        className="mb:h-8 mb:flex-1 mb:font-mono mb:text-[13px]"
      />
    </div>
  );
}
