import { useTranslation } from 'react-i18next';
import DateField from '../../../../components/ui/DateField.jsx';
import Field from '../../../../components/ui/Field.jsx';
import NativeSelect from '../../../../components/ui/NativeSelect.jsx';
import { GENDERS } from './constants.js';
import { ageFromDob, todayIst } from './validation.js';

const FIELD = 'field w-full px-4 py-3 rounded-xl text-white text-sm';
const dobMin = '1900-01-01';

function GenderField({ value, onChange, errKey, errors, clearErr }) {
  const { t } = useTranslation();
  return (
    <Field label={t('services.ra.party.gender')} required error={errors[errKey] && t('services.ra.party.genderErr')}>
      <NativeSelect value={value || ''} title={t('services.ra.party.gender')} onChange={(e) => { onChange(e.target.value); clearErr?.(errKey); }} invalid={!!errors[errKey]} dataErr={errKey}>
        <option value="">{t('services.ra.party.genderPick')}</option>
        {GENDERS.map((g) => <option key={g} value={g}>{t(`services.ra.party.genderOpt.${g}`)}</option>)}
      </NativeSelect>
    </Field>
  );
}

export default function PartyIdentityFields({ dob, setDob, setAge, mother, setMother, gender, setGender, keys, errors, clearErr }) {
  const { t } = useTranslation();
  const today = todayIst();
  const err = (key) => errors[key];
  const cls = (key) => FIELD + (err(key) ? ' err' : '');
  const clear = (key) => clearErr?.(key);
  const onDob = (value) => {
    setDob(value);
    setAge(ageFromDob(value, today));
    clear(keys.dob);
    clear(keys.age);
  };

  return (
    <>
      <Field label={t('services.ra.party.mother')} required error={err(keys.mother) && t('services.ra.party.motherErr')}>
        <input maxLength={80} value={mother || ''} onChange={(e) => { setMother(e.target.value); clear(keys.mother); }} className={cls(keys.mother)} placeholder={t('services.ra.party.motherPlaceholder')} />
      </Field>
      <GenderField value={gender} onChange={setGender} errKey={keys.gender} errors={errors} clearErr={clearErr} />
      <Field label={t('services.ra.party.dob')} required error={err(keys.dob) && t('services.ra.party.dobErr')}>
        <DateField value={dob || ''} min={dobMin} max={today} onChange={onDob} className={cls(keys.dob)} invalid={!!err(keys.dob)} dataErr={keys.dob} ariaLabel={t('services.ra.party.dob')} />
      </Field>
    </>
  );
}
