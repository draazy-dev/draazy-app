import { useTranslation } from 'react-i18next';
import Icon from './Icon.jsx';
import { fmtDate, fmtNum } from '../lib/format.js';
import { ymLabel } from '../lib/data/rentReminders.js';

const DAY_MS = 86_400_000;
export const SOON_DAYS = 60;

export const daysUntil = (iso) => {
  const now = new Date();
  return Math.ceil((Date.parse(iso) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / DAY_MS);
};

function Line({ icon, tone = 'text-gray-400', testId, children }) {
  return (
    <p className={'text-xs flex items-center gap-1.5 ' + tone} data-testid={testId}>
      <Icon name={icon} className="w-3.5 h-3.5 shrink-0" /> {children}
    </p>
  );
}

export default function LeaseFacts({ home, testId, className = '' }) {
  const { t, i18n } = useTranslation();
  const { leaseEnd, deposit, policeIntimation, policeIntimatedOn } = home;
  if (!leaseEnd && !deposit && !policeIntimation) return null;
  const left = leaseEnd ? daysUntil(leaseEnd) : null;
  return (
    <div className={'space-y-1 ' + className}>
      {leaseEnd && (left < 0 ? (
        <Line icon="x-circle" tone="text-rose-300" testId={testId + '-lease-end'}>{t('leaseFacts.ended', { date: fmtDate(leaseEnd) })}</Line>
      ) : left <= SOON_DAYS ? (
        <Line icon="timer" tone="text-amber-300" testId={testId + '-lease-end'}>{t('leaseFacts.endsIn', { count: left, date: fmtDate(leaseEnd) })}</Line>
      ) : (
        <Line icon="file-text" testId={testId + '-lease-end'}>{t('leaseFacts.till', { month: ymLabel(leaseEnd.slice(0, 7), i18n.language) })}</Line>
      ))}
      {deposit > 0 && (
        <Line icon="piggy-bank" testId={testId + '-deposit'}>{t('leaseFacts.deposit', { amount: fmtNum(deposit) })}</Line>
      )}
      {policeIntimation === 'done' && (
        <Line icon="shield-check" tone="text-emerald-300" testId={testId + '-police'}>
          {policeIntimatedOn ? t('leaseFacts.policeDoneOn', { date: fmtDate(policeIntimatedOn) }) : t('leaseFacts.policeDone')}
        </Line>
      )}
      {policeIntimation === 'pending' && (
        <Line icon="shield" testId={testId + '-police'}>{t('leaseFacts.policePending')}</Line>
      )}
    </div>
  );
}
