import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Download, RefreshCw, ShieldAlert, Undo2, X } from 'lucide-react';
import { approveReferral, clawbackReferral, listReferralQueue, rejectReferral } from '../../services/referralService.js';
import { classNames } from '../../lib/format.js';
import { exportCsv } from '../../lib/csv.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useTabParam } from '../../lib/useTabParam.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Loading from '../../components/ui/Loading.jsx';
import {
  BTN, CHIP, CHIP_TONE, FactRow, PageNav, QueuePanel, QueueTabs, RowCard, RowList, SearchBox,
} from '../../components/admin/WorkQueue.jsx';

const RISK_TONE = { high: CHIP_TONE.red, medium: CHIP_TONE.amber, low: CHIP_TONE.green };
const fmtDate = (ms) => (ms ? new Date(ms).toLocaleDateString('en-IN') : '—');
const Dot = () => <span className="text-gray-600" aria-hidden="true">·</span>;

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 250;

/* Background-check signals. goodWhenTrue=true → green when present; false → red when present. */
const SIGNALS = [
  ['activated', 'Activated', true],
  ['sameDevice', 'Same device', false],
  ['sameIp', 'Same IP', false],
  ['velocityHigh', 'High velocity', false],
];

const isOpen = (r) => r.status === 'pending' || r.status === 'held' || r.status === 'qualified';
const canClawback = (r) => r.status === 'rewarded' || r.status === 'qualified';

const AUTO_REASONS = {
  high_risk: 'High risk',
  medium_risk: 'Needs review',
  cap_reached: 'Cap reached',
  referee_suspended: 'Referee suspended',
  listing_taken_down: 'Listing taken down',
  verification_revoked: 'Verification revoked',
  listing_not_live: 'Listing not live',
  self_dealing: 'Self-dealing',
};
const autoReasonLabel = (code) => AUTO_REASONS[code] || code.replace(/_/g, ' ');
const TRACK_LABELS = { owner: 'Owner referral', seeker: 'Seeker referral' };

/* Risk is a separate field, so **High risk** is a risk filter rather than a status one;
   a status tab for it would stay permanently empty. */
const TABS = [
  { key: 'held', label: 'Held', count: 'held', filter: { status: 'held' }, match: (r) => r.status === 'held' },
  { key: 'pending', label: 'Pending', count: 'pending', filter: { status: 'pending' }, match: (r) => r.status === 'pending' },
  { key: 'high-risk', label: 'High risk', count: 'highRisk', filter: { risk: 'high' }, match: (r) => r.risk === 'high' },
  { key: 'rewarded', label: 'Rewarded', count: 'rewarded', filter: { status: 'qualified,rewarded' }, match: (r) => r.status === 'qualified' || r.status === 'rewarded' },
  { key: 'refused', label: 'Refused', count: 'refused', filter: { status: 'rejected,clawed-back' }, match: (r) => r.status === 'rejected' || r.status === 'clawed-back' },
  { key: 'all', label: 'All', count: 'all', filter: {}, match: () => true },
];
const TAB_KEYS = TABS.map((t) => t.key);
const NOTE = 'Rewards are decided automatically. Held rows release or reject on their own once the hold ends; use this desk to audit, override or claw back.';

/* Tab totals after one row changed from `before` to `after`. */
const shiftCounts = (counts, before, after) => {
  const next = { ...counts };
  for (const t of TABS) {
    if (next[t.count] == null) continue;
    next[t.count] += (t.match(after) ? 1 : 0) - (t.match(before) ? 1 : 0);
  }
  return next;
};

export default function OpsReferrals() {
  const { toast } = useToast();
  const [state, setState] = useState({ status: 'loading', items: [], total: 0, error: '' });
  const [counts, setCounts] = useState({});
  const [tab, setTab] = useTabParam(TAB_KEYS, 'held');
  const [page, setPage] = useState(0);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [reloading, setReloading] = useState(false);
  const [nonce, setNonce] = useState(0);
  const wantCounts = useRef(true);
  const busy = useRef(false);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => { setQuery(q.trim()); setPage(0); }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(() => {
    const { filter } = TABS.find((t) => t.key === tab);
    const withCounts = wantCounts.current;
    let live = true;
    setReloading(true);
    listReferralQueue({ ...filter, q: query, page, size: PAGE_SIZE, counts: withCounts })
      .then((res) => {
        if (!live) return;
        if (!res.items.length && page > 0 && res.total > 0) {
          setPage(Math.ceil(res.total / PAGE_SIZE) - 1);
          return;
        }
        setState({ status: 'ready', items: res.items, total: res.total, error: '' });
        setReloading(false);
        if (withCounts) {
          wantCounts.current = false;
          setCounts(res.counts || {});
        }
      })
      .catch((e) => {
        if (!live) return;
        setState({ status: 'error', items: [], total: 0, error: e.message || 'Could not read the queue.' });
        setReloading(false);
      });
    return () => { live = false; };
  }, [tab, page, query]);

  useEffect(load, [load, nonce]);

  const reload = () => { wantCounts.current = true; setNonce((n) => n + 1); };
  const switchTab = (key) => { setTab(key); setPage(0); };

  const doAction = async (r, act) => {
    if (busy.current) return;
    busy.current = true;
    setBusyId(r.id);
    try {
      let decided;
      if (act === 'approve') {
        let reason;
        if (r.status === 'rejected') {
          reason = (window.prompt('Reason for reversing this rejection (required):') || '').trim();
          if (!reason) return;
        }
        decided = await approveReferral(r.id, reason);
        toast('Approved — reward released');
      } else if (act === 'reject') {
        decided = await rejectReferral(r.id);
        toast('Rejected', 'error');
      } else {
        decided = await clawbackReferral(r.id);
        toast('Reward clawed back', 'error');
      }
      if (!decided) { reload(); return; }
      // The decision answers with the row: patch it in place instead of re-reading the page.
      const stays = TABS.find((t) => t.key === tab).match(decided);
      setState((s) => ({
        ...s,
        items: stays ? s.items.map((x) => (x.id === r.id ? decided : x)) : s.items.filter((x) => x.id !== r.id),
        total: stays ? s.total : Math.max(0, s.total - 1),
      }));
      setCounts((c) => shiftCounts(c, r, decided));
    } catch (e) {
      // The server's own sentence names the refusal; paraphrasing it here would lose that.
      toast(e.message || 'That decision was refused.', 'error');
    } finally {
      busy.current = false;
      setBusyId(null);
    }
  };

  const rows = state.items;
  const paging = {
    page: page + 1,
    pageCount: Math.max(1, Math.ceil(state.total / PAGE_SIZE)),
    total: state.total,
    size: PAGE_SIZE,
    onPage: (p) => setPage(p - 1),
    stale: reloading,
  };

  /* No offline fallback: referral decisions release money, and the offline store disagreed with the
     server about what a referral even is. The error branch below is the only failure left. */
  if (state.status === 'error') {
    return (
      <div>
        <PageHeader title="Referral audit" subtitle="Rewards are automatic; override or claw back here." />
        <div className="dz-card flex items-start gap-3 p-6 text-sm text-gray-300">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
          <div>
            <div className="font-semibold text-gray-100">The queue could not be read.</div>
            <p className="mt-1 max-w-2xl text-gray-400">{state.error}</p>
            <button type="button" onClick={reload} className="dz-btn dz-btn-ghost mt-3">
              <RefreshCw className="h-4 w-4" />Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (state.status === 'loading') return <Loading />;

  const doExport = () => exportCsv('draazy-referrals.csv',
    ['ID', 'Referrer', 'Referred', 'Track', 'Reward', 'Amount', 'Risk', 'Status', 'Auto reason', 'Hold until', 'Same device', 'Same IP', 'High velocity', 'Redeemed'],
    rows.map((r) => [r.id, r.referrer, r.referred, r.track || 'contacts only', r.reward, r.rewardAmount, r.risk, r.status, r.autoReason ? autoReasonLabel(r.autoReason) : '', r.holdUntil ? fmtDate(r.holdUntil) : '', r.sameDevice ? 'Yes' : 'No', r.sameIp ? 'Yes' : 'No', r.velocityHigh ? 'Yes' : 'No', fmtDate(r.at)]));

  const decisions = (r) => {
    const off = busyId === r.id;
    const rejected = r.status === 'rejected';
    return (
      <>
        {(isOpen(r) || rejected) && (
          <button type="button" disabled={off} onClick={() => doAction(r, 'approve')} className={classNames(BTN.primary, off && 'opacity-50')}>
            <Check className="h-3.5 w-3.5" />{rejected ? 'Appeal: approve' : 'Approve'}
          </button>
        )}
        {isOpen(r) && <button type="button" disabled={off} onClick={() => doAction(r, 'reject')} className={classNames(BTN.ghost, off && 'opacity-50')}><X className="h-3.5 w-3.5" />Reject</button>}
        {canClawback(r) && <button type="button" disabled={off} onClick={() => doAction(r, 'clawback')} className={classNames(BTN.danger, off && 'opacity-50')}><Undo2 className="h-3.5 w-3.5" />Clawback</button>}
      </>
    );
  };

  return (
    <div>
      <PageHeader title="Referral audit" subtitle="Rewards are automatic; override or claw back here." />

      <QueueTabs
        label="Referral queues"
        active={tab}
        onChange={switchTab}
        tabs={TABS.map((t) => ({ key: t.key, label: t.label, count: counts[t.count] ?? null }))}
      />

      <QueuePanel
        active={tab}
        note={NOTE}
        toolbar={(
          <>
            <SearchBox value={q} onChange={setQ} placeholder="Referrer, referred or ID" label="Search referrals" />
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button type="button" onClick={reload} className={BTN.ghost}><RefreshCw className="h-3.5 w-3.5" />Refresh</button>
              <button type="button" onClick={doExport} className={BTN.ghost}><Download className="h-3.5 w-3.5" />Export CSV</button>
              <PageNav {...paging} />
            </div>
          </>
        )}
        footer={paging.pageCount > 1 ? <PageNav {...paging} /> : null}
      >
        <RowList isEmpty={!rows.length} empty={query ? 'No referrals match this search.' : 'No referrals here.'}>
          {rows.map((r) => (
            <RowCard
              key={r.id}
              id={r.id}
              title={<>{r.referrer} <span className="font-normal text-gray-500">→</span> {r.referred}</>}
              badges={<><Badge status={r.status} /><span className={classNames(CHIP, 'capitalize', RISK_TONE[r.risk] || CHIP_TONE.neutral)}>{r.risk} risk</span></>}
              meta={<><span className="font-mono">{r.id}</span><Dot /><span>{TRACK_LABELS[r.track] || 'Contacts-only referral'}</span><Dot /><span>Redeemed {fmtDate(r.at)}</span></>}
              facts={(
                <>
                  <FactRow label="Mobiles"><span className="col-span-full tabular-nums">{r.referrerMobile || '—'} → {r.referredMobile || '—'}</span></FactRow>
                  <FactRow label="Reward"><span className="col-span-full">{r.reward || '—'}</span></FactRow>
                  {r.holdUntil ? <FactRow label="Held until"><span className="col-span-full">{fmtDate(r.holdUntil)}</span></FactRow> : null}
                  {r.autoReason ? <FactRow label="Auto reason"><span className="col-span-full">{autoReasonLabel(r.autoReason)}</span></FactRow> : null}
                </>
              )}
              chips={SIGNALS.map(([key, label, goodWhenTrue]) => {
                const good = goodWhenTrue ? !!r[key] : !r[key];
                return (
                  <span key={key} className={classNames(CHIP, 'gap-1', good ? CHIP_TONE.green : CHIP_TONE.red)}>
                    {good ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}{label}
                  </span>
                );
              })}
              primary={decisions(r)}
            />
          ))}
        </RowList>
      </QueuePanel>
    </div>
  );
}
