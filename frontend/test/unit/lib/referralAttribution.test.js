import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const redeemReferral = vi.fn();
const getMyReferralSummary = vi.fn();
vi.mock('../../../src/services/referralService.js', () => ({
  redeemReferral: (...a) => redeemReferral(...a),
  getMyReferralSummary: (...a) => getMyReferralSummary(...a),
}));

import { captureReferral, clearReferral, isReferralCode, redeemOnNewAccount, storedReferral } from '../../../src/lib/referralAttribution.js';

const stored = () => JSON.parse(localStorage.getItem('dz_ref'));

beforeEach(() => {
  localStorage.clear();
  redeemReferral.mockReset();
  getMyReferralSummary.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('isReferralCode', () => {
  it('accepts 3-32 safe characters', () => {
    expect(isReferralCode('abc')).toBe(true);
    expect(isReferralCode('A_b-9')).toBe(true);
    expect(isReferralCode('a'.repeat(32))).toBe(true);
    expect(isReferralCode('a'.repeat(33))).toBe(false);
    expect(isReferralCode('ab')).toBe(false);
    expect(isReferralCode('a b')).toBe(false);
    expect(isReferralCode(null)).toBe(false);
  });
});

describe('captureReferral', () => {
  it('stores a valid code with a known channel', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    captureReferral('?ref= FRIEND1 &ch=WhatsApp');
    expect(stored()).toEqual({ code: 'FRIEND1', at: 1000, ch: 'whatsapp' });
    expect(storedReferral()).toBe('FRIEND1');
  });

  it('drops unknown channels', () => {
    captureReferral('?ref=FRIEND1&ch=pigeon');
    expect(stored()).not.toHaveProperty('ch');
  });

  it('ignores missing or malformed codes', () => {
    captureReferral('');
    captureReferral('?ref=a');
    captureReferral('?ref=bad code!');
    expect(localStorage.getItem('dz_ref')).toBeNull();
  });

  it('keeps the first live attribution but replaces an expired one', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    captureReferral('?ref=FIRST');
    vi.setSystemTime(29 * 86400000);
    captureReferral('?ref=SECOND');
    expect(storedReferral()).toBe('FIRST');
    vi.setSystemTime(30 * 86400000);
    expect(storedReferral()).toBe('');
    captureReferral('?ref=SECOND');
    expect(storedReferral()).toBe('SECOND');
  });

  it('ignores a corrupt stored row and tolerates blocked storage', () => {
    localStorage.setItem('dz_ref', '{bad');
    expect(storedReferral()).toBe('');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('x'); });
    expect(() => captureReferral('?ref=ABC')).not.toThrow();
  });
});

describe('clearReferral', () => {
  it('removes the stored code', () => {
    captureReferral('?ref=ABC');
    clearReferral();
    expect(storedReferral()).toBe('');
  });
});

describe('redeemOnNewAccount', () => {
  it('returns none when there is nothing to redeem', async () => {
    expect(await redeemOnNewAccount()).toBe('none');
    expect(await redeemOnNewAccount('  ')).toBe('none');
    expect(redeemReferral).not.toHaveBeenCalled();
  });

  it('redeems the stored code with its channel and clears it', async () => {
    captureReferral('?ref=FRIEND1&ch=sms');
    redeemReferral.mockResolvedValue({});
    expect(await redeemOnNewAccount()).toBe('applied');
    expect(redeemReferral).toHaveBeenCalledWith('FRIEND1', 'sms');
    expect(storedReferral()).toBe('');
  });

  it('uses the link channel for a code that differs from the stored one', async () => {
    captureReferral('?ref=FRIEND1&ch=sms');
    redeemReferral.mockResolvedValue({});
    await redeemOnNewAccount(' OTHER ');
    expect(redeemReferral).toHaveBeenCalledWith('OTHER', 'link');
  });

  it('reports linked when a 409 follows an already redeemed reward', async () => {
    captureReferral('?ref=FRIEND1');
    redeemReferral.mockRejectedValue({ status: 409 });
    getMyReferralSummary.mockResolvedValue({ friendReward: { redeemed: true } });
    expect(await redeemOnNewAccount()).toBe('linked');
    expect(storedReferral()).toBe('');
  });

  it('reports refused for a 409 otherwise, including when the summary fails', async () => {
    redeemReferral.mockRejectedValue({ status: 409 });
    getMyReferralSummary.mockResolvedValue({ friendReward: { redeemed: false } });
    expect(await redeemOnNewAccount('ABC')).toBe('refused');
    getMyReferralSummary.mockRejectedValue(new Error('x'));
    expect(await redeemOnNewAccount('ABC')).toBe('refused');
  });

  it('treats 422 as invalid and clears the code', async () => {
    captureReferral('?ref=FRIEND1');
    redeemReferral.mockRejectedValue({ status: 422 });
    expect(await redeemOnNewAccount()).toBe('invalid');
    expect(storedReferral()).toBe('');
  });

  it('keeps the code on transient failures so sign-in can retry', async () => {
    captureReferral('?ref=FRIEND1');
    redeemReferral.mockRejectedValue({ status: 503 });
    expect(await redeemOnNewAccount()).toBe('failed');
    expect(storedReferral()).toBe('FRIEND1');
  });
});
