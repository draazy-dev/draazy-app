import { useId } from 'react';
import { onActivateKey } from '../../../lib/onActivateKey.js';

export const Pill = ({ selected, onClick, children, className = '', dataErr, ariaLabel, role = 'button' }) => (
  <div
    onClick={onClick}
    onKeyDown={onActivateKey(onClick)}
    role={role}
    tabIndex={0}
    {...(role === 'radio' ? { 'aria-checked': !!selected } : { 'aria-pressed': !!selected })}
    aria-label={ariaLabel}
    data-err={dataErr}
    className={`radio-pill tap-coarse rounded-xl text-sm font-medium cursor-pointer ${selected ? 'selected' : 'text-gray-400'} ${className}`}
  >
    {children}
  </div>
);

export { default as FieldError } from '../../../components/ui/FieldError.jsx';

// One row of equal-width answers, so a 2–4 option question never wraps or hides behind a dropdown on a phone.
// `fit` sizes tiles to their text instead, for one long label ("Semi-Furnished") that would wrap in a third.
export const PillRow = ({ options, value, onChange, label, cols = 'grid-cols-2', fit = false, role = 'button', dataErr, invalid = false }) => (
  <div
    role={role === 'radio' ? 'radiogroup' : 'group'}
    aria-label={label}
    data-err={dataErr}
    className={`${fit ? 'flex' : `grid ${cols}`} gap-2 ${invalid ? 'dz-invalid-group' : ''}`}
  >
    {options.map(([v, l]) => (
      <Pill key={v} role={role} selected={value === v} onClick={() => onChange(v)} className={`min-h-[var(--btn-h)] px-2 py-1.5 inline-flex items-center justify-center text-center leading-tight ${fit ? 'grow whitespace-nowrap' : ''}`}>{l}</Pill>
    ))}
  </div>
);

export const Toggle = ({ on, onClick, ariaLabel }) => (
  <div
    onClick={onClick}
    onKeyDown={onActivateKey(onClick)}
    role="switch"
    tabIndex={0}
    aria-checked={!!on}
    aria-label={ariaLabel}
    className={`toggle-track tap-extend cursor-pointer ${on ? 'active' : ''}`}
  >
    <div className="toggle-thumb" />
  </div>
);

export const ToggleRow = ({ title, subtitle, on, onClick, className = '', pad = 'p-4' }) => {
  const subtitleId = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!on}
      aria-label={typeof title === 'string' ? title : undefined}
      aria-describedby={subtitle ? subtitleId : undefined}
      onClick={onClick}
      className={`flex w-full items-center justify-between text-left ${pad} rounded-xl bg-white/[0.03] border border-white/5 ${className}`}
    >
      <span>
        <span className="block text-sm font-medium text-white">{title}</span>
        {subtitle && <span id={subtitleId} className="block text-xs text-gray-500 mt-0.5">{subtitle}</span>}
      </span>
      <span aria-hidden="true" className={`toggle-track ${on ? 'active' : ''}`}>
        <span className="toggle-thumb" />
      </span>
    </button>
  );
};
