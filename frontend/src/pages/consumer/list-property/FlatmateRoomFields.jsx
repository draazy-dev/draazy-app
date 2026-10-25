import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import RequiredMark from '../../../components/ui/RequiredMark.jsx';
import { PillRow, FieldError } from './controls.jsx';
import { lbl } from './styles.js';
import FlatmateFlatFields from './FlatmateFlatFields.jsx';
import FurnitureIncluded from './FurnitureIncluded.jsx';

export default function FlatmateRoomFields({ form, set, errors, isHouse, toggleInArray, nextStep }) {
  const { t } = useTranslation();
  const L = (key) => t(`listProperty.flatmate.label.${key}`);
  const required = (field, label, options, errKey, extra = {}) => (
    <div className="mb-5">
      <p className={lbl}>{label}<RequiredMark /></p>
      <PillRow label={label} dataErr={field} invalid={!!errors[field]} options={options} value={form[field]} onChange={(v) => set(field, v)} {...extra} />
      <FieldError show={!!errors[field]}>{t(`listProperty.err.${errKey}`)}</FieldError>
    </div>
  );
  const optional = (field, label, options, cols) => (
    <div className="mb-5">
      <p className={lbl}>{label}</p>
      <PillRow label={label} cols={cols} options={options} value={form[field]} onChange={(v) => set(field, v)} />
    </div>
  );

  return (
    <div className="lp-step mt-2">
      <FlatmateFlatFields form={form} set={set} errors={errors} isHouse={isHouse} />

      {required('roomType', L('roomType'), [['Private room', t('listProperty.opt.roomSingle')], ['Shared room', t('listProperty.opt.roomDouble')]], 'roomType')}
      {required('attachedBath', L('washroom'), [['attached', t('listProperty.opt.attachedPrivate')], ['shared', t('listProperty.opt.sharedCommon')]], 'washroom')}
      {required('furnishing', t('listProperty.fields.furnishing'), [['unfurnished', t('listProperty.opt.unfurnished')], ['semi', t('listProperty.opt.semiFurnished')], ['furnished', t('listProperty.opt.furnished')]], 'furnishing', { fit: true })}

      <FurnitureIncluded form={form} toggleInArray={toggleInArray} whatKey="listProperty.word.room" />

      {optional('lookingFor', L('openTo'), [['any', t('listProperty.opt.anyone')], ['female', t('listProperty.opt.women')], ['male', t('listProperty.opt.men')]], 'grid-cols-3')}
      {optional('foodPref', L('food'), [['any', t('listProperty.opt.any')], ['veg', t('listProperty.opt.vegOnly')], ['nonveg', t('listProperty.opt.nonvegOk')]], 'grid-cols-3')}

      <div className="flex justify-end lp-step-actions">
        <button onClick={nextStep} className="btn-teal px-8 py-3.5 min-h-[44px] rounded-xl text-white font-semibold text-sm flex items-center gap-2 shadow-lg shadow-teal-500/20">
          {t('listProperty.next')} <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
