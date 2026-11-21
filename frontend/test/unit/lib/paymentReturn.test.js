import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { continueInThisWindow, isGatewayPopupReturn, trackCheckout } from '../../../src/lib/paymentReturn.js';

const setSearch = (qs) => window.history.replaceState({}, '', `/pay/return${qs}`);

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); setSearch(''); });
afterEach(() => { vi.useRealTimers(); setSearch(''); });

describe('trackCheckout', () => {
  it('records the open checkout and clears a stale redirect marker', () => {
    sessionStorage.setItem('dz_pay_redirected', '1');
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    const stop = trackCheckout();
    expect(localStorage.getItem('dz_pay_open')).toBe('1700000000000');
    expect(sessionStorage.getItem('dz_pay_redirected')).toBeNull();
    stop();
  });

  it('marks the tab as redirected on pagehide until unsubscribed', () => {
    const stop = trackCheckout();
    window.dispatchEvent(new Event('pagehide'));
    expect(sessionStorage.getItem('dz_pay_redirected')).toBe('1');
    sessionStorage.clear();
    stop();
    window.dispatchEvent(new Event('pagehide'));
    expect(sessionStorage.getItem('dz_pay_redirected')).toBeNull();
  });

  it('does not throw when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => trackCheckout()()).not.toThrow();
  });
});

describe('isGatewayPopupReturn', () => {
  it('is false without an order_id', () => {
    localStorage.setItem('dz_pay_open', String(Date.now()));
    expect(isGatewayPopupReturn()).toBe(false);
  });

  it('is true for a recent open checkout', () => {
    setSearch('?order_id=o1');
    localStorage.setItem('dz_pay_open', String(Date.now() - 60_000));
    expect(isGatewayPopupReturn()).toBe(true);
  });

  it('is false once the 30 minute window passes or nothing was opened', () => {
    setSearch('?order_id=o1');
    expect(isGatewayPopupReturn()).toBe(false);
    localStorage.setItem('dz_pay_open', String(Date.now() - 31 * 60_000));
    expect(isGatewayPopupReturn()).toBe(false);
    localStorage.setItem('dz_pay_open', 'garbage');
    expect(isGatewayPopupReturn()).toBe(false);
  });

  it('treats a redirected tab as the payer and consumes both markers', () => {
    setSearch('?order_id=o1');
    localStorage.setItem('dz_pay_open', String(Date.now()));
    sessionStorage.setItem('dz_pay_redirected', '1');
    expect(isGatewayPopupReturn()).toBe(false);
    expect(sessionStorage.getItem('dz_pay_redirected')).toBeNull();
    expect(localStorage.getItem('dz_pay_open')).toBeNull();
    expect(isGatewayPopupReturn()).toBe(false);
  });

  it('is false when storage throws', () => {
    setSearch('?order_id=o1');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(isGatewayPopupReturn()).toBe(false);
  });
});

describe('continueInThisWindow', () => {
  it('sets the redirect marker and reloads', () => {
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, reload, search: original.search } });
    try {
      continueInThisWindow();
      expect(sessionStorage.getItem('dz_pay_redirected')).toBe('1');
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });
});
