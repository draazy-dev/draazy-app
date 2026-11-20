import assert from 'node:assert/strict';
import { BOT_CHECK_FAILED, createTokenSlot, sendWithToken } from './turnstileToken.js';

let clock = 0;
const now = () => clock;
const slot = (opts = {}) => createTokenSlot({ now, ttlMs: 1000, waitMs: 40, ...opts });

{
  const s = slot();
  s.put('a');
  assert.equal(await s.take(), 'a');
  assert.equal(await s.take(), null, 'a token is single-use');
}

{
  const s = slot();
  const waiting = s.take();
  setTimeout(() => s.put('late'), 5);
  assert.equal(await waiting, 'late', 'a send waits for a challenge still in flight');
  assert.equal(await s.take(), null, 'the token handed to a waiter is not handed out again');
}

{
  const s = slot();
  const waiting = s.take();
  s.put(null);
  setTimeout(() => s.put('retried'), 5);
  assert.equal(await waiting, 'retried', 'an error mid-wait does not end the wait; Turnstile retries on its own');
}

{
  clock = 0;
  const s = slot();
  s.put('old');
  clock = 1000;
  assert.equal(s.needsRestart(), true, 'a token past its lifetime needs a new challenge');
  assert.equal(await s.take(), null, 'and is never sent');
}

{
  clock = 0;
  const s = slot();
  assert.equal(s.needsRestart(), false, 'a widget mid-challenge is left alone');
  clock = 39;
  assert.equal(s.needsRestart(), false);
  clock = 40;
  assert.equal(s.needsRestart(), true, 'a widget silent for the whole wait window is presumed stuck');
  s.restarted();
  assert.equal(s.needsRestart(), false);
  s.put(null);
  assert.equal(s.needsRestart(), true, 'an expired or errored widget needs a remount');
  s.put('ok');
  assert.equal(s.needsRestart(), false);
}

const refusal = Object.assign(new Error('refused'), { code: BOT_CHECK_FAILED });
const spender = (...tokens) => async () => tokens.shift() ?? null;

{
  const sent = [];
  const result = await sendWithToken(spender('t1', 't2'), async (tok) => {
    sent.push(tok);
    if (tok === 't1') throw refusal;
    return 'ok';
  });
  assert.equal(result, 'ok');
  assert.deepEqual(sent, ['t1', 't2'], 'a refused token is retried once with a fresh one');
}

{
  const sent = [];
  await assert.rejects(sendWithToken(spender('t1', 't2', 't3'), async (tok) => {
    sent.push(tok);
    throw refusal;
  }), refusal);
  assert.deepEqual(sent, ['t1', 't2'], 'only once');
}

{
  const sent = [];
  await assert.rejects(sendWithToken(spender(null, 't2'), async (tok) => {
    sent.push(tok);
    throw refusal;
  }), refusal);
  assert.deepEqual(sent, [null], 'no retry when no token could be had at all: waiting again would only double the delay');
}

{
  const sent = [];
  await assert.rejects(sendWithToken(spender('t1', null), async (tok) => {
    sent.push(tok);
    throw refusal;
  }), refusal);
  assert.deepEqual(sent, ['t1'], 'no tokenless retry that is bound to be refused');
}

{
  const other = Object.assign(new Error('busy'), { status: 429 });
  const sent = [];
  await assert.rejects(sendWithToken(spender('t1', 't2'), async (tok) => {
    sent.push(tok);
    throw other;
  }), other);
  assert.deepEqual(sent, ['t1'], 'other refusals are not retried');
}
