import { Button } from './primitives/button.jsx';
import { Separator } from './primitives/misc.jsx';
import { Tabs, TabsList, TabsTrigger } from './primitives/misc.jsx';
import { TooltipWrap } from './primitives/misc.jsx';
import { TruncatedText as FadedText } from './primitives/misc.jsx';
import { ArrowLeft, Monitor, Redo2, Smartphone, Undo2 } from 'lucide-react';
import { cn } from './primitives/cn.js';
import { useT } from './context.jsx';

/**
 * Builder toolbar.
 *
 *   left:   back, template name and its status;
 *   center: undo / redo, device (desktop, mobile);
 *   right:  actions provided by the host screen (`actions`: variables,
 *           preview, test - each one comes from its feature), then `primary`
 *           (save).
 *
 * `compact` (builder narrower than its wide layout): two rows. The first keeps
 * what is always needed - back, name, save; the second holds history, device
 * and the feature actions, and scrolls sideways rather than overflow the page.
 */
export default function Toolbar({
  title,
  status,
  ready,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  device,
  onDeviceChange,
  onBack,
  actions = null,
  primary = null,
  compact = false,
}) {
  const t = useT();

  const identity = (
    <>
      <Button
        variant="ghost"
        size={compact ? 'icon-sm-compact' : 'sm-compact'}
        onClick={onBack}
        aria-label={compact ? t('Back') : undefined}
      >
        <ArrowLeft />
        {!compact && t('Back')}
      </Button>
      <Separator orientation="vertical" className="eb:h-5" />
      <div className={cn('eb:min-w-0 eb:flex-1', !compact && 'eb:max-w-[320px]')}>
        <p className="eb:text-[13px] eb:font-medium eb:text-foreground">
          <FadedText>{title || t('New template')}</FadedText>
        </p>
        <p className="eb:text-[11px] eb:text-foreground-muted" role="status" aria-live="polite">
          {status}
        </p>
      </div>
    </>
  );

  const editing = (
    <div className="eb:flex eb:shrink-0 eb:items-center eb:gap-2">
      <div className="eb:flex eb:items-center eb:gap-0.5">
        <TooltipWrap label={t('Undo (Ctrl+Z)')}>
          <Button variant="ghost" size="icon-sm-compact" onClick={onUndo} disabled={!ready || !canUndo} aria-label={t('Undo')}>
            <Undo2 />
          </Button>
        </TooltipWrap>
        <TooltipWrap label={t('Redo (Ctrl+Y)')}>
          <Button variant="ghost" size="icon-sm-compact" onClick={onRedo} disabled={!ready || !canRedo} aria-label={t('Redo')}>
            <Redo2 />
          </Button>
        </TooltipWrap>
      </div>
      <Tabs value={device} onValueChange={onDeviceChange}>
        <TabsList aria-label={t('Device')}>
          <TabsTrigger value="desktop" disabled={!ready} aria-label={compact ? t('Desktop') : undefined}>
            <Monitor />
            {!compact && t('Desktop')}
          </TabsTrigger>
          <TabsTrigger value="mobile" disabled={!ready} aria-label={compact ? t('Mobile') : undefined}>
            <Smartphone />
            {!compact && t('Mobile')}
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );

  if (compact) {
    return (
      <div className="eb:shrink-0 eb:border-b eb:border-border" data-layout="compact">
        <div className="eb:flex eb:h-12 eb:items-center eb:gap-2 eb:px-2">
          {identity}
          {primary}
        </div>
        <div className="eb:flex eb:items-center eb:gap-2 eb:overflow-x-auto eb:px-2 eb:pb-2" data-testid="eb-toolbar-actions">
          {editing}
          <Separator orientation="vertical" className="eb:h-5 eb:shrink-0" />
          <div className="eb:flex eb:shrink-0 eb:items-center eb:gap-2">{actions}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="eb:flex eb:h-12 eb:shrink-0 eb:items-center eb:gap-3 eb:border-b eb:border-border eb:px-3">
      {identity}
      {editing}
      <div className="eb:ml-auto eb:flex eb:items-center eb:gap-2" data-testid="eb-toolbar-actions">
        {actions}
        {primary}
      </div>
    </div>
  );
}
