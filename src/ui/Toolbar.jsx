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
    <div className="mb:flex mb:h-12 mb:shrink-0 mb:items-center mb:gap-3 mb:border-b mb:border-border mb:px-3">
      <Button variant="ghost" size="sm-compact" onClick={onBack}>
        <ArrowLeft />
        {t('Back')}
      </Button>
      <Separator orientation="vertical" className="mb:h-5" />
      <div className="mb:min-w-0 mb:max-w-[320px] mb:flex-1">
        <p className="mb:text-[13px] mb:font-medium mb:text-foreground">
          <FadedText>{title || t('New template')}</FadedText>
        </p>
        <p className="mb:text-[11px] mb:text-foreground-muted" role="status" aria-live="polite">
          {status}
        </p>
      </div>

      <div className="mb:flex mb:items-center mb:gap-2">
        <div className="mb:flex mb:items-center mb:gap-0.5">
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

      <div className="mb:ml-auto mb:flex mb:items-center mb:gap-2">{actions}</div>
    </div>
  );
}
