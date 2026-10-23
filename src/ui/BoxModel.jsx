import { useState } from 'react';
import { Ban } from 'lucide-react';
import { TooltipWrap } from './primitives/misc.jsx';
import { cn } from './primitives/cn.js';
import { PropertyField, spacingFromSides, useDraft } from './fields.jsx';
import { BORDER_STYLES, MAX_BORDER, formatBorder, parseBorder, parseSpacing } from '../core/mjmlAttributes.js';
import { useT } from './context.jsx';

/**
 * BOX DIAGRAM — the Spacing section of a block, drawn as browsers' developer
 * tools draw an element: the margin outside, the border, the padding inside,
 * the content in the middle. Each zone has its four numbers where they apply
 * (top, right, bottom, left), typed in place; pointed at, a zone says below
 * what it sets.
 *
 * A block shows the zones its properties take (`box` of a property: a button
 * has all three, a text only its padding — MJML gives it no margin and no
 * border). The border's width is typed in its zone; its style and its color
 * are chosen under the diagram.
 *
 * Each zone commits its own property, on blur or Enter, as the Spacing field
 * did: an untouched side keeps MJML's default (greyed), never 0.
 */

export const BOX_ROLES = /** @type {const} */ (['margin', 'border', 'padding']);

/** Where a property goes in the diagram, if it does. @param {import('../core/EmailEditor.js').BlockProperty} property */
export const boxRole = (property) => property.box || (property.type === 'border' ? 'border' : null);

/** Each zone's tint, mixed into the panel's background: opaque, so nested zones do not darken one another. */
const TONES = {
  margin: { tint: 'var(--eb-foreground-muted)', zone: 'eb:border-dashed eb:border-border-strong', text: 'eb:text-foreground-lighter' },
  border: { tint: 'var(--eb-primary)', zone: 'eb:border-primary/40', text: 'eb:text-primary eb:dark:text-foreground' },
  padding: { tint: 'var(--eb-accent-foreground)', zone: 'eb:border-dashed eb:border-primary/25', text: 'eb:text-foreground-lighter' },
  content: { tint: 'var(--eb-primary)' },
};
/** @param {keyof typeof TONES} role @param {boolean} active */
const tinted = (role, active) => `color-mix(in oklab, ${TONES[role].tint} ${active ? 34 : 16}%, var(--eb-background))`;

/** The sides in the order they are typed (CSS's), and where each sits in a zone's grid (the top one in its own row). */
const SIDES = [
  ['top', 'Top', ''],
  ['right', 'Right', 'eb:col-start-3 eb:row-start-2'],
  ['bottom', 'Bottom', 'eb:col-span-3 eb:row-start-3'],
  ['left', 'Left', 'eb:col-start-1 eb:row-start-2'],
];

/** A new border, before a color is chosen: a light grey any background shows. */
export const BORDER_COLOR = '#cbd5e1';
const BORDER_COLOR_PROPERTY = { key: 'border-color', label: 'Border color', type: 'color' };
/** Lines that need some width to show what they are. */
const THICK_STYLES = new Set(['double', 'groove', 'ridge']);

const asSides = (v) => (v ? parseSpacing(v).map((s) => String(Number.parseFloat(s) || 0)) : ['', '', '', '']);
const asWidths = (v) => {
  const border = parseBorder(v);
  return border ? border.widths.map(String) : ['', '', '', ''];
};

function SideInput({ id, label, value, placeholder, max, className, onChange, onCommit }) {
  return (
    <input
      id={id}
      type="number"
      inputMode="numeric"
      min={0}
      max={max}
      aria-label={label}
      title={label}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit();
      }}
      className={cn(
        'eb:h-5 eb:w-8 eb:justify-self-center eb:rounded-md eb:bg-transparent eb:text-center eb:text-[11.5px] eb:text-foreground eb:tabular-nums eb:outline-none eb:transition-colors eb:placeholder:text-foreground-muted',
        'eb:hover:bg-background/80 eb:focus:bg-background eb:focus-visible:ring-2 eb:focus-visible:ring-ring/60',
        'eb:[appearance:textfield] eb:[&::-webkit-inner-spin-button]:appearance-none eb:[&::-webkit-outer-spin-button]:appearance-none',
        className
      )}
    />
  );
}

/**
 * One zone: its name, its four numbers, what it surrounds in the middle.
 * `line`: the border's style, drawn by the zone's own edge.
 */
function Zone({ id, role, rootRef, active, onActive, draft, setDraft, placeholders, max, onCommit, line = null, children }) {
  const t = useT();
  const tone = TONES[role];
  const name = { margin: t('Margin'), border: t('Border'), padding: t('Padding') }[role];
  const inputs = SIDES.map(([side, label, place], i) => (
    <SideInput
      key={side}
      id={`${id}-${side}`}
      label={t('{label} — {side}', { label: name, side: t(label) })}
      value={draft[i]}
      placeholder={placeholders[i]}
      max={max}
      className={place}
      onChange={(next) => setDraft((d) => d.map((v, j) => (j === i ? next : v)))}
      onCommit={onCommit}
    />
  ));
  return (
    <div
      data-box={role}
      data-active={active === role}
      className={cn(
        'eb:grid eb:grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] eb:grid-rows-[auto_minmax(0,1fr)_auto] eb:items-center eb:gap-y-0.5 eb:rounded-lg eb:border eb:px-0.5 eb:py-1 eb:transition-colors',
        tone.zone
      )}
      style={{ background: tinted(role, active === role), ...(line && { borderStyle: line, borderWidth: THICK_STYLES.has(line) ? 3 : 2 }) }}
      onPointerOver={(e) => {
        e.stopPropagation();
        onActive(role);
      }}
      onFocus={(e) => {
        e.stopPropagation();
        onActive(role);
      }}
    >
      {/* The zone's own numbers (the inner zones are not its: typing there does not hold its draft). */}
      <div ref={rootRef} className="eb:contents">
        {/* The name at the left of the top row, the top number in its middle (the content's). */}
        <div className="eb:col-span-3 eb:row-start-1 eb:grid eb:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] eb:items-center">
          <span className={cn('eb:truncate eb:pl-1 eb:text-[10.5px] eb:font-medium eb:leading-5', tone.text)}>{name}</span>
          {inputs[0]}
        </div>
        {inputs.slice(1)}
      </div>
      <div className="eb:col-start-2 eb:row-start-2 eb:min-w-0">{children}</div>
    </div>
  );
}

/** A spacing zone (margin or padding): the property's four sides. */
function SpacingZone({ id, role, property, value, fallback, onCommit, ...rest }) {
  const [draft, setDraft, ref] = useDraft(value, asSides);
  const defaults = parseSpacing(fallback || '0px').map((s) => String(Number.parseFloat(s) || 0));
  const commit = () => {
    const next = spacingFromSides(draft, value, defaults);
    if (next !== null) onCommit(property.key, next);
  };
  return <Zone id={id} role={role} rootRef={ref} draft={draft} setDraft={setDraft} placeholders={defaults} max={200} onCommit={commit} {...rest} />;
}

/** The border zone: its four widths; the style and the color are kept. */
function BorderZone({ id, property, value, onCommit, ...rest }) {
  const [draft, setDraft, ref] = useDraft(value, asWidths);
  const border = parseBorder(value);
  const commit = () => {
    const widths = /** @type {[number, number, number, number]} */ (
      draft.map((w) => Math.max(0, Math.min(MAX_BORDER, Math.round(Number.parseFloat(w) || 0))))
    );
    const next = formatBorder({ widths, style: border?.style || 'solid', color: border ? border.color : BORDER_COLOR });
    if (next !== (value || '')) onCommit(property.key, next || null);
  };
  return (
    <Zone
      id={id}
      role="border"
      rootRef={ref}
      draft={draft}
      setDraft={setDraft}
      placeholders={['0', '0', '0', '0']}
      max={MAX_BORDER}
      onCommit={commit}
      line={border?.style || null}
      {...rest}
    />
  );
}

/** The border's line: none, or one of the styles, each drawn. */
function BorderStyle({ id, value, onChange }) {
  const t = useT();
  const border = parseBorder(value);
  const current = border?.style || 'none';
  const labels = {
    none: t('No border'),
    solid: t('Solid'),
    dashed: t('Dashed'),
    dotted: t('Dotted'),
    double: t('Double'),
    groove: t('Groove'),
    ridge: t('Ridge'),
  };
  return (
    <div className="eb:space-y-1">
      <span id={`${id}-label`} className="eb:block eb:text-[12px] eb:text-foreground-lighter">
        {t('Border style')}
      </span>
      <div
        id={id}
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        className="eb:flex eb:w-fit eb:flex-wrap eb:items-center eb:gap-0.5 eb:rounded-lg2 eb:border eb:border-border-strong eb:bg-surface-75 eb:p-0.5"
      >
        {['none', ...BORDER_STYLES].map((style) => {
          const active = current === style;
          return (
            <TooltipWrap key={style} label={labels[style]}>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={labels[style]}
                data-border-style={style}
                onClick={() => !active && onChange(style)}
                className={cn(
                  'eb:inline-flex eb:h-6 eb:w-8 eb:items-center eb:justify-center eb:rounded-md eb:transition-colors',
                  active ? 'eb:bg-primary eb:text-primary-foreground' : 'eb:text-foreground-lighter eb:hover:bg-surface-200 eb:hover:text-foreground'
                )}
              >
                {style === 'none' ? (
                  <Ban className="eb:size-3.5" aria-hidden="true" />
                ) : (
                  <span aria-hidden="true" className="eb:block eb:h-3.5 eb:w-5 eb:rounded-[3px]" style={{ border: `${THICK_STYLES.has(style) ? 4 : 2}px ${style} currentColor` }} />
                )}
              </button>
            </TooltipWrap>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The diagram of an element's box properties (those with a `box` role), with
 * its border's style and color under it.
 * @param {{
 *   idPrefix: string,
 *   element: {label: string, values: Record<string, string>, defaults?: Record<string, string>},
 *   properties: import('../core/EmailEditor.js').BlockProperty[],
 *   onCommit: (key: string, value: string|null) => void,
 * }} props
 */
export default function BoxModel({ idPrefix, element, properties, onCommit }) {
  const t = useT();
  const [active, setActive] = useState(/** @type {string|null} */ (null));
  const hints = {
    margin: t('Margin: the space outside the block, between it and its neighbours.'),
    border: t('Border: a line around the block, as wide as typed on each side.'),
    padding: t('Padding: the space inside the block, between its edge and its content.'),
    content: t('The content of the block: the spacing and the border go around it.'),
  };
  const byRole = Object.fromEntries(properties.map((property) => [boxRole(property), property]));
  const roles = BOX_ROLES.filter((role) => byRole[role]);
  const border = byRole.border;
  const borderValue = border ? element.values[border.key] || '' : '';

  /**
   * The border with a new style or color; a style on no border draws 1 px all round.
   * A double, groove or ridge line needs 3 px to be one: thinner sides grow to it.
   */
  const setBorder = (/** @type {{style?: string, color?: string}} */ change) => {
    if (!border) return;
    if (change.style === 'none') {
      if (borderValue) onCommit(border.key, null);
      return;
    }
    const current = parseBorder(borderValue);
    const style = change.style || current?.style || 'solid';
    const widths = current ? current.widths : [1, 1, 1, 1];
    const next = formatBorder({
      widths: /** @type {[number, number, number, number]} */ (widths.map((w) => (THICK_STYLES.has(style) && w > 0 ? Math.max(w, 3) : w))),
      style,
      color: change.color ?? current?.color ?? BORDER_COLOR,
    });
    if (next !== borderValue) onCommit(border.key, next);
  };

  const zones = roles.reduceRight(
    (inner, role) => {
      const property = byRole[role];
      const common = { id: `${idPrefix}-box-${role}`, role, property, value: element.values[property.key] || '', onCommit, active, onActive: setActive };
      return role === 'border' ? (
        <BorderZone {...common}>{inner}</BorderZone>
      ) : (
        <SpacingZone {...common} fallback={element.defaults?.[property.key] || ''}>
          {inner}
        </SpacingZone>
      );
    },
    <div
      data-box="content"
      className="eb:flex eb:min-h-8 eb:items-center eb:justify-center eb:rounded-md eb:border eb:border-primary/40 eb:px-2 eb:text-[11.5px] eb:font-medium eb:text-foreground"
      style={{ background: tinted('content', active === 'content') }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setActive('content');
      }}
    >
      <span className="eb:truncate">{t(element.label)}</span>
    </div>
  );

  return (
    <div className="eb:space-y-3" data-testid="eb-box-model">
      <div
        className="eb:space-y-1.5"
        onPointerLeave={() => setActive(null)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(/** @type {Node|null} */ (e.relatedTarget))) setActive(null);
        }}
      >
        {zones}
        <p className="eb:min-h-8 eb:text-[11.5px] eb:leading-4 eb:text-foreground-muted" data-testid="eb-box-model-hint">
          {(active && hints[/** @type {keyof typeof hints} */ (active)]) || t('In pixels. Point at a zone to see what it sets.')}
        </p>
      </div>
      {border && (
        <>
          <BorderStyle id={`${idPrefix}-box-border-style`} value={borderValue} onChange={(style) => setBorder({ style })} />
          <PropertyField
            idPrefix={`${idPrefix}-box`}
            property={BORDER_COLOR_PROPERTY}
            value={parseBorder(borderValue)?.color || ''}
            fallback={BORDER_COLOR}
            onCommit={(color) => setBorder({ color: color || BORDER_COLOR })}
          />
        </>
      )}
    </div>
  );
}
