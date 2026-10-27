import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import Icon from '../../components/Icon.jsx';
import PropertyImage from '../../components/ui/PropertyImage.jsx';
import HScroll from '../../components/ui/HScroll.jsx';
import { CARD_SIZES } from '../../lib/imgSrcSet.js';
import { useSavedItems } from '../../context/SavedContext.jsx';
import { useSavedSearches } from '../../context/SavedSearchContext.jsx';
import { fmtINR } from '../../lib/format.js';
import usePullToRefresh from '../../lib/usePullToRefresh.js';
import { buildAlertRecord } from './listings/alertCriteria.js';
import { detailPath, toSavedCard } from './flatmates/helpers.js';
import * as flatmateService from '../../services/flatmateService.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSignInGate } from '../../lib/useSignInGate.js';
import { useToast } from '../../context/ToastContext.jsx';
import { ActionSheet, AlertsRow, SkeletonRows, SwipeCard, UndoRow } from './saved/SavedPageParts.jsx';
import '../../styles/routes/saved.css';

const CATEGORIES = [
  { key: 'all', label: 'All', labelKey: 'catAllLabel', icon: 'heart' },
  { key: 'buy', label: 'Buy', labelKey: 'catBuyLabel', icon: 'home' },
  { key: 'rent', label: 'Rent', labelKey: 'catRentLabel', icon: 'key' },
  { key: 'flatmates', label: 'Flatmates', labelKey: 'catFlatmatesShort', icon: 'users-round' },
];

/* How long a swiped-away card stays undoable before the removal commits. */
const UNDO_WINDOW_MS = 8000;

async function readFlatmateSaves() {
  const page = await flatmateService.listFlatmateSaves();
  return (page?.items || []).flatMap((item) => {
    const card = toSavedCard(item);
    return card ? [{ ...card, savedAt: item.savedAt }] : [];
  });
}

export default function Saved() {
  const { t: tr } = useTranslation();
  const { toast } = useToast();
  const { isIn } = useAuth();
  const sendToSignIn = useSignInGate();
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState('all');
  const [removing, setRemoving] = useState(() => new Set());
  const [pendingRemoval, setPendingRemoval] = useState(() => new Map());
  const [alerting, setAlerting] = useState(() => new Set());
  const [actionCard, setActionCard] = useState(null);
  const undoTimers = useRef(new Map());
  const pendingRef = useRef(new Map());
  const commitRef = useRef(() => {});

  const savedList = useSavedItems();
  const savedSearches = useSavedSearches();

  const dynamicSaved = useMemo(() => savedList.items.map((p) => {
    const isRent = p.deal === 'rent';
    const locality = p.locality || 'Pune';
    return {
      id: p.id,
      // `remove()` below addresses `DELETE /me/saved/{propId}` with the row's primary key, not the
      // routing token.
      uuid: p.uuid,
      cat: isRent ? 'rent' : 'buy',
      title: p.title || p.type || 'Property',
      loc: locality,
      price: typeof p.price === 'number' ? (isRent ? `₹${p.price.toLocaleString('en-IN')}/mo` : fmtINR(p.price)) : (p.price || ''),
      priceNum: typeof p.price === 'number' ? p.price : 0,
      unavailable: p.available === false,
      deal: isRent ? 'rent' : 'buy',
      localitySlug: p.locality || '',
      bhkNum: p.bhkNum || null,
      badge: isRent ? 'For Rent' : 'For Sale',
      bhk: p.bhk || (p.bhkNum ? `${p.bhkNum} BHK` : ''),
      area: p.area ? `${p.area.toLocaleString('en-IN')} sq.ft.` : '',
      img: p.image || p.img || null,
      savedAt: p.savedAt,
      fromStore: true,
    };
  }), [savedList.items]);

  const [cards, setCards] = useState([]);
  const loadFlatmateSaves = useCallback(
    () => readFlatmateSaves()
      .then((rows) => { setCards(rows); return rows; })
      .catch((e) => { console.warn('[saved] flatmate saves failed', e); setCards([]); return []; }),
    [],
  );
  useEffect(() => { loadFlatmateSaves(); }, [loadFlatmateSaves, isIn]);

  /* Re-reads both halves: refreshing only one would leave the gesture looking like it half worked on a page that
     shows the two interleaved. */
  const refreshShortlist = savedList.reload || savedList.refresh;
  const ptr = usePullToRefresh(useCallback(
    () => Promise.resolve(refreshShortlist()).catch(() => {}).then(loadFlatmateSaves),
    [refreshShortlist, loadFlatmateSaves],
  ));

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 20);
    return () => clearTimeout(t);
  }, []);

  const commitRemoval = useCallback((card, { animate = true } = {}) => {
    if (!card) return;
    if (!animate) {
      void (async () => {
        let ok = true;
        if (card.fromStore) ok = await savedList.unsave(card.id, card.uuid);
        else if (card.cat === 'flatmates') {
          try {
            await flatmateService.unsaveFlatmatePost(card.saveKind, String(card.id).slice(2));
          } catch (e) {
            ok = false;
            console.warn('[saved] flatmate unsave failed', e);
          }
        }
        if (!ok) toast(tr('saved.updateFailed'), 'error');
      })();
      return;
    }
    const finish = async () => {
      let ok = true;
      if (card.fromStore) ok = await savedList.unsave(card.id, card.uuid);
      else if (card.cat === 'flatmates') {
        setCards((arr) => arr.filter((c) => c.id !== card.id));
        try {
          await flatmateService.unsaveFlatmatePost(card.saveKind, String(card.id).slice(2));
        } catch (e) {
          ok = false;
          console.warn('[saved] flatmate unsave failed', e);
          setCards((arr) => (arr.some((c) => c.id === card.id) ? arr : [card, ...arr]));
        }
      } else {
        setCards((arr) => arr.filter((c) => c.id !== card.id));
      }
      if (!ok) toast(tr('saved.updateFailed'), 'error');
      setRemoving((s) => {
        const next = new Set(s);
        next.delete(card.id);
        return next;
      });
    };
    setRemoving((s) => new Set(s).add(card.id));
    setTimeout(finish, 400);
  }, [savedList, toast, tr]);

  useEffect(() => { commitRef.current = commitRemoval; }, [commitRemoval]);

  const stageRemove = useCallback((card) => {
    if (!card || pendingRef.current.has(card.id)) return;
    const next = new Map(pendingRef.current);
    next.set(card.id, card);
    pendingRef.current = next;
    setPendingRemoval(next);
    const timer = setTimeout(() => {
      undoTimers.current.delete(card.id);
      const remaining = new Map(pendingRef.current);
      remaining.delete(card.id);
      pendingRef.current = remaining;
      setPendingRemoval(remaining);
      commitRemoval(card);
    }, UNDO_WINDOW_MS);
    undoTimers.current.set(card.id, timer);
  }, [commitRemoval]);

  const undoRemove = (id) => {
    clearTimeout(undoTimers.current.get(id));
    undoTimers.current.delete(id);
    const next = new Map(pendingRef.current);
    next.delete(id);
    pendingRef.current = next;
    setPendingRemoval(next);
  };
  // A pending commit timer would remove a card the user cannot see, let alone undo.

  useEffect(() => {
    const timers = undoTimers.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
      pendingRef.current.forEach((card) => commitRef.current(card, { animate: false }));
      pendingRef.current = new Map();
    };
  }, []);

  // Turn a saved property into an opt-in alert for similar listings (same intent,
  // locality and configuration, within a ±15% price band). Surfaces in Dashboard → Alerts.
  const createAlert = async (c) => {
    if (alerting.has(c.id)) return;
    setAlerting((s) => new Set(s).add(c.id));
    try {
      const isRent = c.deal === 'rent';
      const lo = c.priceNum ? Math.round(c.priceNum * 0.85) : undefined;
      const hi = c.priceNum ? Math.round(c.priceNum * 1.15) : undefined;
      const f = {
        deal: isRent ? 'rent' : 'buy',
        types: [],
        bhk: c.bhkNum ? [String(c.bhkNum)] : [],
        localities: c.localitySlug ? [c.localitySlug] : [],
        budget: !isRent && lo ? [lo, hi] : undefined,
        rent: isRent && lo ? [lo, hi] : undefined,
      };
      await savedSearches.create({ ...buildAlertRecord(f), query: '' });
      toast(tr('saved.alertToast'), 'success');
      setActionCard(null);
    } catch {
      toast(tr('saved.alertFailed'), 'error');
    } finally {
      setAlerting((s) => {
        const next = new Set(s);
        next.delete(c.id);
        return next;
      });
    }
  };

  const allCards = useMemo(() => {
    const existingIds = new Set(cards.map((c) => c.id));
    const at = (c) => Date.parse(c.savedAt) || 0;
    // Newest save first across both sources; the page offers no other order.
    return [...cards, ...dynamicSaved.filter((d) => !existingIds.has(d.id))].sort((a, b) => at(b) - at(a));
  }, [cards, dynamicSaved]);

  const counts = useMemo(() => {
    const m = { all: allCards.length, buy: 0, rent: 0, flatmates: 0 };
    allCards.forEach((c) => { m[c.cat] = (m[c.cat] || 0) + 1; });
    return m;
  }, [allCards]);
  const catLabel = useCallback((c) => (c ? tr('saved.' + c.labelKey, { defaultValue: c.label }) : ''), [tr]);
  const items = useMemo(
    () => (tab === 'all' ? allCards : allCards.filter((c) => c.cat === tab)),
    [allCards, tab],
  );

  const summaryParts = useMemo(() => {
    const homes = counts.buy + counts.rent;
    const rooms = counts.flatmates;
    return [
      homes ? tr('saved.homeCount', { count: homes }) : '',
      rooms ? tr('saved.roomCount', { count: rooms }) : '',
    ].filter(Boolean).join(' · ');
  }, [counts.buy, counts.rent, counts.flatmates, tr]);

  const isLoading = savedList.status === 'loading';
  const isError = savedList.status === 'error';

  return (
    <div ref={ptr.ref} className="saved-page">
      {(ptr.pullDistance > 0 || ptr.isRefreshing) && (
        <div
          aria-hidden="true"
          data-testid="ptr-indicator"
          className="glass-strong pointer-events-none fixed left-1/2 z-40 grid h-9 w-9 -translate-x-1/2 place-items-center rounded-full"
          style={{ top: `calc(var(--dz-nav-h) + ${Math.round(ptr.pullDistance)}px)`, opacity: 0.4 + ptr.progress * 0.6 }}
        >
          <Icon name={ptr.isRefreshing ? 'loader-2' : 'chevron-down'} className={'w-4 h-4 text-teal-400' + (ptr.isRefreshing ? ' animate-spin' : '')} style={ptr.isRefreshing ? undefined : { transform: `rotate(${ptr.progress * 180}deg)` }} />
        </div>
      )}
      <div className="pt-5 sm:pt-8 lg:pt-10 pb-20 min-h-[100dvh]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className={'mb-5 sm:mb-8 fade-in' + (mounted ? ' visible' : '')}>
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">{tr('saved.title')}</h1>
            {summaryParts && <p className="text-gray-400 text-sm"><span className="text-teal-400 font-semibold">{summaryParts}</span></p>}
          </div>
          {/* Signed-out shortlists are real — Reels, Compare and the map detail panel all write dzSavedProps while
             logged out. */}

          {!isIn && (
            <div className={'mb-5 flex flex-col gap-3 rounded-2xl border border-teal-400/20 bg-teal-500/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between fade-in' + (mounted ? ' visible' : '')}>
              <div className="flex items-start gap-3 min-w-0">
                <Icon name="cloud-off" className="w-5 h-5 flex-shrink-0 text-teal-300 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{tr('saved.guestTitle')}</p>
                  <p className="text-[13px] text-gray-400">{tr('saved.guestBody')}</p>
                </div>
              </div>
              <button type="button" onClick={() => sendToSignIn('saved')} className="btn-teal shrink-0 inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl text-white text-sm font-semibold">
                <Icon name="log-in" className="w-4 h-4" /> {tr('saved.guestCta')}
              </button>
            </div>
          )}

          {isLoading ? (
            <SkeletonRows />
          ) : isError ? (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-5 text-center">
              <p className="text-sm font-semibold text-white">{tr('saved.loadError')}</p>
              <button type="button" onClick={() => { void savedList.reload().catch(() => {}); }} className="mt-4 min-h-[44px] rounded-xl border border-white/10 px-5 text-sm font-semibold text-teal-200">
                {tr('saved.retry')}
              </button>
            </div>
          ) : allCards.length > 0 ? (
            <>
              <HScroll
                role="group"
                aria-label={tr('saved.categoryLabel')}
                wrapClassName={'mb-4 fade-in' + (mounted ? ' visible' : '')}
                className="saved-tabs flex gap-1 border-b border-white/10 sm:gap-2"
              >
                {CATEGORIES.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setTab(c.key)}
                    aria-pressed={tab === c.key}
                    className={'saved-tab dz-detail-tab min-h-[44px]' + (tab === c.key ? ' is-active' : '')}
                  >
                    <span className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
                      <Icon name={c.icon} className="h-4 w-4 flex-shrink-0" />
                      <span>{catLabel(c)}</span>
                      <span className="dz-count tab-count">{counts[c.key]}</span>
                    </span>
                  </button>
                ))}
              </HScroll>

              <AlertsRow searches={savedSearches.searches} status={savedSearches.status} isIn={isIn} />

              {items.length > 0 ? (
                <div key={tab} className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-6 lg:grid-cols-3 lg:gap-8">
                  {items.map((c, i) => (pendingRemoval.has(c.id) ? (
                    <UndoRow key={c.id} label={tr('saved.removedTitle', { title: c.title })} undoLabel={tr('saved.undo')} undoAria={tr('saved.undoAria', { title: c.title })} onUndo={() => undoRemove(c.id)} />
                  ) : (
                    <SwipeCard
                      key={c.id}
                      card={c}
                      onRemove={() => stageRemove(c)}
                      onAction={setActionCard}
                      className={'property-card rounded-2xl overflow-hidden fade-in' + (mounted ? ' visible' : '') + (removing.has(c.id) ? ' removing' : '') + ` fade-in-delay-${(i % 3) + 1}`}
                    >
                      <div className="flex min-h-[96px] items-center gap-3 p-2 md:block md:min-h-0 md:p-0">
                        <Link to={c.cat === 'flatmates' ? detailPath(c.saveKind, c.id.slice(2)) : `/property/${c.id}`} className="saved-row-link flex min-w-0 flex-1 items-center gap-3 md:block">
                          <div className="card-image relative h-[88px] w-[88px] flex-shrink-0 rounded-xl md:h-56 md:w-full md:rounded-none">
                            <PropertyImage src={c.img} sizes={`(max-width: 767px) 88px, ${CARD_SIZES}`} alt={c.title} className="w-full h-full object-cover" />
                            <div className="hidden md:block absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                            <div className="hidden md:block absolute top-4 left-4"><span className="dz-tag type-badge font-semibold text-teal-300 backdrop-blur-md">{c.badge}</span></div>
                            <div className="hidden md:block absolute bottom-4 left-4"><p className="text-2xl font-bold text-white">{c.price}</p></div>
                          </div>
                          <div className="min-w-0 flex-1 md:p-5">
                            <div className="flex items-start gap-2 md:block">
                              <div className="min-w-0 flex-1">
                                <p className="text-base font-bold text-white md:text-lg">{c.price}</p>
                                <h3 className="truncate text-sm font-semibold text-white md:mt-2 md:text-lg">{c.title}</h3>
                                <p className="mt-0.5 truncate text-xs text-gray-400 md:text-sm">{c.cat === 'flatmates' ? c.sub : [c.bhk, c.loc].filter(Boolean).join(' · ')}</p>
                              </div>
                              {c.unavailable && <span className="dz-tag border border-rose-400/30 bg-rose-500/10 font-semibold text-rose-200">{tr('saved.noLongerAvailable')}</span>}
                            </div>
                          </div>
                        </Link>
                        <div className="hidden md:mx-5 md:mb-5 md:flex md:items-center md:gap-3 md:border-t md:border-white/5 md:pt-4">
                          {c.cat !== 'flatmates' ? (
                            <>
                              <span className="text-xs text-gray-400">{[c.bhk, c.area].filter(Boolean).join(' · ')}</span>
                              <span className="ml-auto flex items-center gap-2">
                                <button type="button" disabled={alerting.has(c.id)} onClick={() => { void createAlert(c); }} title={tr('saved.createAlertAria')} aria-label={tr('saved.createAlertAria')} className="w-11 h-11 shrink-0 rounded-xl border border-white/10 text-gray-300 flex items-center justify-center transition-colors disabled:opacity-60">
                                  <Icon name={alerting.has(c.id) ? 'loader-2' : 'bell-plus'} className={'w-4 h-4' + (alerting.has(c.id) ? ' animate-spin' : '')} />
                                </button>
                                <button type="button" onClick={() => stageRemove(c)} title={tr('saved.removeFromSaved')} aria-label={tr('saved.removeFromSaved')} className="remove-btn w-11 h-11 shrink-0 rounded-xl border border-white/10 text-red-300 flex items-center justify-center">
                                  <Icon name="trash-2" className="w-4 h-4" />
                                </button>
                              </span>
                            </>
                          ) : (
                            <button type="button" onClick={() => stageRemove(c)} className="h-btn remove-btn w-full rounded-xl border border-white/10 text-gray-400 text-sm font-medium flex items-center justify-center gap-2">
                              <Icon name="trash-2" className="w-4 h-4" /> {tr('saved.removeBtn')}
                            </button>
                          )}
                        </div>
                        <div className="flex flex-col gap-2 md:hidden">
                          {c.cat !== 'flatmates' && (
                            <button type="button" disabled={alerting.has(c.id)} onClick={() => { void createAlert(c); }} title={tr('saved.createAlertAria')} aria-label={tr('saved.createAlertAria')} className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl border border-white/10 text-gray-300 disabled:opacity-60">
                              <Icon name={alerting.has(c.id) ? 'loader-2' : 'bell-plus'} className={'h-4 w-4' + (alerting.has(c.id) ? ' animate-spin' : '')} />
                            </button>
                          )}
                          <button type="button" onClick={() => stageRemove(c)} title={tr('saved.removeFromSaved')} aria-label={tr('saved.removeFromSaved')} className="remove-btn grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl border border-white/10 text-red-300">
                            <Icon name="trash-2" className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </SwipeCard>
                  )))}
                </div>
              ) : (
                <div className="text-center py-20">
                  <div className="w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-5"><Icon name="heart" className="w-9 h-9 text-gray-600" /></div>
                  <h2 className="text-xl font-bold text-white mb-2">{tr('saved.emptyCatTitle', { cat: catLabel(CATEGORIES.find((c) => c.key === tab)).toLowerCase() })}</h2>
                  <p className="text-gray-500 mb-7 max-w-md mx-auto">{tr('saved.emptyCatBody')}</p>
                  <Link to="/listings" className="btn-teal inline-flex items-center gap-2 px-7 py-3 rounded-xl text-white font-semibold text-sm shadow-lg shadow-teal-500/20"><Icon name="search" className="w-4 h-4" /> {tr('saved.browseProperties')}</Link>
                </div>
              )}
            </>
          ) : (
            <div className="empty-state text-center py-24">
              <div className="w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-6 heart-pulse"><Icon name="heart" className="w-10 h-10 text-gray-600" /></div>
              <h2 className="text-2xl font-bold text-white mb-3">{tr('saved.emptyTitle')}</h2>
              <p className="text-gray-500 text-lg mb-8 max-w-md mx-auto">{tr('saved.emptyBody')}</p>
              <Link to="/listings" className="btn-teal inline-flex items-center gap-2 px-8 py-3.5 rounded-xl text-white font-semibold text-sm shadow-lg shadow-teal-500/20"><Icon name="search" className="w-4 h-4" /> {tr('saved.browseProperties')}</Link>
            </div>
          )}
        </div>
      </div>
      <ActionSheet
        card={actionCard}
        onClose={() => setActionCard(null)}
        onAlert={(card) => { void createAlert(card); }}
        onRemove={(card) => { setActionCard(null); stageRemove(card); }}
        alerting={actionCard ? alerting.has(actionCard.id) : false}
        createAlertLabel={tr('saved.createAlertAria')}
        removeLabel={tr('saved.removeBtn')}
        closeLabel={tr('saved.closeActions', { defaultValue: 'Close saved actions' })}
      />
    </div>
  );
}
