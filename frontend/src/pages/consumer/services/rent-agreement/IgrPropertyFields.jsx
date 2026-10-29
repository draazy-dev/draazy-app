import NativeSelect from '../../../../components/ui/NativeSelect.jsx';
import Field from '../../../../components/ui/Field.jsx';
import { PUNE_TALUKAS } from './constants.js';

const FIELD = 'field w-full px-4 py-3 rounded-xl text-white text-sm';
const TEXT_FIELDS = ['landmark', 'policeStation', 'roadVicinity', 'roadType'];

export default function IgrPropertyFields({ t, prop, setP, errors = {}, clearErr, clearPropertyBinding }) {
  const setBound = (key, value) => {
    clearPropertyBinding();
    setP(key, value);
    clearErr(key);
  };
  const set = (key, value) => { setP(key, value); clearErr(key); };

  return (
    <section className="space-y-5 mb-5" data-testid="ra-igr-property">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label={t('services.ra.property.taluka')} required error={errors.taluka && t('services.ra.property.talukaErr')}>
          <NativeSelect value={prop.taluka} title={t('services.ra.property.taluka')} onChange={(e) => setBound('taluka', e.target.value)} invalid={!!errors.taluka}>
            <option value="">{t('services.ra.property.talukaPlaceholder')}</option>
            {PUNE_TALUKAS.map((name) => <option key={name} value={name}>{name}</option>)}
          </NativeSelect>
        </Field>
        {TEXT_FIELDS.map((key) => (
          <Field key={key} label={t(`services.ra.property.${key}`)} required error={errors[key] && t(`services.ra.property.${key}Err`)}>
            <input value={prop[key] || ''} maxLength={80} onChange={(e) => set(key, e.target.value)} className={FIELD + (errors[key] ? ' err' : '')} placeholder={t(`services.ra.property.${key}Placeholder`)} />
          </Field>
        ))}
      </div>
      <p className="text-gray-500 text-xs">{t('services.ra.property.indexTwoHint')}</p>
    </section>
  );
}