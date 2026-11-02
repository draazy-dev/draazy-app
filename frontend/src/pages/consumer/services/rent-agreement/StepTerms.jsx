import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import NativeSelect from '../../../../components/ui/NativeSelect.jsx';
import DateField from '../../../../components/ui/DateField.jsx';
import Icon from '../../../../components/Icon.jsx';
import Field from '../../../../components/ui/Field.jsx';
import DepositPayments from './DepositPayments.jsx';
import AreaField from './AreaField.jsx';
import AmountInput from '../../flatmates/AmountInput.jsx';
import { DEED_LANGUAGES, FURN_PRESETS, PARKING, PERIODS, TDS_RENT_THRESHOLD, VISIT_PLACES, VISIT_SLOTS } from './constants.js';
import { visitDateBounds } from './validation.js';
import { digits, num } from './helpers.js';
import '../../../../styles/components/furniture-tiles.css';

const CLAUSES_SOFT_LIMIT = 1500;

export default function StepTerms({ step, terms, setT, startBounds, errors = {}, fc, clearErr, maint, setMaint, furnItems, toggleFurn, isChecked, bumpQty, removeFurn, custom, setCustom, addCustom, clauses, setClauses }) {
  const { t } = useTranslation();
  const [customChosen, setCustomChosen] = useState(false);
  const periodIsCustom = customChosen || !PERIODS.includes(Number(terms.months));
  const setMonths = (v) => { setT('months', v); clearErr('months'); clearErr('lockin'); };
  const onPeriod = (v) => {
    setCustomChosen(v === 'custom');
    if (v !== 'custom') setMonths(v);
  };
  const numberField = (k, errKey, labelKey = k) => (<Field label={t(`services.ra.terms.${labelKey}`)} error={errors[k] && t(errKey, { months: terms.months })}><input inputMode="numeric" value={terms[k]} onChange={(e) => { setT(k, e.target.value); clearErr(k); }} className={fc(k)} /></Field>);
  const payerField = (k, values) => (
    <Field label={t(`services.ra.terms.${k}`)}>
      <NativeSelect value={terms[k]} title={t(`services.ra.terms.${k}`)} onChange={(e) => setT(k, e.target.value)} className="field w-full px-4 py-3 rounded-xl text-white text-sm">
        {values.map((v) => <option key={v} value={v}>{t(`services.ra.terms.payerOpt.${v}`)}</option>)}
      </NativeSelect>
    </Field>
  );
  const maintLabel = { Tenant: t('services.ra.terms.maintOpt.Tenant'), Owner: t('services.ra.terms.maintOpt.Owner') };
  const visitBounds = visitDateBounds();
  return (
    <div className={'step-panel' + (step === 3 ? ' active' : '')}>
      <h2 className="text-xl font-bold text-white mb-1">{t('services.ra.terms.title')}</h2>
      <p className="text-gray-500 text-sm mb-6">{t('services.ra.terms.subtitle')}</p>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-5">
        <Field className="col-span-2 sm:col-span-1" label={t('services.ra.terms.startDate')} required error={errors.startDate && (errors.startDate === 'range' ? t('services.ra.terms.startDateRange', { min: startBounds?.min, max: startBounds?.max }) : t('services.ra.terms.startDateErr'))}><DateField value={terms.startDate} min={startBounds?.min} max={startBounds?.max} onChange={(v) => { setT('startDate', v); clearErr('startDate'); }} className={fc('startDate')} ariaLabel={t('services.ra.terms.startDateAria')} /></Field>
        <Field label={t('services.ra.terms.period')} required>
          <NativeSelect value={periodIsCustom ? 'custom' : terms.months} title={t('services.ra.terms.period')} onChange={(e) => onPeriod(e.target.value)} className={periodIsCustom ? 'field w-full px-4 py-3 rounded-xl text-white text-sm' : fc('months')}>
            {PERIODS.map((m) => <option key={m} value={String(m)}>{t('services.ra.terms.periodMonths', { count: m })}</option>)}
            <option value="custom">{t('services.ra.terms.periodCustom')}</option>
          </NativeSelect>
        </Field>
        {periodIsCustom && (
          <Field label={t('services.ra.terms.periodCustomMonths')} required error={errors.months && t('services.ra.terms.monthsErr')}><input inputMode="numeric" value={terms.months} onChange={(e) => setMonths(digits(e.target.value))} className={fc('months')} placeholder="1 – 60" /></Field>
        )}
        <Field label={t('services.ra.terms.rent')} required error={errors.rent && t('services.ra.terms.rentErr')}><AmountInput value={terms.rent} onChange={(v) => { setT('rent', v); clearErr('rent'); }} className={errors.rent ? 'err' : ''} suffix={t('services.ra.terms.perMonth')} placeholder={t('services.ra.terms.rentPlaceholder')} /></Field>
        <Field label={t('services.ra.terms.deposit')} required error={errors.deposit && t('services.ra.terms.depositErr')}><AmountInput value={terms.deposit} onChange={(v) => { setT('deposit', v); clearErr('deposit'); }} className={errors.deposit ? 'err' : ''} placeholder={t('services.ra.terms.depositPlaceholder')} /></Field>
        <Field label={t('services.ra.terms.nrDeposit')}><AmountInput value={terms.nrDeposit} onChange={(v) => setT('nrDeposit', v)} placeholder="0" /></Field>
        {numberField('increment', 'services.ra.terms.incrementErr', Number(terms.months) > 11 ? 'increment' : 'incrementRenewal')}
        {Number(terms.months) > 11 && (
          <Field label={t('services.ra.terms.incrementEvery')}>
            <NativeSelect value={terms.incrementEvery} title={t('services.ra.terms.incrementEvery')} onChange={(e) => setT('incrementEvery', e.target.value)} className="field w-full px-4 py-3 rounded-xl text-white text-sm">
              {['11', '12'].map((m) => <option key={m} value={m}>{t('services.ra.terms.periodMonths', { count: Number(m) })}</option>)}
            </NativeSelect>
          </Field>
        )}
        {numberField('lockin', 'services.ra.terms.lockinErr')}
      </div>
      {num(terms.rent) > TDS_RENT_THRESHOLD && (
        <p role="status" className="text-gray-400 text-xs -mt-2 mb-5 leading-relaxed">{t('services.ra.terms.tdsNote')}</p>
      )}
      <DepositPayments terms={terms} setT={setT} errors={errors} clearErr={clearErr} />

      <label className="lbl">{t('services.ra.terms.maintBy')}</label>
      <div className="grid grid-cols-2 gap-3 mb-5">
        {['Tenant', 'Owner'].map((v) => <button type="button" key={v} onClick={() => setMaint(v)} aria-pressed={maint === v} className={'h-btn inline-flex items-center justify-center opt-pill rounded-xl px-4 text-sm font-medium text-center ' + (maint === v ? 'sel' : 'text-gray-400')}>{maintLabel[v]}</button>)}
      </div>

      <div className="grid grid-cols-2 items-end gap-3 sm:gap-4 mb-5">
        {payerField('costBy', ['Split', 'Tenant', 'Owner'])}
        <Field label={t('services.ra.terms.parking')}>
          <NativeSelect value={terms.parking} title={t('services.ra.terms.parking')} onChange={(e) => { setT('parking', e.target.value); if (e.target.value === 'none') setT('parkingArea', ''); }} className="field w-full px-4 py-3 rounded-xl text-white text-sm">
            {PARKING.map((v) => <option key={v} value={v}>{t(`services.ra.terms.parkingOpt.${v}`)}</option>)}
          </NativeSelect>
        </Field>
      </div>
      {terms.parking !== 'none' && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-5">
          <AreaField t={t} className="col-span-2 sm:col-span-1" label={t('services.ra.terms.parkingArea')} error={errors.parkingArea && t('services.ra.property.optionalAreaErr')} inputClassName={fc('parkingArea')} value={terms.parkingArea} onChange={(v) => { setT('parkingArea', v); clearErr('parkingArea'); }} placeholder={t('services.ra.property.smallAreaPlaceholder')} unit={terms.parkingAreaUnit} onUnit={(v) => setT('parkingAreaUnit', v)} unitTitle={t('services.ra.terms.parkingAreaUnit')} />
        </div>
      )}

      <label className="lbl">{t('services.ra.terms.language')}</label>
      <div className="grid grid-cols-2 gap-3 mb-2">
        {DEED_LANGUAGES.map((v) => <button type="button" key={v} onClick={() => setT('language', v)} aria-pressed={terms.language === v} className={'h-btn inline-flex items-center justify-center opt-pill rounded-xl px-4 text-sm font-medium text-center ' + (terms.language === v ? 'sel' : 'text-gray-400')}>{t(`services.ra.terms.languageOpt.${v}`)}</button>)}
      </div>
      <p className="text-gray-500 text-xs mb-5">{t('services.ra.terms.languageHint')}</p>

      <label className="lbl">{t('services.ra.terms.visit')}</label>
      <p className="text-gray-500 text-xs mb-3" style={{ marginTop: '-2px' }}>{t('services.ra.terms.visitHint')}</p>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-5">
        <Field className="col-span-2 sm:col-span-1" label={t('services.ra.terms.visitAt')}>
          <NativeSelect value={terms.visitAt} title={t('services.ra.terms.visitAt')} onChange={(e) => setT('visitAt', e.target.value)} className="field w-full px-4 py-3 rounded-xl text-white text-sm">
            {VISIT_PLACES.map((v) => <option key={v} value={v}>{t(`services.ra.terms.visitAtOpt.${v}`)}</option>)}
          </NativeSelect>
        </Field>
        <Field label={t('services.ra.terms.visitDate')} error={errors.visitDate && t('services.ra.terms.visitDateErr', visitBounds)}><DateField value={terms.visitDate} min={visitBounds.min} max={visitBounds.max} onChange={(v) => { setT('visitDate', v); clearErr('visitDate'); }} className={fc('visitDate')} ariaLabel={t('services.ra.terms.visitDateAria')} /></Field>
        <Field label={t('services.ra.terms.visitSlot')}>
          <NativeSelect value={terms.visitSlot} title={t('services.ra.terms.visitSlot')} onChange={(e) => setT('visitSlot', e.target.value)} className="field w-full px-4 py-3 rounded-xl text-white text-sm">
            {VISIT_SLOTS.map((v) => <option key={v} value={v}>{t(`services.ra.terms.visitSlotOpt.${v}`)}</option>)}
          </NativeSelect>
        </Field>
      </div>

      <label className="lbl">{t('services.ra.terms.furniture')}</label>
      <p className="text-gray-500 text-xs mb-3" style={{ marginTop: '-2px' }}>{t('services.ra.terms.furnitureHint')}</p>
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 mb-4">
        {FURN_PRESETS.map(([name, icon]) => (
          <button type="button" key={name} onClick={() => toggleFurn(name)} aria-pressed={isChecked(name)} className={'furn-tile' + (isChecked(name) ? ' checked' : '')}>
            <span className="furn-check"><Icon name="check" className="w-3 h-3" /></span>
            <span className="furn-icon"><Icon name={icon} className="w-5 h-5" /></span>
            <span className="furn-label">{name}</span>
          </button>
        ))}
      </div>

      {furnItems.length > 0 && (
        <div className="mb-3">
          <p className="lbl">{t('services.ra.terms.itemsIncluded')} <span className="text-gray-500 font-normal">({furnItems.length})</span></p>
          <div className="space-y-2 max-w-[640px]">
            {furnItems.map((f, i) => (
              <div key={i} className="furn-row">
                <span className="fr-name"><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>{f.custom && <span className="fr-tag">{t('services.ra.terms.customTag')}</span>}</span>
                <span className="qty-step">
                  <button type="button" className="qty-btn" aria-label={t('services.ra.terms.qtyDecrease', { name: f.name })} onClick={() => bumpQty(i, -1)}><Icon name="minus" className="w-3.5 h-3.5" /></button>
                  <span className="qty-val">{f.qty}</span>
                  <button type="button" className="qty-btn" aria-label={t('services.ra.terms.qtyIncrease', { name: f.name })} onClick={() => bumpQty(i, 1)}><Icon name="plus" className="w-3.5 h-3.5" /></button>
                </span>
                <button type="button" className="fr-remove" title={t('services.ra.tenant.remove')} onClick={() => removeFurn(i)}><Icon name="x" className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 mb-5 max-w-[640px]">
        <div className="relative flex-1">
          <Icon name="plus-circle" className="w-4 h-4 text-teal-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input value={custom.name} onChange={(e) => setCustom((p) => ({ ...p, name: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }} type="text" placeholder={t('services.ra.terms.customPlaceholder')}           className="field w-full pl-9 pr-3 rounded-xl text-white text-sm" />
        </div>
                  <input type="number" min="1" value={custom.qty} onChange={(e) => setCustom((p) => ({ ...p, qty: e.target.value }))} aria-label={t('services.ra.terms.customQtyAria')} className="field w-16 px-2 rounded-xl text-white text-sm text-center" />
                  <button type="button" onClick={addCustom} className="btn-outline h-btn px-4 rounded-xl text-teal-400 text-sm font-semibold whitespace-nowrap">{t('services.ra.terms.add')}</button>
      </div>

      <label className="lbl" htmlFor="ra-clauses">{t('services.ra.terms.specialClauses')}</label>
      <textarea id="ra-clauses" rows={3} value={clauses} onChange={(e) => setClauses(e.target.value)} className="field w-full px-4 py-3 rounded-xl text-white text-sm resize-none" placeholder={t('services.ra.terms.clausesPlaceholder')} aria-describedby={clauses.length > CLAUSES_SOFT_LIMIT ? 'ra-clauses-len' : undefined} />
      {clauses.length > CLAUSES_SOFT_LIMIT && (
        <p id="ra-clauses-len" role="status" aria-live="polite" className="text-amber-400 text-xs mt-2 leading-relaxed">
          {t('services.ra.terms.clausesLong', { chars: clauses.length })}
        </p>
      )}
    </div>
  );
}
