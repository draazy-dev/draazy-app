import '../../styles/routes/filters.css';
import '../../styles/routes/listings.css';
import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useSearchParams } from 'react-router';
import Icon from '../../components/Icon.jsx';
import { recordSignal } from '../../services/demandService.js';
import { getLocality, localitiesIn } from '../../services/localityService.js';
import { useToast } from '../../context/ToastContext.jsx';
import { setLastSearch, getLastSearch } from '../../lib/localPrefs.js';
import { useSavedSearchCreate } from '../../context/SavedSearchContext.jsx';
import AlertSetupModal from './listings/AlertSetupModal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useCity } from '../../context/CityContext.jsx';
import { cityHasData } from '../../lib/geoConfig.js';
import NewCityEmptyState from '../../components/city/NewCityEmptyState.jsx';
import { useAppFlags } from '../../context/AppFlagsContext.jsx';
import usePullToRefresh from '../../lib/usePullToRefresh.js';
import { replay, useSignInGate } from '../../lib/useSignInGate.js';
import { getSocietyBrief } from '../../services/societyService.js';
import { toFacetQuery } from '../../lib/listings/facetQuery.js';
import { INITIAL, serializeF, deserializeF, paramsToFilters, applyFiltersToSearchParams, switchDealFilters, hasFilterParams } from '../../lib/listings/filterState.js';
import { clampNearRadius, nearMaxFor } from '../../lib/nearParams.js';
import { canonicalTypeKey } from '../../data/propertyTypes.js';
import Filters from './listings/Filters.jsx';
import MobileFilterDrawer from './listings/MobileFilterDrawer.jsx';
import DealToggle from './listings/DealToggle.jsx';
import ResultsArea from './listings/ResultsArea.jsx';
import useListingsSearch from './listings/useListingsSearch.js';
import { buildActiveChips } from './listings/listingsChips.js';
import { parseSmartQuery } from './listings/listingsSmartQuery.js';

const SORTS = ['relevance', 'price-low', 'price-high', 'newest', 'price-psf', 'verified'];

const PAGE_SIZE = 24;
const MAP_MARKER_CAP = 100;
const MAP_MAX_AREAS = 3;
const LAST_LISTINGS_SEARCH_KEY = 'draazy.listings.lastSearch.v1';

async function parseWithLocalities(raw, readCtx) {
  const first = parseSmartQuery(raw, readCtx());
  if (!first?.q) return first && { ...first, hits: [], locNames: readCtx().locNameBySlug };
  const hits = await localitiesIn(first.q);
  const ctx = readCtx();
  const locNames = { ...ctx.locNameBySlug, ...Object.fromEntries(hits.map((l) => [l.slug, l.name])) };
  const parsed = parseSmartQuery(raw, { ...ctx, localities: [...ctx.localities, ...hits], locNameBySlug: locNames });
  return parsed && { ...parsed, hits, locNames };
}
const filterSignature = (value) => JSON.stringify(serializeF(value));
let pendingDrawerBackSnapshot = null;
let lastSearchIntent = '';

function readStoredListingsSearch() {
  if (typeof window === 'undefined') return null;
  try {
    const snap = JSON.parse(window.localStorage.getItem(LAST_LISTINGS_SEARCH_KEY));
    return snap && snap.version === 1 ? snap : null;
  } catch {
    return null;
  }
}

function deserializeStoredFilters(filters) {
  try {
    const f = deserializeF(filters);
    return f.deal === 'rent' || f.deal === 'buy' ? f : null;
  } catch {
    return null;
  }
}

function writeStoredListingsSearch(snapshot) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LAST_LISTINGS_SEARCH_KEY, JSON.stringify({ version: 1, ...snapshot, at: Date.now() }));
  } catch {}
}

export default function Listings() {
  const { t: tr } = useTranslation();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const { toast } = useToast();
  const sendToSignIn = useSignInGate();
  const createSavedSearch = useSavedSearchCreate();
  const { isIn } = useAuth();
  const { flagEnabled } = useAppFlags();
  const initialHadUrlParams = useRef(params.toString() !== '');
  const [initialListingsSearch] = useState(readStoredListingsSearch);
  const [storedInitialFilters] = useState(() => (!initialHadUrlParams.current ? deserializeStoredFilters(initialListingsSearch?.filters) : null));

  const urlTypeRaw = params.get('ptype') || params.get('type') || '';
  const urlTypeKeys = urlTypeRaw.split(',').map(canonicalTypeKey).filter(Boolean);
  const dealParam = params.get('deal');
  const urlDeal = dealParam === 'rent' || dealParam === 'buy'
    ? dealParam
    : ((!initialHadUrlParams.current && storedInitialFilters?.deal) || (urlTypeKeys.includes('flatmates') ? 'rent' : 'buy'));

  const backRestoreInitial = pendingDrawerBackSnapshot;
  const buildInitial = () => backRestoreInitial?.f || storedInitialFilters || paramsToFilters(params, urlDeal);

  const [f, setF] = useState(buildInitial);
  const latestFilterStateRef = useRef(f);
  const [sort, setSort] = useState(() => backRestoreInitial?.sort || (SORTS.includes(params.get('sort')) ? params.get('sort') : (SORTS.includes(initialListingsSearch?.sort) && !initialHadUrlParams.current ? initialListingsSearch.sort : 'relevance')));
  const [page, setPage] = useState(() => {
    const n = Number(params.get('page'));
    return Number.isInteger(n) && n > 1 && params.get('view') !== 'map' ? n : 1;
  });
  const [view, setView] = useState(backRestoreInitial?.view || (params.get('view') === 'map' ? 'map' : params.get('view') === 'list' ? 'list' : (!initialHadUrlParams.current && ['map', 'list', 'grid'].includes(initialListingsSearch?.view) ? initialListingsSearch.view : 'grid')));
  const [activeId, setActiveId] = useState(backRestoreInitial?.activeId || params.get('property') || null);
  const { city } = useCity();
  const hasData = cityHasData(city);
  const [localities, setLocalities] = useState([]);
  const [drawer, setDrawer] = useState(false);
  const [aiQuery, setAiQuery] = useState('');
  const [savingSearch, setSavingSearch] = useState(false);
  const [alertSeed, setAlertSeed] = useState(null);
  const [freeText, setFreeText] = useState(() => backRestoreInitial?.freeText || params.get('q') || (!initialHadUrlParams.current ? initialListingsSearch?.q || '' : ''));
  const stateDrivenDealRef = useRef(null);
  const normalizeFilterPatch = (prev, partial) => {
    if (!Object.prototype.hasOwnProperty.call(partial, 'nearMode')) return partial;
    const nearMode = partial.nearMode;
    if (nearMode !== 'km' && nearMode !== 'min') return partial;
    return { ...partial, nearRadius: clampNearRadius(partial.nearRadius ?? prev.nearRadius, nearMaxFor(nearMode)) };
  };
  const set = (patch) => {
    const resolve = (prev) => normalizeFilterPatch(prev, typeof patch === 'function' ? patch(prev) : patch);
    latestFilterStateRef.current = { ...latestFilterStateRef.current, ...resolve(latestFilterStateRef.current) };
    startTransition(() => setF((prev) => {
      const merged = { ...prev, ...resolve(prev) };
      latestFilterStateRef.current = merged;
      return merged;
    }));
  };
  const clearFreeText = useCallback(() => setFreeText(''), []);
  const clearAll = () => {
    const next = INITIAL(f.deal);
    latestFilterStateRef.current = next;
    setF(next);
    setFreeText('');
  };
  const switchDeal = (deal) => {
    if (deal === f.deal) return;
    stateDrivenDealRef.current = deal;
    startTransition(() => {
      setF((prev) => {
        const next = switchDealFilters(prev, deal);
        latestFilterStateRef.current = next;
        return next;
      });
      setSort('relevance');
      setPage(1);
    });
  };

  useEffect(() => {
    latestFilterStateRef.current = f;
  }, [f]);

  const mapEnabled = flagEnabled('mapSearch');
  const effView = view === 'map' && !mapEnabled ? 'grid' : view;

  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (!location.state?.restore) return;
    const snap = getLastSearch();
    if (!snap) return;
    if (snap.filters) setF(deserializeF(snap.filters));
    if (snap.q != null) setFreeText(snap.q);
    if (snap.view) setView(snap.view);
    if (snap.activeId) setActiveId(snap.activeId);
    if (snap.scrollY != null) requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, snap.scrollY)));
  }, [location.state]);

  const buildReturnSearch = () => {
    const sp = applyFiltersToSearchParams(new URLSearchParams(), f);
    sp.set('deal', f.deal);
    sp.set('view', view);
    if (sort !== 'relevance') sp.set('sort', sort);
    if (page > 1) sp.set('page', String(page));
    if (freeText) sp.set('q', freeText);
    if (activeId) sp.set('property', activeId);
    return '/listings?' + sp.toString();
  };

  const saveReturnContext = () => setLastSearch({ search: buildReturnSearch(), filters: serializeF(f), q: freeText, view, activeId, scrollY: window.scrollY });

  const onSelectProperty = (id) => setActiveId(id);
  const onCloseProperty = () => setActiveId(null);
  const lastSearchWriteReady = useRef(false);
  const filterTriggerRef = useRef(null);
  const drawerBackRestoreSnapshotRef = useRef(null);
  const markDrawerBackClose = useCallback(() => {
    const snapshot = {
      f: deserializeF(serializeF(latestFilterStateRef.current)),
      freeText,
      view: effView,
      sort,
      activeId,
    };
    drawerBackRestoreSnapshotRef.current = snapshot;
    pendingDrawerBackSnapshot = snapshot;
  }, [activeId, effView, freeText, sort]);

  useEffect(() => {
    const restoreSnapshot = drawerBackRestoreSnapshotRef.current || pendingDrawerBackSnapshot;
    if (restoreSnapshot) {
      drawerBackRestoreSnapshotRef.current = restoreSnapshot;
      const next = applyFiltersToSearchParams(params, restoreSnapshot.f);
      next.set('deal', restoreSnapshot.f.deal);
      if (restoreSnapshot.view === 'grid') next.delete('view'); else next.set('view', restoreSnapshot.view);
      if (restoreSnapshot.sort === 'relevance') next.delete('sort'); else next.set('sort', restoreSnapshot.sort);
      if (restoreSnapshot.activeId) next.set('property', restoreSnapshot.activeId); else next.delete('property');
      if (restoreSnapshot.freeText) next.set('q', restoreSnapshot.freeText); else next.delete('q');
      if (page > 1) next.set('page', String(page)); else next.delete('page');
      const nextSearch = next.toString();
      if (nextSearch !== params.toString()) setParams(next, { replace: true });
      if (
        filterSignature(f) !== filterSignature(restoreSnapshot.f) ||
        freeText !== restoreSnapshot.freeText ||
        view !== restoreSnapshot.view ||
        sort !== restoreSnapshot.sort ||
        activeId !== restoreSnapshot.activeId
      ) {
        latestFilterStateRef.current = restoreSnapshot.f;
        setF(restoreSnapshot.f);
        setFreeText(restoreSnapshot.freeText);
        setView(restoreSnapshot.view);
        setSort(restoreSnapshot.sort);
        setActiveId(restoreSnapshot.activeId);
        return;
      }
      if (nextSearch === params.toString()) {
        drawerBackRestoreSnapshotRef.current = null;
        pendingDrawerBackSnapshot = null;
      }
      return;
    }
    if (f.deal !== urlDeal && stateDrivenDealRef.current !== f.deal) return;
    const next = applyFiltersToSearchParams(params, f);
    next.set('deal', f.deal);
    if (effView === 'grid') next.delete('view'); else next.set('view', effView);
    if (sort === 'relevance') next.delete('sort'); else next.set('sort', sort);
    if (activeId) next.set('property', activeId); else next.delete('property');
    if (freeText) next.set('q', freeText); else next.delete('q');
    if (page > 1) next.set('page', String(page)); else next.delete('page');
    const nextSearch = next.toString();
    if (nextSearch !== params.toString()) setParams(next, { replace: true });
    if (stateDrivenDealRef.current === f.deal) stateDrivenDealRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- URL writes.
  }, [effView, sort, page, f, activeId, freeText, params, drawer]);

  useEffect(() => {
    if (!lastSearchWriteReady.current) {
      lastSearchWriteReady.current = true;
      return;
    }
    writeStoredListingsSearch({ filters: serializeF(f), q: freeText, view: effView, sort });
  }, [f, freeText, effView, sort]);

  useEffect(() => {
    if (drawerBackRestoreSnapshotRef.current || pendingDrawerBackSnapshot) return;
    setF((prev) => {
      if (prev.deal === urlDeal) return prev;
      return hasFilterParams(params) ? paramsToFilters(params, urlDeal) : switchDealFilters(prev, urlDeal);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a deal.
  }, [urlDeal]);

  const addLocalityOption = useCallback(({ slug, name, lat, lng, archived, liveListings }) => {
    if (!slug) return;
    const option = { slug, name: name || slug, lat: lat ?? null, lng: lng ?? null, archived: !!archived, liveListings: liveListings || 0 };
    setLocalities((prev) => (prev.some((l) => l.slug === slug) ? prev : [...prev, option]));
  }, []);

  const locNameBySlug = useMemo(() => Object.fromEntries(localities.map((l) => [l.slug, l.name])), [localities]);
  const suggestedMapLocalities = useMemo(() => {
    const stored = deserializeStoredFilters(initialListingsSearch?.filters);
    return stored?.localities?.size ? [...stored.localities].slice(0, MAP_MAX_AREAS) : [];
  }, [initialListingsSearch]);
  const [socNameBySlug, setSocNameBySlug] = useState({});
  const socSlugsKey = [...f.societies].join(',');
  useEffect(() => {
    const missing = socSlugsKey.split(',').filter((slug) => slug && !socNameBySlug[slug]);
    if (!missing.length) return undefined;
    let alive = true;
    missing.forEach((slug) => {
      getSocietyBrief(slug)
        .then((s) => { if (alive && s?.name) setSocNameBySlug((prev) => ({ ...prev, [slug]: s.name })); })
        .catch(() => {});
    });
    return () => { alive = false; };
  }, [socSlugsKey]); // eslint-disable-line react-hooks/exhaustive-deps -- names already loaded are not refetched.

  const deferredF = useDeferredValue(f);

  const mapAreaCount = f.localities.size;
  const mapGated = effView === 'map' && (mapAreaCount === 0 || mapAreaCount > MAP_MAX_AREAS);
  const size = effView === 'map' ? MAP_MARKER_CAP : PAGE_SIZE;

  const askedLocalitiesRef = useRef(new Set());
  const locSlugsKey = [...new Set([...f.localities, ...(mapGated ? suggestedMapLocalities : [])])].sort().join(',');
  useEffect(() => {
    locSlugsKey.split(',').filter((slug) => slug && !locNameBySlug[slug] && !askedLocalitiesRef.current.has(slug)).forEach((slug) => {
      askedLocalitiesRef.current.add(slug);
      getLocality(slug).then(addLocalityOption).catch(() => {});
    });
  }, [locSlugsKey, locNameBySlug, addLocalityOption]);

  const query = useMemo(
    () => (hasData && !mapGated ? toFacetQuery(deferredF, { sort, q: freeText }) : null),
    [hasData, mapGated, deferredF, sort, freeText],
  );
  const relaxedQuery = useMemo(
    () => (query && deferredF.near && deferredF.localities.size
      ? toFacetQuery(deferredF, { sort, q: freeText, dropLocalities: true })
      : null),
    [query, deferredF, sort, freeText],
  );

  const queryKey = useMemo(() => JSON.stringify([query, size]), [query, size]);
  const [pagedQueryKey, setPagedQueryKey] = useState(queryKey);
  if (pagedQueryKey !== queryKey) {
    setPagedQueryKey(queryKey);
    if (page !== 1) setPage(1);
  }
  const requestPage = pagedQueryKey === queryKey ? page : 1;

  const search = useListingsSearch({ query, relaxedQuery, page: requestPage, size });
  const results = search.data.items;
  const total = search.data.total;
  const verifiedCount = search.data.verifiedTotal;
  const unstatedCount = search.data.unstatedTotal;
  const relaxedNear = search.relaxed
    ? { locNames: [...deferredF.localities].map((s) => locNameBySlug[s] || s), nearLabel: deferredF.nearLabel || tr('listings.thePlace') }
    : null;
  const loaded = search.status === 'ready' || results.length > 0;
  const pageCount = Math.max(1, search.data.pageCount || 1);
  const safePage = Math.min(requestPage, pageCount);
  useEffect(() => {
    if (search.status === 'ready' && page > pageCount) setPage(pageCount);
  }, [search.status, page, pageCount]);

  const ptr = usePullToRefresh(search.refresh);

  const locSig = [...f.localities].sort().join(',');
  const mapFocus = useMemo(() => {
    if (!f.localities.size) return [];
    return localities
      .filter((l) => f.localities.has(l.slug) && l.lat != null && l.lng != null)
      .map((l) => [l.lat, l.lng]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `locSig` is.
  }, [locSig, localities]);

  const pageResults = mapGated ? [] : results;
  const activeIndex = activeId ? pageResults.findIndex((p) => p.id === activeId) : -1;
  const activeProperty = activeIndex >= 0 ? pageResults[activeIndex] : null;
  const goToPage = (n) => {
    setPage(Math.min(Math.max(1, n), pageCount));
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    if (!loaded) return;
    const loc = deferredF.localities.size === 1 ? [...deferredF.localities][0] : '';
    const bhk = deferredF.bhk.size === 1 ? [...deferredF.bhk][0] : '';
    const key = `${loc}|${deferredF.deal}|${bhk}`;
    if (key === lastSearchIntent || (!loc && !bhk)) return;
    lastSearchIntent = key;
    recordSignal({ kind: 'search', localitySlug: loc, deal: deferredF.deal, bhk });
  }, [deferredF, loaded]);

  const activeChips = useMemo(
    () => buildActiveChips(f, { tr, locNameBySlug, socNameBySlug, setF, set, freeText, clearFreeText }),
    [f, locNameBySlug, socNameBySlug, tr, freeText, clearFreeText],
  );

  const parseCtxRef = useRef(null);
  useEffect(() => { parseCtxRef.current = { current: f, localities, locNameBySlug }; });
  const smartSeqRef = useRef(0);

  const applyParsed = (parsed) => {
    if (parsed.next.deal !== parseCtxRef.current.current.deal) stateDrivenDealRef.current = parsed.next.deal;
    setF(parsed.next);
    setFreeText(parsed.q);
  };

  const parseTyped = async () => {
    const parsed = await parseWithLocalities(aiQuery, () => parseCtxRef.current);
    parsed?.hits.filter((l) => parsed.next.localities.has(l.slug)).forEach(addLocalityOption);
    return parsed;
  };

  const smartSearch = async () => {
    const seq = ++smartSeqRef.current;
    const parsed = await parseTyped();
    if (!parsed || seq !== smartSeqRef.current) return;
    applyParsed(parsed);
    const detail = [...parsed.parts, parsed.q && tr('listings.smartFreeText', { text: parsed.q })]
      .filter(Boolean).join(' · ');
    toast(tr('listings.smartSearchToast', { detail }), 'success');
  };

  const saveSearch = async (e) => {
    if (!isIn) {
      sendToSignIn('alerts', undefined, replay(e));
      return;
    }
    if (savingSearch) return;
    setSavingSearch(true);
    try {
      const parsed = aiQuery.trim() ? await parseTyped().catch(() => null) : null;
      if (parsed) applyParsed(parsed);
      setAlertSeed(parsed ? { filters: parsed.next, names: parsed.locNames } : { filters: f, names: locNameBySlug });
    } finally {
      setSavingSearch(false);
    }
  };
  return (
    <>
      <MobileFilterDrawer drawer={drawer} setDrawer={setDrawer} f={f} set={set} localities={localities} onAddLocality={addLocalityOption} clearAll={clearAll} total={total} triggerRef={filterTriggerRef} onBackClose={markDrawerBackClose} />
      {alertSeed ? (
        <AlertSetupModal initial={alertSeed.filters} locNameBySlug={alertSeed.names} onSubmit={createSavedSearch} onClose={() => setAlertSeed(null)} />
      ) : null}

      <div ref={ptr.ref} className="pt-[calc(var(--dz-nav-h)+8px)] sm:pt-[calc(var(--dz-nav-h)+20px)] pb-20">
        {(ptr.pullDistance > 0 || ptr.isRefreshing) && (
          <div
            aria-hidden="true"
            className="glass-strong pointer-events-none fixed left-1/2 z-40 grid h-9 w-9 -translate-x-1/2 place-items-center rounded-full"
            style={{ top: `calc(var(--dz-nav-h) + ${Math.round(ptr.pullDistance)}px)`, opacity: 0.4 + ptr.progress * 0.6 }}
          >
            <Icon
              name={ptr.isRefreshing ? 'loader-2' : 'chevron-down'}
              className={'w-4 h-4 text-teal-400' + (ptr.isRefreshing ? ' animate-spin' : '')}
              style={ptr.isRefreshing ? undefined : { transform: `rotate(${ptr.progress * 180}deg)` }}
            />
          </div>
        )}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="hidden sm:flex items-center gap-2 text-sm mb-3 list-reveal" style={{ animationDelay: '0ms' }}>
            <Link to="/" className="text-gray-500 hover:text-teal-400 t-all flex items-center gap-1"><Icon name="home" className="w-3.5 h-3.5" /> {tr('listings.breadcrumbHome')}</Link>
            <Icon name="chevron-right" className="w-3.5 h-3.5 text-gray-600" />
            <span className="text-gray-300" aria-current="page">{f.deal === 'rent' ? tr('listings.titleForRent', { city }) : tr('listings.titleForSale', { city })}</span>
          </nav>

          <div className="flex flex-row items-center justify-between gap-2.5 sm:gap-3 mb-3.5 sm:mb-5 list-reveal" style={{ animationDelay: '60ms' }}>
            <h1 className="min-w-0 text-3xl font-bold text-white leading-tight">
              <span className="sm:hidden">{f.deal === 'rent' ? tr('listings.titleShortForRent', { city }) : tr('listings.titleShortForSale', { city })}</span>
              <span className="hidden sm:inline">{f.deal === 'rent' ? tr('listings.titleForRent', { city }) : tr('listings.titleForSale', { city })}</span>
            </h1>
            {hasData ? <DealToggle deal={f.deal} onChange={switchDeal} className="shrink-0 lg:hidden" /> : null}
          </div>

          {!hasData ? (
            <div className="py-10 sm:py-16">
              <NewCityEmptyState city={city} context="listings" />
            </div>
          ) : (
          <div className="flex gap-8">
            <aside className="hidden lg:block w-[300px] min-w-[300px] list-reveal" style={{ animationDelay: '120ms' }}>
              <div className="glass rounded-2xl p-6 sticky top-28 max-h-[calc(100vh-9rem)] overflow-y-auto filter-scroll">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2"><Icon name="sliders-horizontal" className="w-5 h-5 text-teal-400" /> {tr('listings.filters')}</h3>
                  <button onClick={clearAll} className="text-xs font-medium text-teal-400 hover:text-teal-300 t-all">{tr('listings.clearAll')}</button>
                </div>
                <Filters f={f} set={set} localities={localities} onAddLocality={addLocalityOption} clearAll={clearAll} showClear={false} />
              </div>
            </aside>

            <ResultsArea f={f} set={set} localities={localities} aiQuery={aiQuery} setAiQuery={setAiQuery} smartSearch={smartSearch} saveSearch={saveSearch} savingSearch={savingSearch} results={pageResults} total={total} verifiedCount={verifiedCount} unstatedCount={unstatedCount} relaxedNear={relaxedNear} page={safePage} pageCount={pageCount} goToPage={goToPage} view={effView} setView={setView} sort={sort} setSort={setSort} flagEnabled={flagEnabled} activeChips={activeChips} clearAll={clearAll} locNameBySlug={locNameBySlug} loaded={loaded} loadFailed={search.status === 'error'} searching={search.status === 'loading'} loadError={search.error} onRetryLoad={search.retry} toast={toast} onOpenFilters={() => setDrawer(true)} filterTriggerRef={filterTriggerRef} mapGated={mapGated} mapAreaCount={mapAreaCount} mapMaxAreas={MAP_MAX_AREAS} mapMarkerCap={MAP_MARKER_CAP} mapFocus={mapFocus} activeId={activeId} activeProperty={activeProperty} activeIndex={activeIndex} onSelectProperty={onSelectProperty} onCloseProperty={onCloseProperty} fromSearch={buildReturnSearch()} onOpenProperty={saveReturnContext} isIn={isIn} mapUnavailable={view === 'map' && !mapEnabled} suggestedMapLocalities={suggestedMapLocalities} onAddLocality={addLocalityOption} />
          </div>
          )}
        </div>
      </div>
    </>
  );
}
