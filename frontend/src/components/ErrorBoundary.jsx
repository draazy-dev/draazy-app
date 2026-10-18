import { Component, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from './Icon.jsx';
import { useConnectivity } from '../hooks/useConnectivity.js';
import { reportError } from '../lib/errorReporter.js';
import { reloadOnceForStaleShell, updateWorkerThenReload } from '../lib/seamErrors.js';

/* Catches a render error so a broken route shows a recoverable card, not a white screen. `resetKey` (the
   pathname, in layouts) clears it on navigation; the shown reference matches the admin Error Log row. */

const CHUNK_LOAD_ERROR = /dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError/i;

/* A rejected `React.lazy` stays rejected, so re-rendering cannot recover it — only a reload can. Online, that
   is almost always a deploy that deleted the chunk an old cached shell names, so it reloads once by itself. */
function ChunkLoadFallback({ reference }) {
  const { t } = useTranslation();
  const { status } = useConnectivity();
  const offline = status === 'offline';

  useEffect(() => {
    if (!offline) {
      reloadOnceForStaleShell();
      return undefined;
    }
    const reload = () => window.location.reload();
    window.addEventListener('online', reload);
    return () => window.removeEventListener('online', reload);
  }, [offline]);

  return (
    <div className="mx-auto max-w-lg px-4 py-16 sm:py-24" data-testid="error-boundary">
      <div className="glass-card rounded-2xl p-6 flex flex-col items-center text-center gap-3" role="status">
        <Icon name="alert-triangle" className="w-8 h-8 text-amber-400" />
        <h1 className="text-lg font-bold text-white">
          {offline ? t('common.errorBoundary.offlineTitle') : t('common.errorBoundary.chunkTitle')}
        </h1>
        <p className="text-gray-300 text-sm leading-relaxed">
          {offline ? t('common.errorBoundary.offlineBody') : t('common.errorBoundary.chunkBody')}
        </p>
        <button
          type="button"
          onClick={updateWorkerThenReload}
          disabled={offline}
          className="dz-control dz-control--action px-4 gap-1.5 mt-1 disabled:opacity-50"
        >
          <Icon name="refresh-cw" className="w-4 h-4" /> {t('common.errorBoundary.tryAgain')}
        </button>
        <p className="text-[11px] text-gray-500 mt-2 break-all">{t('common.errorBoundary.reference', { ref: reference })}</p>
      </div>
    </div>
  );
}

function ErrorFallback({ error, reference, scope, onRetry }) {
  const { t } = useTranslation();
  const atRoot = scope === 'app';
  if (CHUNK_LOAD_ERROR.test(error?.message || '')) return <ChunkLoadFallback reference={reference} />;
  return (
    <div className="mx-auto max-w-lg px-4 py-16 sm:py-24" data-testid="error-boundary">
      <div className="glass-card rounded-2xl p-6 flex flex-col items-center text-center gap-3">
        <Icon name="alert-triangle" className="w-8 h-8 text-amber-400" />
        <h1 className="text-lg font-bold text-white">{t('common.errorBoundary.title')}</h1>
        <p className="text-gray-300 text-sm leading-relaxed">
          {atRoot ? t('common.errorBoundary.bodyApp') : t('common.errorBoundary.bodyRoute')}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
          {/* Re-render first for transient failures; reload is offered too because a stale lazy
              chunk after a deploy cannot be fixed by re-rendering the same broken module. */}
          <button type="button" onClick={onRetry} className="dz-control dz-control--action px-4 gap-1.5">
            <Icon name="refresh-cw" className="w-4 h-4" /> {t('common.errorBoundary.tryAgain')}
          </button>
          <button type="button" onClick={() => window.location.reload()} className="dz-control px-4 gap-1.5">
            {t('common.errorBoundary.reload')}
          </button>
          {/* A plain anchor: the root boundary sits outside the router. */}
          {atRoot ? <a href="/" className="dz-control px-4 gap-1.5">{t('common.errorBoundary.goHome')}</a> : null}
        </div>
        {/* Quotable: ties this screen to the console line and to the server error log. */}
        <p className="text-[11px] text-gray-500 mt-2 break-all">
          {t('common.errorBoundary.reference', { ref: reference })}
          {error?.message ? <> · <code className="text-gray-400">{String(error.message).slice(0, 160)}</code></> : null}
        </p>
      </div>
    </div>
  );
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, reference: '', resetKey: props.resetKey };
    this.retry = this.retry.bind(this);
  }

  /* A route change clears the error, or the fallback would stay mounted over every later navigation. */
  static getDerivedStateFromProps(props, state) {
    if (props.resetKey !== state.resetKey) return { error: null, reference: '', resetKey: props.resetKey };
    return null;
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    const scope = this.props.scope || 'unknown';
    const reference = reportError({ kind: 'render', scope, error, componentStack: info?.componentStack });
    /* Always logged: a boundary that says nothing is a worse outage than the blank page. */
    console.error(
      `[error-boundary] ${this.props.scope || 'unknown'} caught a render error (ref ${reference})`,
      {
        scope: this.props.scope || 'unknown',
        path: typeof window !== 'undefined' ? window.location.pathname + window.location.search : '',
        reference,
        message: error?.message,
      },
      error,
      info?.componentStack,
    );
    this.setState({ reference });
  }

  retry() {
    this.setState({ error: null, reference: '' });
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <ErrorFallback
          error={this.state.error}
          reference={this.state.reference}
          scope={this.props.scope}
          onRetry={this.retry}
        />
      );
    }
    return this.props.children;
  }
}
