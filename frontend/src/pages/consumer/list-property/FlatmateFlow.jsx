import { useState } from 'react';
import { MapPin, Users, ArrowLeft, ArrowRight, LocateFixed, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import LocalitySelect from '../../../components/ui/LocalitySelect.jsx';
import RequiredMark from '../../../components/ui/RequiredMark.jsx';
import { FieldError } from './controls.jsx';
import StepHeader from './StepHeader.jsx';
import { PinMapBox } from './LocationPicker.jsx';
import PhotoUploader from './PhotoUploader.jsx';
import { fld, lbl, lbl3 } from './styles.js';
import { isHouseType } from './constants.js';
import { cleanText } from './sanitize.js';
import SocietySelect from './SocietySelect.jsx';
import { roomHeadline } from './submit.js';
import HeadlineField from '../../../components/ui/HeadlineField.jsx';
import OptionalSection from './OptionalSection.jsx';
import FlatmatePriceFields from './FlatmatePriceFields.jsx';
import LivingStyleInline from '../flatmates/livingStyle/LivingStyleInline.jsx';

const StepActions = ({ prevStep, nextStep, t, disabled }) => (
  <div className="flex justify-between lp-step-actions">
    <button onClick={prevStep} className="btn-outline px-6 py-3.5 min-h-[44px] rounded-xl text-gray-300 font-semibold text-sm flex items-center gap-2"><ArrowLeft className="w-4 h-4" /> {t('listProperty.back')}</button>
    <button onClick={nextStep} disabled={disabled} className="btn-teal px-8 py-3.5 min-h-[44px] rounded-xl text-white font-semibold text-sm flex items-center gap-2 shadow-lg shadow-teal-500/20 disabled:opacity-70">{t('listProperty.next')} <ArrowRight className="w-4 h-4" /></button>
  </div>
);

// A room share needs the property's address and map, but owner-only sale and lease terms
// do not apply to a sitting tenant or room host.
const FlatmateFlow = ({
  form, set, errors,
  photos, handlePhotoUpload, removePhoto, setPhotoCategory,
  isMediaBusy, mediaStatus,
  currentStep, prevStep, nextStep, money, submitFlatmate, onReset, isEditing = false,
  flyTo, geoFillStatus, onLocalityChange, onPinMove, locationSet, onSocietyPick, societyFillNotice,
  canUseCurrentLocation, useCurrentLocation, currentLocationStatus,
  needsAuthForMedia = false, onRequireAuth,
}) => {
  const { t } = useTranslation();
  const L = (key) => t(`listProperty.flatmate.label.${key}`);
  const [localityBusy, setLocalityBusy] = useState(false);
  const isHouse = isHouseType(form.propertyType);
  const pinLat = form.pinPlaced ? form.propLat : null;
  const pinLng = form.pinPlaced ? form.propLng : null;
  if (currentStep === 3) {
    return (
      <div className="lp-step">
        <StepHeader title={t('listProperty.steps.flatmatePriceTitle')} subtitle={t('listProperty.steps.flatmatePriceSubtitle')} onReset={onReset} />
        <FlatmatePriceFields form={form} set={set} errors={errors} money={money} onLocalityChange={onLocalityChange} isEditing={isEditing} />
        <StepActions prevStep={prevStep} nextStep={nextStep} t={t} />
      </div>
    );
  }
  if (currentStep === 2) {
    return (
      <div className="lp-step">
        <StepHeader title={t('listProperty.steps.flatmateLocationTitle')} subtitle={t('listProperty.steps.flatmateLocationSubtitle')} onReset={onReset} />

        {/* The society pick fills the pin, locality and pincode, so it leads the step. */}
        <div className="mb-4" data-err="society">
          <label className={`${lbl} mb-1`}>{isHouse ? L('house') : L('society')}<RequiredMark /></label>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <SocietySelect value={form.societyId} name={form.society} notOnMaps={form.societyNotOnMaps} localityLabel={form.locality} lat={pinLat} lng={pinLng} invalid={!!errors.society} onChange={onSocietyPick} onRequireAuth={onRequireAuth} />
            </div>
            {canUseCurrentLocation && (
              <button
                type="button"
                onClick={useCurrentLocation}
                disabled={currentLocationStatus === 'locating'}
                aria-label={t('listProperty.locationSmart.useCurrentLocation')}
                title={t('listProperty.locationSmart.useCurrentLocation')}
                className="btn btn-icon btn-lg rounded-xl disabled:opacity-70"
              >
                {currentLocationStatus === 'locating' ? <Loader2 className="w-6 h-6 animate-spin" /> : <LocateFixed className="w-6 h-6" />}
              </button>
            )}
          </div>
          {currentLocationStatus && (
            <p className={`text-xs mt-2 ${['denied', 'timeout', 'error', 'unavailable'].includes(currentLocationStatus) ? 'text-amber-300' : 'text-gray-500'}`} role="status">
              {t(`listProperty.locationSmart.geo.${currentLocationStatus}`)}
            </p>
          )}
          {societyFillNotice && (
            <p className="text-teal-300/90 text-xs mt-2" role="status">{t('listProperty.locationSmart.filledFrom', { society: societyFillNotice.name })}</p>
          )}
          <FieldError show={!!errors.society}>{isHouse ? t('listProperty.err.house') : t('listProperty.err.society')}</FieldError>
        </div>

        <div className="mb-5" data-err="location">
          <PinMapBox
            invalid={!!errors.location}
            hint={!locationSet && (
              <p className="text-gray-500 text-xs mt-2">
                <MapPin className="w-3 h-3 inline text-teal-400" /> {t('listProperty.help.dragProperty')}
              </p>
            )}
            lat={form.propLat} lng={form.propLng} flyTo={flyTo} onMove={(la, ln) => onPinMove(la, ln)}
          />
          {locationSet && (
            <p className="text-emerald-300/90 text-xs mt-2 flex items-center gap-1.5">
              <MapPin className="w-3 h-3 text-emerald-400" /> {t('listProperty.help.locationSet', { lat: Number(form.propLat).toFixed(4), lng: Number(form.propLng).toFixed(4) })}
            </p>
          )}
          {geoFillStatus === 'filling' && <p className="text-gray-500 text-xs mt-1.5">{t('listProperty.help.fillingAddress')}</p>}
          {geoFillStatus === 'done' && <p className="text-teal-300/80 text-xs mt-1.5 flex items-center gap-1.5"><MapPin className="w-3 h-3 text-teal-400" /> {t('listProperty.help.filledAddress')}</p>}
          <FieldError show={!!errors.location}>{t('listProperty.err.locationFlat')}</FieldError>
        </div>

        <div className="mb-5">
          <label className={lbl}>{L('locality')}<RequiredMark /></label>
          <LocalitySelect value={form.locality} onChange={(v) => onLocalityChange(v)} onSelect={(sel) => onLocalityChange(sel.name, sel)} onBusyChange={setLocalityBusy} placeholder={t('listProperty.ph.selectLocality')} dataErr="locality" invalid={!!errors.locality} />
          <FieldError show={!!errors.locality}>{t('listProperty.err.locality')}</FieldError>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>{L('tower')}</label>
            <input value={form.tower} maxLength={30} onChange={(e) => set('tower', cleanText(e.target.value))} placeholder={t('listProperty.ph.egTowerB')} className={fld} />
          </div>
          <div data-err="flatNumber">
            <label className={lbl}>{isHouse ? L('houseNo') : L('flatNo')}<RequiredMark /></label>
            <input value={form.flatNumber} maxLength={20} aria-required="true" aria-label={isHouse ? L('houseNo') : L('flatNo')} onChange={(e) => set('flatNumber', cleanText(e.target.value))} placeholder={isHouse ? t('listProperty.ph.eg24b') : t('listProperty.ph.egBUnit')} className={`${fld} ${errors.flatNumber ? 'dz-invalid' : ''}`} />
            <FieldError show={!!errors.flatNumber}>{isHouse ? t('listProperty.err.houseNumber') : t('listProperty.err.flatNumber')}</FieldError>
          </div>
        </div>

        <OptionalSection title={t('listProperty.flatmate.moreAddress')} testId="room-more-address">
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="col-span-2 sm:col-span-1">
              <label className={lbl}>{t('listProperty.fields.streetRoad')}</label>
              <input value={form.street} maxLength={60} onChange={(e) => set('street', cleanText(e.target.value))} placeholder={t('listProperty.ph.egBanerRoad')} className={fld} />
            </div>
            <div>
              <label className={lbl}>{t('listProperty.fields.landmark')}</label>
              <input value={form.landmark} maxLength={60} onChange={(e) => set('landmark', cleanText(e.target.value))} placeholder={t('listProperty.ph.egDMart')} className={fld} />
            </div>
            <div>
              <label className={lbl}>{t('listProperty.fields.pincode')}</label>
              <input inputMode="numeric" maxLength={6} value={form.pincode} onChange={(e) => set('pincode', e.target.value.replace(/\D/g, ''))} placeholder="411045" className={fld} />
            </div>
          </div>
        </OptionalSection>

        <StepActions prevStep={prevStep} nextStep={nextStep} t={t} disabled={localityBusy} />
      </div>
    );
  }

  return (
    <div className="lp-step">
      <StepHeader title={t('listProperty.steps.flatmatePhotosTitle')} subtitle={t('listProperty.steps.flatmatePhotosSubtitle')} onReset={onReset} />

      {needsAuthForMedia ? (
        <div className="mb-6 rounded-2xl border border-teal-400/25 bg-teal-400/10 p-4 sm:p-5">
          <h3 className="text-base font-semibold text-white">{t('listProperty.deferredLogin.mediaTitle')}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-gray-300">{t('listProperty.deferredLogin.mediaBody')}</p>
          <button type="button" onClick={onRequireAuth} className="mt-4 btn-teal min-h-[44px] rounded-xl px-5 text-sm font-semibold text-white">
            {t('listProperty.deferredLogin.cta')}
          </button>
        </div>
      ) : (
        <PhotoUploader
          form={form}
          photos={photos}
          handlePhotoUpload={handlePhotoUpload}
          removePhoto={removePhoto}
          setPhotoCategory={setPhotoCategory}
          error={errors.photos}
          isMediaBusy={isMediaBusy}
          mediaStatus={mediaStatus}
          label={t('listProperty.photoUploader.defaultLabel')}
          hint={t('listProperty.flatmate.photosHint')}
        />
      )}

      <HeadlineField
        className="mb-6"
        value={form.title}
        onChange={(value) => set('title', value)}
        suggestion={roomHeadline(form)}
        error={errors.title ? t('common.headline.contact') : ''}
        labelClassName={lbl3}
        inputClassName={fld}
      />

      <div className="mb-8">
        <label className={lbl3}>{t('listProperty.fields.shortNote')}</label>
        <textarea rows={3} value={form.note} onChange={(e) => set('note', e.target.value)} placeholder={t('listProperty.ph.notePlaceholder')} className={`${fld} resize-none`} />
      </div>

      <LivingStyleInline className="mb-8" />
      <div className="flex justify-between lp-step-actions">
        <button onClick={prevStep} className="btn-outline px-6 py-3.5 min-h-[44px] rounded-xl text-gray-300 font-semibold text-sm flex items-center gap-2"><ArrowLeft className="w-4 h-4" /> {t('listProperty.back')}</button>
        <button onClick={submitFlatmate} disabled={isMediaBusy} aria-busy={isMediaBusy} className="btn-teal px-8 py-3.5 min-h-[44px] rounded-xl text-white font-semibold text-sm flex items-center gap-2 shadow-lg shadow-teal-500/20 disabled:opacity-60 disabled:cursor-not-allowed">
          <Users className="w-4 h-4" /> {t(isEditing ? 'listProperty.edit.saveRoom' : needsAuthForMedia ? 'listProperty.deferredLogin.postCta' : 'listProperty.flatmate.postFind')}
        </button>
      </div>
    </div>
  );
};

export default FlatmateFlow;
