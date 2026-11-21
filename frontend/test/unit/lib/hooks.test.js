import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { isValidMobile, useFieldErrors, useFormDraft, useMobileInput } from '../../../src/lib/hooks.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('useFieldErrors', () => {
  it('passes when every spec is ok, resolving function specs lazily', () => {
    const { result } = renderHook(() => useFieldErrors());
    const toast = vi.fn();
    let ok;
    act(() => { ok = result.current.check([{ name: 'a', ok: true }, { name: 'b', ok: () => 'yes' }, null], toast); });
    expect(ok).toBe(true);
    expect(result.current.errors).toEqual({});
    expect(toast).not.toHaveBeenCalled();
    act(() => { result.current.check(undefined); });
    expect(result.current.errors).toEqual({});
  });

  it('records messages, toasts the first failure and exposes helpers', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
    const { result } = renderHook(() => useFieldErrors());
    const toast = vi.fn();
    let ok;
    act(() => { ok = result.current.check([{ name: 'a', ok: false, msg: 'A is bad' }, { name: 'b', ok: () => false }, { name: 'c', ok: true }], toast); });
    expect(ok).toBe(false);
    expect(result.current.errors).toEqual({ a: 'A is bad', b: 'Required' });
    expect(toast).toHaveBeenCalledWith('A is bad', 'error');
    expect(result.current.has('a')).toBe(true);
    expect(result.current.has('c')).toBe(false);
    expect(result.current.msg('b')).toBe('Required');
    expect(result.current.msg('c')).toBe('');
    expect(result.current.cx('a')).toBe(' dz-invalid dz-shake');
    expect(result.current.cx('c')).toBe('');
  });

  it('uses a generic toast when the first failure has no message', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
    const { result } = renderHook(() => useFieldErrors());
    const toast = vi.fn();
    act(() => { result.current.check([{ name: 'a', ok: false }], toast); });
    expect(toast).toHaveBeenCalledWith('Please complete the highlighted field(s)', 'error');
  });

  it('clears a single error, keeps state stable for unknown names, and clears all', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
    const { result } = renderHook(() => useFieldErrors());
    act(() => { result.current.check([{ name: 'a', ok: false }, { name: 'b', ok: false }]); });
    const before = result.current.errors;
    act(() => result.current.clear('zzz'));
    expect(result.current.errors).toBe(before);
    act(() => result.current.clear('a'));
    expect(result.current.errors).toEqual({ b: 'Required' });
    act(() => result.current.clearAll());
    expect(result.current.errors).toEqual({});
  });

  it('scrolls to and focuses the first invalid control after the next frame', () => {
    const rafs = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { rafs.push(cb); return 0; });
    document.body.innerHTML = '<form id="f"><div data-err="a"><input id="inA"></div><button data-err="b" id="b">x</button></form>';
    const form = document.getElementById('f');
    const scroll = vi.fn();
    form.querySelectorAll('[data-err]').forEach((el) => { el.scrollIntoView = scroll; });
    const { result } = renderHook(() => useFieldErrors({ current: form }));
    act(() => { result.current.check([{ name: 'a', ok: false }]); });
    rafs.shift()();
    expect(scroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    expect(document.activeElement.id).toBe('inA');
    act(() => { result.current.check([{ name: 'b', ok: false }]); });
    rafs.shift()();
    expect(document.activeElement.id).toBe('b');
  });

  it('falls back to document search, tolerates missing elements and a focus that rejects options', () => {
    const rafs = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { rafs.push(cb); return 0; });
    document.body.innerHTML = '<input data-err="x" id="x">';
    const x = document.getElementById('x');
    const focus = vi.fn().mockImplementationOnce(() => { throw new Error('opts'); });
    x.focus = focus;
    const { result } = renderHook(() => useFieldErrors());
    act(() => { result.current.check([{ name: 'x', ok: false }]); });
    rafs.shift()();
    expect(focus).toHaveBeenCalledTimes(2);
    act(() => { result.current.check([{ name: 'missing', ok: false }]); });
    expect(() => rafs.shift()()).not.toThrow();
  });
});

describe('mobile helpers', () => {
  it('validates Indian mobiles ignoring formatting', () => {
    expect(isValidMobile('98765 43210')).toBe(true);
    expect(isValidMobile('+91 98765 43210')).toBe(false);
    expect(isValidMobile('5876543210')).toBe(false);
    expect(isValidMobile(null)).toBe(false);
  });

  it('useMobileInput cleans input and tracks validity', () => {
    const { result } = renderHook(() => useMobileInput('+91 98765 43210'));
    expect(result.current).toMatchObject({ value: '9876543210', valid: true, dial: '+91', maxLength: 10, inputMode: 'numeric' });
    act(() => result.current.onChange({ target: { value: '12345' } }));
    expect(result.current).toMatchObject({ value: '12345', valid: false });
    act(() => result.current.setValue('0 98765-43210'));
    expect(result.current.value).toBe('9876543210');
  });

  it('useMobileInput starts empty and invalid', () => {
    const { result } = renderHook(() => useMobileInput());
    expect(result.current).toMatchObject({ value: '', valid: false });
  });
});

describe('useFormDraft', () => {
  const KEY = 'draft:test';
  let form;
  const setForm = vi.fn((fn) => { form = typeof fn === 'function' ? fn(form) : fn; });

  const mount = (opts, initial = { name: '', title: '', tags: [] }) => {
    form = initial;
    return renderHook(({ f }) => useFormDraft(KEY, f, setForm, opts), { initialProps: { f: form } });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    setForm.mockClear();
  });

  it('restores a saved draft once, skipping empty fields', () => {
    localStorage.setItem(KEY, JSON.stringify({ title: 'Flat', tags: [], note: '', name: 'Ravi' }));
    const { result } = mount();
    expect(result.current.restored).toBe(true);
    expect(form).toEqual({ name: 'Ravi', title: 'Flat', tags: [] });
    expect(setForm).toHaveBeenCalledTimes(1);
  });

  it('ignores a draft that only contains ignored or empty fields', () => {
    localStorage.setItem(KEY, JSON.stringify({ name: 'Ravi', mobile: '9876543210', title: '   ' }));
    const { result } = mount();
    expect(result.current.restored).toBe(false);
    expect(setForm).not.toHaveBeenCalled();
  });

  it('ignores corrupt or non-object storage', () => {
    localStorage.setItem(KEY, '{not json');
    expect(mount().result.current.restored).toBe(false);
    cleanup();
    localStorage.setItem(KEY, '"str"');
    expect(mount().result.current.restored).toBe(false);
  });

  it('lets onRestore transform or veto the restored fields', () => {
    localStorage.setItem(KEY, JSON.stringify({ title: 'Flat' }));
    mount({ onRestore: (f) => ({ ...f, title: f.title.toUpperCase() }) });
    expect(form.title).toBe('FLAT');
    cleanup();
    localStorage.setItem(KEY, JSON.stringify({ title: 'Flat' }));
    const veto = mount({ onRestore: () => null });
    expect(veto.result.current.restored).toBe(true);
    expect(form.title).toBe('');
  });

  it('omits configured keys when restoring', () => {
    localStorage.setItem(KEY, JSON.stringify({ title: 'Flat', secret: 'x' }));
    mount({ omit: ['secret'] });
    expect(form).toEqual({ name: '', title: 'Flat', tags: [] });
  });

  it('does not restore or save when disabled', () => {
    localStorage.setItem(KEY, JSON.stringify({ title: 'Flat' }));
    const { result, rerender } = mount({ enabled: false });
    expect(result.current.restored).toBe(false);
    rerender({ f: { title: 'Typed' } });
    vi.advanceTimersByTime(1000);
    expect(localStorage.getItem(KEY)).toBe(JSON.stringify({ title: 'Flat' }));
    act(() => result.current.flush());
    expect(localStorage.getItem(KEY)).toBe(JSON.stringify({ title: 'Flat' }));
  });

  it('saves edits after the debounce and flashes a confirmation', () => {
    const { rerender } = mount();
    rerender({ f: { name: '', title: 'Typed', tags: [] } });
    vi.advanceTimersByTime(399);
    expect(localStorage.getItem(KEY)).toBeNull();
    vi.advanceTimersByTime(1);
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual({ name: '', title: 'Typed', tags: [] });
    const flash = document.getElementById('dzAutosaveSaved');
    expect(flash.classList.contains('is-on')).toBe(true);
    expect(flash.textContent).toContain('Draft saved');
    vi.advanceTimersByTime(1400);
    expect(flash.classList.contains('is-on')).toBe(false);
    rerender({ f: { name: '', title: 'Typed again', tags: [] } });
    vi.advanceTimersByTime(400);
    expect(document.querySelectorAll('#dzAutosaveSaved')).toHaveLength(1);
  });

  it('removes the draft when the form returns to empty, and honours a custom debounce and omit', () => {
    const { rerender } = mount({ debounce: 50, omit: ['tags'] });
    rerender({ f: { name: '', title: 'A', tags: ['x'] } });
    vi.advanceTimersByTime(50);
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual({ name: '', title: 'A' });
    rerender({ f: { name: '', title: '', tags: ['x'] } });
    vi.advanceTimersByTime(50);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('clear removes the draft and stops further saving', () => {
    localStorage.setItem(KEY, JSON.stringify({ title: 'Flat' }));
    const { result, rerender } = mount();
    act(() => result.current.clear());
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(result.current.restored).toBe(false);
    rerender({ f: { name: '', title: 'New', tags: [] } });
    vi.advanceTimersByTime(1000);
    expect(localStorage.getItem(KEY)).toBeNull();
    act(() => result.current.flush());
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('discard cancels the pending save but keeps saving later edits', () => {
    const { result, rerender } = mount();
    rerender({ f: { name: '', title: 'Flat', tags: [] } });
    act(() => result.current.discard());
    vi.advanceTimersByTime(1000);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(result.current.restored).toBe(false);
    rerender({ f: { name: '', title: 'Different', tags: [] } });
    vi.advanceTimersByTime(400);
    expect(JSON.parse(localStorage.getItem(KEY)).title).toBe('Different');
  });

  it('flush writes immediately, or removes an empty draft', () => {
    const { result, rerender } = mount();
    rerender({ f: { name: '', title: 'Now', tags: [] } });
    act(() => result.current.flush());
    expect(JSON.parse(localStorage.getItem(KEY)).title).toBe('Now');
    rerender({ f: { name: 'only-ignored', title: '', tags: [] } });
    act(() => result.current.flush());
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('startFresh clears the draft and reloads the page', () => {
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, reload } });
    localStorage.setItem(KEY, JSON.stringify({ title: 'Flat' }));
    const { result } = mount();
    act(() => result.current.startFresh());
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(reload).toHaveBeenCalledTimes(1);
    Object.defineProperty(window, 'location', { configurable: true, value: original });
  });

  it('survives storage failures', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
    const { result, rerender } = mount();
    rerender({ f: { name: '', title: 'X', tags: [] } });
    expect(() => vi.advanceTimersByTime(400)).not.toThrow();
    expect(() => act(() => result.current.flush())).not.toThrow();
    expect(() => act(() => result.current.clear())).not.toThrow();
    expect(() => act(() => result.current.discard())).not.toThrow();
  });
});
