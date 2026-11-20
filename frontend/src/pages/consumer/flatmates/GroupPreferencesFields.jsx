import { useTranslation } from 'react-i18next';
import Icon from '../../../components/Icon.jsx';
import NativeSelect from '../../../components/ui/NativeSelect.jsx';
import LocalitySelect from '../../../components/ui/LocalitySelect.jsx';
import FieldError from '../../../components/ui/FieldError.jsx';
import RequiredMark from '../../../components/ui/RequiredMark.jsx';
import AmountInput from './AmountInput.jsx';
import MoveInField from './MoveInField.jsx';
import { CheckTile, ParkingRow } from './MustHaveFields.jsx';
import { MAX_LOCALITIES, GROUP_BHKS } from './constants.js';
import { inr } from './helpers.js';

function perHeadRange(grp) {
  const seats = +grp.seats;
  if (!seats || !+grp.rentMax) return '—';
  const each = (v) => inr(Math.round(+v / seats));
  return +grp.rentMin ? `${each(grp.rentMin)} – ${each(grp.rentMax)}` : `${each(grp.rentMax)}`;
}

const labelCx = 'block text-sm font-medium text-gray-400 mb-2';

export default function GroupPreferencesFields({ grp, setGrp, grpErr, onLocalityBusy, seatsField }) {
  const { t: tr } = useTranslation();
  const set = (patch, cleared) => { setGrp((g) => ({ ...g, ...patch })); if (cleared) grpErr.clear(cleared); };
  const toggleBhk = (b) => set({ bhk: grp.bhk.includes(b) ? grp.bhk.filter((x) => x !== b) : [...grp.bhk, b].sort() });
  const money = (name, label, placeholder, required = false) => (
    <div data-err={name}>
      <AmountInput value={grp[name]} onChange={(v) => set({ [name]: v }, name)} className={grpErr.cx(name)} placeholder={placeholder} aria-label={label} aria-required={required || undefined} />
      <FieldError show={grpErr.has(name)}>{grpErr.msg(name)}</FieldError>
    </div>
  );
  return (
    <div className="space-y-4" data-testid="group-preferences">
      <div>
        <label className={labelCx}>{tr('flatmates.groupLocalities')}<RequiredMark /> <span className="text-gray-600">        {tr('flatmates.upToN', { count: MAX_LOCALITIES })}</span></label>
        <LocalitySelect
          multi
          autoClose
          max={MAX_LOCALITIES}
          values={grp.localities}
                  onChange={(arr) => { if (arr.length <= MAX_LOCALITIES) set({ localities: arr }, 'localities'); }}
          placeholder={tr('flatmates.addLocalities')}
          invalid={grpErr.has('localities')}
          dataErr="localities"
          ariaLabel={tr('flatmates.groupLocalities')}
          onBusyChange={onLocalityBusy}
        />
        <FieldError show={grpErr.has('localities')}>{grpErr.msg('localities')}</FieldError>
      </div>
      <div>
        <span className={labelCx}>{tr('flatmates.groupBhk')}</span>
        <div className="grid grid-cols-4 gap-2" role="group" aria-label={tr('flatmates.groupBhk')}>
          {GROUP_BHKS.map((b) => (
            <button key={b} type="button" onClick={() => toggleBhk(b)} aria-pressed={grp.bhk.includes(b)} className={'seg !h-auto min-h-11 justify-center rounded-xl text-sm font-semibold text-gray-300' + (grp.bhk.includes(b) ? ' active' : '')}>{tr(b === '4' ? 'flatmates.bhk4Plus' : 'flatmates.bhkN', { n: b })}</button>
          ))}
        </div>
      </div>
      <div>
        <span className={labelCx}>{tr('flatmates.groupRentRange')}<RequiredMark /></span>
        <div className="grid grid-cols-2 gap-3">
          {money('rentMin', tr('flatmates.rentMinLabel'), tr('flatmates.rangeFrom'))}
          {money('rentMax', tr('flatmates.rentMaxLabel'), tr('flatmates.rangeUpTo'), true)}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 -mt-1">
        <Icon name="calculator" className="w-3.5 h-3.5 text-teal-400" />
        <span className="text-xs text-gray-400">{tr('flatmates.eachFlatmatePays')}</span>
        <span className="text-sm font-bold gradient-text" data-testid="group-per-head-range">{perHeadRange(grp)}{+grp.rentMax && +grp.seats ? tr('flatmates.perMonth') : ''}</span>
      </div>
      <div>
        <span className={labelCx}>{tr('flatmates.groupDepositRange')}<RequiredMark /></span>
        <div className="grid grid-cols-2 gap-3">
          {money('depositMin', tr('flatmates.depositMinLabel'), tr('flatmates.rangeFrom'))}
          {money('depositMax', tr('flatmates.depositMaxLabel'), tr('flatmates.rangeUpTo'), true)}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {seatsField}
        <div><label className={labelCx}>{tr('flatmates.groupFurnishing')}</label><NativeSelect title={tr('flatmates.groupFurnishing')} value={grp.furnishing} onChange={(e) => set({ furnishing: e.target.value })} className="field w-full rounded-xl px-3.5 py-2 text-sm"><option value="">{tr('flatmates.optNoPreference')}</option><option value="furnished">{tr('flatmates.furnFurnished')}</option><option value="semi">{tr('flatmates.furnSemi')}</option><option value="unfurnished">{tr('flatmates.furnUnfurnished')}</option></NativeSelect></div>
      </div>
      <div><span className={labelCx}>{tr('flatmates.groupMoveInBy')}</span><MoveInField value={grp.moveInBy} onChange={(v) => set({ moveInBy: v })} label={tr('flatmates.groupMoveInBy')} /></div>
      <ParkingRow value={grp.parking} onChange={(v) => set({ parking: v })} />
      <div className="grid grid-cols-2 gap-2">
        <CheckTile checked={grp.gatedOnly} onChange={(v) => set({ gatedOnly: v })}>{tr('flatmates.gatedOnly')}</CheckTile>
        <CheckTile checked={grp.bachelors} onChange={(v) => set({ bachelors: v })}>{tr('flatmates.needsBachelors')}</CheckTile>
      </div>
    </div>
  );
}
