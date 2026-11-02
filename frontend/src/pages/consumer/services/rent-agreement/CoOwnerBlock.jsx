import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import NativeSelect from '../../../../components/ui/NativeSelect.jsx';
import Icon from '../../../../components/Icon.jsx';
import MobileField from '../../../../components/MobileField.jsx';
import PartyIdInput from './PartyIdInput.jsx';
import Field from '../../../../components/ui/Field.jsx';
import { pickDoc } from './helpers.js';
import { coOwnerDocSlots, dupMessageKey } from './validation.js';
import { COMMERCIAL_ROUTE } from './constants.js';
import PoaFields from './PoaFields.jsx';
import UploadBox from './UploadBox.jsx';
import PartyIdentityFields from './PartyIdentityFields.jsx';
import PartyAddressFields from './PartyAddressFields.jsx';

export default function CoOwnerBlock({ index, row, set, remove, errors, fc, clearErr, ownerDocs, setOwnerDocs, today, masked, held }) {
  const { t } = useTranslation();
  const p = `c${index}`;
  const input = (k, extra = {}) => ({
    value: row[k] || '',
    onChange: (e) => { set(k, e.target.value); clearErr(p + k); },
    className: fc(p + k),
    ...extra,
  });
  const why = (k, fallback) => t(errors[p + k] === 'dup' ? dupMessageKey(k) : fallback);
  const offline = row.residency === 'nri' || row.residency === 'foreign';
  return (
    <div className="bg-white/4 border border-white/8 rounded-xl p-4" data-testid={`co-owner-${index}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-white font-semibold text-sm">{t('services.ra.owner.coOwners.label', { n: index + 1 })}</p>
        <button type="button" onClick={remove} className="text-gray-500 hover:text-red-400 text-xs flex items-center gap-1"><Icon name="trash-2" className="w-3.5 h-3.5" /> {t('services.ra.tenant.remove')}</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label={t('services.ra.party.type')} error={errors[p + 'type'] && t('services.ra.party.entityErr')}>
          <NativeSelect value={row.type || 'individual'} onChange={(e) => { set('type', e.target.value); clearErr(p + 'type'); }} className={fc(p + 'type')}>
            <option value="individual">{t('services.ra.party.typeOpt.individual')}</option>
            <option value="entity">{t('services.ra.party.typeOpt.entity')}</option>
          </NativeSelect>
        </Field>
        <Field label={t('services.ra.party.residency')}>
          <NativeSelect value={row.residency || 'resident'} onChange={(e) => { set('residency', e.target.value); setOwnerDocs((d) => { const next = { ...d }; delete next[`${p}-passport`]; delete next[`${p}-visa`]; return next; }); clearErr(p + 'residency'); }} className={fc(p + 'residency')}>
            {['resident', 'nri', 'foreign'].map((r) => <option key={r} value={r}>{t(`services.ra.party.residencyOpt.${r}`)}</option>)}
          </NativeSelect>
        </Field>
        {row.type === 'entity' && (
          <div className="sm:col-span-2 rounded-xl border border-amber-400/25 bg-amber-500/10 p-3 text-xs text-amber-100 leading-relaxed">
            {t('services.ra.party.entityNote')}{' '}
            <Link to={COMMERCIAL_ROUTE} className="font-semibold text-teal-300 hover:underline">{t('services.ra.party.quoteCta')}</Link>
          </div>
        )}
        {offline && <div className="sm:col-span-2 rounded-xl border border-sky-400/20 bg-sky-500/10 p-3 text-xs text-sky-100 leading-relaxed">{t('services.ra.party.offlineNote')}</div>}
        <Field label={t('services.ra.owner.fullName')} required error={errors[p + 'name'] && t('services.ra.owner.coOwners.nameErr')}><input {...input('name')} placeholder={t('services.ra.owner.fullNamePlaceholder')} /></Field>
        <PartyIdentityFields dob={row.dob} setDob={(v) => set('dob', v)} setAge={(v) => set('age', v)} mother={row.mother} setMother={(v) => set('mother', v)} gender={row.gender} setGender={(v) => set('gender', v)} keys={{ dob: p + 'dob', age: p + 'age', mother: p + 'mother', gender: p + 'gender' }} errors={errors} clearErr={clearErr} />
        <Field label={t('services.ra.owner.pan')} required error={errors[p + 'pan'] && why('pan', 'services.ra.owner.panErr')}><PartyIdInput masked={masked?.pan} held={held} kind="pan" value={row.pan || ''} onChange={(v) => { set('pan', v); clearErr(p + 'pan'); }} className={fc(p + 'pan')} placeholder="ABCDE1234F" /></Field>
        {offline && (
          <>
            <Field label={t('services.ra.party.passport')} required error={errors[p + 'passport'] && t('services.ra.party.passportErr')}><input maxLength={20} {...input('passport')} onChange={(e) => { set('passport', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); clearErr(p + 'passport'); }} placeholder={t('services.ra.party.passportPlaceholder')} /></Field>
            {row.residency === 'foreign' && <Field label={t('services.ra.party.visaOci')} required error={errors[p + 'visaOci'] && t('services.ra.party.visaOciErr')}><input maxLength={40} {...input('visaOci')} placeholder={t('services.ra.party.visaOciPlaceholder')} /></Field>}
            {row.residency === 'foreign' && <Field label={t('services.ra.party.frro')}><input maxLength={40} {...input('frro')} placeholder={t('services.ra.party.frroPlaceholder')} /></Field>}
          </>
        )}
        <Field label={t('services.ra.owner.mobile')} required error={errors[p + 'mobile'] && why('mobile', 'services.ra.owner.mobileErr')}><MobileField value={row.mobile} onChange={(v) => { set('mobile', v); clearErr(p + 'mobile'); }} error={!!errors[p + 'mobile']} placeholder={t('services.ra.owner.mobilePlaceholder')} inputClassName="px-4 py-3" /></Field>
        <PartyAddressFields value={row.addr} onChange={(k, v) => set('addr', { ...row.addr, [k]: v })} errPrefix={p + 'addr'} errors={errors} clearErr={clearErr} />
        <Field label={t('services.ra.owner.capacity')}>
          <NativeSelect value={row.capacity} onChange={(e) => set('capacity', e.target.value)} className="field w-full px-4 py-3 rounded-xl text-white text-sm">
            {['co-owner', 'poa'].map((c) => <option key={c} value={c}>{t(`services.ra.owner.capacityOpt.${c}`)}</option>)}
          </NativeSelect>
        </Field>
        {row.capacity === 'poa' && <PoaFields prefix={p} row={row} set={set} errors={errors} clearErr={clearErr} fc={fc} today={today} />}
      </div>
      {coOwnerDocSlots(row, index).length > 0 && (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
        {coOwnerDocSlots(row, index).map((k) => (
          <UploadBox
            key={k}
            label={t(`services.ra.owner.coDoc.${k.split('-')[1]}`)}
            fileName={ownerDocs[k]?.fileName}
            preview={ownerDocs[k]}
            required
            error={errors['doc-' + k]}
            onPick={async (f) => { if (await pickDoc(f, ownerDocs[k], setOwnerDocs, k)) clearErr('doc-' + k); }}
          />
        ))}
      </div>
      )}
    </div>
  );
}
