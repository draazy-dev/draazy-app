import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

const m = vi.hoisted(() => ({
  openCashfreeCheckout: vi.fn(),
  getServiceRequest: vi.fn(),
  simulateServiceRequestPayment: vi.fn(),
  clearReads: vi.fn(),
}));
vi.mock('../../../../../../src/lib/cashfree.js', () => ({ openCashfreeCheckout: m.openCashfreeCheckout }));
vi.mock('../../../../../../src/services/serviceRequestService.js', () => ({
  getServiceRequest: m.getServiceRequest,
  simulateServiceRequestPayment: m.simulateServiceRequestPayment,
}));
vi.mock('../../../../../../src/services/http.js', () => ({ clearReads: m.clearReads }));

import { useRaFurniture } from '../../../../../../src/pages/consumer/services/rent-agreement/useRaFurniture.js';
import { useRaPayment } from '../../../../../../src/pages/consumer/services/rent-agreement/useRaPayment.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useRaFurniture', () => {
  it('toggles preset items case-insensitively', () => {
    const { result } = renderHook(() => useRaFurniture());
    act(() => result.current.toggleFurn('Sofa'));
    expect(result.current.furnItems).toEqual([{ name: 'Sofa', qty: 1, custom: false }]);
    expect(result.current.isChecked('sofa')).toBe(true);
    act(() => result.current.toggleFurn('SOFA'));
    expect(result.current.furnItems).toEqual([]);
    expect(result.current.isChecked('Sofa')).toBe(false);
  });

  it('bumps quantity with a floor of one and removes rows', () => {
    const { result } = renderHook(() => useRaFurniture());
    act(() => result.current.toggleFurn('Sofa'));
    act(() => result.current.toggleFurn('Fan'));
    act(() => result.current.bumpQty(0, 2));
    expect(result.current.furnItems[0].qty).toBe(3);
    act(() => result.current.bumpQty(0, -10));
    expect(result.current.furnItems[0].qty).toBe(1);
    act(() => result.current.removeFurn(0));
    expect(result.current.furnItems.map((f) => f.name)).toEqual(['Fan']);
  });

  it('adds custom items and merges quantities for existing names', () => {
    const { result } = renderHook(() => useRaFurniture());
    act(() => result.current.addCustom());
    expect(result.current.furnItems).toEqual([]);
    act(() => result.current.setCustom({ name: '  Bookshelf ', qty: '150' }));
    act(() => result.current.addCustom());
    expect(result.current.furnItems).toEqual([{ name: 'Bookshelf', qty: 99, custom: true }]);
    expect(result.current.custom).toEqual({ name: '', qty: 1 });
    act(() => result.current.setCustom({ name: 'bookshelf', qty: 'x' }));
    act(() => result.current.addCustom());
    expect(result.current.furnItems[0].qty).toBe(100);
    act(() => result.current.setCustom({ name: 'tv', qty: 2 }));
    act(() => result.current.addCustom());
    expect(result.current.furnItems[1]).toEqual({ name: 'tv', qty: 2, custom: false });
  });

  it('renders the furniture text with quantities', () => {
    const { result } = renderHook(() => useRaFurniture());
    act(() => result.current.setFurnItems([{ name: 'Bed', qty: 2 }, { name: 'Fan', qty: 1 }]));
    expect(result.current.furnitureText()).toBe('Bed \u00d72, Fan');
  });
});

describe('useRaPayment', () => {
  const tr = (k, p) => `${k}:${p?.amount ?? ''}`;
  let toast;
  const checkout = (extra = {}) => ({ id: 'SR1', paymentSessionId: 'sess', amount: 500, ...extra });

  beforeEach(() => {
    Object.values(m).forEach((fn) => fn.mockReset());
    toast = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  const setup = () => renderHook(() => useRaPayment({ tr, toast }));

  it('returns the checkout status when there is no payment session', async () => {
    const { result } = setup();
    expect(await result.current.payAndConfirm({ status: 'paid' })).toBe('paid');
    expect(await result.current.payAndConfirm(null)).toBeUndefined();
    expect(m.openCashfreeCheckout).not.toHaveBeenCalled();
  });

  it('confirms a settled payment and warns when the charge differs', async () => {
    m.openCashfreeCheckout.mockResolvedValue({});
    m.getServiceRequest.mockResolvedValue({ status: 'paid' });
    const { result } = setup();
    let status;
    await act(async () => { status = await result.current.payAndConfirm(checkout(), 400); });
    expect(status).toBe('paid');
    expect(toast).toHaveBeenCalledWith('services.ra.cost.chargedDiffers:\u20b9500', 'info');
    expect(m.clearReads).toHaveBeenCalled();
    expect(result.current).toMatchObject({ paymentPending: false, paymentConfirming: false });
  });

  it('does not warn when the charge matches or no total is known', async () => {
    m.openCashfreeCheckout.mockResolvedValue({});
    m.getServiceRequest.mockResolvedValue({ status: 'paid' });
    const { result } = setup();
    await act(async () => { await result.current.payAndConfirm(checkout(), 500); });
    await act(async () => { await result.current.payAndConfirm(checkout(), undefined); });
    expect(toast).not.toHaveBeenCalled();
  });

  it('polls with backoff while payment is awaited and flags it pending', async () => {
    vi.useFakeTimers();
    m.openCashfreeCheckout.mockResolvedValue({});
    m.getServiceRequest.mockRejectedValueOnce(new Error('net')).mockResolvedValue({ status: 'awaiting_payment' });
    const { result } = setup();
    let promise;
    act(() => { promise = result.current.payAndConfirm(checkout()); });
    await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
    let status;
    await act(async () => { status = await promise; });
    expect(status).toBe('awaiting_payment');
    expect(m.getServiceRequest).toHaveBeenCalledTimes(6);
    expect(result.current.paymentPending).toBe(true);
    act(() => result.current.resetPayment());
    expect(result.current).toMatchObject({ paymentPending: false, paymentConfirming: false, paymentNotCompleted: false });
  });

  it('stops polling once the status settles', async () => {
    vi.useFakeTimers();
    m.openCashfreeCheckout.mockResolvedValue({});
    m.getServiceRequest.mockResolvedValueOnce({ status: 'awaiting_payment' }).mockResolvedValue({ status: 'paid' });
    const { result } = setup();
    let promise;
    act(() => { promise = result.current.payAndConfirm(checkout()); });
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    let status;
    await act(async () => { status = await promise; });
    expect(status).toBe('paid');
    expect(m.getServiceRequest).toHaveBeenCalledTimes(2);
  });

  it('checks the status once when checkout fails to open', async () => {
    m.openCashfreeCheckout.mockRejectedValue(new Error('blocked'));
    m.getServiceRequest.mockResolvedValue({ status: 'awaiting_payment' });
    const { result } = setup();
    let status;
    await act(async () => { status = await result.current.payAndConfirm(checkout()); });
    expect(status).toBe('awaiting_payment');
    expect(result.current.paymentNotCompleted).toBe(true);
    m.getServiceRequest.mockResolvedValue({ status: 'paid' });
    await act(async () => { status = await result.current.payAndConfirm(checkout()); });
    expect(status).toBe('paid');
    expect(result.current.paymentNotCompleted).toBe(false);
    m.getServiceRequest.mockRejectedValue(new Error('x'));
    await act(async () => { status = await result.current.payAndConfirm(checkout()); });
    expect(status).toBe('awaiting_payment');
  });

  it('simulates a mock payment in dev when confirmed', async () => {
    m.openCashfreeCheckout.mockResolvedValue({ mock: true });
    m.getServiceRequest.mockResolvedValue({ status: 'paid' });
    m.simulateServiceRequestPayment.mockResolvedValue({});
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { result } = setup();
    await act(async () => { await result.current.payAndConfirm(checkout()); });
    expect(m.simulateServiceRequestPayment).toHaveBeenCalledWith('SR1', 'paid');
    m.simulateServiceRequestPayment.mockRejectedValue({ status: 500 });
    await act(async () => { await result.current.payAndConfirm(checkout()); });
    window.confirm.mockReturnValue(false);
    m.simulateServiceRequestPayment.mockClear();
    await act(async () => { await result.current.payAndConfirm(checkout()); });
    expect(m.simulateServiceRequestPayment).not.toHaveBeenCalled();
  });

  it('stops polling when unmounted mid-wait', async () => {
    vi.useFakeTimers();
    m.openCashfreeCheckout.mockResolvedValue({});
    m.getServiceRequest.mockResolvedValue({ status: 'awaiting_payment' });
    const { result, unmount } = setup();
    let promise;
    act(() => { promise = result.current.payAndConfirm(checkout()); });
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    unmount();
    await expect(promise).resolves.toBe('awaiting_payment');
    expect(m.getServiceRequest).toHaveBeenCalledTimes(1);
  });
});
