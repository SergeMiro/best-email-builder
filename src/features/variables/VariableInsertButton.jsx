import { useId, useState } from 'react';
import { Braces } from 'lucide-react';
import { Button } from '../../ui/primitives/button.jsx';
import { Popover, PopoverAnchor, PopoverContent } from '../../ui/primitives/overlays.jsx';
import { tokenOf } from './catalog.js';
import VariablePicker from './VariablePicker.jsx';

/**
 * `{ }` button next to a plain-text field (subject, preview text, a link's
 * address): inserts a variable at the field's caret, or at its end. `links`:
 * the link variables offered too (an unsubscribe link has no meaning in a
 * subject line, it does as a link's address).
 *
 * @param {{
 *   variables: import('./catalog.js').EmailVariable[],
 *   inputRef: {current: HTMLInputElement|HTMLTextAreaElement|null},
 *   value: string,
 *   onChange: (value: string) => void,
 *   label: string,
 *   links?: boolean,
 * }} props
 */
export default function VariableInsertButton({ variables, inputRef, value, onChange, label, links = false }) {
  const [open, setOpen] = useState(false);
  const id = useId();

  const insert = (variable) => {
    const input = inputRef.current;
    const text = String(value || '');
    const token = tokenOf(variable);
    const start = input?.selectionStart ?? text.length;
    const end = input?.selectionEnd ?? text.length;
    const next = `${text.slice(0, start)}${token}${text.slice(end)}`;
    onChange(next);
    setOpen(false);
    // Caret right after the inserted tag.
    requestAnimationFrame(() => {
      if (!input) return;
      input.focus();
      input.setSelectionRange(start + token.length, start + token.length);
    });
  };

  // No PopoverTrigger: a trigger is an anchor too. Under StrictMode (and on
  // any remount of the button) its stale node won over the field, and the
  // list opened in the window's top-left corner. The field is the only anchor.
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Button
        data-eb-variable-insert={id}
        variant="ghost"
        size="icon-xs"
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Braces />
      </Button>
      {/* Under the field, its edges and width: not hanging off the small button. */}
      <PopoverAnchor virtualRef={inputRef} />
      <PopoverContent
        align="start"
        className="eb:w-(--radix-popover-trigger-width) eb:min-w-64 eb:p-0"
        onCloseAutoFocus={(e) => e.preventDefault()}
        // The button toggles: a press on it is not a click outside.
        onPointerDownOutside={(e) => {
          if (e.target instanceof Element && e.target.closest(`[data-eb-variable-insert="${id}"]`)) e.preventDefault();
        }}
      >
        <VariablePicker variables={variables} onPick={insert} filter={links ? undefined : (v) => v.kind !== 'link'} />
      </PopoverContent>
    </Popover>
  );
}
