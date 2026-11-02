import { matchRoutes, Navigate, Route, Routes, useLocation, useNavigationType, useRoutes } from 'react-router';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';

import ConsumerLayout from './components/layout/ConsumerLayout.jsx';
import PreviewBanner from './components/pmf/PreviewBanner.jsx';
import { ProtectedRoute, RoleRoute, FlagRoute, AppFlagRoute, ModuleRoute } from './components/RouteGuards.jsx';
import { AppFlagsProvider } from './context/AppFlagsContext.jsx';
import { useAuth } from './context/AuthContext.jsx';
import { lazyPage } from './i18n/lazyPage.js';
import { preloadable } from './lib/preloadable.js';
import { applyAppPrefs } from './lib/localPrefs.js';
import { readAccessToken } from './lib/auth.js';
import { prefetchMyListing } from './services/propertyService.js';
import { DESK_BY_VALUE, portalBase, portalPath } from './lib/adminModules.js';
import { recordPageView, startPageViewBeacon } from './lib/telemetry/pageViewBeacon.js';
import usePageHead from './lib/usePageHead.js';
import { captureReferral } from './lib/referralAttribution.js';
import { ROUTE_HEADS } from './data/routeHeads.js';

import Home from './pages/consumer/Home.jsx';
import Signin from './pages/consumer/Signin.jsx';
import Signup from './pages/consumer/Signup.jsx';
import Stub from './pages/Stub.jsx';
import useKeyboardOpen from './lib/useKeyboardOpen.js';
import { installReducedMotionScroll } from './lib/motion.js';
import LegacyHelpLangRedirect from './components/help/LegacyHelpLangRedirect.jsx';

const AdminLayout = preloadable(() => import('./components/layout/AdminLayout.jsx'));
const StaffLogin = lazy(() => import('./pages/consumer/StaffLogin.jsx'));

import DashboardSkeleton from './pages/consumer/dashboard/DashboardSkeleton.jsx';
import FlatmatesSkeleton from './pages/consumer/flatmates/FlatmatesSkeleton.jsx';
import SocietySkeleton from './pages/consumer/society/SocietySkeleton.jsx';

const Listings = lazyPage(() => import('./pages/consumer/Listings.jsx'), 'listings', 'owner', 'property', 'verify');
const Property = lazyPage(() => import('./pages/consumer/Property.jsx'), 'listings', 'owner', 'property', 'verify');
const Owner = lazyPage(() => import('./pages/consumer/Owner.jsx'), 'owner');
const Compare = lazyPage(() => import('./pages/consumer/Compare.jsx'), 'compare-saved');
const Dashboard = lazyPage(() => import('./pages/consumer/Dashboard.jsx'), 'dashboard', 'flatmates', 'list-property', 'listings', 'locality', 'owner', 'owner-hub', 'verify');
const Services = lazyPage(() => import('./pages/consumer/Services.jsx'), 'services');
const ListProperty = lazyPage(() => import('./pages/consumer/ListProperty.jsx'), 'flatmates', 'list-property', 'owner', 'verify');
const PropertyPassport = lazyPage(() => import('./pages/consumer/PropertyPassport.jsx'), 'locality', 'owner-hub');
const PackersMovers = lazyPage(() => import('./pages/consumer/services/PackersMovers.jsx'), 'services');
const PropertyLegal = lazyPage(() => import('./pages/consumer/services/PropertyLegal.jsx'), 'services');
const HomeLoans = lazyPage(() => import('./pages/consumer/services/HomeLoans.jsx'), 'services');
const InteriorRenovation = lazyPage(() => import('./pages/consumer/services/InteriorRenovation.jsx'), 'services');
const PropertyValuation = lazyPage(() => import('./pages/consumer/services/PropertyValuation.jsx'), 'services');
const RentAgreement = lazyPage(() => import('./pages/consumer/services/RentAgreement.jsx'), 'list-property', 'services');
const Contact = lazy(() => import('./pages/consumer/Contact.jsx'));
const TrustPage = lazy(() => import('./pages/consumer/TrustPage.jsx'));
const CompareNobroker = lazy(() => import('./pages/consumer/CompareNobroker.jsx'));
const StaffInvite = lazy(() => import('./pages/consumer/StaffInvite.jsx'));
const Notifications = lazy(() => import('./pages/consumer/Notifications.jsx'));
const Plans = lazy(() => import('./pages/consumer/Plans.jsx'));
const Refer = lazy(() => import('./pages/consumer/Refer.jsx'));
const EmiCalculator = lazy(() => import('./pages/consumer/EmiCalculator.jsx'));
const ToolsHub = lazy(() => import('./pages/consumer/tools/ToolsHub.jsx'));
const RentReceipt = lazy(() => import('./pages/consumer/tools/RentReceipt.jsx'));
const StampDutyTool = lazy(() => import('./pages/consumer/tools/StampDutyTool.jsx'));
const RentAgreementCost = lazyPage(() => import('./pages/consumer/tools/RentAgreementCost.jsx'), 'services');
const RentalYield = lazy(() => import('./pages/consumer/tools/RentalYield.jsx'));
const TenantProfile = lazyPage(() => import('./pages/consumer/TenantProfile.jsx'), 'misc2', 'verify');
const VerifyIdentity = lazyPage(() => import('./pages/consumer/VerifyIdentity.jsx'), 'verify-identity');
const Checkout = lazyPage(() => import('./pages/consumer/Checkout.jsx'), 'misc2');
const ScheduleVisit = lazy(() => import('./pages/consumer/ScheduleVisit.jsx'));
const Society = lazyPage(() => import('./pages/consumer/Society.jsx'), 'list-property', 'property', 'society');
const Societies = lazyPage(() => import('./pages/consumer/Societies.jsx'), 'list-property', 'society');
const Reels = lazyPage(() => import('./pages/consumer/Reels.jsx'), 'compare-saved', 'reels-docs');
const Saved = lazyPage(() => import('./pages/consumer/Saved.jsx'), 'compare-saved', 'flatmates', 'listings');
const PayRent = lazyPage(() => import('./pages/consumer/PayRentComingSoon.jsx'), 'misc2');
const ViewDocuments = lazyPage(() => import('./pages/consumer/ViewDocuments.jsx'), 'reels-docs');
const Messages = lazyPage(() => import('./pages/consumer/Messages.jsx'), 'flatmates', 'misc2');
const Flatmates = lazyPage(() => import('./pages/consumer/Flatmates.jsx'), 'dashboard', 'flatmates', 'list-property', 'owner', 'property', 'verify');
const FlatmateDetail = lazyPage(() => import('./pages/consumer/FlatmateDetail.jsx'), 'flatmates', 'owner', 'property');
const OwnerConfirm = lazyPage(() => import('./pages/consumer/OwnerConfirm.jsx'), 'flatmates');
const Locality = lazyPage(() => import('./pages/consumer/Locality.jsx'), 'listings', 'locality');
const RentBuyLanding = lazyPage(() => import('./pages/consumer/RentBuyLanding.jsx'), 'listings', 'owner', 'property', 'verify');
const FlatmateLanding = lazyPage(() => import('./pages/consumer/FlatmateLanding.jsx'), 'flatmates', 'owner', 'property', 'verify');
const Support = lazyPage(() => import('./pages/consumer/Support.jsx'), 'misc2');
const HelpHome = lazy(() => import('./pages/consumer/help/HelpHome.jsx'));
const HelpCategory = lazy(() => import('./pages/consumer/help/HelpCategory.jsx'));
const HelpArticle = lazy(() => import('./pages/consumer/help/HelpArticle.jsx'));
const HelpSearchResults = lazy(() => import('./pages/consumer/help/HelpSearchResults.jsx'));
const HelpFaq = lazy(() => import('./pages/consumer/help/HelpFaq.jsx'));
const HelpChangelog = lazy(() => import('./pages/consumer/help/HelpChangelog.jsx'));
const BlogIndex = lazy(() => import('./pages/consumer/blog/BlogIndex.jsx'));
const LocalityIndex = lazy(() => import('./pages/consumer/locality/LocalityIndex.jsx'));
const BlogPost = lazy(() => import('./pages/consumer/blog/BlogPost.jsx'));
const Privacy = lazy(() => import('./pages/consumer/Privacy.jsx'));
const Terms = lazy(() => import('./pages/consumer/Terms.jsx'));
const RefundPolicy = lazy(() => import('./pages/consumer/RefundPolicy.jsx'));
const Disclaimer = lazy(() => import('./pages/consumer/Disclaimer.jsx'));

function ListPropertyRoute() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const editing = params.has('edit');
  const editId = params.get('edit');
  useEffect(() => {
    if (!editing || !readAccessToken()) return;
    ListProperty.preload();
    prefetchMyListing(editId).catch(() => {});
  }, [editing, editId]);
  const page = <ListProperty />;
  return editing ? <ProtectedRoute>{page}</ProtectedRoute> : page;
}

const AdminDashboard = preloadable(() => import('./pages/admin/AdminDashboard.jsx'));
const AdminProperties = preloadable(() => import('./pages/admin/AdminProperties.jsx'));
const AdminAnalytics = preloadable(() => import('./pages/admin/AdminAnalytics.jsx'));
const AdminUsers = preloadable(() => import('./pages/admin/AdminUsers.jsx'));
const AdminServices = preloadable(() => import('./pages/admin/AdminServices.jsx'));
const AdminRunbooks = preloadable(() => import('./pages/admin/AdminRunbooks.jsx'));
const AdminEnquiries = preloadable(() => import('./pages/admin/AdminEnquiries.jsx'));
const AdminFinance = preloadable(() => import('./pages/admin/AdminFinance.jsx'));
const AdminContent = preloadable(() => import('./pages/admin/AdminContent.jsx'));
const AdminReports = preloadable(() => import('./pages/admin/AdminReports.jsx'));
const AdminSettings = preloadable(() => import('./pages/admin/AdminSettings.jsx'));
const AdminIntegrations = preloadable(() => import('./pages/admin/AdminIntegrations.jsx'));
const AdminErasureRequests = preloadable(() => import('./pages/admin/AdminErasureRequests.jsx'));
const AdminHelpFeedback = preloadable(() => import('./pages/admin/AdminHelpFeedback.jsx'));
const AdminErrorLog = preloadable(() => import('./pages/admin/AdminErrorLog.jsx'));
const AdminPostOnBehalf = lazyPage(() => import('./pages/admin/AdminPostOnBehalf.jsx'), 'list-property');
const AdminStaffActivity = preloadable(() => import('./pages/admin/AdminStaffActivity.jsx'));
const AdminPlaces = preloadable(() => import('./pages/admin/AdminPlaces.jsx'));
const AdminTeam = lazyPage(() => import('./pages/admin/AdminTeam.jsx'), 'team');

const OpsReferrals = preloadable(() => import('./pages/ops/OpsReferrals.jsx'));
const OpsRefunds = preloadable(() => import('./pages/ops/OpsRefunds.jsx'));
const AdminLeads = preloadable(() => import('./pages/admin/leads/AdminLeads.jsx'));
const OpsFlatmateReview = lazyPage(() => import('./pages/ops/OpsFlatmateReview.jsx'), 'flatmates');
const OpsIdentityReview = preloadable(() => import('./pages/ops/OpsIdentityReview.jsx'));
const OpsSupportQueue = preloadable(() => import('./pages/ops/OpsSupportQueue.jsx'));
const OpsDraftingDesk = lazyPage(() => import('./pages/ops/OpsDraftingDesk.jsx'), 'services');
const RentAgreementDesk = lazyPage(() => import('./pages/ops/rent-agreement/RentAgreementDesk.jsx'), 'services');

function ScrollToTop() {
  const { pathname } = useLocation();
  const navType = useNavigationType();
  useEffect(() => {
    const navEntry = performance.getEntriesByType?.('navigation')?.[0];
    if (navEntry?.type === 'reload') window.scrollTo(0, 0);
  }, []);
  const prevPath = useRef(pathname);
  useEffect(() => {
    if (pathname === prevPath.current) return;
    prevPath.current = pathname;
    if (navType !== 'POP') window.scrollTo(0, 0);
  }, [pathname, navType]);
  return null;
}

function ReferralCapture() {
  const { search } = useLocation();
  useEffect(() => { captureReferral(search); }, [search]);
  return null;
}

function PageViewTelemetry() {
  const { pathname } = useLocation();

  useEffect(() => startPageViewBeacon(), []);

  useEffect(() => { recordPageView(pathname); }, [pathname]);
  return null;
}

function RouteHead({ route, head }) {
  usePageHead({ ...head, path: route });
  return null;
}

function StaticRouteHead() {
  const { pathname } = useLocation();
  const head = ROUTE_HEADS[pathname];
  return head ? <RouteHead route={pathname} head={head} /> : null;
}

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-2 border-teal-400/30 border-t-teal-400 rounded-full animate-spin" />
    </div>
  );
}

function LegacyRedirect({ to }) {
  const { search, hash } = useLocation();
  const [pathname, fixed = ''] = to.split('?');
  const params = new URLSearchParams(search);
  new URLSearchParams(fixed).forEach((value, key) => params.set(key, value));
  const query = params.toString();
  return <Navigate to={`${pathname}${query ? `?${query}` : ''}${hash}`} replace />;
}

function DeskRedirect() {
  const { search } = useLocation();
  return <Navigate to={DESK_BY_VALUE[new URLSearchParams(search).get('type')]?.path || '/admin'} replace />;
}

function PortalHome() {
  const { user } = useAuth();
  return <Navigate to={portalBase(user)} replace />;
}

const BACK_OFFICE_ROUTES = [{
  element: <AdminLayout />,
  children: [
    { index: true, element: <AdminDashboard /> },
    { path: 'runbooks', element: <AdminRunbooks /> },
    { path: 'runbooks/:slug', element: <AdminRunbooks /> },
    { path: 'notifications', element: <Notifications staff /> },
    { path: 'kyc-review', element: <ModuleRoute moduleKey="kycReview"><OpsIdentityReview /></ModuleRoute> },
    { path: 'properties', element: <ModuleRoute moduleKey="properties"><AdminProperties /></ModuleRoute> },
    { path: 'analytics', element: <ModuleRoute moduleKey="analytics"><FlagRoute flag="analytics"><AdminAnalytics /></FlagRoute></ModuleRoute> },
    { path: 'users', element: <ModuleRoute moduleKey="users"><AdminUsers /></ModuleRoute> },
    { path: 'rent-agreement', element: <ModuleRoute moduleKey="desk:rental"><RentAgreementDesk /></ModuleRoute> },
    { path: 'home-loans', element: <ModuleRoute moduleKey="desk:loans"><AdminServices desk="loans" /></ModuleRoute> },
    { path: 'legal', element: <ModuleRoute moduleKey="desk:legal"><OpsDraftingDesk key="legal" desk="legal" /></ModuleRoute> },
    { path: 'interior', element: <ModuleRoute moduleKey="desk:interior"><OpsDraftingDesk key="interior" desk="interior" /></ModuleRoute> },
    { path: 'packers', element: <ModuleRoute moduleKey="desk:packers"><OpsDraftingDesk key="packers" desk="packers" /></ModuleRoute> },
    { path: 'valuation', element: <ModuleRoute moduleKey="desk:valuation"><OpsDraftingDesk key="valuation" desk="valuation" /></ModuleRoute> },
    { path: 'drafting-desk', element: <DeskRedirect /> },
    { path: 'support', element: <ModuleRoute moduleKey="support"><FlagRoute flag="support"><OpsSupportQueue /></FlagRoute></ModuleRoute> },
    { path: 'enquiries', element: <ModuleRoute moduleKey="enquiries"><AdminEnquiries /></ModuleRoute> },
    { path: 'referrals', element: <ModuleRoute moduleKey="referrals"><OpsReferrals /></ModuleRoute> },
    { path: 'refunds', element: <ModuleRoute moduleKey="refunds"><OpsRefunds /></ModuleRoute> },
    { path: 'leads', element: <ModuleRoute moduleKey="leads"><AdminLeads /></ModuleRoute> },
    { path: 'finance', element: <ModuleRoute moduleKey="finance"><FlagRoute flag="finance"><AdminFinance /></FlagRoute></ModuleRoute> },
    { path: 'content', element: <ModuleRoute moduleKey="content"><AdminContent /></ModuleRoute> },
    { path: 'reports', element: <ModuleRoute moduleKey="reports"><FlagRoute flag="reports"><AdminReports /></FlagRoute></ModuleRoute> },
    { path: 'flatmates', element: <ModuleRoute moduleKey="flatmates"><FlagRoute flag="flatmates"><OpsFlatmateReview /></FlagRoute></ModuleRoute> },
    { path: 'places', element: <ModuleRoute moduleKey="places"><AdminPlaces /></ModuleRoute> },
    { path: 'societies', element: <Navigate to="/admin/places?tab=duplicates" replace /> },
    { path: 'localities', element: <Navigate to="/admin/places?tab=areas" replace /> },
    { path: 'team', element: <ModuleRoute moduleKey="team"><AdminTeam /></ModuleRoute> },
    { path: 'settings', element: <ModuleRoute moduleKey="settings"><AdminSettings /></ModuleRoute> },
    { path: 'integrations', element: <ModuleRoute moduleKey="integrations"><AdminIntegrations /></ModuleRoute> },
    { path: 'erasure-requests', element: <ModuleRoute moduleKey="erasure"><AdminErasureRequests /></ModuleRoute> },
    { path: 'help-feedback', element: <ModuleRoute moduleKey="helpFeedback"><AdminHelpFeedback /></ModuleRoute> },
    { path: 'error-log', element: <ModuleRoute moduleKey="errorLog"><AdminErrorLog /></ModuleRoute> },
    { path: 'post-on-behalf', element: <ModuleRoute moduleKey="postOnBehalf"><AdminPostOnBehalf /></ModuleRoute> },
    { path: 'staff-activity', element: <ModuleRoute moduleKey="staffActivity"><AdminStaffActivity /></ModuleRoute> },
    { path: '*', element: <PortalHome /> },
  ],
}];

function BackOffice() {
  const { user } = useAuth();
  const { pathname, search, hash } = useLocation();
  const routes = useRoutes(BACK_OFFICE_ROUTES);
  const target = portalPath(user, pathname);
  return target === pathname ? routes : <Navigate to={`${target}${search}${hash}`} replace />;
}

function preloadablePage(element) {
  let el = element;
  while (el && !el.type?.preload) el = el.props?.children;
  return el?.type;
}

// Holds the console until the shell and page chunks land: a page that suspends after auth makes
// React 19 keep its fallback up for at least 300ms (see preloadable.js).
function BackOfficeEntry({ base, children }) {
  const { pathname } = useLocation();
  const [ready, setReady] = useState(() => !readAccessToken());
  useEffect(() => {
    if (!readAccessToken()) return;
    const matches = matchRoutes(BACK_OFFICE_ROUTES, pathname, base);
    Promise.all([AdminLayout.preload(), preloadablePage(matches?.at(-1)?.route.element)?.preload()])
      .then(() => setReady(true));
  }, [base, pathname]);
  return ready ? children : <LoadingFallback />;
}

export default function App() {
  useEffect(() => { applyAppPrefs(); installReducedMotionScroll(); }, []);
  useKeyboardOpen();
  return (
    <>
      <PreviewBanner />
      <ScrollToTop />
      <PageViewTelemetry />
      <ReferralCapture />
      <StaticRouteHead />
      <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path="/view-documents/:requestId" element={<ProtectedRoute><ViewDocuments /></ProtectedRoute>} />
        <Route path="/verify-identity" element={<ProtectedRoute><AppFlagsProvider><AppFlagRoute flag="kycBadgeEnabled"><VerifyIdentity /></AppFlagRoute></AppFlagsProvider></ProtectedRoute>} />
        <Route path="/shared-documents" element={<ViewDocuments shared />} />
        <Route element={<ConsumerLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/listings" element={<Listings />} />
          <Route path="/property/:id" element={<Property />} />
          <Route path="/owner/:id" element={<Owner />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/signin" element={<Signin />} />
          <Route path="/signup" element={<AppFlagRoute flag="signupsEnabled"><Signup /></AppFlagRoute>} />
          <Route path="/staff-login" element={<StaffLogin />} />
          <Route path="/staff-invite" element={<StaffInvite />} />
          <Route path="/owner-confirm" element={<OwnerConfirm />} />
          <Route path="/services" element={<Services />} />
          <Route path="/services/packers-movers" element={<PackersMovers />} />
          <Route path="/services/property-legal" element={<PropertyLegal />} />
          <Route path="/home-loans" element={<HomeLoans />} />
          <Route path="/services/interior-renovation" element={<InteriorRenovation />} />
          <Route path="/services/property-valuation" element={<PropertyValuation />} />
          <Route path="/services/rent-agreement" element={<RentAgreement />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/about" element={<TrustPage path="/about" />} />
          <Route path="/compare/nobroker" element={<CompareNobroker />} />
          <Route path="/how-verification-works" element={<TrustPage path="/how-verification-works" />} />
          <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
          <Route path="/plans" element={<Plans />} />
          <Route path="/refer" element={<ProtectedRoute><Refer /></ProtectedRoute>} />
          <Route path="/emi-calculator" element={<EmiCalculator />} />
          <Route path="/tools" element={<ToolsHub />} />
          <Route path="/tools/rent-receipt-generator" element={<RentReceipt />} />
          <Route path="/tools/stamp-duty-calculator-maharashtra" element={<StampDutyTool />} />
          <Route path="/tools/rent-agreement-cost-pune" element={<RentAgreementCost />} />
          <Route path="/tools/rental-yield-calculator" element={<RentalYield />} />
          <Route path="/tenant-profile" element={<ProtectedRoute><TenantProfile /></ProtectedRoute>} />
          <Route path="/checkout" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />
          <Route path="/schedule-visit" element={<AppFlagRoute flag="scheduleVisit"><ProtectedRoute><ScheduleVisit /></ProtectedRoute></AppFlagRoute>} />
          <Route path="/societies" element={<Societies />} />
          <Route path="/society/:slug" element={<Suspense fallback={<SocietySkeleton />}><Society /></Suspense>} />
          <Route path="/reels" element={<Reels />} />
          <Route path="/saved" element={<Saved />} />
          <Route path="/pay-rent" element={<ProtectedRoute><PayRent /></ProtectedRoute>} />
          <Route path="/locality" element={<LocalityIndex />} />
          <Route path="/locality/:slug" element={<Locality />} />
          <Route path="/map" element={<Navigate to="/listings?view=map" replace />} />
          <Route path="/messages" element={<AppFlagRoute flag="inAppMessaging"><ProtectedRoute><Messages /></ProtectedRoute></AppFlagRoute>} />
          <Route path="/flatmates" element={<Suspense fallback={<FlatmatesSkeleton />}><Flatmates /></Suspense>} />
          <Route path="/flatmates/:kind/:id" element={<FlatmateDetail />} />
          <Route path="/flatmates/:place" element={<FlatmateLanding />} />
          <Route path="/rent/:place" element={<RentBuyLanding deal="rent" />} />
          <Route path="/rent/:place/:bhk" element={<RentBuyLanding deal="rent" />} />
          <Route path="/buy/:place" element={<RentBuyLanding deal="buy" />} />
          <Route path="/buy/:place/:bhk" element={<RentBuyLanding deal="buy" />} />
          <Route path="/share-flat" element={<Navigate to="/flatmates" replace />} />
          <Route path="/support" element={<ProtectedRoute><Support /></ProtectedRoute>} />
          <Route path="/help" element={<HelpHome />} />
          <Route path="/help/search" element={<HelpSearchResults />} />
          <Route path="/help/faq" element={<HelpFaq />} />
          <Route path="/help/changelog" element={<HelpChangelog />} />
          <Route path="/help/c/:categoryId" element={<HelpCategory />} />
          <Route path="/help/a/:slug" element={<HelpArticle />} />
          <Route path="/hi/help/*" element={<LegacyHelpLangRedirect />} />
          <Route path="/mr/help/*" element={<LegacyHelpLangRedirect />} />
          <Route path="/docs" element={<Navigate to="/help" replace />} />
          <Route path="/help-center" element={<Navigate to="/help" replace />} />
          <Route path="/blog" element={<BlogIndex />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/refund-policy" element={<RefundPolicy />} />
          <Route path="/disclaimer" element={<Disclaimer />} />
          <Route
            path="/list-property"
            element={<ListPropertyRoute />}
          />
          <Route
            path="/owner-hub"
            element={<Navigate to="/dashboard#owner-hub" replace />}
          />
          <Route
            path="/owner-hub/property/:id"
            element={
              <ProtectedRoute>
                <PropertyPassport />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Suspense fallback={<DashboardSkeleton />}>
                  <Dashboard />
                </Suspense>
              </ProtectedRoute>
            }
          />
        </Route>

        <Route path="/admin/*" element={<BackOfficeEntry base="/admin"><RoleRoute roles={['staff', 'manager', 'admin']}><BackOffice /></RoleRoute></BackOfficeEntry>} />
        <Route path="/staff/*" element={<BackOfficeEntry base="/staff"><RoleRoute roles={['staff', 'manager', 'admin']}><BackOffice /></RoleRoute></BackOfficeEntry>} />

        <Route path="/ops" element={<LegacyRedirect to="/admin" />} />
        <Route path="/ops/support" element={<LegacyRedirect to="/admin/support" />} />
        <Route path="/ops/drafting-desk" element={<DeskRedirect />} />
        <Route path="/ops/rent-agreement" element={<LegacyRedirect to="/admin/rent-agreement" />} />
        <Route path="/ops/legal" element={<LegacyRedirect to="/admin/legal" />} />
        <Route path="/ops/interior" element={<LegacyRedirect to="/admin/interior" />} />
        <Route path="/ops/packers" element={<LegacyRedirect to="/admin/packers" />} />
        <Route path="/ops/valuation" element={<LegacyRedirect to="/admin/valuation" />} />
        <Route path="/ops/referrals" element={<LegacyRedirect to="/admin/referrals" />} />
        <Route path="/ops/flatmate-review" element={<LegacyRedirect to="/admin/flatmates" />} />
        <Route path="/ops/kyc-review" element={<LegacyRedirect to="/admin/kyc-review" />} />
        <Route path="/ops/*" element={<LegacyRedirect to="/admin" />} />

        <Route element={<ConsumerLayout />}>
          <Route path="*" element={<Stub title="Page not found" phase="Phase 3" />} />
        </Route>
      </Routes>
      </Suspense>
    </>
  );
}
