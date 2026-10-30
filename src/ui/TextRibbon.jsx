import { useEffect, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  CaseSensitive,
  Check,
  ChevronDown,
  Italic,
  Link,
  RemoveFormatting,
  Strikethrough,
  Underline,
  Unlink,
} from 'lucide-react';
import { useUi } from './context.jsx';
import { cn } from './primitives/cn.js';
import { Button } from './primitives/button.jsx';
import { Input } from './primitives/fields.jsx';
import { TooltipWrap } from './primitives/misc.jsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './primitives/overlays.jsx';
import { ColorField } from './fields.jsx';
import VariableInsertButton from '../features/variables/VariableInsertButton.jsx';

/**
 * TEXT RIBBON — the bar above the canvas, always open, as in a word
 * processor.
 *
 *   the words of a text: bold, italic, underline, strikethrough, link,
 *     remove the link, clear formatting — on the selection of the text being
 *     edited, or on the whole text when it is only selected;
 *   the element: font, size, line height, color, capitals and alignment —
 *     on the selected element when its block has them, otherwise on every
 *     element inside it that has them (a menu's links, a section's texts and
 *     buttons), in one step of the history; bold, italic, underline and
 *     strikethrough style the words while editing, the whole elements
 *     otherwise;
 *   at its end, the buttons of the feature panels (emojis, variables): each
 *     opens its panel beside the canvas.
 *
 * Every button names itself in a tooltip. Nothing here takes the focus from
 * the text being edited: its caret stays where it was.
 *
 * The properties panel leaves out what is here (`RIBBON_KEYS`): one place for each.
 */

/** The block properties this ribbon sets. */
export const RIBBON_KEYS = new Set(['font-family', 'font-size', 'line-height', 'font-weight', 'color', 'text-transform', 'align']);

const FORMATS = [
  { command: 'bold', icon: Bold, label: 'Bold (Ctrl+B)' },
  { command: 'italic', icon: Italic, label: 'Italic (Ctrl+I)' },
  { command: 'underline', icon: Underline, label: 'Underline (Ctrl+U)' },
  { command: 'strike', icon: Strikethrough, label: 'Strikethrough' },
];

const SIZES = [10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 32, 36, 40, 44, 48];
const LINE_HEIGHTS = [1, 1.15, 1.3, 1.5, 2, 2.5];

const ALIGNMENTS = [
  { value: 'left', icon: AlignLeft, label: 'Align left' },
  { value: 'center', icon: AlignCenter, label: 'Align center' },
  { value: 'right', icon: AlignRight, label: 'Align right' },
  { value: 'justify', icon: AlignJustify, label: 'Justify' },
];

/** Lines with an up-and-down arrow: line spacing, drawn like the icons beside it. */
function LineSpacingIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 4v16M2 7l3-3 3 3M2 17l3 3 3-3M12 6h9M12 12h9M12 18h9" />
    </svg>
  );
}

/** "15px" → 15; "120%" or "1.5" of a 20 px text → 24. */
function pixels(value, fontSize) {
  const text = String(value || '').trim();
  const n = Number.parseFloat(text);
  if (!Number.isFinite(n)) return null;
  if (text.endsWith('%')) return fontSize ? (n / 100) * fontSize : null;
  if (/^[\d.]+$/.test(text)) return fontSize ? n * fontSize : null;
  return n;
}

/** "'Trebuchet MS', Helvetica" and "'trebuchet ms',helvetica" are one font. */
const fontKey = (value) => String(value || '').toLowerCase().replace(/["'\s]/g, '');

/** MJML's attributes for the words' styles: [attribute, on, off]. */
const STYLES = {
  italic: ['font-style', 'italic', 'normal'],
  underline: ['text-decoration', 'underline', 'none'],
  strike: ['text-decoration', 'line-through', 'none'],
};
/** The elements MJML styles so. */
const STYLED_TAGS = new Set(['mj-text', 'mj-button', 'mj-navbar-link']);

const heavy = (weight) => weight === 'bold' || Number(weight) >= 600;

const clamp = (n, property) => Math.min(property.max ?? n, Math.max(property.min ?? n, n));

const ICON_BUTTON =
  'eb:inline-flex eb:h-7 eb:min-w-7 eb:items-center eb:justify-center eb:gap-1 eb:rounded-lg2 eb:px-1.5 eb:text-foreground-lighter eb:outline-none eb:transition-colors eb:hover:bg-surface-200 eb:hover:text-foreground eb:focus-visible:ring-2 eb:focus-visible:ring-ring/50 eb:disabled:pointer-events-none eb:disabled:opacity-40 eb:aria-pressed:bg-primary/10 eb:aria-pressed:text-primary eb:aria-checked:bg-primary/10 eb:aria-checked:text-primary eb:data-[state=open]:bg-surface-200 eb:[&_svg]:size-4 eb:[&_svg]:shrink-0';

/**
 * A tooltip that also names a disabled button: a disabled button takes no
 * pointer, so the tooltip listens on a wrapper.
 */
function Tip({ label, children }) {
  return (
    <TooltipWrap label={label} side="bottom" delayDuration={250} hoverable={false}>
      <span className="eb:inline-flex">{children}</span>
    </TooltipWrap>
  );
}

const Separator = () => <span className="eb:mx-0.5 eb:h-4 eb:w-px eb:shrink-0 eb:bg-border" aria-hidden="true" />;

/**
 * @param {{
 *   editor: import('../core/EmailEditor.js').EmailEditor,
 *   ready: boolean,
 *   selection: import('../core/EmailEditor.js').EmailSelection|null,
 *   format: import('../core/EmailEditor.js').TextFormat,
 *   variables?: import('../features/variables/catalog.js').EmailVariable[],
 *   drawers: {id: string, icon: any, label: string, title?: string}[],
 *   openDrawer: string|null,
 *   onToggleDrawer: (id: string) => void,
 * }} props
 */
export default function TextRibbon({ editor, ready, selection, format, variables = [], drawers, openDrawer, onToggleDrawer }) {
  const { t, locale } = useUi();
  const element = ready && selection && !selection.multiple ? selection : null;
  /** An element's property, when its block has one. */
  const own = (target, key) => (target.blockId ? editor.getBlock(target.blockId) : null)?.properties?.find((property) => property.key === key) || null;
  // Everything inside the selected element (a menu's links, a section's texts and buttons).
  const inside = [];
  const walk = (ids = []) => {
    for (const id of ids) {
      const child = editor.getElement(id);
      if (!child) continue;
      inside.push(child);
      walk(child.children);
    }
  };
  if (element) walk(element.children);
  /** What a key acts on: the selected element when its block has it, otherwise every element inside it that has it. */
  const targetsOf = (key) => (element && own(element, key) ? [element] : inside.filter((target) => own(target, key)));
  /** The property, as the first element it acts on has it. @param {string} key */
  const propertyOf = (key) => {
    const [first] = targetsOf(key);
    return first ? own(first, key) : null;
  };
  /** Their value, when they all have the same one. */
  const valueOf = (key) => {
    const values = [...new Set(targetsOf(key).map((target) => target.values?.[key] || target.defaults?.[key] || ''))];
    return values.length === 1 ? values[0] : '';
  };
  const set = (key, value) => {
    const ids = targetsOf(key).map((target) => target.id);
    if (ids.length) editor.updateProperties({ [key]: value }, ids);
  };

  // Words can be formatted in a text: the one being edited, or a selected one.
  const words = ready && (format.editing || element?.tagName === 'mj-text');
  const run = (command, value) => editor.formatText(command, value);

  // No words in hand: italic, underline and strikethrough style whole elements, where MJML takes them.
  const styledTargets = element && STYLED_TAGS.has(element.tagName) ? [element] : inside.filter((target) => STYLED_TAGS.has(target.tagName));
  const styled = !words && styledTargets.length > 0;
  const styleOn = (command) => styledTargets.length > 0 && styledTargets.every((target) => target.attributes?.[STYLES[command][0]] === STYLES[command][1]);
  const toggleStyle = (command) => {
    const [attribute, on, off] = STYLES[command];
    editor.updateProperties({ [attribute]: styleOn(command) ? off : on }, styledTargets.map((target) => target.id));
  };
  // Not editing: bold is the weight of the whole element, where its block has one
  // (a selected text keeps its words in <b>, a weight it already has is taken off).
  const weight = !format.editing ? propertyOf('font-weight') : null;
  const bold = weight ? heavy(valueOf('font-weight')) || format.bold : format.bold;
  const toggleBold = () => {
    if (weight && (heavy(valueOf('font-weight')) || (!words && !format.bold))) set('font-weight', heavy(valueOf('font-weight')) ? 'normal' : 'bold');
    else run('bold');
  };
  const font = propertyOf('font-family');
  const fontValue = font?.options?.find((option) => fontKey(option.value) === fontKey(valueOf('font-family')))?.value;
  const color = propertyOf('color');
  const capitals = propertyOf('text-transform');
  const size = propertyOf('font-size');
  const lineHeight = propertyOf('line-height');
  const align = propertyOf('align');
  const currentSize = pixels(valueOf('font-size'), null);
  const currentLine = pixels(valueOf('line-height'), currentSize);
  const number = new Intl.NumberFormat(locale || undefined, { maximumFractionDigits: 2 });

  return (
    <div
      role="toolbar"
      aria-label={t('Text formatting')}
      data-testid="eb-ribbon"
      className="eb:@container eb:flex eb:h-10 eb:shrink-0 eb:items-center eb:border-b eb:border-border eb:bg-background"
      // No mousedown outside its fields: the text being edited keeps its caret.
      onMouseDown={(event) => event.target instanceof HTMLInputElement || event.preventDefault()}
    >
      {/* Too narrow, the tools scroll; the panel buttons stay in view. */}
      <div className="eb:flex eb:h-full eb:min-w-0 eb:flex-1 eb:items-center eb:gap-0.5 eb:overflow-x-auto eb:px-2 eb:[scrollbar-width:thin]">
        <Select value={fontValue ?? ''} onValueChange={(next) => set('font-family', next)} disabled={!font}>
          <Tip label={t('Font')}>
            <SelectTrigger
              aria-label={t('Font')}
              data-control="font-family"
              className="eb:w-28 eb:shrink-0 eb:gap-1 eb:px-2 eb:shadow-none eb:disabled:opacity-40"
            >
              <SelectValue placeholder={t('Font')} />
            </SelectTrigger>
          </Tip>
          <SelectContent position="popper" align="start" onCloseAutoFocus={(event) => event.preventDefault()}>
            {font?.options?.map((option) => (
              <SelectItem key={option.value} value={option.value} style={{ fontFamily: option.value }}>
                {t(option.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Separator />
        {FORMATS.map(({ command, icon: Icon, label }) => (
          <Tip key={command} label={t(label)}>
            <button
              type="button"
              className={ICON_BUTTON}
              disabled={command === 'bold' ? !words && !weight : !words && !styled}
              aria-label={t(label)}
              aria-pressed={Boolean(command === 'bold' ? bold : styled ? styleOn(command) : format[command])}
              data-command={command}
              onClick={() => {
                if (command === 'bold') toggleBold();
                else if (styled) toggleStyle(command);
                else run(command);
              }}
            >
              <Icon aria-hidden="true" />
            </button>
          </Tip>
        ))}
        <ColorField
          key={element?.id ?? 'none'}
          id="eb-ribbon-color"
          property={color || { key: 'color', label: 'Text color', type: 'color' }}
          value={valueOf('color')}
          fallback=''
          onCommit={(value) => set('color', value)}
          trigger={
            <button type="button" className={ICON_BUTTON} disabled={!color} aria-label={t('Text color')} title={t('Text color')} data-control="color">
              <span className="eb:relative eb:inline-flex">
                <Baseline aria-hidden="true" />
                <span className="eb:absolute eb:inset-x-0.5 eb:-bottom-0.5 eb:h-1 eb:rounded-sm" style={{ backgroundColor: valueOf('color') || 'currentColor' }} aria-hidden="true" />
              </span>
            </button>
          }
        />
        <DropdownMenu modal={false}>
          <Tip label={t('Capitals')}>
            <DropdownMenuTrigger asChild disabled={!capitals}>
              <button type="button" className={ICON_BUTTON} aria-label={t('Capitals')} data-control="text-transform">
                <CaseSensitive aria-hidden="true" />
                <ChevronDown className="eb:size-3! eb:text-foreground-muted" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
          </Tip>
          <DropdownMenuContent align="start" aria-label={t('Capitals')} onCloseAutoFocus={(event) => event.preventDefault()}>
            {capitals?.options?.map((option) => (
              <DropdownMenuItem key={option.value} onSelect={() => set('text-transform', option.value)} className="eb:min-w-36">
                <Check className={cn('eb:size-3.5', valueOf('text-transform') !== option.value && 'eb:invisible')} aria-hidden="true" />
                {t(option.label)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Separator />
        <LinkButton disabled={!words} href={format.link || ''} variables={variables} onApply={(href) => run('link', href)} />
        <Tip label={t('Remove the link')}>
          <button type="button" className={ICON_BUTTON} disabled={!words || !format.link} aria-label={t('Remove the link')} data-command="unlink" onClick={() => run('unlink')}>
            <Unlink aria-hidden="true" />
          </button>
        </Tip>
        <Separator />
        <Tip label={t('Clear formatting')}>
          <button type="button" className={ICON_BUTTON} disabled={!words} aria-label={t('Clear formatting')} data-command="clear" onClick={() => run('clear')}>
            <RemoveFormatting aria-hidden="true" />
          </button>
        </Tip>
        <Separator />

        <SizeField property={size} value={currentSize} onCommit={(n) => set('font-size', `${clamp(n, size)}px`)} />

        <DropdownMenu modal={false}>
          <Tip label={t('Line height')}>
            <DropdownMenuTrigger asChild disabled={!lineHeight}>
              <button type="button" className={ICON_BUTTON} aria-label={t('Line height')} data-control="line-height">
                <LineSpacingIcon aria-hidden="true" />
                <ChevronDown className="eb:size-3! eb:text-foreground-muted" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
          </Tip>
          <DropdownMenuContent align="start" aria-label={t('Line height')} onCloseAutoFocus={(event) => event.preventDefault()}>
            {lineHeight &&
              LINE_HEIGHTS.map((ratio) => {
                const px = clamp(Math.round((currentSize || 15) * ratio), lineHeight);
                const current = currentLine !== null && Math.round(currentLine) === px;
                return (
                  <DropdownMenuItem key={ratio} onSelect={() => set('line-height', `${px}px`)} className="eb:min-w-36">
                    <Check className={cn('eb:size-3.5', !current && 'eb:invisible')} aria-hidden="true" />
                    <span className="eb:tabular-nums">{number.format(ratio)}</span>
                    <span className="eb:ml-auto eb:text-[12px] eb:tabular-nums eb:text-foreground-muted">{px} px</span>
                  </DropdownMenuItem>
                );
              })}
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator />

        <div role="radiogroup" aria-label={t('Alignment')} className="eb:flex eb:items-center eb:gap-0.5">
          {ALIGNMENTS.map(({ value, icon: Icon, label }) => {
            const offered = Boolean(align?.options?.some((option) => option.value === value));
            return (
              <Tip key={value} label={t(label)}>
                <button
                  type="button"
                  role="radio"
                  className={ICON_BUTTON}
                  disabled={!offered}
                  aria-label={t(label)}
                  aria-checked={offered && valueOf('align') === value}
                  onClick={() => valueOf('align') !== value && set('align', value)}
                >
                  <Icon aria-hidden="true" />
                </button>
              </Tip>
            );
          })}
        </div>
      </div>

      {drawers.length > 0 && (
        <div className="eb:flex eb:h-full eb:shrink-0 eb:items-center eb:gap-0.5 eb:px-1.5">
          {drawers.map(({ id, icon: Icon, label, title }) => (
            <Tip key={id} label={t(title || label)}>
              <button
                type="button"
                className={cn(ICON_BUTTON, 'eb:text-[12px] eb:font-medium eb:@min-[50rem]:px-2')}
                aria-label={t(label)}
                aria-pressed={openDrawer === id}
                aria-controls={openDrawer === id ? `eb-drawer-${id}` : undefined}
                data-drawer={id}
                onClick={() => onToggleDrawer(id)}
              >
                <Icon aria-hidden="true" />
                {/* Its name, where the ribbon has the room. */}
                <span className="eb:hidden eb:@min-[50rem]:inline">{t(label)}</span>
              </button>
            </Tip>
          ))}
        </div>
      )}
    </div>
  );
}

/** The font size: typed, or picked from the usual ones. */
function SizeField({ property, value, onCommit }) {
  const { t } = useUi();
  const shown = value === null ? '' : String(Math.round(value * 100) / 100);
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown]);
  const commit = () => {
    const n = Number.parseFloat(draft);
    if (Number.isFinite(n) && n !== value) onCommit(n);
    else setDraft(shown);
  };
  const disabled = !property;
  const sizes = property ? SIZES.filter((n) => n >= (property.min ?? 0) && n <= (property.max ?? Infinity)) : [];
  return (
    <DropdownMenu modal={false}>
      <Tip label={t('Font size')}>
        <div
          className={cn(
            'eb:flex eb:h-7 eb:items-center eb:rounded-lg2 eb:border eb:border-border eb:bg-background eb:transition-colors eb:focus-within:border-ring',
            disabled && 'eb:opacity-40'
          )}
        >
          <input
            type="text"
            inputMode="numeric"
            className="eb:h-full eb:w-9 eb:bg-transparent eb:pl-2 eb:text-[12px] eb:tabular-nums eb:text-foreground eb:outline-none eb:disabled:cursor-default"
            aria-label={t('Font size')}
            data-control="font-size"
            disabled={disabled}
            value={disabled ? '' : draft}
            onChange={(event) => setDraft(event.target.value.replace(/[^\d.]/g, ''))}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit();
              if (event.key === 'Escape') setDraft(shown);
            }}
          />
          <DropdownMenuTrigger asChild disabled={disabled}>
            <button
              type="button"
              aria-label={t('Font sizes')}
              className="eb:grid eb:h-full eb:w-5 eb:place-items-center eb:rounded-r-lg2 eb:text-foreground-muted eb:outline-none eb:hover:bg-surface-200 eb:focus-visible:ring-2 eb:focus-visible:ring-ring/50 eb:disabled:pointer-events-none"
            >
              <ChevronDown className="eb:size-3" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
        </div>
      </Tip>
      <DropdownMenuContent align="start" aria-label={t('Font size')} className="eb:max-h-72 eb:min-w-20" onCloseAutoFocus={(event) => event.preventDefault()}>
        {sizes.map((n) => (
          <DropdownMenuItem key={n} onSelect={() => onCommit(n)} className="eb:tabular-nums">
            <Check className={cn('eb:size-3.5', n !== value && 'eb:invisible')} aria-hidden="true" />
            {n}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The link of the words: its address, typed in a small window under the
 * button, or a variable put in it (`{{ unsubscribe }}`) from the `{ }` in the field.
 */
function LinkButton({ disabled, href, variables, onApply }) {
  const { t } = useUi();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(href);
        setOpen(next);
      }}
    >
      <Tip label={t('Link')}>
        <PopoverTrigger asChild disabled={disabled}>
          <button type="button" className={ICON_BUTTON} aria-label={t('Link')} aria-pressed={Boolean(href)} data-command="link">
            <Link aria-hidden="true" />
          </button>
        </PopoverTrigger>
      </Tip>
      <PopoverContent align="start" className="eb:w-80 eb:p-2" onCloseAutoFocus={(event) => event.preventDefault()}>
        <form
          className="eb:flex eb:items-center eb:gap-1.5"
          // "example.com" is taken too: the canvas adds its https://.
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            setOpen(false);
            if (draft.trim()) onApply(draft.trim());
          }}
        >
          <div className="eb:relative eb:min-w-0 eb:flex-1">
            <Input ref={inputRef} type="url" autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="https://" aria-label={t('Link URL')} className={variables.length ? 'eb:pr-8' : ''} />
            {variables.length > 0 && (
              <span className="eb:absolute eb:top-1/2 eb:right-0.5 eb:-translate-y-1/2">
                <VariableInsertButton variables={variables} inputRef={inputRef} value={draft} onChange={setDraft} label={t('Insert a variable in the link')} links />
              </span>
            )}
          </div>
          <Button type="submit" size="icon-dense" variant="outline" aria-label={t('Apply the link')} disabled={!draft.trim()}>
            <Check />
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
