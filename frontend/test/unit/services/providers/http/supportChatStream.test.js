import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../src/services/http.js', () => ({
  get: vi.fn(),
  post: vi.fn(),
  openEventStream: vi.fn(async (_path, opts) => opts),
}));

const { openEventStream } = await import('../../../../../src/services/http.js');
const { openSupportChatStream } = await import('../../../../../src/services/providers/http/supportProvider.js');

describe('openSupportChatStream', () => {
  it('opens the staff stream and maps chat events into rows', async () => {
    const onEvent = vi.fn();
    const signal = new AbortController().signal;
    const opts = await openSupportChatStream({ onEvent, signal });
    expect(openEventStream).toHaveBeenCalledWith('/admin/support/chats/stream', expect.objectContaining({ signal }));

    opts.onEvent({ type: 'chat', data: { userId: 4, name: 'Ann' } });
    expect(onEvent).toHaveBeenLastCalledWith({ type: 'chat', data: expect.objectContaining({ userId: '4', name: 'Ann', status: 'awaiting' }) });

    const other = { type: 'ping', data: { userId: 1 } };
    opts.onEvent(other);
    expect(onEvent).toHaveBeenLastCalledWith(other);
    const noUser = { type: 'chat', data: {} };
    opts.onEvent(noUser);
    expect(onEvent).toHaveBeenLastCalledWith(noUser);
  });

  it('tolerates a missing onEvent callback', async () => {
    const opts = await openSupportChatStream({});
    expect(() => opts.onEvent({ type: 'chat', data: { userId: 1 } })).not.toThrow();
  });
});
