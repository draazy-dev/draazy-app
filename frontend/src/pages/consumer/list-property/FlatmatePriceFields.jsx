import { useTranslation } from 'react-i18next';
import AvailabilityField from '../../../components/ui/AvailabilityField.jsx';
import RequiredMark from '../../../components/ui/RequiredMark.jsx';
import { FieldError } from './controls.jsx';
import { fld, lbl } from './styles.js';
import { moneyWords } from './format.js';
import FlatmateTerms from '../flatmates/FlatmateTerms.jsx';
import FlatmateHostFields from './FlatmateHostFields.jsx';

const rupee = 'absolute left-3 top-1/2 -translate-y-1/2 text-teal-400 font-semibold text-sm';

export default function FlatmatePriceFields({ form, set, errors, money, onLocalityChange }) {
  const { t } = useTranslation();
  const L = (key) => t(`listProperty.flatmate.label.${key}`);

  return (
    <>
      <div className="mb-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <label className={lbl}>{L('rent')}<RequiredMark /></label>
          <div className="relative">
            <div className={rupee}>₹</div>
            <input inputMode="numeric" maxLength={10} {...money('rentShare')} data-err="rentShare" aria-label={L('rent')} placeholder={t('listProperty.ph.egRentShare')} className={`${fld} pl-8 pr-10 ${errors.rentShare ? 'dz-invalid' : ''}`} />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">{t('listProperty.unit.perMo')}</div>
          </div>
          <FieldError show={!!errors.rentShare}>{t('listProperty.err.rentShare')}</FieldError>
          {moneyWords(form.rentShare) && <p className="mt-1.5 ml-1 text-xs text-gray-500">{moneyWords(form.rentShare)}</p>}
          {form.roomType === 'Shared room' && Number(form.rentShare) > 0 && (
            <p className="mt-1 ml-1 text-xs text-teal-300" data-testid="room-rent-split">{t('listProperty.help.roomRentSplit', { price: `₹${Math.round(Number(form.rentShare) / 2).toLocaleString('en-IN')}` })}</p>
          )}
        </div>
        <div>
          <label className={lbl}>{L('deposit')}<RequiredMark /></label>
          <div className="relative">
            <div className={rupee}>₹</div>
            <input inputMode="numeric" maxLength={10} {...money('deposit')} data-err="deposit" aria-label={L('deposit')} aria-required="true" placeholder={t('listProperty.ph.egDeposit28')} className={`${fld} pl-8 pr-3 ${errors.deposit ? 'dz-invalid' : ''}`} />
          </div>
          <FieldError show={!!errors.deposit}>{t('listProperty.err.roomDeposit')}</FieldError>
          {moneyWords(form.deposit) && <p className="mt-1.5 ml-1 text-xs text-gray-500">{moneyWords(form.deposit)}</p>}
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className={lbl}>{L('availableFrom')}<RequiredMark /></label>
          <AvailabilityField value={form.availableFrom} onChange={(v) => set('availableFrom', v)} dataErr="availableFrom" ariaLabel={t('listProperty.aria.availableFrom')} invalid={!!errors.availableFrom} className={fld} />
          <FieldError show={!!errors.availableFrom}>{t('listProperty.err.availableRoom')}</FieldError>
        </div>
      </div>

      <div className="mb-6">
        <FlatmateTerms required errors={errors} value={form} onChange={(patch) => Object.entries(patch).forEach(([k, v]) => set(k, v))} />
      </div>

      <FlatmateHostFields form={form} set={set} errors={errors} onLocalityChange={onLocalityChange} />
    </>
  );
}
