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
      <button
        type="button"
        ref={anchorRef}
        className={`dz-datefield ${invalid ? 'dz-invalid' : ''} ${className}`}
        data-err={dataErr}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`dz-datefield__text ${!display ? 'is-placeholder' : ''}`}>
          {display || ph}
        </span>
        <Clock className="dz-datefield__icon" aria-hidden="true" />
      </button>
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
