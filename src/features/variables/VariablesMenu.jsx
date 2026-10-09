import { useState } from 'react';
import { Braces } from 'lucide-react';
import { useUi } from '../../ui/context.jsx';
import { Button } from '../../ui/primitives/button.jsx';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/primitives/overlays.jsx';
import { tokenOf } from './catalog.js';
import VariableDialog from './VariableDialog.jsx';
import VariablePicker from './VariablePicker.jsx';

/**
 * VARIABLES — toolbar menu.
 *
 * Inserts the variable's TAG where the user is typing (caret of the text being
 * edited), otherwise at the end of the selected text or button. The
 * unsubscribe link is inserted as a link (or becomes the button's URL). The
 * editor replaces nothing: rendering does, per recipient.
 *
 * When the storage supports it, users create, edit and delete their own
 * variables from here; they are shared by every template.
 *
 * The menu never takes the caret away from the text being edited: it does not
 * give focus back on close, and its mousedown does not reach the document —
 * any mousedown there ends the text editing.
 */
export default function VariablesMenu({ context }) {
  const { editor, ready, variables, storage, canManageVariables, reloadVariables } = context;
  const { t, notify } = useUi();
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState(null); // { variable } | { label }

  const insert = (variable) => {
    setOpen(false);
    const done =
      variable.kind === 'link'
        ? editor.insertLink(tokenOf(variable), t('Unsubscribe'))
        : editor.insertText(tokenOf(variable));
    if (!done) notify('info', t('Select a text or a button first.'));
    return done;
  };

  const manage = canManageVariables
    ? {
        onCreate: (label) => {
          setOpen(false);
          setDialog({ variable: null, label });
        },
        onEdit: (variable) => {
          setOpen(false);
          setDialog({ variable, label: '' });
        },
      }
    : {};

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm-compact"
            disabled={!ready}
            // No mousedown: the text being edited keeps its caret (the click still opens the menu).
            onPointerDown={(e) => e.pointerType === 'mouse' && e.preventDefault()}
          >
            <Braces />
            {t('Variables')}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="mb:w-80 mb:p-0"
          onCloseAutoFocus={(e) => e.preventDefault()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <VariablePicker variables={variables} onPick={insert} {...manage} />
        </PopoverContent>
      </Popover>
      {canManageVariables && (
        <VariableDialog
          open={Boolean(dialog)}
          onOpenChange={(next) => !next && setDialog(null)}
          variable={dialog?.variable || null}
          initialLabel={dialog?.label || ''}
          variables={variables}
          storage={storage}
          onSaved={async (variable, created) => {
            await reloadVariables();
            if (created) {
              // A text was being edited: the new variable goes at its caret.
              if (editor.insertText(tokenOf(variable))) {
                notify('success', t('Variable “{name}” created and inserted.', { name: variable.label }));
              } else {
                notify('success', t('Variable “{name}” created.', { name: variable.label }));
              }
            } else {
              notify('success', t('Variable “{name}” saved.', { name: variable.label }));
            }
          }}
          onDeleted={async () => {
            await reloadVariables();
            notify('success', t('Variable deleted.'));
          }}
        />
      )}
    </>
  );
}
