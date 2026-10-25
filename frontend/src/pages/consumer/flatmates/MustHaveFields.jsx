import { useTranslation } from 'react-i18next';
import ChoiceRow from './ChoiceRow.jsx';

const labelCx = 'block text-sm font-medium text-gray-400 mb-2';

export function CheckTile({ checked, onChange, children }) {
  return (
    <label className="flex items-start gap-2.5 text-sm leading-5 text-gray-300 cursor-pointer select-none rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 shrink-0 mt-0.5 accent-teal-500" />
      <span>{children}</span>
    </label>
  );
}

export function ParkingRow({ value, onChange }) {
  const { t } = useTranslation();
  return (
    <div>
      <span className={labelCx}>{t('flatmates.parkingLabel')}</span>
      <ChoiceRow label={t('flatmates.parkingLabel')} options={[['', t('flatmates.parkingNone')], ['bike', t('flatmates.parkingBike')], ['car', t('flatmates.parkingCar')]]} value={value || ''} onChange={onChange} />
    </div>
  );
}

export default function SeekerMustHaves({ post, setPost }) {
  const { t } = useTranslation();
  const set = (patch) => setPost({ ...post, ...patch });
  return (
    <fieldset className="rounded-xl border border-teal-400/25 bg-teal-500/[0.04] px-3.5 pb-3.5" data-testid="seeker-must-haves">
      {/* Floated so the legend sits inside the box instead of on its top border. */}
      <legend className="float-left w-full flex items-center min-h-[44px] py-2.5 text-sm font-semibold text-white">{t('flatmates.mustHaves')}</legend>
      <div className="clear-both space-y-4 pt-1">
        <div>
          <span className={labelCx}>{t('flatmates.groupFurnishing')}</span>
          <ChoiceRow label={t('flatmates.groupFurnishing')} cols={2} options={[['', t('flatmates.optAnyFurnishing')], ['furnished', t('flatmates.furnFurnished')], ['semi', t('flatmates.furnSemi')], ['unfurnished', t('flatmates.furnUnfurnished')]]} value={post.furnishing || ''} onChange={(v) => set({ furnishing: v })} />
        </div>
        <ParkingRow value={post.parking} onChange={(v) => set({ parking: v })} />
        <div className="grid grid-cols-2 gap-2">
          <CheckTile checked={!!post.gatedOnly} onChange={(v) => set({ gatedOnly: v })}>{t('flatmates.gatedOnly')}</CheckTile>
          <CheckTile checked={!!post.attachedBath} onChange={(v) => set({ attachedBath: v })}>{t('flatmates.mustAttachedBath')}</CheckTile>
        </div>
      </div>
    </fieldset>
  );
}
