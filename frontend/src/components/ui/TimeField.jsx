import { useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { displayTime } from '../../lib/timeOfDay.js';
import TimePickerDialog from './TimePickerDialog.jsx';

export default function TimeField({
  value = '',
  onChange,
  format = '12h',
  minuteStep = 5,
  className = '',
  invalid = false,
  dataErr,
  disabled = false,
  ariaLabel,
  placeholder,
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const display = displayTime(value, format);
  const ph = placeholder || t('ui.selectTime');
  const label = ariaLabel || ph;

  return (
    <>
      <div
        ref={anchorRef}
        className={`dz-datefield ${invalid ? 'dz-invalid' : ''} ${disabled ? 'is-disabled' : ''} ${className}`}
        data-err={dataErr}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-disabled={disabled || undefined}
        aria-label={label}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((o) => !o); }
        }}
      >
        <span className={`dz-datefield__text ${!display ? 'is-placeholder' : ''}`}>
          {display || ph}
        </span>
        <Clock className="dz-datefield__icon" aria-hidden="true" />
      </div>
      <TimePickerDialog
        open={open}
        value={value}
        anchorRef={anchorRef}
        format={format}
        minuteStep={minuteStep}
        ariaLabel={label}
        onClose={() => setOpen(false)}
        onConfirm={(v) => { onChange?.(v); setOpen(false); }}
      />
    </>
  );
}
