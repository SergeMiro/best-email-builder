import { useState } from 'react';
import { Braces } from 'lucide-react';
import { Button } from '../../ui/primitives/button.jsx';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/primitives/overlays.jsx';
import { tokenOf } from './catalog.js';
import VariablePicker from './VariablePicker.jsx';

/**
 * `{ }` button next to a plain-text field (subject, preview text): inserts a
 * variable at the field's caret, or at its end.
 *
 * @param {{
 *   variables: import('./catalog.js').EmailVariable[],
 *   inputRef: {current: HTMLInputElement|HTMLTextAreaElement|null},
 *   value: string,
 *   onChange: (value: string) => void,
 *   label: string,
 * }} props
 */
export default function VariableInsertButton({ variables, inputRef, value, onChange, label }) {
  const [open, setOpen] = useState(false);

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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={label} title={label}>
          <Braces />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="eb:w-72 eb:p-0" onCloseAutoFocus={(e) => e.preventDefault()}>
        {/* Links have no meaning in a subject line. */}
        <VariablePicker variables={variables} onPick={insert} filter={(v) => v.kind !== 'link'} />
      </PopoverContent>
    </Popover>
  );
}
