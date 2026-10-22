import { useEffect, useState } from 'react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Popover, PopoverContent, PopoverTrigger } from './primitives/overlays.jsx';

/**
 * TEXT RIBBON — the bar above the canvas, always open, as in a word
 * processor.
 *
 *   the words of a text: bold, italic, underline, strikethrough, link,
 *     remove the link, clear formatting — on the selection of the text being
 *     edited, or on the whole text when it is only selected;
 *   the element: size, line height, weight and alignment — on the selected
 *     text or button, wherever its block has them;
 *   at its end, the buttons of the feature panels (emojis, variables): each
 *     opens its panel beside the canvas.
 *
 * Every button names itself in a tooltip. Nothing here takes the focus from
 * the text being edited: its caret stays where it was.
 */

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

const clamp = (n, property) => Math.min(property.max ?? n, Math.max(property.min ?? n, n));

const ICON_BUTTON =
  'eb:inline-flex eb:h-7 eb:min-w-7 eb:items-center eb:justify-center eb:gap-1 eb:rounded-md eb:px-1.5 eb:text-foreground-lighter eb:outline-none eb:transition-colors eb:hover:bg-surface-200 eb:hover:text-foreground eb:focus-visible:ring-2 eb:focus-visible:ring-ring/50 eb:disabled:pointer-events-none eb:disabled:opacity-40 eb:aria-pressed:bg-primary/10 eb:aria-pressed:text-primary eb:aria-checked:bg-primary/10 eb:aria-checked:text-primary eb:data-[state=open]:bg-surface-200 eb:[&_svg]:size-4 eb:[&_svg]:shrink-0';

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
 *   drawers: {id: string, icon: any, label: string, title?: string}[],
 *   openDrawer: string|null,
 *   onToggleDrawer: (id: string) => void,
 * }} props
 */
export default function TextRibbon({ editor, ready, selection, format, drawers, openDrawer, onToggleDrawer }) {
  const { t, locale } = useUi();
  const element = ready && selection && !selection.multiple ? selection : null;
  const block = element?.blockId ? editor.getBlock(element.blockId) : null;
  /** The selected element's property, when its block has one. @param {string} key */
  const propertyOf = (key) => block?.properties?.find((property) => property.key === key) || null;
  const valueOf = (key) => element?.values?.[key] || element?.defaults?.[key] || '';
  const set = (key, value) => element && editor.updateProperties({ [key]: value }, element.id);

  // Words can be formatted in a text: the one being edited, or a selected one.
  const words = ready && (format.editing || element?.tagName === 'mj-text');
  const run = (command, value) => editor.formatText(command, value);

  const size = propertyOf('font-size');
  const lineHeight = propertyOf('line-height');
  const weight = propertyOf('font-weight');
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
        {FORMATS.map(({ command, icon: Icon, label }) => (
          <Tip key={command} label={t(label)}>
            <button
              type="button"
              className={ICON_BUTTON}
              disabled={!words}
              aria-label={t(label)}
              aria-pressed={Boolean(format[command])}
              data-command={command}
              onClick={() => run(command)}
            >
              <Icon aria-hidden="true" />
            </button>
          </Tip>
        ))}
        <Separator />
        <LinkButton disabled={!words} href={format.link || ''} onApply={(href) => run('link', href)} />
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

        <DropdownMenu modal={false}>
          <Tip label={t('Weight')}>
            <DropdownMenuTrigger asChild disabled={!weight}>
              <button type="button" className={cn(ICON_BUTTON, 'eb:min-w-20 eb:justify-between eb:text-[12px]')} aria-label={t('Weight')} data-control="font-weight">
                <span className="eb:truncate">
                  {weight ? t(weight.options?.find((option) => option.value === valueOf('font-weight'))?.label || 'Normal') : t('Weight')}
                </span>
                <ChevronDown className="eb:size-3! eb:text-foreground-muted" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
          </Tip>
          <DropdownMenuContent align="start" aria-label={t('Weight')} onCloseAutoFocus={(event) => event.preventDefault()}>
            {(weight?.options || []).map((option) => (
              <DropdownMenuItem key={option.value} onSelect={() => set('font-weight', option.value)}>
                <Check className={cn('eb:size-3.5', option.value !== valueOf('font-weight') && 'eb:invisible')} aria-hidden="true" />
                <span className={option.value === 'bold' ? 'eb:font-bold' : undefined}>{t(option.label)}</span>
              </DropdownMenuItem>
            ))}
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
        <div className="eb:flex eb:h-full eb:shrink-0 eb:items-center eb:gap-0.5 eb:border-l eb:border-border eb:px-1.5">
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
            'eb:flex eb:h-7 eb:items-center eb:rounded-md eb:border eb:border-border eb:bg-background eb:transition-colors eb:focus-within:border-ring',
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
              className="eb:grid eb:h-full eb:w-5 eb:place-items-center eb:rounded-r-md eb:text-foreground-muted eb:outline-none eb:hover:bg-surface-200 eb:focus-visible:ring-2 eb:focus-visible:ring-ring/50 eb:disabled:pointer-events-none"
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

/** The link of the words: its address, typed in a small window under the button. */
function LinkButton({ disabled, href, onApply }) {
  const { t } = useUi();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
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
          onSubmit={(event) => {
            event.preventDefault();
            setOpen(false);
            if (draft.trim()) onApply(draft.trim());
          }}
        >
          <Input type="url" dense autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="https://" aria-label={t('Link URL')} />
          <Button type="submit" size="icon-dense" variant="outline" aria-label={t('Apply the link')} disabled={!draft.trim()}>
            <Check />
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
