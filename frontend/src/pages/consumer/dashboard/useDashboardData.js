import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useAsyncList from '../../../hooks/useAsyncList.js';
import { MAX_PAGE_SIZE } from '../../../services/apiLimits.js';
import { PAGE_LOAD_TTL, PUBLIC_READ_TTL, REVISIT_MAX_AGE } from '../../../services/http.js';
import { primeMeDashboard } from '../../../services/meDashboardService.js';
import { listPropertiesByIds, searchListings } from '../../../services/propertyService.js';
import { listVisits, myVisitRequests, rescheduleVisit, updateVisitStatus } from '../../../services/visitService.js';
import { myContactRequests } from '../../../services/contactService.js';
import { listDocRequests } from '../../../services/documentService.js';
import { listMyGroupApplications, myRequests, getFlatmateCase, listMyFlatmateCases, markFlatmateCaseRead, replyToFlatmateCase } from '../../../services/flatmateService.js';
import { myPhotoRequests } from '../../../services/photoRequestService.js';
import { offersOnMine } from '../../../services/dealService.js';
import { listServiceRequests } from '../../../services/serviceRequestService.js';
import {
  listMyPropertyReviews, getPropertyReview, markPropertyReviewRead, addPropertyReviewMessage,
} from '../../../services/propertyReviewService.js';
import { getRecentProps } from '../../../lib/localPrefs.js';
import { loadMyListings, parseFlatmateCaseKey } from '../../../lib/data/myListings.js';
import { searchHref } from '../listings/alertCriteria.js';
import { useSavedSearches } from '../../../context/SavedSearchContext.jsx';

const toLeadRow = (r) => ({
  id: r.id,
  propId: r.propertySlug || r.propertyId || '',
  buyerName: r.requester?.name || 'A buyer',
  buyerMobile: r.contact?.mobile || r.requester?.mobile || '',
  verified: !!r.requester?.verified,
  status: r.status,
  requestedAt: r.createdAt ? Date.parse(r.createdAt) : 0,
});

const toPhotoRow = (r) => ({
  id: r.id,
  propId: r.propertySlug || r.propertyId || '',
  propLabel: r.propertyTitle || '',
  buyerName: r.requester?.name || 'A buyer',
  buyerMobile: r.requester?.mobile || '',
  status: r.status || 'pending',
  requestedAt: r.createdAt ? Date.parse(r.createdAt) : 0,
});

const mergeVisits = (mine, onMine) => [...new Map([...mine, ...onMine.map((v) => ({ ...v, hostedByMe: true }))].map((v) => [v.id, v])).values()]
  .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  .map((v) => ({ ...v, listing: v.listing || '', ownerMobile: v.ownerMobile || '' }));

async function loadFeed(withRecommended) {
  try {
    const recent = await listPropertiesByIds(getRecentProps().slice(0, 6));
    if (recent.length || !withRecommended) return { recent, recommended: [] };
    const { items } = await searchListings({ sort: 'createdAt,desc' }, { size: 6, ttl: PUBLIC_READ_TTL });
    return { recent: [], recommended: items };
  } catch {
    return { recent: [], recommended: [] };
  }
}

export function useDashboardData({ user, toast, ownsProperty }) {
  const [listings, setListings] = useState([]);
  const [listingsLoaded, setListingsLoaded] = useState(false);
  const ownerReads = !!user?.mobile && (ownsProperty !== false || listings.some((l) => !l.flatmate));
  const { searches } = useSavedSearches();
  const [visits, setVisits] = useState([]);
  const [recent, setRecent] = useState([]);
  const [recommended, setRecommended] = useState([]);
  const [alertMatches, setAlertMatches] = useState([]);
  const [reviewProp, setReviewProp] = useState(null);
  const [reviewInput, setReviewInput] = useState('');
  const [reviewRows, setReviewRows] = useState([]);
  const [caseRows, setCaseRows] = useState([]);
  const [reviewThread, setReviewThread] = useState(null);
  const [busyIds, setBusyIds] = useState(() => new Set());
  const busyRef = useRef(new Set());
  const setBusy = useCallback((ids, value) => {
    const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
    if (!list.length) return;
    const next = new Set(busyRef.current);
    list.forEach((id) => {
      if (value) next.add(id);
      else next.delete(id);
    });
    busyRef.current = next;
    setBusyIds(next);
  }, []);

  const [flatmateReqs, , , , , refreshFlatmateReqs] = useAsyncList(
    () => myRequests(),
    [user],
    !!user?.mobile,
  );

  const serviceReqsCache = useRef({ ttl: PAGE_LOAD_TTL, maxAge: REVISIT_MAX_AGE });
  const [serviceReqs, , , , , refreshServiceReqs] = useAsyncList(
    () => listServiceRequests('rental', serviceReqsCache.current),
    [user],
    !!user?.mobile,
  );

  const [docReqs, , , , , refreshDocReqs] = useAsyncList(
    () => listDocRequests(user.mobile),
    [user],
    ownerReads,
  );

  const [contactReqs, , , , , refreshContactReqs] = useAsyncList(
    () => myContactRequests().then((res) => res.items.map(toLeadRow)),
    [user],
    ownerReads,
  );

  const [apps, , , , , refreshApps] = useAsyncList(
    () => listMyGroupApplications({ size: MAX_PAGE_SIZE }).then((res) => res.items),
    [user],
    ownerReads,
  );

  const [photoReqs, , , , , refreshPhotoReqs] = useAsyncList(
    () => myPhotoRequests().then((res) => res.items.map(toPhotoRow)),
    [user],
    ownerReads,
  );

  const [offers, , , , , refreshOffers] = useAsyncList(
    () => offersOnMine(),
    [user],
    ownerReads,
  );

  const mutateVisit = (id, patch) => {
    if (busyRef.current.has(`visit:${id}`)) return false;
    setBusy(`visit:${id}`, true);
    const snapshot = visits;
    setVisits((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));
    const write = patch.when !== undefined
      ? rescheduleVisit(id, patch.when)
      : updateVisitStatus(id, patch.status);
    return write
      .then(
        () => {
          Promise.all([listVisits(), myVisitRequests()])
            .then(([mine, onMine]) => setVisits(mergeVisits(mine, onMine)))
            .catch(() => {});
          return true;
        },
        () => {
          setVisits(snapshot);
          toast('Could not update that visit. Please try again.', 'error');
          return false;
        },
      )
      .finally(() => setBusy(`visit:${id}`, false));
  };

  const openReview = async (pid) => {
    setReviewProp(pid);
    setReviewInput('');
    setReviewThread(null);
    const fm = parseFlatmateCaseKey(pid);
    try {
      if (fm) {
        await markFlatmateCaseRead(fm.kind, fm.id);
        setReviewThread(await getFlatmateCase(fm.kind, fm.id));
      } else {
        await markPropertyReviewRead(pid);
        setReviewThread(await getPropertyReview(pid));
      }
      refreshReviews(fm ? 'flatmate' : 'property');
    } catch (err) {
      toast(`Could not open that verification thread: ${err.message}`, 'error');
      setReviewProp(null);
    }
  };
  const sendReview = async () => {
    const body = reviewInput.trim();
    if (!body || !reviewProp) return;
    setReviewInput('');
    const fm = parseFlatmateCaseKey(reviewProp);
    try {
      setReviewThread(fm
        ? await replyToFlatmateCase(fm.kind, fm.id, body)
        : await addPropertyReviewMessage(reviewProp, body));
      refreshReviews(fm ? 'flatmate' : 'property');
    } catch (err) {
      setReviewInput(body);
      toast(`Could not send that reply: ${err.message}`, 'error');
    }
  };

  const [bundle, dataStatus, , retryData, dataError, refreshData] = useAsyncList(
    () => Promise.all([loadMyListings(user), listVisits(), myVisitRequests()]),
    [user?.mobile],
  );

  useEffect(() => {
    if (bundle.length < 3) return;
    const [shownListings, mine, onMine] = bundle;
    setListings(shownListings);
    setListingsLoaded(true);
    setVisits(mergeVisits(mine, onMine));
  }, [bundle]);

  useEffect(() => {
    if (ownsProperty === undefined) return undefined;
    let live = true;
    loadFeed(ownsProperty !== true).then((feed) => {
      if (!live) return;
      setRecent(feed.recent);
      setRecommended(feed.recommended);
    });
    return () => { live = false; };
  }, [ownsProperty]);

  useEffect(() => {
    setAlertMatches(searches
      .filter((s) => s.alerts !== false)
      .map((s) => ({
        id: s.id,
        label: s.label || 'your saved search',
        count: s.matchCount ?? 0,
        newCount: s.newCount ?? s.unreadCount,
        href: searchHref(s),
      }))
      .filter((m) => m.count > 0 || m.newCount > 0)
      .slice(0, 3));
  }, [searches]);

  const refreshRequests = useCallback(() => {
    // One /me/dashboard read seeds every section the refreshes below re-read.
    primeMeDashboard();
    serviceReqsCache.current = { ttl: PAGE_LOAD_TTL };
    refreshData();
    refreshFlatmateReqs();
    refreshServiceReqs();
    if (!ownerReads) return;
    refreshContactReqs();
    refreshPhotoReqs();
    refreshDocReqs();
    refreshApps();
    refreshOffers();
  }, [ownerReads, refreshApps, refreshOffers, refreshContactReqs, refreshData, refreshDocReqs, refreshFlatmateReqs, refreshPhotoReqs, refreshServiceReqs]);

  const lastVisibleRefresh = useRef(0);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastVisibleRefresh.current < 30000) return;
      lastVisibleRefresh.current = now;
      refreshRequests();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshRequests]);

  const hasFlatmateListings = listings.some((l) => l.flatmate);
  const refreshReviews = useCallback((scope) => Promise.all([
    ownerReads && scope !== 'flatmate'
      && listMyPropertyReviews({ size: MAX_PAGE_SIZE }).then((r) => setReviewRows(r.items), () => setReviewRows([])),
    hasFlatmateListings && scope !== 'property'
      && listMyFlatmateCases().then(setCaseRows, () => setCaseRows([])),
  ]), [ownerReads, hasFlatmateListings]);

  useEffect(() => {
    if (!ownerReads) setReviewRows([]);
    if (!hasFlatmateListings) setCaseRows([]);
    refreshReviews();
  }, [ownerReads, hasFlatmateListings, refreshReviews]);

  const reviewsByProp = useMemo(() => {
    const slugOf = new Map(listings.map((l) => [l.uuid || l.id, l.id]));
    const next = new Map();
    reviewRows.forEach((row) => {
      next.set(row.propertyId, row);
      const slug = slugOf.get(row.propertyId);
      if (slug) next.set(slug, row);
    });
    caseRows.forEach((row) => next.set(`fm:${row.kind}:${row.id}`, row));
    return next;
  }, [reviewRows, caseRows, listings]);

  return {
    listings, listingsLoaded, visits, recent, recommended, alertMatches,
    contactReqs, photoReqs, flatmateReqs, docReqs, serviceReqs,
    reviewProp, setReviewProp, reviewInput, setReviewInput, reviewsByProp, reviewThread,
    apps, offers, mutateVisit, openReview, sendReview,
    busyIds, refreshData, refreshRequests, setListings,
    dataStatus, dataError, retryData,
  };
}
