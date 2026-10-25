import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import NativeSelect from '../../../components/ui/NativeSelect.jsx';
import RequiredMark from '../../../components/ui/RequiredMark.jsx';
import FieldError from '../../../components/ui/FieldError.jsx';

const fieldLabel = 'block text-sm font-medium text-gray-400 mb-2';

export default function FlatmateTerms({ value, onChange, required = false, errors = {} }) {
  const { t: tr } = useTranslation();
  const noticePeriodId = useId();
  const lockInId = useId();
  const mark = required && <RequiredMark />;
  const number = (id, name, max, placeholder) => (
    <input id={id} type="number" min="0" max={max} value={value[name]} data-err={name} aria-required={required || undefined} onChange={(e) => onChange({ [name]: e.target.value })} className={`field w-full rounded-xl px-3.5 py-2.5 text-sm ${errors[name] ? 'dz-invalid' : ''}`} placeholder={placeholder} />
  );
  const bill = (name, label) => (
    <div>
      <label className={fieldLabel}>{label}</label>
      <NativeSelect title={label} value={value[name]} onChange={(e) => onChange({ [name]: e.target.value })} className="field w-full rounded-full px-4 py-2 text-sm">
        <option value="">{tr('flatmates.billNotStated')}</option>
        <option value="included">{tr('flatmates.billIncluded')}</option>
        <option value="shared">{tr('flatmates.billShared')}</option>
        <option value="separate">{tr('flatmates.billSeparate')}</option>
      </NativeSelect>
    </div>
  );
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
      <p className="text-sm font-medium text-gray-300">{tr('flatmates.termsHeading')}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor={noticePeriodId} className={fieldLabel}>{tr('flatmates.noticePeriod')}{mark}</label>
          {number(noticePeriodId, 'noticePeriodDays', 180, tr('flatmates.noticePeriodPlaceholder'))}
          <FieldError show={!!errors.noticePeriodDays}>{tr('listProperty.err.noticePeriod')}</FieldError>
        </div>
        <div>
          <label htmlFor={lockInId} className={fieldLabel}>{tr('flatmates.lockIn')}{mark}</label>
          {number(lockInId, 'lockInMonths', 24, tr('flatmates.lockInPlaceholder'))}
          <FieldError show={!!errors.lockInMonths}>{tr('listProperty.err.lockIn')}</FieldError>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {bill('maintenanceBilling', tr('flatmates.maintenanceBill'))}
        {bill('electricityBilling', tr('flatmates.electricityBill'))}
      </div>
    </div>
  );
}
