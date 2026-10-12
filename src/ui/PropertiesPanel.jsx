import { useMemo, useRef } from 'react';
import { Button } from './primitives/button.jsx';
import { Input } from './primitives/fields.jsx';
import { Label } from './primitives/fields.jsx';
import { Textarea } from './primitives/fields.jsx';
import { SectionLabel } from './primitives/misc.jsx';
import { TruncatedText as FadedText } from './primitives/misc.jsx';
import { X } from 'lucide-react';
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
 * `actions`: the element action bar (move, duplicate, delete), provided by
 * the host screen.
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
          services={services}
          onCommit={(value) => editor.updateProperties({ [property.key]: value }, element.id)}
        />
      ))}
    </section>
  ));
}

const LABEL_PROPERTY = { key: 'content', label: 'Label', type: 'text', group: GROUPS.content };

function PanelHeader({ title, onClose }) {
  const t = useT();
  return (
    <header className="eb:sticky eb:top-0 eb:z-10 eb:flex eb:h-11 eb:shrink-0 eb:items-center eb:gap-2 eb:border-b eb:border-border eb:bg-background eb:px-4">
      <h3 className="eb:min-w-0 eb:flex-1 eb:text-[13px] eb:font-medium eb:text-foreground">
        <FadedText>{title}</FadedText>
      </h3>
      {onClose && (
        <Button variant="ghost" size="icon-sm-compact" onClick={onClose} aria-label={t('Deselect')}>
          <X />
        </Button>
      )}
    </header>
  );
}

/** Nothing selected: the template and the page. */
function TemplateSettings({ editor, meta, onMetaChange, changes, showErrors, variables = null }) {
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
      <PanelHeader title={t('Email')} />
      <div className="eb:space-y-5 eb:p-4">
        <section className="eb:space-y-3">
          <SectionLabel>{t('Template')}</SectionLabel>
          <div className="eb:space-y-1.5">
            <Label htmlFor="eb-meta-name" className="eb:text-[12px] eb:font-normal eb:text-foreground-lighter">
              {t('Name')} <span className="eb:text-destructive">*</span>
            </Label>
            <Input
              id="eb-meta-name"
              maxLength={200}
              value={meta.name}
              onChange={field('name')}
              aria-invalid={(showErrors && !meta.name.trim()) || undefined}
            />
            {showErrors && !meta.name.trim() && (
              <p className="eb:text-[12px] eb:text-destructive">{t('Name is required')}</p>
            )}
          </div>
          <div className="eb:space-y-1.5">
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
            <Input ref={subjectRef} id="eb-meta-subject" maxLength={250} value={meta.subject} onChange={field('subject')} />
          </div>
          <div className="eb:space-y-1.5">
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
  actions = null,
  showErrors = false,
  services = null,
  variables = null,
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
        />
      ) : (
        <>
          <PanelHeader title={t(selection.label)} onClose={() => editor.select(null)} />
          {actions}
          <div className="eb:space-y-5 eb:p-4">
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
            <PropertyGroups editor={editor} element={selection} block={block} idPrefix="eb-prop" services={services} />
          </div>
        </>
      )}
    </aside>
  );
}
