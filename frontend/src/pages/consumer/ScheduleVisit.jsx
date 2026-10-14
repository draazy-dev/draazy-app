import { Link, Navigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import Icon from '../../components/Icon.jsx';

// The property page's popup is the one booking form; this route only forwards to it.
export default function ScheduleVisit() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const listingId = params.get('p') || params.get('listing') || '';

  if (listingId) return <Navigate to={`/property/${encodeURIComponent(listingId)}?visit=1`} replace />;

  return (
    <div className="pt-8 lg:pt-10 pb-20 min-h-[100dvh] px-4">
      <div className="glass-card rounded-2xl p-6 max-w-sm mx-auto text-center">
        <div className="w-12 h-12 rounded-xl bg-teal-400/15 flex items-center justify-center mx-auto mb-3"><Icon name="calendar-check" className="w-6 h-6 text-teal-400" /></div>
        <h1 className="text-white font-semibold">{t('misc1.svBookVisit')}</h1>
        <p className="text-gray-400 text-sm mt-1">{t('misc1.svBookVisitSub')}</p>
        <Link to="/listings" className="btn-teal inline-flex items-center justify-center gap-2 mt-4 min-h-[44px] px-4 rounded-xl text-sm text-white"><Icon name="search" className="w-4 h-4" /> {t('misc1.svBrowseListings')}</Link>
      </div>
    </div>
  );
}
