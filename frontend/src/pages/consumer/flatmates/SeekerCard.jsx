import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import Icon from '../../../components/Icon.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import { useTapPop } from '../../../lib/useTapPop.js';
import { avatarGrad, initials, genderLabel, seekerBudget, matchFor, moveInLabel, detailPath, seekerTitle, mustHaves } from './helpers.js';
import { FLAT_PREF_LBL, ROOM_PREF_LBL } from './constants.js';
import { SaveBtn, TrustTag, TileChip, Facts, MustHaveChips, CardBadge, CardLink, SharedVibes } from './atoms.jsx';

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
  const meta = seekerSubtitle(r);
  // An untitled post already shows the name as its title, so the header leads with the meta line instead.
  const [lead, sub] = r.title && r.name ? [r.name, meta] : [meta, ''];
  return (
    <div data-sf-id={anchorId} className="sf-card relative rounded-2xl overflow-hidden reveal" style={{ animationDelay: i * 0.03 + 's' }}>
      <div className="flex items-center gap-3 pl-4 pr-2 py-3 bg-white/[0.03] border-b border-white/5">
        <div className={'w-11 h-11 rounded-full bg-gradient-to-br ' + avatarGrad(r.gender) + ' flex items-center justify-center text-white text-sm font-bold shrink-0'} aria-hidden="true">
          {initials(r.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            {lead && <p className="text-sm font-semibold text-white truncate">{lead}</p>}
            {r.verified && <TrustTag label={tr('flatmates.verifiedSeeker')} />}
          </div>
          {sub && <p className="text-xs text-gray-400 mt-0.5 truncate">{sub}</p>}
        </div>
        <SaveBtn k={'s:' + r.id} saved={saved} onSave={onSave} className="relative z-[1] shrink-0 text-gray-400" />
      </div>
      <div className="p-4">
        <h3 className="text-[15px] font-bold text-white leading-snug truncate"><Link to={href} data-tap-exempt className="relative z-[1]">{seekerTitle(r)}</Link></h3>
        {localities && <p className="flex items-center gap-1 text-xs text-gray-400 mt-1"><Icon name="map-pin" className="w-3 h-3 text-teal-400 shrink-0" /><span className="truncate">{localities}</span></p>}
        <p className="sf-price mt-3 text-lg font-extrabold text-white leading-tight">
          {seekerBudget(r)}<span className="text-sm font-normal text-gray-400">{tr('flatmates.perMonth')}</span>
          <span className="text-[11px] font-normal text-gray-500 ml-1.5">{tr('flatmates.tagBudget')}</span>
        </p>
        <Facts items={[
          ['bed', pref(ROOM_PREF_LBL, r.roomPref)],
          ['users', pref(FLAT_PREF_LBL, r.flatPref) && tr('flatmates.prefFlat_' + r.flatPref)],
        ]} />
        <div className="flex flex-wrap items-center gap-1.5 mt-3 empty:hidden">
          {r.moveIn && <TileChip icon="calendar-check">{moveInLabel(r.moveIn)}</TileChip>}
          <CardBadge item={r} match={match} />
        </div>
        <MustHaveChips items={mustHaves(r, tr)} className="mt-3" />
        <SharedVibes item={r} />
      </div>
      <CardLink to={href} />
    </div>
  );
}

export default SeekerCard;
