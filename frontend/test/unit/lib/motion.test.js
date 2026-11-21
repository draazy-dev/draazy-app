import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function load() {
  vi.resetModules();
  return import('../../../src/lib/motion.js');
}

const mm = (matches) => vi.fn(() => ({ matches }));

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  delete window.matchMedia;
  localStorage.clear();
});

describe('reducedMotion', () => {
  it('is true when the OS asks for reduced motion', async () => {
    window.matchMedia = mm(true);
    const { reducedMotion } = await load();
    expect(reducedMotion()).toBe(true);
    expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  });

  it('is true when the in-app preference is set', async () => {
    window.matchMedia = mm(false);
    localStorage.setItem('dzAppPrefs', JSON.stringify({ reduceMotion: true }));
    const { reducedMotion } = await load();
    expect(reducedMotion()).toBe(true);
  });

  it('is false by default and without matchMedia', async () => {
    window.matchMedia = mm(false);
    const { reducedMotion } = await load();
    expect(reducedMotion()).toBe(false);
    delete window.matchMedia;
    expect(reducedMotion()).toBe(false);
  });

  it('is false when matchMedia throws', async () => {
    window.matchMedia = () => { throw new Error('nope'); };
    const { reducedMotion } = await load();
    expect(reducedMotion()).toBe(false);
  });
});

describe('installReducedMotionScroll', () => {
  const origEl = {};
  const origWin = {};
  beforeEach(() => {
    ['scrollTo', 'scrollBy', 'scrollIntoView'].forEach((n) => { origEl[n] = Element.prototype[n]; });
    ['scrollTo', 'scrollBy'].forEach((n) => { origWin[n] = window[n]; });
  });
  afterEach(() => {
    Object.assign(Element.prototype, origEl);
    Object.assign(window, origWin);
  });

  it('demotes smooth scrolling to auto when motion is reduced', async () => {
    window.matchMedia = mm(true);
    const native = vi.fn();
    Element.prototype.scrollTo = native;
    Element.prototype.scrollBy = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
    window.scrollTo = vi.fn();
    window.scrollBy = vi.fn();
    const { installReducedMotionScroll } = await load();
    installReducedMotionScroll();
    const el = document.createElement('div');
    el.scrollTo({ top: 10, behavior: 'smooth' });
    expect(native).toHaveBeenCalledWith({ top: 10, behavior: 'auto' });
    el.scrollTo({ top: 10, behavior: 'instant' });
    expect(native).toHaveBeenLastCalledWith({ top: 10, behavior: 'instant' });
    el.scrollTo(0, 20);
    expect(native).toHaveBeenLastCalledWith(0, 20);
  });

  it('leaves smooth scrolling alone when motion is allowed', async () => {
    window.matchMedia = mm(false);
    const native = vi.fn();
    Element.prototype.scrollIntoView = native;
    Element.prototype.scrollTo = vi.fn();
    Element.prototype.scrollBy = vi.fn();
    window.scrollTo = vi.fn();
    window.scrollBy = vi.fn();
    const { installReducedMotionScroll } = await load();
    installReducedMotionScroll();
    document.createElement('div').scrollIntoView({ behavior: 'smooth' });
    expect(native).toHaveBeenCalledWith({ behavior: 'smooth' });
  });

  it('patches only once', async () => {
    window.matchMedia = mm(false);
    Element.prototype.scrollTo = vi.fn();
    Element.prototype.scrollBy = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
    window.scrollTo = vi.fn();
    window.scrollBy = vi.fn();
    const { installReducedMotionScroll } = await load();
    installReducedMotionScroll();
    const patched = Element.prototype.scrollTo;
    installReducedMotionScroll();
    expect(Element.prototype.scrollTo).toBe(patched);
  });

  it('skips methods the platform does not provide', async () => {
    window.matchMedia = mm(false);
    Element.prototype.scrollTo = vi.fn();
    Element.prototype.scrollBy = vi.fn();
    Element.prototype.scrollIntoView = undefined;
    window.scrollTo = vi.fn();
    window.scrollBy = vi.fn();
    const { installReducedMotionScroll } = await load();
    expect(() => installReducedMotionScroll()).not.toThrow();
    expect(Element.prototype.scrollIntoView).toBeUndefined();
  });
});
