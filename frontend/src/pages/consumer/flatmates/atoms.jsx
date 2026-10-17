import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import Icon from '../../../components/Icon.jsx';
import { isFresh } from './helpers.js';
import ReviewChip from './ReviewChip.jsx';

const Chip = ({ children }) => <span className="dz-tag chip text-gray-300">{children}</span>;
const SaveBtn = ({ k, saved, onSave, className }) => {
  const { t } = useTranslation();
  return (
    <button onClick={() => onSave(k)} className={'save-btn w-11 h-11 sm:w-9 sm:h-9 inline-flex items-center justify-center ' + className + (saved ? ' saved' : '')} aria-pressed={saved} aria-label={saved ? t('flatmates.saved') : t('flatmates.save')}><Icon name="heart" weight={saved ? 'fill' : 'regular'} className="w-6 h-6" /></button>
  );
};
const TileChip = ({ icon, children }) => <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/5 border border-white/10 text-[11px] text-gray-300"><Icon name={icon} className="w-3 h-3 text-teal-400" /> {children}</span>;

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

const PolicyChip = ({ policy }) => {
  const { t } = useTranslation();
  if (policy === 'women') return <span className="dz-tag chip text-pink-300"><Icon name="venus" className="w-2.5 h-2.5" /> {t('flatmates.womenOnly')}</span>;
  if (policy === 'men') return <span className="dz-tag chip text-blue-300"><Icon name="mars" className="w-2.5 h-2.5" /> {t('flatmates.menOnly')}</span>;
  return <span className="dz-tag chip text-gray-300">{t('flatmates.openToAnyone')}</span>;
};
const CardLink = ({ to }) => <Link to={to} tabIndex={-1} aria-hidden="true" className="absolute inset-0 rounded-2xl" />;
export { Chip, SaveBtn, TileChip, MatchPill, Fresh, ReviewChip, PolicyChip, CardLink };
