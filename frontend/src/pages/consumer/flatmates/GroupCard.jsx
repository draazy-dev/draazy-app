import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import Icon from '../../../components/Icon.jsx';
import { seatsLeft, inr, perHead, shareFloor, moneyRange, groupLocalities, allVerified, matchFor, hostTierMeta, showHostBadge, detailPath, moveInLabel, bhkText, policyAvatar, mustHaves } from './helpers.js';
import { SaveBtn, TrustTag, TileChip, Facts, MustHaveChips, policyFact, MatchPill, Fresh, CardBadge, ReviewChip, CardLink, SharedVibes } from './atoms.jsx';

export function GroupJoinButton({ g, onJoin }) {
  const { t: tr } = useTranslation();
  const base = 'flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold ';
  if (seatsLeft(g) <= 0) return <button className={base + 'btn-ghost opacity-60 cursor-not-allowed text-white'} disabled><Icon name="lock" className="w-4 h-4" /> {tr('flatmates.groupFull')}</button>;
  return <button onClick={() => onJoin(g)} className={base + 'request-btn btn-teal text-white'}><Icon name="user-check" className="w-4 h-4" /> {tr('flatmates.requestToJoin')}</button>;
}

const groupMatch = (g, myPost) => matchFor({ localities: groupLocalities(g), budget: shareFloor(g) || perHead(g), budgetMax: perHead(g), gender: g.policy === 'women' ? 'female' : g.policy === 'men' ? 'male' : 'any' }, myPost);

export function groupTrust(g, t) {
  const tier = showHostBadge(g, g.reviewStatus) && hostTierMeta(g);
  return [
    tier && [tier.label, tier.icon, t(g.verificationTier === 'owner' ? 'flatmates.trustOwnerBody' : 'flatmates.trustTenantBody')],
    allVerified(g) && [t('flatmates.allVerified'), 'shield-check', t('flatmates.trustAllVerifiedBody')],
    g.ownerConsent && [t('flatmates.ownerConsented'), 'badge-check', t('flatmates.trustOwnerConsentedBody')],
  ].filter(Boolean);
}

export function GroupBadges({ g, reviewStatus, myPost, owned }) {
  const { t: tr } = useTranslation();
  const left = seatsLeft(g);
  return (
    <>
      {left <= 0
        ? <span className="dz-tag chip text-amber-300">{tr('flatmates.full')}</span>
        : <span className="dz-tag badge-seeker font-bold text-white">{tr('flatmates.seatsLeft', { count: left })}</span>}
      <ReviewChip status={reviewStatus} kind="group" id={g.id} owned={owned} />
      <MatchPill match={groupMatch(g, myPost)} />
      <Fresh item={g} />
    </>
  );
}

const METER_MAX = 6;

function SeatDots({ g }) {
  const left = seatsLeft(g);
  const members = g.members || [];
  const offPlatform = Math.max(0, g.seatsTotal - left - members.length);
  if (g.seatsTotal > METER_MAX) {
    return <span className={'w-11 h-11 rounded-full inline-flex items-center justify-center text-white shrink-0 bg-gradient-to-br ' + policyAvatar(g.policy)} aria-hidden="true"><Icon name="users" className="w-5 h-5" /></span>;
  }
  const dot = 'w-7 h-7 rounded-full inline-flex items-center justify-center text-[10px] font-bold shrink-0 ';
  return (
    <div className="flex items-center gap-1 shrink-0" aria-hidden="true">
      {members.map((m, k) => <span key={m.id || k} className={dot + 'text-white bg-gradient-to-br ' + policyAvatar(g.policy)}>{m.initials}</span>)}
      {Array.from({ length: offPlatform }).map((_, k) => <span key={'f' + k} className={dot + 'bg-white/10 text-gray-400'}><Icon name="user" className="w-3.5 h-3.5" /></span>)}
      {Array.from({ length: left }).map((_, k) => <span key={'o' + k} className={dot + 'border border-dashed border-white/30'} />)}
    </div>
  );
}

function GroupCard({ g, i, saved, onSave, anchorId, myPost }) {
  const { t: tr } = useTranslation();
  const href = detailPath('group', g.id);
  const match = groupMatch(g, myPost);
  const trust = groupTrust(g, tr)[0]?.[0];
  const p = g.hunting && g.preferences;
  const left = seatsLeft(g);
  const moveIn = p?.moveInBy;
  return (
    <div data-sf-id={anchorId} className="sf-card relative rounded-2xl overflow-hidden reveal" style={{ animationDelay: i * 0.03 + 's' }}>
      <div className="flex items-center gap-3 pl-4 pr-2 py-3 bg-white/[0.03] border-b border-white/5">
        <SeatDots g={g} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-x-2 gap-y-1 flex-wrap">
            <p className={'text-sm font-semibold whitespace-nowrap ' + (left > 0 ? 'text-teal-300' : 'text-amber-300')}>{left > 0 ? tr('flatmates.seatsLeft', { count: left }) : tr('flatmates.full')}</p>
            <TrustTag label={trust} />
          </div>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{policyFact(g.policy, tr)[1]}</p>
        </div>
        <SaveBtn k={'g:' + g.id} saved={saved} onSave={onSave} className="relative z-[1] shrink-0 text-gray-400" />
      </div>
      <div className="p-4">
        <h3 className="text-[15px] font-bold text-white leading-snug truncate"><Link to={href} data-tap-exempt className="relative z-[1]">{g.title}</Link></h3>
        <p className="flex items-center gap-1 text-xs text-gray-400 mt-1"><Icon name="map-pin" className="w-3 h-3 text-teal-400 shrink-0" /><span className="truncate">{groupLocalities(g).join(', ')}</span></p>
        <p className="sf-price mt-3 text-lg font-extrabold text-white leading-tight">
          {p ? moneyRange(shareFloor(g), perHead(g), tr) : inr(perHead(g))}<span className="text-sm font-normal text-gray-400">{tr('flatmates.perMonth')}</span>
          <span className="text-[11px] font-normal text-gray-500 ml-1.5">{p ? tr('flatmates.tagBudgetEach') : g.rent > 0 ? tr('flatmates.tagShareOf', { rent: inr(g.rent) }) : tr('flatmates.tagYourShare')}</span>
        </p>
        <Facts items={[['bed', p && bhkText(p.bhk)]]} />
        <div className="flex flex-wrap items-center gap-1.5 mt-3 empty:hidden">
          {moveIn && <TileChip icon="calendar-check">{moveInLabel(moveIn)}</TileChip>}
          <CardBadge item={g} match={match} />
        </div>
        {p && <MustHaveChips items={mustHaves(p, tr)} className="mt-3" />}
        <SharedVibes item={g} />
      </div>
      <CardLink to={href} />
    </div>
  );
}

export default GroupCard;
