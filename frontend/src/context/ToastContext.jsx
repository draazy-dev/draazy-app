import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, XCircle, ToggleRight, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SESSION_ENDED_EVENT } from '../services/http.js';

const ToastContext = createContext(null);
let nextId = 0;

const STICKY_TYPES = new Set(['error', 'warning']);
const MAX_VISIBLE = 3;

// Paced for a second-language English reader (~150 wpm) plus time to notice the toast.
function autoDismissMs(message) {
  const words = typeof message === 'string' ? message.trim().split(/\s+/).length : 0;
  return Math.min(12000, Math.max(5000, 1500 + words * 400));
}

const TOAST_CONFIG = {
  success: {
    icon: CheckCircle2,
    containerCls: 'border-emerald-500/25 bg-gradient-to-r from-emerald-500/[0.08] to-transparent',
    iconCls: 'text-emerald-400',
    textCls: 'text-emerald-100',
  },
  error: {
    icon: XCircle,
    containerCls: 'border-rose-500/25 bg-gradient-to-r from-rose-500/[0.08] to-transparent',
    iconCls: 'text-rose-400',
    textCls: 'text-rose-100',
  },
  warning: {
    icon: AlertCircle,
    containerCls: 'border-amber-500/25 bg-gradient-to-r from-amber-500/[0.08] to-transparent',
    iconCls: 'text-amber-400',
    textCls: 'text-amber-100',
  },
  info: {
    icon: Info,
    containerCls: 'border-sky-500/20 bg-gradient-to-r from-sky-500/[0.06] to-transparent',
    iconCls: 'text-sky-400',
    textCls: 'text-gray-100',
  },
  toggle: {
    icon: ToggleRight,
    containerCls: 'border-brand-teal/25 bg-gradient-to-r from-brand-teal/[0.08] to-transparent',
    iconCls: 'text-brand-teal',
    textCls: 'text-gray-100',
  },
};

function Toast({ toast: t, onDismiss, onPause, onResume }) {
  const config = TOAST_CONFIG[t.type] || TOAST_CONFIG.info;
  const Icon = config.icon;

  return (
    <div
      onPointerEnter={() => onPause(t.id)}
      onPointerLeave={() => onResume(t.id)}
      onFocus={() => onPause(t.id)}
      onBlur={() => onResume(t.id)}
      className={`
        flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-2xl shadow-black/30
        backdrop-blur-xl bg-ink-2/90 min-w-[280px] max-w-[420px]
        animate-slideIn ${config.containerCls}
      `}
      role="alert"
    >
      <span className={`shrink-0 ${config.iconCls}`}>
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className={`flex-1 text-sm font-medium leading-snug ${config.textCls}`}>
        {t.message}
      </span>
      <button
        onClick={() => onDismiss(t.id)}
        className="shrink-0 rounded-lg p-1 text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }) {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());
  const shown = useRef(new Map());
  const durations = useRef(new Map());
  const order = useRef([]);

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    durations.current.delete(id);
    order.current = order.current.filter((x) => x !== id);
    shown.current.forEach((v, k) => { if (v === id) shown.current.delete(k); });
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);
  const pause = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  }, []);
  const resume = useCallback((id) => {
    const ms = durations.current.get(id);
    if (!ms) return;
    clearTimeout(timers.current.get(id));
    timers.current.set(id, setTimeout(() => dismiss(id), ms));
  }, [dismiss]);
  const toast = useCallback(
    (message, type = 'info') => {
      const key = typeof message === 'string' ? `${type}:${message}` : null;
      const live = key && shown.current.get(key);
      const id = live || ++nextId;
      if (!live) {
        if (key) shown.current.set(key, id);
        order.current.push(id);
        if (order.current.length > MAX_VISIBLE) dismiss(order.current[0]);
        setToasts((t) => [...t, { id, message, type }]);
      }
      if (!STICKY_TYPES.has(type)) {
        durations.current.set(id, autoDismissMs(message));
        resume(id);
      }
    },
    [dismiss, resume],
  );

  useEffect(() => {
    const onEnded = () => toast(t('common.sessionEnded'), 'warning');
    window.addEventListener(SESSION_ENDED_EVENT, onEnded);
    return () => window.removeEventListener(SESSION_ENDED_EVENT, onEnded);
  }, [toast, t]);

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div data-testid="toasts" className="fixed bottom-24 right-5 z-[1600] flex flex-col-reverse gap-2.5 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <Toast toast={t} onDismiss={dismiss} onPause={pause} onResume={resume} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
