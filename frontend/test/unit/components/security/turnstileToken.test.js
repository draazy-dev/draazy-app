import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOT_CHECK_FAILED, createTokenSlot, sendWithToken } from '../../../../src/components/security/turnstileToken.js';

let clock = 0;
const now = () => clock;
const slot = (opts = {}) => createTokenSlot({ now, ttlMs: 1000, waitMs: 40, ...opts });

describe('createTokenSlot', () => {
  beforeEach(() => { clock = 0; vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());

  it('hands out a token once', async () => {
    const s = slot();
    s.put('a');
    expect(await s.take()).toBe('a');
    const second = s.take();
    await vi.advanceTimersByTimeAsync(40);
    expect(await second).toBeNull();
  });

  it('makes a send wait for a challenge still in flight', async () => {
    const s = slot();
    const waiting = s.take();
    setTimeout(() => s.put('late'), 5);
    await vi.advanceTimersByTimeAsync(5);
    expect(await waiting).toBe('late');
    const again = s.take();
    await vi.advanceTimersByTimeAsync(40);
    expect(await again).toBeNull();
  });

  it('keeps waiting through a failed challenge that Turnstile retries', async () => {
    const s = slot();
    const waiting = s.take();
    s.put(null);
    setTimeout(() => s.put('retried'), 5);
    await vi.advanceTimersByTimeAsync(5);
    expect(await waiting).toBe('retried');
  });

  it('gives up with null after the wait window', async () => {
    const s = slot();
    const waiting = s.take();
    await vi.advanceTimersByTimeAsync(40);
    expect(await waiting).toBeNull();
  });

  it('releases an earlier waiter with null when a new take starts', async () => {
    const s = slot();
    const first = s.take();
    const second = s.take();
    expect(await first).toBeNull();
    s.put('x');
    expect(await second).toBe('x');
  });

  it('never sends a token past its lifetime', async () => {
    const s = slot();
    s.put('old');
    clock = 1000;
    expect(s.needsRestart()).toBe(true);
    const taken = s.take();
    await vi.advanceTimersByTimeAsync(40);
    expect(await taken).toBeNull();
  });

  it('still sends a token just inside its lifetime', async () => {
    const s = slot();
    s.put('edge');
    clock = 999;
    expect(s.needsRestart()).toBe(false);
    expect(await s.take()).toBe('edge');
  });

  it('leaves a widget mid-challenge alone until the wait window has passed', () => {
    const s = slot();
    expect(s.needsRestart()).toBe(false);
    clock = 39;
    expect(s.needsRestart()).toBe(false);
    clock = 40;
    expect(s.needsRestart()).toBe(true);
    s.restarted();
    expect(s.needsRestart()).toBe(false);
  });

  it('asks for a remount after an expired or errored widget and not once it has a token', () => {
    const s = slot();
    s.put(null);
    expect(s.needsRestart()).toBe(true);
    s.put('ok');
    expect(s.needsRestart()).toBe(false);
  });

  it('uses the production defaults when no options are given', async () => {
    const s = createTokenSlot();
    s.put('real');
    expect(s.needsRestart()).toBe(false);
    expect(await s.take()).toBe('real');
  });
});

describe('sendWithToken', () => {
  const refusal = Object.assign(new Error('refused'), { code: BOT_CHECK_FAILED });
  const spender = (...tokens) => async () => tokens.shift() ?? null;

  it('sends once when the request succeeds', async () => {
    const request = vi.fn(async () => 'ok');
    await expect(sendWithToken(spender('t1'), request)).resolves.toBe('ok');
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('t1');
  });

  it('retries a refused token once with a fresh one', async () => {
    const sent = [];
    const result = await sendWithToken(spender('t1', 't2'), async (tok) => {
      sent.push(tok);
      if (tok === 't1') throw refusal;
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(sent).toEqual(['t1', 't2']);
  });

  it('retries only once', async () => {
    const sent = [];
    await expect(sendWithToken(spender('t1', 't2', 't3'), async (tok) => { sent.push(tok); throw refusal; })).rejects.toBe(refusal);
    expect(sent).toEqual(['t1', 't2']);
  });

  it('does not retry when no token could be had at all', async () => {
    const sent = [];
    await expect(sendWithToken(spender(null, 't2'), async (tok) => { sent.push(tok); throw refusal; })).rejects.toBe(refusal);
    expect(sent).toEqual([null]);
  });

  it('does not retry without a token for the second attempt', async () => {
    const sent = [];
    await expect(sendWithToken(spender('t1', null), async (tok) => { sent.push(tok); throw refusal; })).rejects.toBe(refusal);
    expect(sent).toEqual(['t1']);
  });

  it('does not retry other failures, including missing error objects', async () => {
    const other = Object.assign(new Error('busy'), { status: 429 });
    const sent = [];
    await expect(sendWithToken(spender('t1', 't2'), async (tok) => { sent.push(tok); throw other; })).rejects.toBe(other);
    expect(sent).toEqual(['t1']);
    await expect(sendWithToken(spender('t1'), async () => { throw undefined; })).rejects.toBeUndefined(); // eslint-disable-line no-throw-literal
  });
});
