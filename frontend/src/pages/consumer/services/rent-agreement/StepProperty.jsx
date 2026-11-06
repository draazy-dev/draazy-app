import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import NativeSelect from '../../../../components/ui/NativeSelect.jsx';
import LocalitySelect from '../../../../components/ui/LocalitySelect.jsx';
import Icon from '../../../../components/Icon.jsx';
import FieldError from '../../../../components/ui/FieldError.jsx';
import Field from '../../../../components/ui/Field.jsx';
import { Link } from 'react-router';
import SocietySelect from '../../list-property/SocietySelect.jsx';
import { activeLocality, societyLocalityName } from '../../list-property/useListingLocation.js';
import { cleanText } from '../../list-property/sanitize.js';
import { COMMERCIAL_ROUTE, MAX_FLOOR, RESIDENTIAL_PROPERTY_TYPES } from './constants.js';
import IgrPropertyFields from './IgrPropertyFields.jsx';
import AreaField from './AreaField.jsx';

export default function StepProperty({ step, prop, setP, setProp, setSelectedPropertyId, pickListing, myProperties = [], readOnly = false, errors = {}, fc, clearErr, onLocalityBusy }) {
  const { t } = useTranslation();
  const clearPropertyBinding = () => setSelectedPropertyId(null);
  const societyPickSeq = useRef(0);
  const localityPickedAt = useRef(-1);
  const onSociety = async (picked) => {
    const name = picked?.name || '';
    if (name !== prop.society) clearPropertyBinding();
    const pincode = picked?.pincode;
    setProp((p) => ({ ...p, society: name, societyId: picked?.id || '', societyNotOnMaps: !!picked?.notOnMaps, ...(pincode ? { pincode } : {}) }));
    ['society', ...(pincode ? ['pincode'] : [])].forEach(clearErr);
    const seq = ++societyPickSeq.current;
    if (!picked?.id) {
      onLocalityBusy?.(false);
      return;
    }
    onLocalityBusy?.(true);
    try {
      const { name: localityName, slug } = await societyLocalityName(picked, Number(picked.lat ?? NaN), Number(picked.lng ?? NaN));
      const hit = await activeLocality(localityName, slug);
      if (!hit || seq !== societyPickSeq.current || localityPickedAt.current === seq) return;
      setProp((p) => ({ ...p, locality: hit.name }));
      clearErr('locality');
    } catch {
    } finally {
      if (seq === societyPickSeq.current) onLocalityBusy?.(false);
    }
  };
  const onLocality = (name) => {
    localityPickedAt.current = societyPickSeq.current;
    if (name !== prop.locality) clearPropertyBinding();
    setP('locality', name);
    clearErr('locality');
  };
  const onLocalityPicked = ({ details }) => {
    if (!details?.pincode) return;
    setProp((p) => (p.pincode ? p : { ...p, pincode: details.pincode }));
    clearErr('pincode');
  };
  return (
    <div className={'step-panel' + (step === 0 ? ' active' : '')}>
      <h2 className="text-xl font-bold text-white mb-1">{t('services.ra.property.title')}</h2>
      <p className="text-gray-500 text-sm mb-6">{t('services.ra.property.subtitle')}</p>
      {(() => {
        if (readOnly) {
          const address = [prop.flatNo, prop.society].filter(Boolean).join(', ');
          if (!address) return null;
          const where = [prop.propType, [prop.locality, prop.pincode].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
          return (
            <div className="mb-6 flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/4" data-testid="ra-property-summary">
              <Icon name="building-2" className="w-4 h-4 text-teal-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] text-gray-500">{t('services.ra.property.agreementFor')}</p>
                <p className="text-sm font-semibold text-white truncate">{address}</p>
                {where && <p className="text-xs text-gray-400 truncate">{where}</p>}
              </div>
            </div>
          );
        }
        const myListings = myProperties.filter((l) => l.deal === 'rent' || l.deal === 'buy');
        if (!myListings.length) return null;
        return (
          <div className="mb-6 p-4 rounded-xl border border-teal-400/20 bg-teal-400/5">
            <p className="text-sm font-medium text-white mb-2">{t('services.ra.property.pickerQuestion')}</p>
            <div className="space-y-2 mb-3">
              {myListings.slice(0, 3).map((l) => (
                <button key={l.id} type="button" onClick={() => pickListing(l)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10 hover:border-teal-400/30 text-left transition">
                  <Icon name="building-2" className="w-4 h-4 text-teal-400 flex-shrink-0" />
                  <span className="text-sm text-gray-300 truncate">{l.title || `${l.bhk} ${l.type}`} — {l.locality || 'Pune'}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setSelectedPropertyId(null)} className="text-xs text-gray-500 hover:text-teal-400">{t('services.ra.property.enterManually')}</button>
          </div>
        );
      })()}

      <div className="mb-5 p-3.5 rounded-xl border border-white/10 bg-white/4 flex items-start gap-2.5" data-testid="ra-commercial-note">
        <Icon name="briefcase" className="w-4 h-4 text-teal-400 flex-shrink-0 mt-0.5" />
        <p className="text-gray-300 text-xs leading-relaxed">
          {t('services.ra.property.commercialNote')}{' '}
          <Link to={COMMERCIAL_ROUTE} className="text-teal-400 font-semibold hover:underline">{t('services.ra.property.commercialCta')}</Link>
        </p>
      </div>
      <div className="mb-5">
        <Field label={t('services.ra.property.propertyType')} error={errors.propType && t('services.ra.property.propTypeErr')}>
          <NativeSelect value={prop.propType} onChange={(e) => { setP('propType', e.target.value); clearErr('propType'); }} className={fc('propType')}>
            {errors.propType && <option value={prop.propType} disabled>{prop.propType}</option>}
            {RESIDENTIAL_PROPERTY_TYPES.map((o) => <option key={o}>{o}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <Field label={t('services.ra.property.flatNo')} required error={errors.flatNo && t('services.ra.property.flatNoErr')}><input value={prop.flatNo} onChange={(e) => { clearPropertyBinding(); setP('flatNo', e.target.value); clearErr('flatNo'); }} className={fc('flatNo')} placeholder={t('services.ra.property.flatNoPlaceholder')} /></Field>
          <Field label={t('services.ra.property.society')} required error={errors.society && t('services.ra.property.societyErr')}><SocietySelect value={prop.societyId} name={prop.societyNotOnMaps ? '' : prop.society} notOnMaps={!!prop.societyNotOnMaps} onChange={onSociety} localityLabel={prop.locality} inputClassName={fc('society')} invalid={!!errors.society} placeholder={t('services.ra.property.societyPlaceholder')} />{prop.societyNotOnMaps ? <input value={prop.society || ''} maxLength={60} onChange={(e) => { clearPropertyBinding(); setP('society', cleanText(e.target.value)); clearErr('society'); }} className="field w-full px-4 py-3 rounded-xl text-white text-sm mt-2" aria-label={t('services.ra.property.buildingText')} placeholder={t('services.ra.property.buildingText')} /> : null}</Field>
          <Field label={t('services.ra.property.locality')} required error={errors.locality && t('services.ra.property.localityErr')}><LocalitySelect value={prop.locality} onChange={onLocality} onSelect={onLocalityPicked} onBusyChange={onLocalityBusy} dataErr="locality" invalid={!!errors.locality} placeholder={t('services.ra.property.localityPlaceholder')} ariaLabel={t('services.ra.property.locality')} className="w-full" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('services.ra.property.city')}><input value={prop.city} onChange={(e) => { clearPropertyBinding(); setP('city', e.target.value); }} className="field w-full px-4 py-3 rounded-xl text-white text-sm" /></Field>
          <Field label={t('services.ra.property.pincode')} required error={errors.pincode && (errors.pincode === 'state' ? t('services.ra.property.pincodeState') : t('services.ra.property.pincodeErr'))}><input inputMode="numeric" maxLength={6} value={prop.pincode} onChange={(e) => { clearPropertyBinding(); setP('pincode', e.target.value.replace(/\D/g, '')); clearErr('pincode'); }} className={fc('pincode')} placeholder={t('services.ra.property.pincodePlaceholder')} /></Field>
        </div>
      </div>
      <div className="mb-5" data-err="gramPanchayat" role="group" aria-label={t('services.ra.property.gramPanchayat')} aria-describedby={errors.gramPanchayat ? 'ra-gram-err' : undefined}>
        <label className="lbl req">{t('services.ra.property.gramPanchayat')}</label>
        <div className="grid grid-cols-2 gap-3">
          {[true, false].map((v) => <button type="button" key={String(v)} onClick={() => { setP('gramPanchayat', v); clearErr('gramPanchayat'); }} aria-pressed={prop.gramPanchayat === v} data-testid={v ? 'ra-gram-yes' : 'ra-gram-no'} className={'h-btn inline-flex items-center justify-center opt-pill rounded-xl px-4 text-sm font-medium text-center ' + (prop.gramPanchayat === v ? 'sel' : 'text-gray-400')}>{t(v ? 'services.ra.property.gramPanchayatYes' : 'services.ra.property.gramPanchayatNo')}</button>)}
        </div>
        <FieldError id="ra-gram-err" alert={false} show={!!errors.gramPanchayat}>{t('services.ra.property.gramPanchayatErr')}</FieldError>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-3 sm:gap-4 mb-5">
        <AreaField t={t} label={t('services.ra.property.area')} required error={errors.area && t('services.ra.property.areaErr')} inputClassName={fc('area')} value={prop.area} onChange={(v) => { setP('area', v); clearErr('area'); }} placeholder={t('services.ra.property.areaPlaceholder')} unit={prop.areaUnit} onUnit={(v) => setP('areaUnit', v)} unitTitle={t('services.ra.property.areaUnit')} />
        <Field label={t('services.ra.property.floor')} error={errors.floor && t('services.ra.property.floorErr', { max: MAX_FLOOR })}><input inputMode="numeric" value={prop.floor} onChange={(e) => { setP('floor', e.target.value.replace(/\D/g, '')); clearErr('floor'); }} className={fc('floor')} placeholder={t('services.ra.property.floorPlaceholder')} /></Field>
      </div>
      <IgrPropertyFields t={t} prop={prop} setP={setP} errors={errors} clearErr={clearErr} clearPropertyBinding={clearPropertyBinding} />
    </div>
  );
}
