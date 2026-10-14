import { API_BASE } from '../services/config.js';
import { lastBuildStamp, lastFailedTraceId } from '../services/http.js';
import { scrub, uaFamily } from './errorScrub.js';

export { scrub };

const MAX_REPORTS = 10;
const seen = new Map();
const noise = (...parts) => parts.some((p) => /ResizeObserver loop|(?:chrome|moz|safari)-extension:\/\//.test(String(p ?? '')));
const newReference = () => crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// Dev builds only mint the reference; sandbox and prod builds also send the scrubbed report.
export function reportError({ kind, scope, error, componentStack }) {
  const name = String(error?.name ?? 'Error');
  const message = String(error?.message ?? error ?? '');
  const stack = typeof error?.stack === 'string' ? error.stack : '';
  const key = `${name}|${message}|${stack.split('\n')[1] ?? ''}`;
  const known = seen.get(key);
  if (known) return known;
  const reference = newReference();
  if (seen.size >= MAX_REPORTS) return reference;
  seen.set(key, reference);
  if (!import.meta.env.PROD) return reference;
  const payload = {
    reference,
    kind,
    scope: scrub(String(scope ?? ''), 100),
    path: scrub(window.location.pathname, 300),
    name: scrub(name, 100),
    message: scrub(message),
    stack: scrub(stack, 8000),
    componentStack: scrub(componentStack, 4000),
    build: lastBuildStamp(),
    lastTraceId: lastFailedTraceId(),
    context: {
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      online: navigator.onLine,
      deployEnv: import.meta.env.VITE_DEPLOY_ENV || 'prod',
      userAgent: uaFamily(navigator.userAgent),
    },
  };
  fetch(`${API_BASE}/client-errors`, {
    method: 'POST',
    keepalive: true,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
  return reference;
}

let installed = false;

export function installGlobalErrorHandlers() {
  if (installed || !import.meta.env.PROD) return;
  installed = true;
  window.addEventListener('error', ({ error, message, filename }) => {
    if (noise(message, filename, error?.stack) || (message === 'Script error.' && !error)) return;
    reportError({ kind: 'error', scope: 'window', error: error ?? { name: 'Error', message } });
  });
  window.addEventListener('unhandledrejection', ({ reason }) => {
    if (noise(reason?.stack)) return;
    const error = reason instanceof Error ? reason : { name: 'UnhandledRejection', message: reason?.message ?? reason };
    reportError({ kind: 'unhandledrejection', scope: 'window', error });
  });
}
