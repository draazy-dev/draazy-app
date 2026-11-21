import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearBrowserState, installFetch, loadHttp, reply } from './helpers/httpHarness.js';

let fetchMock;
let auth;
let http;
let API_BASE;

const encoder = new TextEncoder();

function sse(...chunks) {
  const body = new ReadableStream({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(encoder.encode(c)));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

const collect = () => {
  const events = [];
  return { events, onEvent: (e) => events.push(e) };
};

beforeEach(async () => {
  clearBrowserState();
  fetchMock = installFetch();
  ({ auth, http, API_BASE } = await loadHttp());
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearBrowserState();
});

describe('openEventStream', () => {
  it('requests an event stream with credentials and the bearer token', async () => {
    auth.writeTokens({ accessToken: 'tok' });
    fetchMock.mockResolvedValue(sse());
    const ctrl = new AbortController();
    await http.openEventStream('/messages/stream', { signal: ctrl.signal });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE}/messages/stream`);
    expect(init).toMatchObject({ method: 'GET', credentials: 'include', signal: ctrl.signal });
    expect(init.headers).toEqual({ Accept: 'text/event-stream', Authorization: 'Bearer tok' });
  });

  it('parses named events, JSON and plain payloads, and multi-line data', async () => {
    fetchMock.mockResolvedValue(sse(
      'event: ping\ndata: {"a":1}\n\n',
      ': keep-alive\n',
      'data: line1\ndata: line2\r\n\r\n',
    ));
    const { events, onEvent } = collect();
    await expect(http.openEventStream('/s', { onEvent })).resolves.toBeNull();
    expect(events).toEqual([
      { type: 'ping', data: { a: 1 } },
      { type: 'message', data: 'line1\nline2' },
    ]);
  });

  it('reassembles an event split across chunks and flushes an unterminated tail', async () => {
    fetchMock.mockResolvedValue(sse('event: no', 'tice\ndata: {"x"', ':2}\n\ndata: tail'));
    const { events, onEvent } = collect();
    await http.openEventStream('/s', { onEvent });
    expect(events).toEqual([
      { type: 'notice', data: { x: 2 } },
      { type: 'message', data: 'tail' },
    ]);
  });

  it('defaults the event name, strips one leading space and ignores unknown fields', async () => {
    fetchMock.mockResolvedValue(sse('event:\nid: 7\ndata:  padded\n\nevent\ndata\n\n'));
    const { events, onEvent } = collect();
    await http.openEventStream('/s', { onEvent });
    expect(events).toEqual([
      { type: 'message', data: ' padded' },
      { type: 'message', data: '' },
    ]);
  });

  it('does not dispatch a blank event without data', async () => {
    fetchMock.mockResolvedValue(sse('event: ping\n\n'));
    const { events, onEvent } = collect();
    await http.openEventStream('/s', { onEvent });
    expect(events).toEqual([]);
  });

  it('signals open once and activity for every chunk', async () => {
    fetchMock.mockResolvedValue(sse('data: 1\n\n', 'data: 2\n\n', 'data: 3\n\n'));
    const onOpen = vi.fn();
    const onActivity = vi.fn();
    await http.openEventStream('/s', { onOpen, onActivity });
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onActivity).toHaveBeenCalledTimes(3);
  });

  it('opens but reads nothing when the response has no body', async () => {
    fetchMock.mockResolvedValue(reply(204));
    const onOpen = vi.fn();
    await expect(http.openEventStream('/s', { onOpen })).resolves.toBeNull();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('throws the mapped ApiError for a failed response', async () => {
    fetchMock.mockResolvedValue(reply(403, { error: 'forbidden', message: 'No' }));
    const onOpen = vi.fn();
    await expect(http.openEventStream('/s', { onOpen })).rejects.toMatchObject({ status: 403, code: 'forbidden' });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('refreshes the token on 401 and reconnects with it', async () => {
    auth.writeTokens({ accessToken: 'old' });
    fetchMock.mockImplementation(async (url) => {
      if (url.endsWith('/auth/refresh')) return reply(200, { accessToken: 'new' });
      return fetchMock.mock.calls.filter(([u]) => u.endsWith('/s')).length === 1 ? reply(401, {}) : sse('data: hi\n\n');
    });
    const { events, onEvent } = collect();
    await http.openEventStream('/s', { onEvent });
    expect(events).toEqual([{ type: 'message', data: 'hi' }]);
    const streamCalls = fetchMock.mock.calls.filter(([u]) => u.endsWith('/s'));
    expect(streamCalls[1][1].headers.Authorization).toBe('Bearer new');
  });

  it('ends the session and fails when the refresh is refused', async () => {
    auth.writeTokens({ accessToken: 'old' });
    const ended = vi.fn();
    globalThis.addEventListener(http.SESSION_ENDED_EVENT, ended);
    fetchMock.mockImplementation(async (url) => (url.endsWith('/auth/refresh') ? reply(401, {}) : reply(401, { error: 'expired' })));
    await expect(http.openEventStream('/s')).rejects.toMatchObject({ status: 401 });
    globalThis.removeEventListener(http.SESSION_ENDED_EVENT, ended);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(auth.readAccessToken()).toBeNull();
  });

  it('does not try to refresh a signed-out 401', async () => {
    fetchMock.mockResolvedValue(reply(401, { error: 'nope' }));
    await expect(http.openEventStream('/s')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('wraps connection failures and reports them, but lets aborts through', async () => {
    const observer = vi.fn();
    http.observeReachability(observer);
    fetchMock.mockRejectedValueOnce(new TypeError('down'));
    const err = await http.openEventStream('/s').catch((e) => e);
    expect(err).toBeInstanceOf(http.NetworkError);
    expect(observer).toHaveBeenLastCalledWith(err);
    const abort = new DOMException('x', 'AbortError');
    fetchMock.mockRejectedValueOnce(abort);
    await expect(http.openEventStream('/s')).rejects.toBe(abort);
  });

  it('reports the build stamp of the stream response', async () => {
    const stamps = vi.fn();
    http.observeBuildStamp(stamps);
    fetchMock.mockResolvedValue(new Response(null, { status: 200, headers: { 'X-Draazy-Build': 'b9' } }));
    await http.openEventStream('/s');
    expect(stamps).toHaveBeenCalledWith('b9');
  });
});
