import { beforeEach, describe, expect, it, vi } from 'vitest';

const checkout = vi.fn();
const load = vi.fn();
vi.mock('@cashfreepayments/cashfree-js', () => ({ load: (...a) => load(...a) }));

let openCashfreeCheckout;
beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  sessionStorage.clear();
  checkout.mockReset();
  load.mockReset().mockResolvedValue({ checkout });
  ({ openCashfreeCheckout } = await import('../../../src/lib/cashfree.js'));
});

describe('openCashfreeCheckout', () => {
  it('short-circuits mock sessions without loading the SDK', async () => {
    expect(await openCashfreeCheckout('mock_session_123')).toEqual({ mock: true });
    expect(load).not.toHaveBeenCalled();
  });

  it('opens the modal checkout in sandbox mode and tracks it', async () => {
    checkout.mockImplementation(async () => {
      expect(localStorage.getItem('dz_pay_open')).not.toBeNull();
      return { paymentDetails: {} };
    });
    expect(await openCashfreeCheckout('sess_1')).toEqual({ paymentDetails: {} });
    expect(load).toHaveBeenCalledWith({ mode: 'sandbox' });
    expect(checkout).toHaveBeenCalledWith({ paymentSessionId: 'sess_1', redirectTarget: '_modal' });
  });

  it('stops tracking pagehide after the modal closes, even on error', async () => {
    checkout.mockRejectedValue(new Error('closed'));
    await expect(openCashfreeCheckout('sess_1')).rejects.toThrow('closed');
    window.dispatchEvent(new Event('pagehide'));
    expect(sessionStorage.getItem('dz_pay_redirected')).toBeNull();
  });

  it('loads the SDK once and retries after a load failure', async () => {
    checkout.mockResolvedValue({});
    await openCashfreeCheckout('a');
    await openCashfreeCheckout('b');
    expect(load).toHaveBeenCalledTimes(1);

    vi.resetModules();
    load.mockReset().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ checkout });
    ({ openCashfreeCheckout } = await import('../../../src/lib/cashfree.js'));
    await expect(openCashfreeCheckout('c')).rejects.toThrow('offline');
    await expect(openCashfreeCheckout('c')).resolves.toEqual({});
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('uses the configured mode', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_CASHFREE_MODE', 'production');
    ({ openCashfreeCheckout } = await import('../../../src/lib/cashfree.js'));
    checkout.mockResolvedValue({});
    await openCashfreeCheckout('s');
    expect(load).toHaveBeenCalledWith({ mode: 'production' });
    vi.unstubAllEnvs();
  });
});
