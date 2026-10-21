import { useMemo, useRef } from 'react';
import { Button } from './primitives/button.jsx';
import { Input } from './primitives/fields.jsx';
import { Label } from './primitives/fields.jsx';
import { Textarea } from './primitives/fields.jsx';
import { SectionLabel } from './primitives/misc.jsx';
import { TruncatedText as FadedText } from './primitives/misc.jsx';
import { Trash2, X } from 'lucide-react';
import { GROUPS } from '../blocks/shared.js';
import { PropertyField } from './fields.jsx';
import { useT } from './context.jsx';
import VariableInsertButton from '../features/variables/VariableInsertButton.jsx';

/**
 * Properties panel, right of the canvas.
 *
 *   an element is selected -> its properties, by group (those of its block in
 *     the registry); a button or a menu link also gets its label here;
 *   nothing is selected    -> the TEMPLATE (name, subject, preview text) and
 *     the page (background, width), i.e. the email body.
 *
 * Moving, duplicating and deleting the element are on the canvas, in the
 * toolbar of its selection frame (and Del); every block selected (Ctrl+A) has
 * no frame of its own, so the panel keeps its Delete. `ai` (the AI module, `createAi`):
 * with its `rewrite`, a text or a button also gets "Rewrite with AI"; with its
 * `suggestSubjects`, the subject gets "Suggest subjects". `onDismiss`: the
 * panel is shown in a drawer — its header button closes the drawer rather
 * than deselecting.
 */

const GROUP_ORDER = Object.values(GROUPS);

/** A block's properties, grouped in panel order. */
function grouped(properties) {
  const map = new Map();
  for (const property of properties) {
    if (!map.has(property.group)) map.set(property.group, []);
    map.get(property.group).push(property);
  }
  return [...map.entries()].sort(
    ([a], [b]) =>
      (GROUP_ORDER.indexOf(a) + 1 || 99) - (GROUP_ORDER.indexOf(b) + 1 || 99)
  );
}

function PropertyGroups({ editor, element, block, idPrefix, services = null }) {
  const t = useT();
  return grouped(block?.properties || []).map(([group, properties]) => (
    <section key={group} className="eb:space-y-3">
      <SectionLabel>{t(group)}</SectionLabel>
      {properties.map((property) => (
        <PropertyField
          key={`${element.id}:${property.key}`}
          idPrefix={idPrefix}
          property={property}
          value={element.values[property.key]}
          fallback={element.defaults?.[property.key]}
          services={services}
          onCommit={(value) => editor.updateProperties({ [property.key]: value }, element.id)}
        />
      ))}
    </section>
  ));
}

const LABEL_PROPERTY = { key: 'content', label: 'Label', type: 'text', group: GROUPS.content };

/** Elements whose words the AI may rewrite: texts (headings included) and buttons. */
const REWRITABLE_TAGS = new Set(['mj-text', 'mj-button']);

function PanelHeader({ title, onClose, closeLabel = 'Deselect' }) {
  const t = useT();
  return (
    <header className="eb:sticky eb:top-0 eb:z-10 eb:flex eb:h-11 eb:shrink-0 eb:items-center eb:gap-2 eb:bg-background eb:px-4">
      <h3 className="eb:min-w-0 eb:flex-1 eb:text-[13px] eb:font-medium eb:text-foreground">
        <FadedText>{title}</FadedText>
      </h3>
      {onClose && (
        <Button variant="ghost" size="icon-sm-compact" onClick={onClose} aria-label={t(closeLabel)}>
          <X />
        </Button>
      )}
    </header>
  );
}

/** Nothing selected: the template and the page. */
function TemplateSettings({ editor, meta, onMetaChange, changes, showErrors, variables = null, ai = null, onDismiss = null }) {
  const t = useT();
  const subjectRef = useRef(null);
  const preheaderRef = useRef(null);
  const rootId = editor.getRootId();
  // `changes`: the page is re-read after every change (background, width).
  const root = useMemo(() => (rootId ? editor.getElement(rootId) : null), [editor, rootId, changes]); // eslint-disable-line react-hooks/exhaustive-deps
  const bodyBlock = root?.blockId ? editor.getBlock(root.blockId) : null;
  const field = (key) => (e) => onMetaChange({ ...meta, [key]: e.target.value });

  return (
    <>
      <PanelHeader title={t('Email')} onClose={onDismiss} closeLabel="Close" />
      <div className="eb:space-y-4 eb:p-4">
        <section className="eb:space-y-3">
          <SectionLabel>{t('Template')}</SectionLabel>
          <div className="eb:space-y-1">
            <Label htmlFor="eb-meta-name" className="eb:text-[12px] eb:font-normal eb:text-foreground-lighter">
              {t('Name')} <span className="eb:text-destructive">*</span>
            </Label>
            <Input
              id="eb-meta-name"
              maxLength={200}
              dense
              value={meta.name}
              onChange={field('name')}
              aria-invalid={(showErrors && !meta.name.trim()) || undefined}
            />
            {showErrors && !meta.name.trim() && (
              <p className="eb:text-[12px] eb:text-destructive">{t('Name is required')}</p>
            )}
          </div>
          <div className="eb:space-y-1">
            <div className="eb:flex eb:h-6 eb:items-center eb:justify-between">
              <Label htmlFor="eb-meta-subject" className="eb:text-[12px] eb:font-normal eb:text-foreground-lighter">
                {t('Subject')}
              </Label>
              {variables && (
                <VariableInsertButton
                  variables={variables}
                  inputRef={subjectRef}
                  value={meta.subject}
                  onChange={(subject) => onMetaChange({ ...meta, subject })}
                  label={t('Insert a variable in the subject')}
                />
              )}
            </div>
            <Input ref={subjectRef} id="eb-meta-subject" dense maxLength={250} value={meta.subject} onChange={field('subject')} />
            {ai?.suggestSubjects && (
              <ai.components.Subjects
                editor={editor}
                meta={meta}
                onSubject={(subject) => onMetaChange({ ...meta, subject })}
                suggest={ai.suggestSubjects}
                variables={variables}
              />
            )}
          </div>
          <div className="eb:space-y-1">
            <div className="eb:flex eb:h-6 eb:items-center eb:justify-between">
              <Label htmlFor="eb-meta-preheader" className="eb:text-[12px] eb:font-normal eb:text-foreground-lighter">
                {t('Preview text')}
              </Label>
              {variables && (
                <VariableInsertButton
                  variables={variables}
                  inputRef={preheaderRef}
                  value={meta.preheader}
                  onChange={(preheader) => onMetaChange({ ...meta, preheader })}
                  label={t('Insert a variable in the preview text')}
                />
              )}
            </div>
            <Textarea
              ref={preheaderRef}
              id="eb-meta-preheader"
              rows={2}
              dense
              maxLength={250}
              value={meta.preheader}
              onChange={field('preheader')}
              placeholder={t('Shown after the subject in the inbox')}
            />
          </div>
        </section>
        {root && bodyBlock && <PropertyGroups editor={editor} element={root} block={bodyBlock} idPrefix="eb-page" />}
      </div>
    </>
  );
}

export default function PropertiesPanel({
  editor,
  selection,
  meta,
  onMetaChange,
  changes,
  showErrors = false,
  services = null,
  ai = null,
  variables = null,
  onDismiss = null,
}) {
  const t = useT();
  const block = selection?.blockId ? editor.getBlock(selection.blockId) : null;

  return (
    <aside aria-label={t('Properties')} className="eb:min-h-0 eb:overflow-y-auto eb:border-l eb:border-border" data-testid="eb-properties">
      {!selection ? (
        <TemplateSettings
          editor={editor}
          meta={meta}
          onMetaChange={onMetaChange}
          changes={changes}
          showErrors={showErrors}
          variables={variables}
          ai={ai}
          onDismiss={onDismiss}
        />
      ) : (
        <>
          <PanelHeader
            title={t(selection.label)}
            onClose={onDismiss || (() => editor.select(null))}
            closeLabel={onDismiss ? 'Close' : 'Deselect'}
          />
          {selection.multiple ? (
            <div className="eb:space-y-3 eb:p-4">
              <p className="eb:text-[13px] eb:leading-relaxed eb:text-foreground-lighter" data-testid="eb-select-all">
                {t('{count} sections selected. Press Delete to remove them (Ctrl+Z brings them back).', {
                  count: selection.multiple,
                })}
              </p>
              <Button
                variant="outline"
                size="sm-compact"
                onClick={() => editor.remove(selection.id)}
                className="eb:hover:border-destructive/40 eb:hover:bg-destructive/10 eb:hover:text-destructive"
              >
                <Trash2 aria-hidden="true" />
                {t('Delete')}
              </Button>
            </div>
          ) : (
          <div className="eb:space-y-4 eb:p-4">
            {selection.content !== null && selection.content !== undefined && (
              <section className="eb:space-y-3">
                <SectionLabel>{t(GROUPS.content)}</SectionLabel>
                <PropertyField
                  key={`${selection.id}:content`}
                  idPrefix="eb-prop"
                  property={LABEL_PROPERTY}
                  value={selection.content || ''}
                  onCommit={(value) => editor.setContent(value || '', selection.id)}
                />
              </section>
            )}
            {selection.tagName === 'mj-text' && (
              <p className="eb:text-[12px] eb:text-foreground-muted">{t('Double-click the text to edit it.')}</p>
            )}
            {ai?.rewrite && REWRITABLE_TAGS.has(selection.tagName) && (
              <ai.components.Rewrite key={selection.id} editor={editor} selection={selection} rewrite={ai.rewrite} />
            )}
            <PropertyGroups editor={editor} element={selection} block={block} idPrefix="eb-prop" services={services} />
          </div>
          )}
        </>
      )}
    </aside>
  );
}
