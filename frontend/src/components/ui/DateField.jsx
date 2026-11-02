import { useRef, useState } from 'react';
import { Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isoToDisplay } from '../../lib/format.js';
import DatePickerDialog from './DatePickerDialog.jsx';

export default function DateField({
  id,
  value = '',
  onChange,
  className = '',
  invalid = false,
  dataErr,
  min,
  max,
  disabled = false,
  ariaLabel,
  'aria-describedby': ariaDescribedBy,
  placeholder = 'DD/MM/YYYY',
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const display = isoToDisplay(value);
  const label = ariaLabel || t('ui.selectDate');

  return (
    <>
      <button
        type="button"
        ref={anchorRef}
        id={id}
        className={`dz-datefield ${invalid ? 'dz-invalid' : ''} ${className}`}
        data-err={dataErr}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        aria-describedby={ariaDescribedBy}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`dz-datefield__text ${!display ? 'is-placeholder' : ''}`}>
          {display || placeholder}
        </span>
        <Calendar className="dz-datefield__icon" aria-hidden="true" />
      </button>
      <DatePickerDialog
        open={open}
        value={value}
        anchorRef={anchorRef}
        min={min}
        max={max}
        ariaLabel={label}
        onClose={() => setOpen(false)}
        onConfirm={(iso) => { onChange?.(iso); setOpen(false); }}
      />
    </>
  );
}
