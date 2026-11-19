import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { fmtDate } from '../../../lib/format.js';

const STATES = {
  invited: { label: 'misc1.referFriendInvited', hint: 'misc1.referFriendInvitedHint', tone: 'text-gray-300 bg-white/5' },
  joined: { label: 'misc1.referFriendJoined', hint: 'misc1.referFriendJoinedHint', tone: 'text-sky-300 bg-sky-500/10' },
  checking: { label: 'misc1.referFriendChecking', hint: 'misc1.referFriendCheckingHint', tone: 'text-amber-300 bg-amber-500/10' },
  locked: { label: 'misc1.referFriendLocked', hint: null, tone: 'text-amber-300 bg-amber-500/10' },
  ready: { label: 'misc1.referFriendReady', hint: 'misc1.referFriendReadyHint', tone: 'text-emerald-300 bg-emerald-500/10' },
  used: { label: 'misc1.referFriendUsed', hint: 'misc1.referFriendUsedHint', tone: 'text-teal-300 bg-teal-500/10' },
  not_counted: { label: 'misc1.referFriendNotCounted', hint: 'misc1.referFriendNotCountedHint', tone: 'text-gray-400 bg-white/5' },
};

const KYC_HINTS = {
  you: 'misc1.referFriendKycYou',
  friend: 'misc1.referFriendKycFriend',
  both: 'misc1.referFriendKycBoth',
};

function Friend({ friend, percent }) {
  const { t } = useTranslation();
  const state = STATES[friend.state] || STATES.joined;
  const kycHint = friend.state === 'locked' ? KYC_HINTS[friend.kycPending] : null;
  const needsMyKyc = kycHint && friend.kycPending !== 'friend';
  return (
    <li className="py-3 flex items-start justify-between gap-3" data-testid="refer-friend" data-mobile={friend.mobile} data-state={friend.state}>
      <div className="min-w-0">
        <p className="font-semibold truncate">{friend.name || `+91 ${friend.mobile}`}</p>
        <p className="text-xs text-gray-500">
          {friend.name ? `+91 ${friend.mobile} · ` : ''}{fmtDate(friend.at)}
        </p>
        <p className="text-xs text-gray-400 mt-1" data-testid="refer-friend-hint">
          {kycHint ? t(kycHint) : state.hint ? t(state.hint, { percent }) : ''}
          {needsMyKyc && (
            <>{' '}<Link to="/verify-identity" className="underline font-semibold text-amber-300">{t('misc1.referDoKyc')}</Link></>
          )}
        </p>
      </div>
      <span className={`shrink-0 text-xs font-semibold rounded-full px-2.5 py-1 ${state.tone}`}>{t(state.label)}</span>
    </li>
  );
}

export default function FriendList({ friends, percent }) {
  const { t } = useTranslation();
  return (
    <section className="glass rounded-2xl p-5 sm:p-6 mt-5" data-testid="refer-friends">
      <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-1">{t('misc1.referFriendsTitle')}</h2>
      {friends.length === 0 ? (
        <p className="text-sm text-gray-500 py-3" data-testid="refer-friends-empty">{t('misc1.referFriendsEmpty')}</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {friends.map((f) => <Friend key={f.mobile} friend={f} percent={percent} />)}
        </ul>
      )}
    </section>
  );
}
