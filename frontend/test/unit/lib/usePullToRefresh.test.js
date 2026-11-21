import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import usePullToRefresh from '../../../src/lib/usePullToRefresh.js';

let api;
function Harness({ onRefresh, opts }) {
  api = usePullToRefresh(onRefresh, opts);
  return createElement('div', { ref: api.ref, 'data-testid': 'root' }, createElement('span', { id: 'child' }, 'x'));
}

const touch = (type, y, x = 0, count = 1) => {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  ev.touches = Array.from({ length: count }, () => ({ clientX: x, clientY: y }));
  return ev;
};
const fire = (el, ev) => { act(() => { el.dispatchEvent(ev); }); return ev; };

function setup(onRefresh = vi.fn(), opts) {
  const utils = render(createElement(Harness, { onRefresh, opts }));
  const root = utils.getByTestId('root');
  return { ...utils, root, child: root.querySelector('#child') };
}

function pull(root, to, from = 100) {
  fire(root, touch('touchstart', from));
  return fire(root, touch('touchmove', to));
}

beforeEach(() => {
  window.matchMedia = vi.fn((q) => ({ matches: q.includes('pointer: coarse') }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete window.matchMedia;
});

describe('usePullToRefresh', () => {
  it('starts idle', () => {
    setup();
    expect(api).toMatchObject({ pullDistance: 0, progress: 0, isRefreshing: false });
  });

  it('is inert on non-touch devices and when disabled', () => {
    window.matchMedia = vi.fn(() => ({ matches: false }));
    const a = setup();
    const ev = pull(a.root, 200);
    expect(ev.defaultPrevented).toBe(false);
    expect(api.pullDistance).toBe(0);
    cleanup();
    window.matchMedia = vi.fn((q) => ({ matches: q.includes('pointer: coarse') }));
    const b = setup(vi.fn(), { enabled: false });
    expect(pull(b.root, 200).defaultPrevented).toBe(false);
  });

  it('tracks a pull with resistance and prevents native scrolling', () => {
    const { root } = setup();
    const ev = pull(root, 140);
    expect(ev.defaultPrevented).toBe(true);
    expect(api.pullDistance).toBe((40 - 6) * 0.5);
    expect(api.progress).toBeCloseTo(17 / 64, 5);
  });

  it('caps the pull at the maximum', () => {
    const { root } = setup();
    pull(root, 900);
    expect(api.pullDistance).toBe(96);
    expect(api.progress).toBe(1);
  });

  it('ignores tiny movement, upward drags and sideways drags', () => {
    const { root } = setup();
    fire(root, touch('touchstart', 100));
    expect(fire(root, touch('touchmove', 103)).defaultPrevented).toBe(false);
    expect(api.pullDistance).toBe(0);
    fire(root, touch('touchmove', 90));
    expect(fire(root, touch('touchmove', 200)).defaultPrevented).toBe(false);
    fire(root, touch('touchend', 0));
    fire(root, touch('touchstart', 100, 0));
    expect(fire(root, touch('touchmove', 120, 50)).defaultPrevented).toBe(false);
    expect(api.pullDistance).toBe(0);
  });

  it('skips opted-out regions and multi-touch starts', () => {
    const { root, child } = setup();
    child.setAttribute('data-no-ptr', '');
    fire(child, touch('touchstart', 100));
    expect(fire(root, touch('touchmove', 200)).defaultPrevented).toBe(false);
    child.removeAttribute('data-no-ptr');
    fire(root, touch('touchstart', 100, 0, 2));
    expect(fire(root, touch('touchmove', 200)).defaultPrevented).toBe(false);
  });

  it('cancels when a second finger joins mid-drag', () => {
    const { root } = setup();
    pull(root, 140);
    fire(root, touch('touchmove', 150, 0, 2));
    expect(api.pullDistance).toBe(0);
  });

  it('does not start when the page is scrolled down', () => {
    const { root } = setup();
    const spy = vi.spyOn(Element.prototype, 'scrollTop', 'get').mockReturnValue(50);
    expect(pull(root, 200).defaultPrevented).toBe(false);
    spy.mockRestore();
  });

  it('does not start when an inner scroller is not at the top', () => {
    const { root, child } = setup();
    Object.defineProperty(root, 'scrollHeight', { configurable: true, value: 500 });
    Object.defineProperty(root, 'clientHeight', { configurable: true, value: 100 });
    root.style.overflowY = 'auto';
    root.scrollTop = 30;
    fire(child, touch('touchstart', 100));
    expect(fire(child, touch('touchmove', 200)).defaultPrevented).toBe(false);
    root.scrollTop = 0;
    fire(child, touch('touchstart', 100));
    expect(fire(child, touch('touchmove', 200)).defaultPrevented).toBe(true);
  });

  it('springs back when released under the threshold', () => {
    const onRefresh = vi.fn();
    const { root } = setup(onRefresh);
    pull(root, 140);
    fire(root, touch('touchend', 140));
    expect(api.pullDistance).toBe(0);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('refreshes when released past the threshold and holds the spinner for a minimum time', async () => {
    vi.useFakeTimers();
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { root } = setup(onRefresh);
    pull(root, 300);
    fire(root, touch('touchend', 300));
    expect(api.isRefreshing).toBe(true);
    expect(api.pullDistance).toBe(64);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(349); });
    expect(api.isRefreshing).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(api).toMatchObject({ isRefreshing: false, pullDistance: 0 });
  });

  it('still settles when the refresh rejects and ignores new pulls while refreshing', async () => {
    vi.useFakeTimers();
    const onRefresh = vi.fn().mockRejectedValue(new Error('x'));
    const { root } = setup(onRefresh);
    pull(root, 300);
    fire(root, touch('touchend', 300));
    expect(pull(root, 300).defaultPrevented).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(api.isRefreshing).toBe(false);
  });

  it('uses the latest onRefresh and custom threshold', async () => {
    vi.useFakeTimers();
    const first = vi.fn();
    const second = vi.fn();
    const utils = setup(first, { threshold: 20 });
    utils.rerender(createElement(Harness, { onRefresh: second, opts: { threshold: 20 } }));
    const root = utils.getByTestId('root');
    pull(root, 160);
    fire(root, touch('touchend', 160));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(api.progress).toBe(0);
  });

  it('snaps to the threshold instead of animating when motion is reduced', () => {
    localStorage.setItem('dzAppPrefs', JSON.stringify({ reduceMotion: true }));
    const { root } = setup();
    pull(root, 120);
    expect(api.pullDistance).toBe(0);
    pull(root, 300);
    expect(api.pullDistance).toBe(64);
  });

  it('removes its listeners on unmount', () => {
    const remove = vi.spyOn(HTMLElement.prototype, 'removeEventListener');
    const { unmount } = setup();
    unmount();
    expect(remove.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(['touchstart', 'touchmove', 'touchend', 'touchcancel']));
  });
});
