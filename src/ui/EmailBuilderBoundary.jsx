import { Component } from 'react';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from './primitives/button.jsx';

/**
 * Guard around the builder: a LOADING failure must not take the page down.
 *
 * Applications usually load the builder lazily (engine + MJML are heavy). Its
 * chunk may not arrive: slow server, or a new version deployed while the page
 * was open (the old chunk no longer exists). Without this guard the error
 * reaches the framework — a blank "Application error" page.
 *
 * Retry: missing chunk → reload the page (the loader caches the failure);
 * any other failure → mount the builder again.
 *
 *   <EmailBuilderBoundary onClose={…} t={…}>
 *     <LazyEmailBuilder … />
 *   </EmailBuilderBoundary>
 *
 * `t`: translator for its three strings (class component: no hooks).
 */

const isChunkError = (error) =>
  error?.name === 'ChunkLoadError' || /Loading (CSS )?chunk .* failed/i.test(String(error?.message || ''));

const english = (text) => text;

export default class EmailBuilderBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, attempt: 0 };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.warn('[mailblocks] the builder could not load', error);
  }

  retry = () => {
    if (isChunkError(this.state.error)) {
      window.location.reload();
      return;
    }
    this.setState((s) => ({ error: null, attempt: s.attempt + 1 }));
  };

  render() {
    const { error, attempt } = this.state;
    const t = this.props.t || english;
    if (!error) {
      return (
        <div key={attempt} style={{ height: '100%' }}>
          {this.props.children}
        </div>
      );
    }
    return (
      <div
        role="alert"
        className="mb-root mb:flex mb:h-full mb:flex-col mb:items-center mb:justify-center mb:gap-3 mb:p-6 mb:text-center"
      >
        <AlertTriangle className="mb:size-6 mb:text-destructive" aria-hidden="true" />
        <p className="mb:text-[13px] mb:text-foreground">{t('The builder could not load.')}</p>
        <div className="mb:flex mb:gap-2">
          {this.props.onClose && (
            <Button variant="outline" size="sm" onClick={this.props.onClose}>
              <ArrowLeft />
              {t('Back')}
            </Button>
          )}
          <Button size="sm" onClick={this.retry}>
            <RefreshCw />
            {t('Retry')}
          </Button>
        </div>
      </div>
    );
  }
}
