import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import useSwipeDismiss from '../../../src/lib/useSwipeDismiss.js';

function pointer({ x = 0, y = 0, top = 0, target, matchesScrollable } = {}) {
  const el = {
    style: {}, setPointerCapture: vi.fn(), addEventListener: vi.fn(), getBoundingClientRect: () => ({ top }),
  };
  return {
    clientX: x, clientY: y, pointerId: 7, currentTarget: el,
    target: target ?? { closest: (sel) => (matchesScrollable?.(sel) ?? null) },
  };
}

beforeEach(() => {
  window.matchMedia = vi.fn(() => ({ matches: true }));
});
afterEach(() => {
  cleanup();
  delete window.matchMedia;
});

describe('useSwipeDismiss (vertical)', () => {
  it('follows the finger downward and dismisses past the threshold', () => {
    const onDismiss = vi.fn();
    const { result } = renderHook(() => useSwipeDismiss(onDismiss));
    const down = pointer({ y: 10 });
    result.current.onPointerDown(down);
    const move = pointer({ y: 60 });
    move.currentTarget = down.currentTarget;
    result.current.onPointerMove(move);
    expect(down.currentTarget.style.transition).toBe('none');
    expect(down.currentTarget.style.transform).toBe('translateY(50px)');
    expect(down.currentTarget.setPointerCapture).toHaveBeenCalledWith(7);
    const up = pointer({ y: 90 });
    up.currentTarget = down.currentTarget;
    result.current.onPointerUp(up);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(down.currentTarget.style.transform).toBe('');
    expect(down.currentTarget.style.transition).toBe('');
  });

  it('snaps back with a transition when released early', () => {
    const onDismiss = vi.fn();
    const { result } = renderHook(() => useSwipeDismiss(onDismiss));
    const down = pointer({ y: 10 });
    result.current.onPointerDown(down);
    const move = { ...pointer({ y: 50 }), currentTarget: down.currentTarget };
    result.current.onPointerMove(move);
    result.current.onPointerCancel({ ...pointer({ y: 50 }), currentTarget: down.currentTarget });
    expect(onDismiss).not.toHaveBeenCalled();
    expect(down.currentTarget.style.transition).toContain('transform 200ms');
    const [evt, handler, opts] = down.currentTarget.addEventListener.mock.calls[0];
    expect([evt, opts]).toEqual(['transitionend', { once: true }]);
    handler();
    expect(down.currentTarget.style.transition).toBe('');
  });

  it('never moves upward and ignores drags below the slop', () => {
    const { result } = renderHook(() => useSwipeDismiss(vi.fn()));
    const down = pointer({ y: 30 });
    result.current.onPointerDown(down);
    result.current.onPointerMove({ ...pointer({ y: 32 }), currentTarget: down.currentTarget });
    expect(down.currentTarget.style.transform).toBeUndefined();
    result.current.onPointerMove({ ...pointer({ y: 40 }), currentTarget: down.currentTarget });
    result.current.onPointerMove({ ...pointer({ y: 10 }), currentTarget: down.currentTarget });
    expect(down.currentTarget.style.transform).toBe('translateY(0px)');
  });

  it('ignores moves and ends with no drag in progress', () => {
    const onDismiss = vi.fn();
    const { result } = renderHook(() => useSwipeDismiss(onDismiss));
    const e = pointer({ y: 100 });
    result.current.onPointerMove(e);
    result.current.onPointerUp(e);
    expect(e.currentTarget.style.transform).toBeUndefined();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('does not treat a press without movement as a swipe', () => {
    const onDismiss = vi.fn();
    const { result } = renderHook(() => useSwipeDismiss(onDismiss));
    const down = pointer({ y: 10 });
    result.current.onPointerDown(down);
    result.current.onPointerUp({ ...pointer({ y: 200 }), currentTarget: down.currentTarget });
    expect(onDismiss).not.toHaveBeenCalled();
    expect(down.currentTarget.style.transition).toBeUndefined();
  });

  it('does nothing on viewports that do not match the query', () => {
    window.matchMedia = vi.fn(() => ({ matches: false }));
    const { result } = renderHook(() => useSwipeDismiss(vi.fn()));
    const down = pointer({ y: 10 });
    result.current.onPointerDown(down);
    result.current.onPointerMove({ ...pointer({ y: 100 }), currentTarget: down.currentTarget });
    expect(down.currentTarget.style.transform).toBeUndefined();
    expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 639.98px)');
  });

  it('ignores presses on slider handles', () => {
    const { result } = renderHook(() => useSwipeDismiss(vi.fn()));
    const down = pointer({ y: 10, matchesScrollable: (sel) => (sel.includes('range') ? {} : null) });
    result.current.onPointerDown(down);
    result.current.onPointerMove({ ...pointer({ y: 100 }), currentTarget: down.currentTarget });
    expect(down.currentTarget.style.transform).toBeUndefined();
  });

  it('only starts below the handle zone when a scrollable top is allowed', () => {
    const lowDown = pointer({ y: 200, top: 0 });
    const { result } = renderHook(() => useSwipeDismiss(vi.fn()));
    result.current.onPointerDown(lowDown);
    result.current.onPointerMove({ ...pointer({ y: 300 }), currentTarget: lowDown.currentTarget });
    expect(lowDown.currentTarget.style.transform).toBeUndefined();
  });

  it('starts from a scrolled-to-top scroller when allowed, and gives up if the user scrolls up', () => {
    const scroller = { scrollTop: 0 };
    const { result } = renderHook(() => useSwipeDismiss(vi.fn(), { allowScrollableTop: true }));
    const down = pointer({ y: 200, matchesScrollable: (sel) => (sel === '.filter-scroll' ? scroller : null) });
    result.current.onPointerDown(down);
    result.current.onPointerMove({ ...pointer({ y: 100 }), currentTarget: down.currentTarget });
    expect(down.currentTarget.style.transform).toBeUndefined();
    result.current.onPointerMove({ ...pointer({ y: 300 }), currentTarget: down.currentTarget });
    expect(down.currentTarget.style.transform).toBeUndefined();

    const again = pointer({ y: 200, matchesScrollable: (sel) => (sel === '.filter-scroll' ? scroller : null) });
    result.current.onPointerDown(again);
    result.current.onPointerMove({ ...pointer({ y: 260 }), currentTarget: again.currentTarget });
    expect(again.currentTarget.style.transform).toBe('translateY(60px)');
  });

  it('refuses a scroller that is already scrolled', () => {
    const scroller = { scrollTop: 40 };
    const { result } = renderHook(() => useSwipeDismiss(vi.fn(), { allowScrollableTop: true }));
    const down = pointer({ y: 200,     matchesScrollable: (sel) => (sel === '.filter-scroll' ? scroller : null) });
    result.current.onPointerDown(down);
    result.current.onPointerMove({ ...pointer({ y: 300 }), currentTarget: down.currentTarget });
    expect(down.currentTarget.style.transform).toBeUndefined();
  });
});

describe('useSwipeDismiss (horizontal)', () => {
  it('slides left and dismisses past the threshold', () => {
    const onDismiss = vi.fn();
    const { result } = renderHook(() => useSwipeDismiss(onDismiss, { axis: 'x', query: '(min-width: 1px)' }));
    const down = pointer({ x: 300, y: 500 });
    result.current.onPointerDown(down);
    result.current.onPointerMove({ ...pointer({ x: 240 }), currentTarget: down.currentTarget });
    expect(down.currentTarget.style.transform).toBe('translateX(-60px)');
    result.current.onPointerMove({ ...pointer({ x: 340 }), currentTarget: down.currentTarget });
    expect(down.currentTarget.style.transform).toBe('translateX(0px)');
    result.current.onPointerUp({ ...pointer({ x: 200 }), currentTarget: down.currentTarget });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(window.matchMedia).toHaveBeenCalledWith('(min-width: 1px)');
  });
});
