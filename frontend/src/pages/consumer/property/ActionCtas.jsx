import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/Icon.jsx';
import { useTapPop } from '../../../lib/useTapPop.js';

const CONTACT_USED = {
  pending: ['clock', 'property.requestSent'],
  approved: ['circle-check', 'property.contacted'],
};

export function ContactCta({ status, onClick, className, iconClassName = 'w-4 h-4' }) {
  const { t } = useTranslation();
  const used = Boolean(CONTACT_USED[status]);
  const [icon, label] = CONTACT_USED[status] || ['message-circle', 'property.contactOwner'];
  const [taps, pop] = useTapPop();
  return (
    <button type="button" onClick={() => { if (used) pop(); onClick(); }} data-cta-state={used ? status : 'none'} className={className}>
      <Icon key={taps} name={icon} className={`${iconClassName}${used && taps ? ' dz-cta-pop' : ''}`} /> {t(label)}
    </button>
  );
}

const shortDate = (slot) => new Date(slot).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export function VisitCta({ visits, onSchedule, className, iconClassName = 'w-4 h-4', label }) {
  const { t } = useTranslation();
  const state = visits?.booked ? 'scheduled' : visits?.completed ? 'completed' : 'none';
  const [taps, pop] = useTapPop();
  if (state === 'none') {
    return (
      <button type="button" onClick={onSchedule} data-cta-state="none" className={className}>
        <Icon name="calendar" className={iconClassName} /> {label || t('property.visit')}
      </button>
    );
  }
  const slot = visits.booked?.slot;
  const text = state === 'completed' ? t('property.visited')
    : Number.isNaN(Date.parse(slot)) ? t('property.visitBooked') : t('property.visitOn', { date: shortDate(slot) });
  return (
    <Link to="/dashboard?tab=visits" onClick={pop} data-cta-state={state} className={className}>
      <Icon key={taps} name="calendar-check" className={`${iconClassName}${taps ? ' dz-cta-pop' : ''}`} /> {text}
    </Link>
  );
}
