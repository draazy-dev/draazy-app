import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import Icon from '../../../components/Icon.jsx';
import { isFresh } from './helpers.js';
import { matchTier } from './livingStyle/questions.js';
import ReviewChip from './ReviewChip.jsx';

const Chip = ({ children }) => <span className="dz-tag chip text-gray-300">{children}</span>;
const SaveBtn = ({ k, saved, onSave, className }) => {
  const { t } = useTranslation();
  return (
    <button onClick={() => onSave(k)} className={'save-btn w-11 h-11 sm:w-9 sm:h-9 inline-flex items-center justify-center ' + className + (saved ? ' saved' : '')} aria-pressed={saved} aria-label={saved ? t('flatmates.saved') : t('flatmates.save')}><Icon name="heart" weight={saved ? 'fill' : 'regular'} className="w-6 h-6" /></button>
  );
};
const TileChip = ({ icon, children }) => <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/5 border border-white/10 text-[11px] text-gray-300">{icon && <Icon name={icon} className="w-3 h-3 text-teal-400" />} {children}</span>;
const TrustTag = ({ label }) => (label
  ? <span className="dz-tag badge-seeker font-bold uppercase tracking-wider text-white"><Icon name="shield-check" /> {label}</span>
  : null);
const Facts = ({ items }) => {
  const list = items.filter(([, label]) => label);
  if (!list.length) return null;
  return (
    <div className="flex items-center gap-x-3 gap-y-1.5 text-xs text-gray-300 mt-3 flex-wrap">
      {list.map(([ic, label]) => <span key={label} className="flex items-center gap-1"><Icon name={ic} className="w-3.5 h-3.5 text-gray-500" /> {label}</span>)}
    </div>
  );
};
const MustHaveChips = ({ items, className = '' }) => {
  const { t } = useTranslation();
  if (!items.length) return null;
  return (
    <ul aria-label={t('flatmates.mustHaves')} data-testid="must-haves" className={'flex flex-wrap gap-1.5 ' + className}>
      {items.map(([ic, label]) => (
        <li key={label} className="inline-flex items-center gap-1 rounded-full border border-teal-400/40 bg-teal-500/10 px-2.5 py-1 text-xs font-semibold text-teal-100">
          <Icon name={ic} className="w-3.5 h-3.5 text-teal-300 shrink-0" />{label}
        </li>
      ))}
    </ul>
  );
};
const POLICY_FACT = { women: ['venus', 'womenOnly'], men: ['mars', 'menOnly'], any: ['users', 'openToAnyone'] };
const policyFact = (policy, t) => {
  const [icon, key] = POLICY_FACT[policy] || POLICY_FACT.any;
  return [icon, t('flatmates.' + key)];
};

const MatchPill = ({ match }) => {
  const { t } = useTranslation();
  if (!match) return null;
  const great = match.tier === 'great';
  const what = [match.locality, match.budget].filter(Boolean).join(', ');
  return (
    <span
      className={'dz-tag sf-match font-semibold ' + (great ? 'sf-match-great text-white' : 'sf-match-good')}
      title={t('flatmates.matchPillTitle')}
    >
      <Icon name="sparkles" className="w-2.5 h-2.5" /> {t(great ? 'flatmates.matchGreat' : 'flatmates.matchGood', { what })}
    </span>
  );
};

// Honest freshness flag: shown only for posts created in the last 24h so seekers
// can spot the newest, most-likely-still-available requests at a glance.
const Fresh = ({ item }) => {
  const { t } = useTranslation();
  return (isFresh(item)
    ? <span className="dz-tag sf-fresh font-bold uppercase tracking-wider" title={t('flatmates.freshTitle')}><Icon name="zap" className="w-2.5 h-2.5" /> {t('flatmates.freshNew')}</span>
    : null);
};

const STYLE_CLS = { great: 'sf-match-great text-white', good: 'sf-match-good', low: 'chip text-gray-300' };
const StyleMatch = ({ pct }) => {
  const { t } = useTranslation();
  if (!Number.isFinite(pct)) return null;
  return (
    <span data-testid="style-match" className={'dz-tag sf-match font-semibold ' + STYLE_CLS[matchTier(pct)]} title={t('flatmates.ls.chipTitle')}>
      <Icon name="heart-handshake" className="w-2.5 h-2.5" /> {t('flatmates.ls.chip', { pct })}
    </span>
  );
};

/** One badge per card: living-style match, else the post-based match, else the freshness flag. */
const CardBadge = ({ item, match }) => (Number.isFinite(item.styleMatch)
  ? <StyleMatch pct={item.styleMatch} />
  : match ? <MatchPill match={match} /> : <Fresh item={item} />);

const CardLink = ({ to }) => <Link to={to} tabIndex={-1} aria-hidden="true" className="absolute inset-0 rounded-2xl" />;
export { Chip, SaveBtn, TileChip, TrustTag, Facts, MustHaveChips, policyFact, MatchPill, Fresh, StyleMatch, CardBadge, ReviewChip, CardLink };
