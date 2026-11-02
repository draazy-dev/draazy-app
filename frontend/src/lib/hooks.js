import { useCallback, useEffect, useRef, useState } from 'react';
import { cleanMobile } from './idFormat.js';

export function useFieldErrors(formRef) {
  const [errors, setErrors] = useState({});

  const clear = useCallback((name) => setErrors((e) => {
    if (!e[name]) return e;
    const { [name]: _omit, ...rest } = e;
    return rest;
  }), []);

  const clearAll = useCallback(() => setErrors({}), []);

  const check = useCallback((specs, toast) => {
    const next = {};
    let firstName = null;
    let firstMsg = '';
    for (const s of specs || []) {
      if (!s) continue;
      const ok = typeof s.ok === 'function' ? !!s.ok() : !!s.ok;
      if (!ok) {
        next[s.name] = s.msg || 'Required';
        if (!firstName) { firstName = s.name; firstMsg = s.msg || 'Please complete the highlighted field(s)'; }
      }
    }
    setErrors(next);
    if (!firstName) return true;
    if (toast) toast(firstMsg, 'error');
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        const root = (formRef && formRef.current) || document;
        const el = root.querySelector('[data-err="' + firstName + '"]');
        if (el) {
          if (el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const focusable = el.matches('input,select,textarea,button,[tabindex]') ? el : el.querySelector('input,select,textarea,button,[tabindex]');
          if (focusable && focusable.focus) { try { focusable.focus({ preventScroll: true }); } catch { focusable.focus(); } }
        }
      });
    }
    return false;
  }, [formRef]);

  const cx = useCallback((name) => (errors[name] ? ' dz-invalid dz-shake' : ''), [errors]);

  return { errors, check, clear, clearAll, cx, has: (n) => !!errors[n], msg: (n) => errors[n] || '' };
}

const IN_PATTERN = /^[6-9]\d{9}$/;
export function useMobileInput(initial = '') {
  const [value, setRaw] = useState(() => cleanMobile(initial));
  const setValue = useCallback((v) => setRaw(cleanMobile(v)), []);
  const onChange = useCallback((e) => setValue(e.target.value), [setValue]);
  const valid = IN_PATTERN.test(value);
  return { value, setValue, onChange, valid, dial: '+91', maxLength: 10, inputMode: 'numeric' };
}

export const isValidMobile = (v) => IN_PATTERN.test(String(v || '').replace(/\D/g, ''));

function draftHasContent(obj, ignore) {
  return Object.keys(obj || {}).some((k) => {
    if (ignore && ignore.includes(k)) return false;
    const v = obj[k];
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'string') return v.trim() !== '';
    if (typeof v === 'number') return true;
    if (typeof v === 'boolean') return v;
    return v != null && v !== '';
  });
}

function omitKeys(obj, omit) {
  if (!omit || !omit.length) return obj;
  const out = {};
  for (const k in obj) if (!omit.includes(k)) out[k] = obj[k];
  return out;
}

function flashDraftSaved() {
  if (typeof document === 'undefined') return;
  let s = document.getElementById('dzAutosaveSaved');
  if (!s) {
    s = document.createElement('div');
    s.id = 'dzAutosaveSaved';
    s.className = 'dz-autosave-flash';
    const dot = document.createElement('span');
    dot.className = 'dz-autosave-flash__dot';
    s.appendChild(dot);
    s.appendChild(document.createTextNode(' Draft saved'));
    document.body.appendChild(s);
  }
  s.classList.add('is-on');
  clearTimeout(s._t);
  s._t = setTimeout(() => { s.classList.remove('is-on'); }, 1400);
}

export function useFormDraft(key, form, setForm, { debounce = 400, ignore = ['name', 'mobile'], omit = [], enabled = true, onRestore = null } = {}) {
  const [restored, setRestored] = useState(false);
  const firstRun = useRef(true);
  const cleared = useRef(false);
  const skipSnapshot = useRef(null);
  const timer = useRef(null);
  const onRestoreRef = useRef(onRestore);
  const restoredKey = useRef(null);

  useEffect(() => { onRestoreRef.current = onRestore; }, [onRestore]);

  useEffect(() => {
    if (!enabled || restoredKey.current === key) return;
    restoredKey.current = key;
    cleared.current = false;
    try {
      const parsed = JSON.parse(localStorage.getItem(key));
      const saved = parsed && typeof parsed === 'object' ? omitKeys(parsed, omit) : null;
      if (saved && draftHasContent(saved, ignore)) {
        const nonEmptyFields = {};
        for (const k in saved) {
          const v = saved[k];
          const isEmpty = v == null || v === '' || (Array.isArray(v) && v.length === 0);
          if (!isEmpty) nonEmptyFields[k] = v;
        }
        const restoredFields = onRestoreRef.current ? onRestoreRef.current(nonEmptyFields) : nonEmptyFields;
        if (restoredFields && typeof restoredFields === 'object') {
          setForm((f) => ({ ...f, ...restoredFields }));
        }
        setRestored(true);
      }
    } catch {
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  const snapshot = enabled ? JSON.stringify(omitKeys(form, omit)) : null;

  useEffect(() => {
    if (!enabled) return undefined;
    if (firstRun.current) { firstRun.current = false; return undefined; }
    if (cleared.current) return undefined;
    if (skipSnapshot.current === snapshot) { skipSnapshot.current = null; return undefined; }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        if (draftHasContent(omitKeys(form, omit), ignore)) { localStorage.setItem(key, snapshot); flashDraftSaved(); }
        else localStorage.removeItem(key);
      } catch {
      }
    }, debounce);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, snapshot, debounce, enabled]);

  const clear = useCallback(() => {
    clearTimeout(timer.current);
    cleared.current = true;
    try { localStorage.removeItem(key); } catch { }
    setRestored(false);
  }, [key]);

  const discard = useCallback(() => {
    clearTimeout(timer.current);
    cleared.current = false;
    skipSnapshot.current = snapshot;
    try { localStorage.removeItem(key); } catch { }
    setRestored(false);
  }, [key, snapshot]);

  const flush = () => {
    if (!enabled || cleared.current) return;
    clearTimeout(timer.current);
    try {
      if (draftHasContent(omitKeys(form, omit), ignore)) localStorage.setItem(key, snapshot);
      else localStorage.removeItem(key);
    } catch { }
  };

  const startFresh = useCallback(() => {
    clear();
    if (typeof window !== 'undefined') window.location.reload();
  }, [clear]);

  return { restored, clear, discard, flush, startFresh };
}
