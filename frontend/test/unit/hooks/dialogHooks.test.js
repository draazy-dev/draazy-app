import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useBackToClose from '../../../src/hooks/useBackToClose.js';
import useModalDialog from '../../../src/hooks/useModalDialog.js';

describe('useBackToClose', () => {
  beforeEach(() => window.history.replaceState(null, '', '/'));
  afterEach(() => vi.useRealTimers());

  it('pushes a history entry while open and pops it when closed from the UI', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const push = vi.spyOn(window.history, 'pushState');
    const { rerender } = renderHook(({ open }) => useBackToClose(open, vi.fn()), { initialProps: { open: false } });
    expect(push).not.toHaveBeenCalled();
    rerender({ open: true });
    expect(push).toHaveBeenCalledTimes(1);
    expect(Object.keys(window.history.state)).toEqual(['__dzBackToClose']);
    rerender({ open: false });
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('does not push again for repeated renders while open', () => {
    const push = vi.spyOn(window.history, 'pushState');
    const { rerender } = renderHook(({ open }) => useBackToClose(open, vi.fn()), { initialProps: { open: true } });
    rerender({ open: true });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('re-stamps the entry when another navigation replaced the state', () => {
    const { rerender } = renderHook(() => useBackToClose(true, vi.fn()));
    window.history.replaceState({ other: 1 }, '');
    rerender();
    expect(window.history.state).toEqual({ other: 1, __dzBackToClose: expect.any(String) });
  });

  it('closes on browser back and reports it through onPopClose', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const onPopClose = vi.fn();
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const { rerender } = renderHook(({ open }) => useBackToClose(open, onClose, { onPopClose }), { initialProps: { open: true } });
    act(() => { window.dispatchEvent(new PopStateEvent('popstate', { state: null })); });
    expect(onPopClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender({ open: false });
    expect(back).not.toHaveBeenCalled();
    act(() => { vi.runAllTimers(); });
  });

  it('ignores a popstate that still carries its own entry token', () => {
    const onClose = vi.fn();
    renderHook(() => useBackToClose(true, onClose));
    const state = { ...window.history.state };
    act(() => { window.dispatchEvent(new PopStateEvent('popstate', { state })); });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignores popstate while closed', () => {
    const onClose = vi.fn();
    renderHook(() => useBackToClose(false, onClose));
    act(() => { window.dispatchEvent(new PopStateEvent('popstate', { state: null })); });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does nothing when disabled', () => {
    const push = vi.spyOn(window.history, 'pushState');
    const onClose = vi.fn();
    renderHook(() => useBackToClose(true, onClose, { enabled: false }));
    act(() => { window.dispatchEvent(new PopStateEvent('popstate', { state: null })); });
    expect(push).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('adopts an entry left in history by a previous mount', () => {
    const push = vi.spyOn(window.history, 'pushState');
    window.history.replaceState({ k: 'tok' }, '');
    renderHook(() => useBackToClose(true, vi.fn(), { key: 'k' }));
    expect(push).not.toHaveBeenCalled();
    expect(window.history.state.k).toBe('tok');
  });

  it('uses the latest onClose without resubscribing', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ fn }) => useBackToClose(true, fn), { initialProps: { fn: first } });
    rerender({ fn: second });
    act(() => { window.dispatchEvent(new PopStateEvent('popstate', { state: null })); });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('useModalDialog', () => {
  let opener;
  let panel;
  let first;
  let last;

  const mount = (open, onClose = vi.fn()) => {
    const hook = renderHook(({ o }) => {
      const ref = useModalDialog(o, onClose);
      ref.current = panel;
      return ref;
    }, { initialProps: { o: open } });
    return hook;
  };
  const press = (key, init = {}) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    document.dispatchEvent(event);
    return event;
  };

  beforeEach(() => {
    document.body.innerHTML = `
      <button id="opener">open</button>
      <div id="panel" role="dialog" aria-modal="true" tabindex="-1"><button id="a">a</button><input id="b"></div>`;
    opener = document.getElementById('opener');
    opener.focus();
    panel = document.getElementById('panel');
    first = document.getElementById('a');
    last = document.getElementById('b');
  });

  afterEach(() => { document.body.innerHTML = ''; });

  it('moves focus into the panel when it opens and gives it back on close', () => {
    const hook = mount(false);
    hook.rerender({ o: true });
    expect(document.activeElement).toBe(panel);
    hook.rerender({ o: false });
    expect(document.activeElement).toBe(opener);
  });

  it('leaves focus alone when it is already inside the panel', () => {
    first.focus();
    mount(true);
    expect(document.activeElement).toBe(first);
  });

  it('does not refocus an opener that left the document', () => {
    const hook = mount(true);
    opener.remove();
    expect(() => hook.unmount()).not.toThrow();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    mount(true, onClose);
    const event = press('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('ignores keys that were already handled', () => {
    const onClose = vi.fn();
    mount(true, onClose);
    document.addEventListener('keydown', (e) => e.preventDefault(), { once: true, capture: true });
    press('Escape');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('only lets the top-most modal react', () => {
    document.body.insertAdjacentHTML('beforeend', '<div role="dialog" aria-modal="true" id="top"></div>');
    const onClose = vi.fn();
    mount(true, onClose);
    press('Escape');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('wraps Tab from the last control to the first and Shift+Tab back', () => {
    mount(true);
    last.focus();
    expect(press('Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
    expect(press('Tab', { shiftKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it('lets Tab move naturally in the middle and ignores other keys', () => {
    mount(true);
    first.focus();
    expect(press('Tab').defaultPrevented).toBe(false);
    expect(press('a').defaultPrevented).toBe(false);
  });

  it('does not trap Tab in a panel without focusable children', () => {
    panel.innerHTML = '';
    mount(true);
    expect(press('Tab').defaultPrevented).toBe(false);
  });

  it('stops listening once unmounted', () => {
    const onClose = vi.fn();
    const hook = mount(true, onClose);
    hook.unmount();
    press('Escape');
    expect(onClose).not.toHaveBeenCalled();
  });
});
