import Icon from '../../../components/Icon.jsx';
import HScroll from '../../../components/ui/HScroll.jsx';
import { Link } from 'react-router';

export const Card = ({ children, className = '', ...rest }) => (
  <div className={'glass-card rounded-2xl ' + className} {...rest}>{children}</div>
);

export function SubNav({ items, active, onChange, variant = 'pill', wrapClassName = 'mb-5', label, panelId }) {
  if (!items || items.length < 2) return null;

  if (variant === 'underline') {
    const focusable = items.some((it) => it.key === active) ? active : items[0].key;
    const onKeyDown = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const from = e.target.closest('[data-tab]')?.dataset.tab ?? focusable;
      const at = items.findIndex((it) => it.key === from);
      const to = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: items.length - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      const next = items[(to + items.length) % items.length].key;
      onChange(next);
      e.currentTarget.querySelector(`[data-tab="${next}"]`)?.focus();
    };
    return (
      <HScroll role="tablist" aria-label={label} onKeyDown={onKeyDown} fadeColor="var(--brand-dark)" wrapClassName={wrapClassName} className="flex gap-1 sm:gap-2 border-b border-white/10">
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            role="tab"
            id={panelId ? `${panelId}-tab-${it.key}` : undefined}
            aria-controls={panelId}
            aria-selected={active === it.key}
            tabIndex={focusable === it.key ? 0 : -1}
            data-tab={it.key}
            onClick={() => onChange(it.key)}
            className={'dz-detail-tab' + (active === it.key ? ' is-active' : '')}
          >
            {it.icon ? <Icon name={it.icon} className="w-4 h-4" /> : null}
            <span>{it.label}</span>
            {it.count > 0 ? (
              <span className={'dz-count ' + (active === it.key ? 'bg-brand-teal/20 text-brand-teal' : 'bg-white/10 text-gray-300')}>{it.count}</span>
            ) : null}
          </button>
        ))}
      </HScroll>
    );
  }

  return (
    <HScroll wrapClassName="-mx-1 mb-5" className="flex gap-1.5 px-1">
      {items.map((it) => (
        <button
          key={it.key}
          onClick={() => onChange(it.key)}
          aria-current={active === it.key ? 'page' : undefined}
          className={'h-btn inline-flex items-center gap-2 whitespace-nowrap rounded-xl border px-3.5 text-sm font-medium transition ' + (active === it.key ? 'border-brand-teal/30 bg-brand-teal/15 text-brand-teal' : 'border-transparent bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white')}
        >
          {it.icon ? <Icon name={it.icon} className="w-4 h-4" /> : null} {it.label}
          {it.count > 0 ? (
            <span className={'dz-count ml-0.5 ' + (active === it.key ? 'bg-brand-teal/25 text-brand-teal' : 'bg-white/10 text-gray-300')}>{it.count}</span>
          ) : null}
        </button>
      ))}
    </HScroll>
  );
}

export const SectionHead = ({ icon, iconCls = 'text-teal-400', title, sub, action }) => (
  <div className="flex flex-col gap-3 mb-5 sm:flex-row sm:items-start sm:justify-between">
    <div className="min-w-0">
      <h2 className="text-lg font-bold text-white flex items-center gap-2">
        {icon ? <Icon name={icon} className={'w-5 h-5 flex-shrink-0 ' + iconCls} /> : null} <span className="min-w-0 sm:truncate">{title}</span>
      </h2>
      {sub ? <p className="text-gray-500 text-xs mt-0.5">{sub}</p> : null}
    </div>
    {action ? <div className="w-full sm:w-auto sm:flex-shrink-0">{action}</div> : null}
  </div>
);

const CHIP_TINTS = {
  teal: 'bg-brand-teal/15 text-brand-teal',
  amber: 'bg-amber-400/15 text-amber-300',
  sky: 'bg-sky-400/15 text-sky-300',
  violet: 'bg-violet-400/15 text-violet-300',
  emerald: 'bg-emerald-400/15 text-emerald-300',
};

export const RequestList = ({ children }) => (
  <div className="-mx-3 divide-y divide-white/[0.05]">{children}</div>
);

const URGENCY_TINTS = {
  hot: 'bg-rose-500/15 text-rose-300',
  warm: 'bg-amber-400/15 text-amber-300',
};

export function RequestRow({ icon, tint = 'teal', avatar, title, badge, meta, time, urgency, attention = false, onOpen, children }) {
  const chip = CHIP_TINTS[tint] || CHIP_TINTS.teal;
  const urgent = urgency?.level === 'hot';
  const identity = (
    <>
      {avatar != null ? (
        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-teal to-emerald-500 text-xs font-bold text-white">{avatar}</span>
      ) : (
        <span className={'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ' + chip}>
          <Icon name={icon} className="h-5 w-5" />
        </span>
      )}
      <span className="block min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{title}</span>
          {badge ? (
            <span className="dz-tag bg-emerald-500/15 font-bold text-emerald-300">
              <Icon name="shield-check" className="h-2.5 w-2.5" />{badge}
            </span>
          ) : null}
          {urgency ? (
            <span className={'dz-tag font-bold ' + (URGENCY_TINTS[urgency.level] || URGENCY_TINTS.warm)}>
              <Icon name="timer" className="h-2.5 w-2.5" />{urgency.label}
            </span>
          ) : time ? (
            <span className="flex-shrink-0 text-[13px] sm:text-[11px] font-medium text-gray-500">{time}</span>
          ) : null}
        </span>
        {meta ? <span className="mt-0.5 block line-clamp-2 text-xs text-gray-500 sm:truncate">{meta}</span> : null}
      </span>
    </>
  );
  return (
    <div className="group relative rounded-xl py-3.5 pl-4 pr-3 transition-colors hover:bg-white/[0.03]">
      {attention ? (
        <span aria-hidden="true" className={'absolute left-0 top-4 h-8 w-[3px] rounded-full ' + (urgent ? 'bg-rose-400' : 'bg-brand-teal')} />
      ) : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            aria-label={'Open ' + (typeof title === 'string' ? title : 'lead') + ' details'}
            className="flex min-w-0 flex-1 basis-full items-center gap-4 rounded-lg text-left transition sm:basis-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/50"
          >
            {identity}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 basis-full items-center gap-4 sm:basis-auto">{identity}</div>
        )}
        {children ? <div className="flex w-full flex-shrink-0 flex-wrap items-center gap-2 pl-[3.75rem] sm:w-auto sm:justify-end sm:pl-0">{children}</div> : null}
      </div>
    </div>
  );
}

export const RequestEmpty = ({ icon = 'inbox', text, cta }) => (
  <div className="flex flex-col items-center gap-3 py-10 text-center">
    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.04]">
      <Icon name={icon} className="h-5 w-5 text-gray-500" />
    </div>
    <p className="text-sm text-gray-500">{text}</p>
    {cta ? (
      <Link to={cta.to} className="h-btn-sm inline-flex items-center gap-1.5 rounded-lg bg-brand-teal/15 px-3.5 text-xs font-semibold text-brand-teal transition hover:bg-brand-teal/25">
        {cta.icon ? <Icon name={cta.icon} className="h-3.5 w-3.5" /> : null} {cta.label}
      </Link>
    ) : null}
  </div>
);
