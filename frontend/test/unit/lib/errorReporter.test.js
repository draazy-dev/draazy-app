import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/services/config.js', () => ({ API_BASE: 'https://api.test' }));
vi.mock('../../../src/services/http.js', () => ({
  lastBuildStamp: () => 'build-123',
  lastFailedTraceId: () => 'trace-9',
}));

let fetchMock;

async function load({ prod = true } = {}) {
  vi.resetModules();
  vi.stubEnv('PROD', prod);
  return import('../../../src/lib/errorReporter.js');
}

const err = (message, name = 'TypeError', line = 'at a (x.js:1:1)') => Object.assign(new Error(message), { name, stack: `${name}: ${message}\n    ${line}` });
const lastBody = () => JSON.parse(fetchMock.mock.calls.at(-1)[1].body);

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetchMock);
  let n = 0;
  vi.stubGlobal('crypto', { randomUUID: () => `ref-${++n}` });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('reportError', () => {
  it('posts a scrubbed payload with context and returns the reference', async () => {
    const { reportError } = await load();
    const ref = reportError({ kind: 'boundary', scope: 'Listings', error: err('bad for jane@x.com'), componentStack: 'in Foo' });
    expect(ref).toBe('ref-1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.test/client-errors');
    expect(init).toMatchObject({ method: 'POST', keepalive: true, credentials: 'include' });
    const body = lastBody();
    expect(body).toMatchObject({
      reference: 'ref-1', kind: 'boundary', scope: 'Listings', name: 'TypeError', message: 'bad for [email]', componentStack: 'in Foo',
      build: 'build-123', lastTraceId: 'trace-9', path: window.location.pathname,
    });
    expect(body.context).toMatchObject({ viewport: `${window.innerWidth}x${window.innerHeight}`, deployEnv: 'prod' });
    expect(body.stack).toContain('TypeError: bad for [email]');
  });

  it('dedupes identical errors to the same reference without re-posting', async () => {
    const { reportError } = await load();
    const a = reportError({ kind: 'e', error: err('same') });
    const b = reportError({ kind: 'e', error: err('same') });
    expect(b).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops posting after ten distinct errors but still returns a reference', async () => {
    const { reportError } = await load();
    for (let i = 0; i < 10; i += 1) reportError({ kind: 'e', error: err(`m${i}`) });
    expect(fetchMock).toHaveBeenCalledTimes(10);
    const ref = reportError({ kind: 'e', error: err('m11') });
    expect(ref).toMatch(/^ref-/);
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it('accepts string errors and missing details', async () => {
    const { reportError } = await load();
    reportError({ kind: 'e', error: 'plain failure' });
    expect(lastBody()).toMatchObject({ name: 'Error', message: 'plain failure', stack: '', scope: '' });
  });

  it('only records a reference outside production', async () => {
    const { reportError } = await load({ prod: false });
    expect(reportError({ kind: 'e', error: err('dev') })).toBe('ref-1');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('builds a fallback reference without crypto.randomUUID', async () => {
    const { reportError } = await load();
    vi.stubGlobal('crypto', {});
    expect(reportError({ kind: 'e', error: err('nocrypto') })).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
  });

  it('ignores a failing network call', async () => {
    const { reportError } = await load();
    fetchMock.mockRejectedValue(new Error('offline'));
    expect(() => reportError({ kind: 'e', error: err('net') })).not.toThrow();
    await Promise.resolve();
  });

  it('re-exports scrub', async () => {
    const { scrub } = await load();
    expect(scrub('a@b.co')).toBe('[email]');
  });
});

describe('installGlobalErrorHandlers', () => {
  const fire = (type, init) => {
    const ev = new Event(type);
    Object.assign(ev, init);
    window.dispatchEvent(ev);
  };
  let added;

  beforeEach(() => {
    added = [];
    const orig = window.addEventListener.bind(window);
    vi.spyOn(window, 'addEventListener').mockImplementation((t, h, o) => { added.push([t, h]); orig(t, h, o); });
  });
  afterEach(() => {
    added.forEach(([t, h]) => window.removeEventListener(t, h));
  });

  it('does nothing outside production', async () => {
    const { installGlobalErrorHandlers } = await load({ prod: false });
    installGlobalErrorHandlers();
    expect(added).toHaveLength(0);
  });

  it('installs once and reports window errors', async () => {
    const { installGlobalErrorHandlers } = await load();
    installGlobalErrorHandlers();
    installGlobalErrorHandlers();
    expect(added.map(([t]) => t)).toEqual(['error', 'unhandledrejection']);
    fire('error', { error: err('window boom'), message: 'window boom', filename: 'app.js' });
    expect(lastBody()).toMatchObject({ kind: 'error', scope: 'window', message: 'window boom' });
  });

  it('wraps errors that carry only a message', async () => {
    const { installGlobalErrorHandlers } = await load();
    installGlobalErrorHandlers();
    fire('error', { error: null, message: 'cross' });
    expect(lastBody()).toMatchObject({ name: 'Error', message: 'cross' });
  });

  it('drops opaque script errors and browser-extension noise', async () => {
    const { installGlobalErrorHandlers } = await load();
    installGlobalErrorHandlers();
    fire('error', { error: null, message: 'Script error.' });
    fire('error', { error: null, message: 'ResizeObserver loop completed with undelivered notifications.' });
    fire('error', { error: null, message: 'x', filename: 'chrome-extension://abc/inject.js' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports unhandled rejections for Errors and for plain reasons', async () => {
    const { installGlobalErrorHandlers } = await load();
    installGlobalErrorHandlers();
    fire('unhandledrejection', { reason: err('rejected') });
    expect(lastBody()).toMatchObject({ kind: 'unhandledrejection', message: 'rejected' });
    fire('unhandledrejection', { reason: { message: 'obj reason' } });
    expect(lastBody()).toMatchObject({ name: 'UnhandledRejection', message: 'obj reason' });
    fire('unhandledrejection', { reason: 'string reason' });
    expect(lastBody()).toMatchObject({ name: 'UnhandledRejection', message: 'string reason' });
  });

  it('skips rejections whose stack is extension noise', async () => {
    const { installGlobalErrorHandlers } = await load();
    installGlobalErrorHandlers();
    fire('unhandledrejection', { reason: { stack: 'at moz-extension://x/y.js', message: 'q' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
