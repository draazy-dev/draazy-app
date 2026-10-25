import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp } from 'lucide-react';
import RequiredMark from '../../../components/ui/RequiredMark.jsx';
import Select from '../../../components/ui/Select';
import { PillRow, FieldError, ToggleRow } from './controls.jsx';
import { fld, lbl } from './styles.js';
import { HOME_TYPE_PILLS, floorOptions, totalFloorsOptions } from './constants.js';

const MAX_OCCUPANTS = 10;
const clampOccupants = (v) => Math.min(MAX_OCCUPANTS, Math.max(0, Math.trunc(Number(v)) || 0));

export default function FlatmateFlatFields({ form, set, errors, isHouse }) {
  const { t } = useTranslation();
  const L = (key) => t(`listProperty.flatmate.label.${key}`);
  const occupants = clampOccupants(form.occupants);
  const stepOccupants = (by) => set('occupants', String(clampOccupants(occupants + by)));
  const required = (field, label, options, cols, errKey = field) => (
    <div>
      <p className={lbl}>{label}<RequiredMark /></p>
      <PillRow label={label} cols={cols} dataErr={field} invalid={!!errors[field]} options={options} value={form[field]} onChange={(v) => set(field, v)} />
      <FieldError show={!!errors[field]}>{t(`listProperty.err.${errKey}`)}</FieldError>
    </div>
  );

  return (
    <>
      <div className="mb-5">
        <p className={lbl}>{L('homeType')}<RequiredMark /></p>
        <PillRow
          label={L('homeType')}
          cols="grid-cols-2 sm:grid-cols-4"
          dataErr="homeTypeLabel"
          invalid={!!errors.homeTypeLabel}
          options={HOME_TYPE_PILLS.map(([, label]) => [label, label])}
          value={form.homeTypeLabel}
          onChange={(label) => { set('propertyType', HOME_TYPE_PILLS.find(([, l]) => l === label)[0]); set('homeTypeLabel', label); }}
        />
        <FieldError show={!!errors.homeTypeLabel}>{t('listProperty.err.homeType')}</FieldError>
      </div>

      <div className="mb-5">
        {required('bhk', L('bhk'), ['1', '2', '3', '4'].map((n) => [n, n === '4' ? '4+ BHK' : `${n} BHK`]), 'grid-cols-4', 'flatType')}
      </div>

      <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
        {required('bathrooms', L('bathrooms'), [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4+']], 'grid-cols-4')}
        <div>
          <p className={lbl}>{t('listProperty.fields.balconies')}</p>
          <PillRow label={t('listProperty.fields.balconies')} cols="grid-cols-4" options={[['0', t('listProperty.opt.none')], ['1', '1'], ['2', '2'], ['3', '3+']]} value={form.balconies} onChange={(v) => set('balconies', v)} />
        </div>
      </div>

      {isHouse ? (
        <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
          {required('floorsInHouse', L('floorsInHouse'), [['1', t('listProperty.opt.ground')], ['2', 'G+1'], ['3', 'G+2'], ['4', 'G+3+']], 'grid-cols-4')}
          <div className="flex items-end">
            <ToggleRow
              title={t('listProperty.toggle.gatedCommunity')}
              on={form.gatedCommunity}
              onClick={() => set('gatedCommunity', !form.gatedCommunity)}
              pad="p-3"
              className="w-full"
            />
          </div>
        </div>
      ) : (
        <div className="mb-5 grid grid-cols-2 gap-3">
          <div>
            <p className={lbl}>{L('floor')}<RequiredMark /></p>
            <Select value={form.floor} onChange={(v) => set('floor', v)} placeholder={t('listProperty.ph.select')} ariaLabel={L('floor')} searchable options={floorOptions} dataErr="floor" invalid={!!errors.floor} />
            <FieldError show={!!errors.floor}>{t('listProperty.err.floor')}</FieldError>
          </div>
          <div>
            <p className={lbl}>{L('totalFloors')}<RequiredMark /></p>
            <Select value={form.totalFloors} onChange={(v) => set('totalFloors', v)} placeholder={t('listProperty.ph.select')} ariaLabel={L('totalFloors')} searchable options={totalFloorsOptions} dataErr="totalFloors" invalid={!!errors.totalFloors} />
            <FieldError show={!!errors.totalFloors}>{t('listProperty.err.totalFloors')}</FieldError>
          </div>
        </div>
      )}

      <div className="mb-5">
        <label htmlFor="room-occupants" className={lbl}>{L('occupants')}</label>
        <div className="relative w-40">
          <input
            id="room-occupants"
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_OCCUPANTS}
            value={form.occupants}
            placeholder="0"
            onChange={(e) => set('occupants', e.target.value === '' ? '' : String(clampOccupants(e.target.value)))}
            aria-describedby="room-occupants-help"
            className={`${fld} pr-24 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
          />
          <div className="absolute inset-y-0 right-1 flex items-center">
            <button type="button" onClick={() => stepOccupants(-1)} disabled={occupants <= 0} aria-label={t('listProperty.flatmate.occupantsLess')} className="w-10 h-10 inline-flex items-center justify-center rounded-lg text-gray-300 disabled:opacity-40">
              <ChevronDown className="w-5 h-5" />
            </button>
            <button type="button" onClick={() => stepOccupants(1)} disabled={occupants >= MAX_OCCUPANTS} aria-label={t('listProperty.flatmate.occupantsMore')} className="w-10 h-10 inline-flex items-center justify-center rounded-lg text-gray-300 disabled:opacity-40">
              <ChevronUp className="w-5 h-5" />
            </button>
          </div>
        </div>
        <p id="room-occupants-help" className="mt-1.5 text-xs text-gray-500">{t('listProperty.help.occupantsNow')}</p>
      </div>
    </>
  );
}
