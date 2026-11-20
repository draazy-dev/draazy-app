import { useId } from 'react';
import NativeSelect from '../../../../components/ui/NativeSelect.jsx';
import FieldError from '../../../../components/ui/FieldError.jsx';
import { AREA_UNITS } from './constants.js';

export default function AreaField({ t, label, required, error, className, inputClassName, value, onChange, placeholder, unit, onUnit, unitTitle }) {
  const id = useId();
  const errorId = `${id}-err`;
  return (
    <div className={className}>
      <label className={required ? 'lbl req' : 'lbl'} htmlFor={id}>{label}</label>
      <div className="flex gap-2">
        <input id={id} inputMode="decimal" value={value || ''} onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))} className={`min-w-0 flex-1 ${inputClassName}`} placeholder={placeholder} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} />
        <div className="w-24 shrink-0">
          <NativeSelect value={unit || 'sqft'} title={unitTitle} onChange={(e) => onUnit(e.target.value)}>
            {AREA_UNITS.map((v) => <option key={v} value={v}>{t(`services.ra.property.areaUnitOpt.${v}`)}</option>)}
          </NativeSelect>
        </div>
      </div>
      <FieldError id={errorId} alert={false}>{error}</FieldError>
    </div>
  );
}
