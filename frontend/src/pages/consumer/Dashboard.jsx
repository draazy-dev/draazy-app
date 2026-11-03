import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useSaved } from '../../context/SavedContext.jsx';
import { useFollows } from '../../context/FollowContext.jsx';
import { useSavedSearches } from '../../context/SavedSearchContext.jsx';
import { firstName } from '../../lib/auth.js';
import { flatmateCaseKey } from '../../lib/data/myListings.js';
import { useVerification } from '../../context/VerificationContext.jsx';
import { listRecentSearches } from '../../services/recentSearchService.js';
import { dashboardCaps, primeMeDashboard } from '../../services/meDashboardService.js';
import { REVISIT_MAX_AGE } from '../../services/http.js';
import VisitsTab from '../../components/dashboard/VisitsTab.jsx';
import DocumentsTab from '../../components/dashboard/DocumentsTab.jsx';
import FinancesTab from '../../components/dashboard/FinancesTab.jsx';
import ProfileTab from '../../components/dashboard/ProfileTab.jsx';
import { TABS, TAB_ALIAS, REVIEW_STATUS_MAP, buildDashboardGroups } from './dashboard/constants.js';
import { profileCompletion } from './dashboard/retention.js';
import { listManaged } from '../../services/managedService.js';
import LoadError from '../../components/LoadError.jsx';
import OverviewPanel from './dashboard/OverviewPanel.jsx';
import MyPropertiesPanel from './dashboard/MyPropertiesPanel.jsx';
import MyRentalPanel from './dashboard/MyRentalPanel.jsx';
import RequestsPanel from './requests/RequestsPanel.jsx';
import { Card } from './dashboard/components.jsx';
import BillingPanel from './dashboard/BillingPanel.jsx';
import ActivityPanel from './dashboard/ActivityPanel.jsx';
import MobileNav from './dashboard/MobileNav.jsx';
import DashboardSidebar from './dashboard/DashboardSidebar.jsx';
import DashboardReviewModal from './dashboard/DashboardReviewModal.jsx';
import { useDashboardData } from './dashboard/useDashboardData.js';
import { attentionFromItems, buildActionItems, buildDocGroups, buildOwnerStats, buildSeekerStats, countUpcomingVisits } from './dashboard/dashboardData.js';
import { DashboardOverviewSkeleton } from './dashboard/DashboardSkeleton.jsx';

export default function Dashboard() {
  const { t: tr } = useTranslation();
  const { user, update, logout } = useAuth();
  const saved = useSaved();
  const follows = useFollows();
  const savedSearches = useSavedSearches();
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const tabFromLocation = () => {
    const h = location.hash.replace('#', '');
    const q = new URLSearchParams(location.search).get('tab') || '';
    return h || q;
  };
  const resolveTarget = (candidate) => {
    if (candidate && TAB_ALIAS[candidate]) return TAB_ALIAS[candidate];
    return { tab: candidate || 'overview' };
  };
  const [dashboardDoc] = useState(() => primeMeDashboard({ listingTools: resolveTarget(tabFromLocation()).tab === 'properties', maxAge: REVISIT_MAX_AGE }));
  const [caps, setCaps] = useState({});
  useEffect(() => {
    let live = true;
    dashboardCaps(dashboardDoc).then((next) => { if (live) setCaps(next); });
    return () => { live = false; };
  }, [dashboardDoc]);
  const { verified } = useVerification();
  const [managedProps, setManagedProps] = useState([]);
  useEffect(() => {
    let live = true;
    listManaged()
      .then((rows) => { if (live) setManagedProps(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (live) setManagedProps([]); });
    return () => { live = false; };
  }, [user?.mobile]);
  const refreshManaged = useCallback(async () => {
    try {
      const rows = await listManaged();
      setManagedProps(Array.isArray(rows) ? rows : []);
    } catch { }
  }, []);

  const {
    listings, listingsLoaded, visits, recent, recommended, alertMatches,
    contactReqs, photoReqs, flatmateReqs, docReqs, serviceReqs,
    reviewProp, setReviewProp, reviewInput, setReviewInput, reviewsByProp, reviewThread,
    apps, offers, mutateVisit, openReview, sendReview,
    dataStatus, dataError, retryData,
    refreshData, refreshRequests, setListings,
  } = useDashboardData({ user, toast, ownsProperty: caps.ownsProperty });
  const isOwner = (listings || []).length > 0 || managedProps.length > 0;
  const { hasTenancy = false, hasRentalInvite = false } = caps;
  const showRental = hasTenancy || !isOwner || hasRentalInvite;
  const hasRentalGroup = hasTenancy || hasRentalInvite;

  const visibleTabs = useMemo(
    () => TABS.filter((t) => (!t.owner || isOwner) && (!t.tenant || showRental)),
    [isOwner, showRental],
  );
  const dashboardGroups = useMemo(
    () => buildDashboardGroups({ visibleTabs, isOwner, showRental, hasRentalGroup }),
    [visibleTabs, isOwner, showRental, hasRentalGroup],
  );

  const urlTarget = resolveTarget(tabFromLocation());
  const { tab, sub } = visibleTabs.some((t) => t.tab === urlTarget.tab) ? urlTarget : { tab: 'overview', sub: undefined };

  const REVIEW_STATUS = REVIEW_STATUS_MAP;

  const go = (next, { replace = false } = {}) => {
    const r = resolveTarget(next);
    if (r.link) { navigate(r.link); return; }
    if (!visibleTabs.some((t) => t.tab === r.tab)) return;
    const apply = () => { navigate('#' + next, { replace }); window.scrollTo(0, 0); };
    if (document.startViewTransition) document.startViewTransition(apply);
    else apply();
  };

  useEffect(() => {
    if (urlTarget.link) navigate(urlTarget.link, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- redirect only follows the active URL tab
  }, [urlTarget.link]);

  const reviewParam = new URLSearchParams(location.search).get('review');
  useEffect(() => {
    if (!reviewParam) return;
    openReview(reviewParam);
    const rest = new URLSearchParams(location.search);
    rest.delete('review');
    navigate({ search: rest.toString() ? `?${rest}` : '', hash: location.hash }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- review deep-link is consumed once
  }, [reviewParam]);

  const docGroups = useMemo(() => buildDocGroups(docReqs, listings), [docReqs, listings]);
  const pendingDocGroups = docGroups.filter((g) => g.pendingIds.length > 0);
  const savedCount = saved.count;
  const alertCount = savedSearches.count;
  const followCount = follows.count;
  const [recentSearches, setRecentSearches] = useState([]);
  useEffect(() => {
    let alive = true;
    setRecentSearches([]);
    listRecentSearches()
      .then((rows) => { if (alive) setRecentSearches(rows); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [user?.mobile]);
  const profile = useMemo(() => profileCompletion(user, verified), [user, verified]);

  const scheduledVisits = useMemo(() => visits.filter((v) => v.status === 'scheduled'), [visits]);
  const actionItems = buildActionItems({
    isOwner, contactReqs, apps, photoReqs, pendingDocGroups, listings, reviewsByProp,
    scheduledVisits, flatmateReqs, serviceReqs, offers, userId: user?.id, openReview, go,
  });
  const attentionCounts = attentionFromItems(actionItems);

  const upcomingVisits = countUpcomingVisits(visits, user?.id);
  const ownerStats = buildOwnerStats({ listings, items: actionItems, go });
  const seekerStats = buildSeekerStats({ savedCount, alertCount, followCount, upcomingVisits, go });
  const hasAnyCoreData = [
    listings, visits, recent, recommended, alertMatches, contactReqs, photoReqs, flatmateReqs, docReqs, apps, offers,
  ].some((rows) => (rows || []).length > 0);
  const personaPending = dataStatus === 'loading' && !hasAnyCoreData;

  const renderPanel = () => {
    if (tab === 'overview' && personaPending) return <DashboardOverviewSkeleton />;
    switch (tab) {
      case 'properties':
        return <MyPropertiesPanel key={'prop:' + (sub || '')} initialSub={sub} isOwner={isOwner} listings={listings} listingsLoaded={listingsLoaded} setListings={setListings} managed={managedProps} onManagedChanged={refreshManaged} user={user} toast={toast} REVIEW_STATUS={REVIEW_STATUS} openReview={openReview} reviewsByProp={reviewsByProp} onChanged={refreshData} />;
      case 'rental':
        return <MyRentalPanel user={user} toast={toast} />;
      case 'activity':
        return <ActivityPanel key={'act:' + (sub || '')} initialSub={sub} recent={recent} />;
      case 'leads':
        return <Card className="p-3 sm:p-5"><RequestsPanel key={'leads:' + (sub || '')} initialTab={sub} onChanged={refreshRequests} /></Card>;
      case 'finances':
        return <FinancesTab user={user} listings={listings} toast={toast} isOwner={isOwner} showRental={showRental} />;
      case 'documents':
        return <DocumentsTab user={user} listings={listings} toast={toast} isOwner={isOwner} onRoomBadgeChanged={refreshData} />;
      case 'visits':
        return <VisitsTab visits={visits} toast={toast} isOwner={isOwner} onUpdate={mutateVisit} />;
      case 'billing':
        return <BillingPanel isOwner={isOwner} listings={listings} />;
      case 'profile':
        return <ProfileTab user={user} update={update} toast={toast} isOwner={isOwner} />;
      default:
        return <OverviewPanel actionItems={actionItems} isOwner={isOwner} go={go} recent={recent} recommended={recommended} stats={isOwner ? ownerStats : seekerStats} alertMatches={alertMatches} profile={profile} recentSearches={recentSearches} />;
    }
  };

  return (
    <div className="pt-6 lg:pt-8 pb-20 min-h-[100dvh]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Hi, {firstName(user)} <span className="inline-block">👋</span></h1>
          <p className="text-gray-400 text-sm mt-1">Here's your Draazy activity.</p>
        </div>
        <MobileNav
          groups={dashboardGroups}
          activeTab={tab}
          onSelect={go}
          attentionCounts={attentionCounts}
          loading={personaPending}
          labelFor={(t) => tr('dashboard.tabs.' + t.tab, { defaultValue: t.label })}
        />

        <div className="lg:grid lg:grid-cols-[260px_1fr] lg:gap-6">
          <DashboardSidebar
            groups={dashboardGroups}
            activeTab={tab}
            onSelect={go}
            attentionCounts={attentionCounts}
            user={user}
            onLogout={logout}
            loading={personaPending}
          />

          <section>
            {dataStatus === 'error' && (
              <LoadError message={tr('dash.dashboardLoadError')} error={dataError} onRetry={retryData} className="glass-card rounded-2xl p-5 mb-5" />
            )}
            {renderPanel()}
          </section>
        </div>
      </div>

      <DashboardReviewModal
        reviewProp={reviewProp}
        setReviewProp={setReviewProp}
        thread={reviewThread}
        listing={(listings || []).find((l) => l.id === reviewProp || l.uuid === reviewProp || flatmateCaseKey(l) === reviewProp)}
        reviewInput={reviewInput}
        setReviewInput={setReviewInput}
        sendReview={sendReview}
        REVIEW_STATUS={REVIEW_STATUS}
      />
    </div>
  );
}
