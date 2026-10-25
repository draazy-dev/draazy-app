import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import Icon from '../../../components/Icon.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import { useTapPop } from '../../../lib/useTapPop.js';
import { avatarGrad, initials, genderLabel, seekerBudget, matchFor, moveInLabel, detailPath, seekerTitle, mustHaves } from './helpers.js';
import { FLAT_PREF_LBL, ROOM_PREF_LBL } from './constants.js';
import { SaveBtn, TrustTag, Facts, MustHaveChips, CardBadge, CardLink } from './atoms.jsx';

export function SeekerAskButton({ r, owned, ask, onInterest }) {
  const { t: tr } = useTranslation();
  const { toast } = useToast();
  const [taps, pop] = useTapPop();
  const base = 'flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold ';
  if (owned) return <span className={base + 'btn-ghost text-teal-300 cursor-default'}><Icon name="megaphone" className="w-4 h-4" /> {tr('flatmates.detailYourPost')}</span>;
  if (ask) {
    const declined = ask.status === 'declined';
    const name = r.name || seekerTitle(r);
    const remind = () => { pop(); toast(tr(declined ? 'flatmates.seekerDeclinedToast' : 'flatmates.interestAlreadyRecorded', { name }), 'info'); };
    return (
      <button type="button" onClick={remind} data-ask-state={ask.status || 'pending'} className={base + (declined ? 'btn-ghost text-gray-300' : 'btn-ghost text-emerald-300')}>
        <Icon key={taps} name={declined ? 'x-circle' : 'check-check'} className={'w-4 h-4' + (taps ? ' dz-cta-pop' : '')} /> {tr(declined ? 'flatmates.notAccepted' : 'flatmates.interested')}
      </button>
    );
  }
  return <button onClick={() => onInterest(r)} className={base + 'exp-btn btn-teal text-white'}><Icon name="hand-heart" className="w-4 h-4" /> {tr('flatmates.expressInterest')}</button>;
}

const seekerSubtitle = (r) => [r.gender !== 'any' && genderLabel(r.gender), r.age, r.occupation].filter(Boolean).join(' · ');

const pref = (labels, v) => (v && v !== 'any' ? labels[v] : null);

function SeekerCard({ r, i, saved, onSave, anchorId, myPost }) {
  const { t: tr } = useTranslation();
  const match = matchFor(r, myPost);
  const href = detailPath('post', r.id);
  const localities = (r.localities || []).join(', ');
  const who = [r.title && r.name, seekerSubtitle(r)].filter(Boolean).join(' · ');
  return (
    <div data-sf-id={anchorId} className="sf-card relative rounded-2xl p-4 reveal" style={{ animationDelay: i * 0.03 + 's' }}>
      <div className="flex items-start gap-3">
        <div className={'w-11 h-11 rounded-full bg-gradient-to-br ' + avatarGrad(r.gender) + ' flex items-center justify-center text-white text-sm font-bold shrink-0'} aria-hidden="true">
          {initials(r.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-x-2 gap-y-1 flex-wrap">
            <h3 className="text-[15px] font-bold text-white leading-snug line-clamp-2"><Link to={href} data-tap-exempt className="relative z-[1]">{seekerTitle(r)}</Link></h3>
            {r.verified && <TrustTag label={tr('flatmates.verifiedSeeker')} />}
          </div>
          {who && <p className="text-xs text-gray-400 mt-1 truncate">{who}</p>}
        </div>
        <SaveBtn k={'s:' + r.id} saved={saved} onSave={onSave} className="relative z-[1] shrink-0 -mt-1 -mr-1 text-gray-400" />
      </div>
      <p className="sf-price mt-3 text-lg font-extrabold text-white leading-tight">
        {seekerBudget(r)}<span className="text-sm font-normal text-gray-400">{tr('flatmates.perMonth')}</span>
        <span className="text-[11px] font-normal text-gray-500 ml-1.5">{tr('flatmates.tagBudget')}</span>
      </p>
      {localities && <p className="flex items-center gap-1 text-xs text-gray-400 mt-1"><Icon name="map-pin" className="w-3 h-3 text-teal-400 shrink-0" /><span className="truncate">{localities}</span></p>}
      <Facts items={[
        ['bed', pref(ROOM_PREF_LBL, r.roomPref)],
        ['users', pref(FLAT_PREF_LBL, r.flatPref) && tr('flatmates.prefFlat_' + r.flatPref)],
        ['calendar-check', r.moveIn && moveInLabel(r.moveIn)],
      ]} />
      <MustHaveChips items={mustHaves(r, tr)} className="mt-3" />
      <div className="flex flex-wrap items-center gap-1.5 mt-3 empty:hidden">
        <CardBadge item={r} match={match} />
      </div>
      <CardLink to={href} />
    </div>
  );
}

export default SeekerCard;
