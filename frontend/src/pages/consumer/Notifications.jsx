import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import Icon from '../../components/Icon.jsx';
import HScroll from '../../components/ui/HScroll.jsx';
import NotificationRow from '../../components/notifications/NotificationRow.jsx';
import {
  collapseNotifications,
  FILTERS,
  hasUnreadInFilter,
  isToday,
  matchesNotificationFilter,
  notificationBucket,
  STAFF_FILTERS,
  staffNotificationBucket,
} from '../../components/notifications/notificationModel.js';
import { useScrollReveal } from '../../lib/useScrollReveal.js';
import usePullToRefresh from '../../lib/usePullToRefresh.js';
import { useNotifications } from '../../context/NotificationContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { alertPermission, alertsSupported, browserAlertsOn, enableBrowserAlerts } from '../../lib/browserAlerts.js';
import {
  dismiss as dismissIds,
  listNotifications,
  markAllRead,
  markRead as markOneRead,
} from '../../services/notificationService.js';

const PAGE_SIZE = 50;
const UNDO_MS = 5000;
const IDLE = { status: 'idle', cursor: 0, total: 0 };

// Whether a loaded row still sits in its section's server list (`read=false` or `read=true`).
const inServerList = (n) => (n.section === 'read') === Boolean(n.read);

const restoreRows = (cur, rows) => {
  const ids = new Set(rows.map((n) => n.id));
  return [...rows, ...cur.filter((n) => !ids.has(n.id))].sort((a, b) => (b.at || 0) - (a.at || 0));
};

function SkeletonRows() {
  return (
    <div className="space-y-3">
      {[0, 1, 2, 3].map((n) => <div key={n} className="h-16 animate-pulse rounded-2xl bg-white/[0.04]" />)}
    </div>
  );
}

function LoadError({ onRetry }) {
  const { t } = useTranslation();
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-rose-400/20 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-100">
      <span>{t('notifications.loadError')}</span>
      <button type="button" onClick={onRetry} className="min-h-[44px] rounded-xl px-3 font-semibold text-white hover:bg-white/5">{t('notifications.retry')}</button>
    </div>
  );
}

function ShowOlder({ onClick }) {
  const { t } = useTranslation();
  return (
    <div className="mt-5 text-center">
      <button type="button" onClick={onClick} className="min-h-[44px] rounded-xl border border-white/10 px-4 text-sm font-semibold text-teal-300 hover:bg-white/5">
        {t('notifications.showOlder')}
      </button>
    </div>
  );
}

// Staff have no Profile switch, so the inbox itself offers browser alerts until they are on.
function StaffAlertsButton() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [on, setOn] = useState(browserAlertsOn);
  if (on || !alertsSupported() || alertPermission() === 'denied') return null;
  const turnOn = async () => {
    try {
      await enableBrowserAlerts();
      setOn(true);
      toast(t('browserAlerts.enabled'), 'success');
    } catch {
      if (alertPermission() === 'granted') setOn(true);
      else toast(t('browserAlerts.blockedBody'), 'error');
    }
  };
  return (
    <button type="button" onClick={turnOn} data-testid="staff-alerts-on" className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-white/10 px-3 text-sm font-semibold text-gray-200 hover:border-teal-400/30 hover:text-teal-300">
      <Icon name="bell" className="h-4 w-4" /> {t('browserAlerts.cta')}
    </button>
  );
}

export default function Notifications({ staff = false }) {
  const { t } = useTranslation();
  const filters = staff ? STAFF_FILTERS : FILTERS;
  const bucket = staff ? staffNotificationBucket : notificationBucket;
  const { toast } = useToast();
  const { unread, refresh: refreshBadge } = useNotifications();
  const [notifs, setNotifs] = useState([]);
  const [filter, setFilter] = useState('all');
  const [sections, setSections] = useState({ unread: { ...IDLE, status: 'loading' }, read: IDLE });
  const [showRead, setShowRead] = useState(false);
  const [undo, setUndo] = useState(null);
  const undoTimer = useRef(null);
  const loadedOnce = useRef(false);
  const undoRef = useRef(null);
  const dismissPendingRef = useRef(null);
  const latest = useRef({ unread: 0, read: 0 });
  const rootRef = useScrollReveal([filter, notifs.length, showRead]);

  // Rows keep their fetched section, so one read here stays put. Reads and dismissals shift the server list, so
  // paging re-reads from the page at-or-before offset `from` plus the next one, and de-dupes.
  const loadSection = useCallback(async (section, from = null) => {
    const req = ++latest.current[section];
    const first = from === null ? 0 : Math.floor(from / PAGE_SIZE);
    const pages = from !== null && from % PAGE_SIZE ? [first, first + 1] : [first];
    setSections((s) => ({ ...s, [section]: { ...s[section], status: 'loading' } }));
    try {
      const read = section === 'read';
      const results = await Promise.all(pages.map((page) => listNotifications({ page, size: PAGE_SIZE, read })));
      if (req !== latest.current[section]) return;
      const items = results.flatMap((r) => r.items);
      const pendingClear = new Set(undoRef.current?.ids);
      setNotifs((cur) => {
        const keep = from === null ? cur.filter((n) => n.section !== section) : cur;
        const held = new Set(keep.map((n) => n.id));
        const fresh = items.filter((n) => !held.has(n.id) && !pendingClear.has(n.id));
        return [...keep, ...fresh.map((n) => ({ ...n, section }))];
      });
      setSections((s) => ({
        ...s,
        [section]: { status: 'ready', cursor: first * PAGE_SIZE + items.length, total: results.at(-1).total },
      }));
    } catch {
      if (req === latest.current[section]) {
        setSections((s) => ({ ...s, [section]: { ...s[section], status: 'error' } }));
      }
    }
  }, []);

  const showReadRef = useRef(showRead);
  showReadRef.current = showRead;
  const reload = useCallback(async () => {
    if (!showReadRef.current) {
      latest.current.read += 1;
      setNotifs((cur) => cur.filter((n) => n.section !== 'read'));
      setSections((s) => ({ ...s, read: IDLE }));
    }
    await loadSection('unread');
    if (showReadRef.current) await loadSection('read');
    // The bell was read at sign-in and the stream keeps it current; only a re-read can find it stale.
    if (loadedOnce.current) refreshBadge();
    loadedOnce.current = true;
  }, [loadSection, refreshBadge]);

  useEffect(() => {
    reload();
  }, [reload]);

  const toggleRead = () => {
    if (!showRead && sections.read.status === 'idle') loadSection('read');
    setShowRead((v) => !v);
  };

  // Shrinks a section's server-side list by the rows that just left it, keeping the paging offset honest.
  const leave = useCallback((rows) => setSections((s) => {
    const next = { ...s };
    for (const n of rows.filter(inServerList)) {
      const c = next[n.section];
      next[n.section] = { ...c, cursor: Math.max(0, c.cursor - 1), total: Math.max(0, c.total - 1) };
    }
    return next;
  }), []);

  dismissPendingRef.current = (entry) => {
    void dismissIds(entry.ids).finally(refreshBadge);
  };

  useEffect(() => () => {
    clearTimeout(undoTimer.current);
    if (undoRef.current) dismissPendingRef.current?.(undoRef.current);
  }, []);

  const ptr = usePullToRefresh(reload);

  const rowsOf = useCallback(
    (section) => collapseNotifications(notifs.filter((n) => n.section === section && matchesNotificationFilter(n, filter, bucket))),
    [bucket, filter, notifs],
  );
  const unreadRows = useMemo(() => rowsOf('unread'), [rowsOf]);
  const readRows = useMemo(() => rowsOf('read'), [rowsOf]);

  const groups = useMemo(() => {
    const today = unreadRows.filter((n) => isToday(n.at));
    const earlier = unreadRows.filter((n) => !isToday(n.at));
    return [['today', today], ['earlier', earlier]].filter(([, rows]) => rows.length);
  }, [unreadRows]);

  // A failed write re-reads the server rather than restoring a snapshot that later loads may have outdated.
  const mutate = async (apply, request, leaving) => {
    setNotifs(apply);
    leave(leaving);
    try {
      await request();
      return true;
    } catch {
      toast("Couldn't update. Try again.", 'error');
      reload();
      return false;
    } finally {
      refreshBadge();
    }
  };

  const idsFor = (item) => item.ids || [item.id];
  const rowsFor = (ids) => notifs.filter((n) => ids.includes(n.id));

  const markAll = () => mutate(
    (cur) => cur.map((n) => (n.read ? n : { ...n, read: true })),
    markAllRead,
    [],
  ).then((ok) => {
    if (ok) setSections((s) => ({ ...s, unread: { ...s.unread, cursor: 0, total: 0 } }));
    return ok;
  });

  const markRead = (item) => {
    const ids = idsFor(item);
    const rows = rowsFor(ids);
    if (rows.every((n) => n.read)) return Promise.resolve(true);
    return mutate(
      (cur) => cur.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)),
      () => markOneRead(ids),
      rows,
    );
  };

  const dismissNow = (item) => {
    const ids = idsFor(item);
    return mutate(
      (cur) => cur.filter((n) => !ids.includes(n.id)),
      () => dismissIds(ids),
      rowsFor(ids),
    );
  };

  const commitUndo = useCallback(async (entry) => {
    if (!entry) return;
    try {
      await dismissIds(entry.ids);
      leave(entry.rows);
    } catch {
      setNotifs((cur) => restoreRows(cur, entry.rows));
      toast("Couldn't update. Try again.", 'error');
    } finally {
      refreshBadge();
      if (undoRef.current === entry) {
        undoRef.current = null;
        setUndo(null);
      }
    }
  }, [leave, refreshBadge, toast]);

  const swipeClear = (item) => {
    clearTimeout(undoTimer.current);
    if (undoRef.current) commitUndo(undoRef.current);
    const ids = idsFor(item);
    const rows = rowsFor(ids);
    const entry = { ids, rows };
    undoRef.current = entry;
    setNotifs((cur) => cur.filter((n) => !ids.includes(n.id)));
    setUndo(entry);
    undoTimer.current = setTimeout(() => commitUndo(entry), UNDO_MS);
  };

  const undoClear = () => {
    const entry = undoRef.current;
    clearTimeout(undoTimer.current);
    if (!entry) return;
    setNotifs((cur) => restoreRows(cur, entry.rows));
    undoRef.current = null;
    setUndo(null);
  };

  const unreadState = sections.unread;
  const readState = sections.read;
  const initialLoad = unreadState.status === 'loading' && !unreadRows.length;
  const hasMore = (section) => sections[section].status === 'ready' && sections[section].cursor < sections[section].total;
  const caughtUpKey = filters.find((f) => f.key === filter)?.emptyKey ?? 'notifications.caughtUp';

  let delay = 0;
  const renderRow = (n) => {
    const rowDelay = delay;
    delay += 0.04;
    return (
      <NotificationRow
        fallbackHref={staff ? '/admin/notifications' : undefined}
        key={`${n.type}-${n.link}-${n.id}`}
        item={n}
        onOpen={markRead}
        onMarkRead={markRead}
        onDismiss={dismissNow}
        onSwipeClear={swipeClear}
        swipeable
        delay={rowDelay}
      />
    );
  };

  return (
    <div ref={ptr.ref} className="min-h-[100dvh] pb-20 pt-5 sm:pt-8 lg:pt-10">
      {(ptr.pullDistance > 0 || ptr.isRefreshing) && (
        <div
          aria-hidden="true"
          className="glass-strong pointer-events-none fixed left-1/2 z-40 grid h-9 w-9 -translate-x-1/2 place-items-center rounded-full"
          style={{ top: `calc(var(--dz-nav-h) + ${Math.round(ptr.pullDistance)}px)`, opacity: 0.4 + ptr.progress * 0.6 }}
        >
          <Icon
            name={ptr.isRefreshing ? 'loader-2' : 'chevron-down'}
            className={'h-4 w-4 text-teal-400' + (ptr.isRefreshing ? ' animate-spin' : '')}
            style={ptr.isRefreshing ? undefined : { transform: `rotate(${ptr.progress * 180}deg)` }}
          />
        </div>
      )}

      <div ref={rootRef} className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="mb-5 flex items-center justify-between gap-4 reveal sm:mb-6">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-white sm:text-3xl">{t('notifications.title')}</h1>
            <p className="mt-1 text-sm text-gray-400"><span className="font-semibold text-teal-400">{unread}</span> {t('notifications.unread')}</p>
          </div>
          <div className="flex items-center gap-2">
            {unread > 0 && (
              <button type="button" onClick={markAll} className="min-h-[44px] rounded-xl px-2 text-sm font-semibold text-teal-300 hover:bg-white/5">
                {t('notifications.markAll')}
              </button>
            )}
            {staff ? <StaffAlertsButton /> : (
              <Link to="/dashboard#profile" aria-label={t('notifications.manage')} className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 text-gray-400 hover:border-teal-400/30 hover:text-teal-300">
                <Icon name="user-cog" className="h-5 w-5" />
              </Link>
            )}
          </div>
        </div>

        <HScroll role="tablist" aria-label={t('notifications.title')} fadeColor="var(--brand-dark)" wrapClassName="mb-5" className="flex gap-1 sm:gap-2 border-b border-white/10">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={'dz-detail-tab' + (filter === f.key ? ' is-active' : '')}
            >
              <Icon name={f.icon} className="w-4 h-4" /> <span>{t(f.labelKey)}</span>
              {hasUnreadInFilter(notifs, f.key, bucket) && <span className="h-1.5 w-1.5 rounded-full bg-teal-400" aria-hidden="true" />}
            </button>
          ))}
        </HScroll>

        {unreadState.status === 'error' && <LoadError onRetry={reload} />}

        {initialLoad ? <SkeletonRows /> : null}

        {groups.map(([gid, rows]) => (
          <section key={gid} className="mb-6">
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-500 reveal">{gid === 'today' ? t('notifications.today') : t('notifications.earlier')}</h2>
            <div className="space-y-3">{rows.map(renderRow)}</div>
          </section>
        ))}

        {unreadState.status === 'ready' && !unreadRows.length && (
          <div className="py-10 text-center text-sm text-gray-500">{t(caughtUpKey)}</div>
        )}

        {hasMore('unread') && <ShowOlder onClick={() => loadSection('unread', unreadState.cursor)} />}

        {!initialLoad && (
          <button
            type="button"
            onClick={toggleRead}
            aria-expanded={showRead}
            aria-controls="notif-read"
            className="mt-2 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 text-sm font-semibold text-gray-300 hover:bg-white/5"
          >
            {t(showRead ? 'notifications.hideRead' : 'notifications.showRead')}
            <Icon name="chevron-down" className={'h-4 w-4 transition-transform' + (showRead ? ' rotate-180' : '')} />
          </button>
        )}

        {showRead && (
          <section id="notif-read" className="mt-6">
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">{t('notifications.readHeading')}</h2>
            {readState.status === 'error' && <LoadError onRetry={() => loadSection('read')} />}
            {readState.status === 'loading' && !readRows.length ? <SkeletonRows /> : null}
            <div className="space-y-3">{readRows.map(renderRow)}</div>
            {readState.status === 'ready' && !readRows.length && (
              <p className="py-8 text-center text-sm text-gray-500">{t('notifications.noRead')}</p>
            )}
            {hasMore('read') && <ShowOlder onClick={() => loadSection('read', readState.cursor)} />}
          </section>
        )}
      </div>

      {undo && (
        <div role="status" className="fixed inset-x-4 bottom-[calc(1rem+var(--dz-safe-b))] z-[1600] mx-auto flex max-w-sm items-center justify-between gap-3 rounded-2xl border border-white/10 bg-ink-card px-4 py-3 shadow-2xl shadow-black/40">
          <span className="text-sm text-gray-200">{t('notifications.cleared')}</span>
          <button type="button" onClick={undoClear} className="min-h-[44px] rounded-xl px-3 text-sm font-semibold text-teal-300 hover:bg-white/5">{t('notifications.undo')}</button>
        </div>
      )}
    </div>
  );
}
