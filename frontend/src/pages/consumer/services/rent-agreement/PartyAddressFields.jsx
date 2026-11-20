import { useTranslation } from 'react-i18next';
import Field from '../../../../components/ui/Field.jsx';
import { digits } from './helpers.js';

const FIELD = 'field w-full px-4 py-3 rounded-xl text-white text-sm';

export default function PartyAddressFields({ value = {}, onChange, errPrefix, errors, clearErr }) {
  const { t } = useTranslation();
  const key = (f) => errPrefix + f[0].toUpperCase() + f.slice(1);
  const cls = (f) => FIELD + (errors[key(f)] ? ' err' : '');
  const set = (f, v) => { onChange(f, v); clearErr?.(key(f)); };
  return (
    <>
      <Field label={t('services.ra.party.pincode')} required error={errors[key('pincode')] && t('services.ra.tenant.police.pincodeErr')}>
        <input inputMode="numeric" maxLength={6} value={value.pincode || ''} onChange={(e) => set('pincode', digits(e.target.value).slice(0, 6))} className={cls('pincode')} placeholder="411004" />
      </Field>
      <Field label={t('services.ra.tenant.police.village')} required error={errors[key('village')] && t('services.ra.tenant.police.required')}>
        <input maxLength={80} value={value.village || ''} onChange={(e) => set('village', e.target.value)} className={cls('village')} placeholder={t('services.ra.tenant.police.villagePlaceholder')} />
      </Field>
      <Field className="sm:col-span-2" label={t('services.ra.party.address')} required error={errors[key('address')] && t('services.ra.tenant.police.addressErr')}>
        <textarea rows={2} maxLength={200} value={value.address || ''} onChange={(e) => set('address', e.target.value)} className={cls('address') + ' resize-none'} placeholder={t('services.ra.tenant.police.addressPlaceholder')} />
      </Field>
    </>
  );
}
