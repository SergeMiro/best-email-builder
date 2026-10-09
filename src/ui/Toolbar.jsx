import { Button } from './primitives/button.jsx';
import { Separator } from './primitives/misc.jsx';
import { Tabs, TabsList, TabsTrigger } from './primitives/misc.jsx';
import { TooltipWrap } from './primitives/misc.jsx';
import { TruncatedText as FadedText } from './primitives/misc.jsx';
import { ArrowLeft, Monitor, Redo2, Smartphone, Undo2 } from 'lucide-react';
import { useT } from './context.jsx';

/**
 * Builder toolbar.
 *
 *   left:   back, template name and its status;
 *   center: undo / redo, device (desktop, mobile);
 *   right:  actions provided by the host screen (`actions`: variables,
 *           preview, test, save - each one comes from its feature).
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
}) {
  const t = useT();
  return (
    <div className="eb:flex eb:h-12 eb:shrink-0 eb:items-center eb:gap-3 eb:border-b eb:border-border eb:px-3">
      <Button variant="ghost" size="sm-compact" onClick={onBack}>
        <ArrowLeft />
        {t('Back')}
      </Button>
      <Separator orientation="vertical" className="eb:h-5" />
      <div className="eb:min-w-0 eb:max-w-[320px] eb:flex-1">
        <p className="eb:text-[13px] eb:font-medium eb:text-foreground">
          <FadedText>{title || t('New template')}</FadedText>
        </p>
        <p className="eb:text-[11px] eb:text-foreground-muted" role="status" aria-live="polite">
          {status}
        </p>
      </div>

      <div className="eb:flex eb:items-center eb:gap-2">
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
            <TabsTrigger value="desktop" disabled={!ready}>
              <Monitor />
              {t('Desktop')}
            </TabsTrigger>
            <TabsTrigger value="mobile" disabled={!ready}>
              <Smartphone />
              {t('Mobile')}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="eb:ml-auto eb:flex eb:items-center eb:gap-2">{actions}</div>
    </div>
  );
}
