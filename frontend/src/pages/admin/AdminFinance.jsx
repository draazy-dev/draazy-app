import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, ChevronRight, Download, Eye, IndianRupee, RefreshCw, Undo2, Wallet } from 'lucide-react';
import { getFinanceOverview, getFinanceSeries, listFinanceTransactions } from '../../services/financeService.js';
import { fmtINR, fmtNum, classNames } from '../../lib/format.js';
import { exportCsv } from '../../lib/csv.js';
import { useTabParam } from '../../lib/useTabParam.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Loading from '../../components/ui/Loading.jsx';
import Select from '../../components/ui/Select.jsx';
import { BarChart, PALETTE } from '../../components/charts/index.jsx';
import { cssColour, useIsLightTheme } from '../../lib/themeColour';
import {
  BTN, CHIP, CHIP_TONE, Chips, DATE_CHIPS, IconAction, PageNav, QueuePanel, QueueTabs, RowCard, RowList, SearchBox,
  useClientPaging,
} from '../../components/admin/WorkQueue.jsx';

/** The widest window the console offers, and therefore what it fetches once and slices locally. */
const MAX_MONTHS = 24;

/** Search and the type filter are server-side; CSV export walks every page, not just the window. */
const LEDGER_PAGE_SIZE = 100;
const TX_PER_PAGE = 20;

/** Must match `AdminFinanceService.LEDGER_KINDS`: an unknown kind is a 400, not an empty page. */
const KINDS = {
  subscription: { label: 'Subscription', tone: CHIP_TONE.teal },
  service: { label: 'Service', tone: CHIP_TONE.sky },
  refund: { label: 'Refund', tone: CHIP_TONE.red },
};

const KIND_CHIPS = [
  { value: '', label: 'All' },
  { value: 'subscription', label: 'Subscriptions' },
  { value: 'service', label: 'Services' },
  { value: 'refund', label: 'Refunds' },
];

const Dot = () => <span className="text-gray-600" aria-hidden="true">·</span>;
const CYCLE_ABBR = { yearly: 'yr', quarterly: 'qtr' };
const termLabel = (p) => (p.termDays ? ` / ${p.termDays} days` : p.billingCycle ? `/${CYCLE_ABBR[p.billingCycle] ?? 'mo'}` : '');

/** `fmtINR` has no sign handling, so a refund would otherwise read `₹-999`. */
const money = (n) => (n < 0 ? `−${fmtINR(-n)}` : fmtINR(n));
const netOf = (m) => m.subscriptions + m.services - m.refunds;

async function fetchWholeLedger(filters) {
  const rows = [];
  for (let page = 0; ; page += 1) {
    const res = await listFinanceTransactions({ ...filters, page, size: LEDGER_PAGE_SIZE });
    rows.push(...res.items);
    if (res.items.length < LEDGER_PAGE_SIZE || rows.length >= res.total) return rows;
  }
}

function pct(cur, prev) {
  if (!Number.isFinite(cur) || !Number.isFinite(prev) || !prev) return null;
  const d = Math.round((cur - prev) / Math.abs(prev) * 1000) / 10;
  return { val: (d >= 0 ? '+' : '') + d + '%', up: d >= 0 };
}

function monthLabel(iso) {
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? String(iso)
    : d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}

function Attention({ attention: a }) {
  const items = [
    a.refundRequests > 0 && { key: 'refunds', to: '/admin/refunds', text: `${fmtNum(a.refundRequests)} refund request${a.refundRequests === 1 ? '' : 's'} to decide`, amount: a.refundRequestAmount },
    a.serviceRefunds > 0 && { key: 'service-refunds', to: '/admin/rent-agreement', text: `${fmtNum(a.serviceRefunds)} service refund${a.serviceRefunds === 1 ? '' : 's'} to decide`, amount: a.serviceRefundAmount },
    a.openDisputes > 0 && { key: 'disputes', to: '/admin/refunds?tab=disputes', text: `${fmtNum(a.openDisputes)} open payment dispute${a.openDisputes === 1 ? '' : 's'}`, amount: a.openDisputeAmount },
  ].filter(Boolean);
  if (!items.length) return null;
  return (
    <div className="mb-5 rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-3" data-testid="finance-attention">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-amber-200">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />Needs attention
      </h3>
      <ul>
        {items.map((i) => (
          <li key={i.key}>
            <Link to={i.to} className="flex items-center justify-between gap-3 rounded-lg px-1 py-1.5 text-sm text-amber-100/90 hover:bg-white/5">
              <span>{i.text}</span>
              <span className="flex items-center gap-1 font-semibold tabular-nums">{fmtINR(i.amount)}<ChevronRight className="h-4 w-4" aria-hidden="true" /></span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FlowRow({ label, hint, amount, minus, total }) {
  return (
    <div className={classNames('flex items-baseline justify-between gap-3 border-b py-2 text-sm', total ? 'border-white/15 font-bold' : 'border-white/5')}>
      <div>
        <div className={total ? '' : 'text-gray-300'}>{label}</div>
        {hint ? <div className="text-[11px] text-gray-500">{hint}</div> : null}
      </div>
      <span className={classNames('tabular-nums', minus && amount > 0 && 'text-red-400')}>{money(minus ? -amount : amount)}</span>
    </div>
  );
}

export default function AdminFinance() {
  /* Chart options below read cssColour at render, so a theme flip must re-render them. */
  useIsLightTheme();
  const [finance, setFinance] = useState(null);
  const [series, setSeries] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [range, setRange] = useState(12);
  const [txQ, setTxQ] = useState('');
  const [txTerm, setTxTerm] = useState('');
  const [txKind, setTxKind] = useState('');
  const [txDays, setTxDays] = useState('');
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useTabParam(['overview', 'transactions'], 'overview');
  const [overviewFailed, setOverviewFailed] = useState(false);
  const [seriesFailed, setSeriesFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [ledgerAttempt, setLedgerAttempt] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    /* `allSettled`, not `all`: the two reads feed independent panels, and one failing must not blank the other. */
    Promise.allSettled([getFinanceOverview(), getFinanceSeries(MAX_MONTHS)]).then(([f, sr]) => {
      if (!alive) return;
      setFinance(f.status === 'fulfilled' ? f.value : null);
      setOverviewFailed(f.status !== 'fulfilled');
      setSeries(sr.status === 'fulfilled' ? sr.value : []);
      setSeriesFailed(sr.status !== 'fulfilled');
    });
    return () => { alive = false; };
  }, [attempt]);

  const retryOverview = () => { setOverviewFailed(false); setAttempt((n) => n + 1); };

  useEffect(() => {
    const id = setTimeout(() => setTxTerm(txQ.trim()), 300);
    return () => clearTimeout(id);
  }, [txQ]);

  const txFilters = useMemo(() => ({ kind: txKind, days: txDays, q: txTerm }), [txKind, txDays, txTerm]);
  const ledgerKey = `${txKind}|${txDays}|${txTerm}`;

  useEffect(() => {
    let alive = true;
    const key = `${txFilters.kind}|${txFilters.days}|${txFilters.q}`;
    listFinanceTransactions({ ...txFilters, size: LEDGER_PAGE_SIZE })
      .then((res) => { if (alive) setLedger({ key, items: res.items, total: res.total }); })
      .catch(() => { if (alive) setLedger({ key, items: [], total: 0, failed: true }); });
    return () => { alive = false; };
  }, [txFilters, ledgerAttempt]);

  const slicedSeries = useMemo(() => (series || []).slice(-range), [series, range]);

  const ledgerLoading = !ledger || ledger.key !== ledgerKey;
  const txRows = ledger?.items || [];
  const txTotal = ledger?.total || 0;
  const { items: pageTx, paging } = useClientPaging(txRows, TX_PER_PAGE, ledgerKey);
  const retryLedger = () => { setLedger(null); setLedgerAttempt((n) => n + 1); };

  if (overviewFailed) {
    return (
      <div>
        <PageHeader title="Finance" subtitle="What Draazy collected, refunded and kept." />
        <div role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
          Could not load the finance overview.{' '}
          <button type="button" onClick={retryOverview} className="underline underline-offset-2">Retry</button>
        </div>
      </div>
    );
  }
  if (!finance) return <Loading />;

  const { mrr, plans, month, attention } = finance;
  const all = series || [];
  const lastMonth = all[all.length - 2];
  const netDelta = lastMonth ? pct(month.net, netOf(lastMonth)) : null;
  const windowNet = slicedSeries.reduce((s, m) => s + netOf(m), 0);
  const activePlans = plans.reduce((s, p) => s + p.active, 0);

  const KPIS = [
    { label: 'Net revenue', sub: 'This month, after refunds', value: money(month.net), delta: netDelta, icon: IndianRupee },
    { label: 'Collected', sub: `${fmtNum(month.payments)} payment${month.payments === 1 ? '' : 's'} this month`, value: fmtINR(month.collected), icon: Wallet },
    { label: 'Refunded', sub: 'This month', value: fmtINR(month.refunded), icon: Undo2 },
    { label: 'MRR', sub: `${fmtNum(activePlans)} active paid plan${activePlans === 1 ? '' : 's'}`, value: fmtINR(mrr), icon: RefreshCw },
  ];

  const doRevenueExport = () => exportCsv(
    'draazy-revenue.csv',
    ['Month', 'Subscription fees', 'Service fees', 'Refunded fees', 'Net revenue'],
    all.map((m) => [m.month, m.subscriptions, m.services, m.refunds, netOf(m)]),
  );

  const doTxExport = async () => {
    setExporting(true);
    setExportFailed(false);
    try {
      /* The live box, not the debounced term: the CSV must match what the operator typed. */
      const rows = await fetchWholeLedger({ ...txFilters, q: txQ.trim() });
      exportCsv(
        'draazy-transactions.csv',
        ['Number', 'Date', 'Party', 'Type', 'Amount', 'Draazy fee'],
        rows.map((r) => [r.number, r.date, r.party, KINDS[r.kind]?.label || r.kind, r.amount, r.fee]),
      );
    } catch {
      setExportFailed(true);
    } finally {
      setExporting(false);
    }
  };

  const kindChip = (kind) => (
    <span className={classNames(CHIP, KINDS[kind]?.tone || CHIP_TONE.neutral)}>{KINDS[kind]?.label || kind}</span>
  );

  const txRow = (r) => (
    <RowCard
      key={r.id}
      id={r.id}
      title={r.party}
      badges={kindChip(r.kind)}
      meta={<><span className="font-mono">{r.number}</span><Dot /><span>{r.date}</span></>}
      figure={(
        <div className="text-right max-md:text-left">
          <div className={classNames('text-lg font-bold tabular-nums', r.amount < 0 && 'text-red-400')}>{money(r.amount)}</div>
          <div className="text-[11px] text-gray-500">Fee {money(r.fee)}</div>
        </div>
      )}
      icons={<IconAction label={`Open ${r.number}`} icon={Eye} onClick={() => setDetail(r)} />}
    />
  );
  const ledgerTruncated = txTotal > txRows.length;
  const axis = { ticks: { color: cssColour('slate-400') }, grid: { color: cssColour('white', 0.05) } };

  return (
    <div>
      <PageHeader title="Finance" subtitle="What Draazy collected, refunded and kept." actions={
        <button type="button" onClick={doRevenueExport} disabled={seriesFailed} className="dz-btn dz-btn-ghost"><Download className="h-4 w-4" />Revenue CSV</button>
      } />

      <QueueTabs
        tabs={[{ key: 'overview', label: 'Overview', count: null }, { key: 'transactions', label: 'Transactions', count: ledger && !ledger.failed ? txTotal : null }]}
        active={tab}
        onChange={setTab}
        label="Finance views"
        idPrefix="finance"
      />

      {tab === 'overview' ? (
        <div id="finance-panel" role="tabpanel" aria-labelledby="finance-tab-overview">
          <Attention attention={attention} />

          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {KPIS.map((k) => (
              <div key={k.label} className="dz-card p-3" data-testid="finance-kpi">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-teal/15 text-brand-teal"><k.icon className="h-3.5 w-3.5" /></span>
                <div className="mt-2 text-xl font-extrabold tabular-nums">{k.value}</div>
                <div className="mt-0.5 text-xs font-medium text-gray-300">{k.label}</div>
                <div className="text-[11px] text-gray-500">
                  {k.delta ? <span className={k.delta.up ? 'text-emerald-300' : 'text-red-400'}>{k.delta.val} MoM · </span> : null}
                  {k.sub}
                </div>
              </div>
            ))}
          </div>

          <div className="mb-5 grid gap-4 lg:grid-cols-[2fr_1fr]">
            <div className="dz-card p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-bold">Revenue by month</h3>
                  <p className="text-xs text-gray-500" data-testid="finance-window-net">{money(windowNet)} net over {range} months</p>
                </div>
                <Select
                  size="sm"
                  value={String(range)}
                  onChange={(v) => setRange(+v)}
                  ariaLabel="Revenue window"
                  options={[
                    { value: '6', label: '6 months' },
                    { value: '12', label: '12 months' },
                    { value: '24', label: '24 months' },
                  ]}
                />
              </div>
              {seriesFailed ? (
                <p role="alert" className="mb-2 text-sm text-red-300">
                  Could not load the monthly figures.{' '}
                  <button type="button" onClick={retryOverview} className="underline underline-offset-2">Retry</button>
                </p>
              ) : null}
              <BarChart
                labels={slicedSeries.map((m) => monthLabel(m.month))}
                datasets={[
                  { label: 'Subscriptions', data: slicedSeries.map((m) => m.subscriptions), stack: 's', color: PALETTE[5] },
                  { label: 'Services', data: slicedSeries.map((m) => m.services), stack: 's', color: PALETTE[1] },
                  { label: 'Refunds', data: slicedSeries.map((m) => -m.refunds), stack: 's', color: PALETTE[0] },
                ]}
                height={260}
                options={{ scales: { x: { ...axis, stacked: true }, y: { ...axis, stacked: true, ticks: { ...axis.ticks, callback: (v) => money(v) } } } }}
              />
              <p className="mt-2 text-xs text-gray-500">Draazy&apos;s fees only. Stamp duty and registration are passed on, not revenue.</p>
            </div>

            <div className="dz-card p-4" data-testid="finance-month">
              <h3 className="mb-1 font-bold">This month</h3>
              <FlowRow label="Collected" hint="Everything customers paid" amount={month.collected} />
              <FlowRow label="Refunded" amount={month.refunded} minus />
              <FlowRow label="Pass-through" hint="Stamp duty and registration, paid on to the government" amount={month.passThrough} minus />
              <FlowRow label="Net revenue" amount={month.net} total />
            </div>
          </div>

          <div className="dz-card p-4 lg:max-w-xl">
            <h3 className="font-bold">Active paid plans</h3>
            <p className="mb-2 text-xs text-gray-500">What the current book bills each month.</p>
            {plans.length === 0 ? (
              <p className="py-2 text-sm text-gray-500">No active paid plans.</p>
            ) : plans.map((p) => (
              /* Keyed on price too: a repriced plan returns one line per price cohort, so the name is not unique. */
              <div key={`${p.name}:${p.price}`} className="flex items-center justify-between border-b border-white/5 py-2 text-sm">
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-gray-500">{fmtNum(p.active)} active · {fmtINR(p.price)}{termLabel(p)}</div>
                </div>
                <div className="font-semibold tabular-nums">{fmtINR(p.monthlyValue)}</div>
              </div>
            ))}
            <div className="flex justify-between pt-2 text-sm font-bold">
              <span className="text-gray-400">MRR</span><span className="tabular-nums">{fmtINR(mrr)}</span>
            </div>
          </div>
        </div>
      ) : (
        <QueuePanel
          idPrefix="finance"
          active={tab}
          note={ledgerTruncated
            ? `Showing the newest ${fmtNum(txRows.length)} of ${fmtNum(txTotal)} matching documents. The CSV has all of them.`
            : 'Every invoice and credit note, newest first.'}
          noteTestId={ledgerTruncated ? 'ledger-window' : undefined}
          toolbar={(
            <>
              <SearchBox value={txQ} onChange={setTxQ} placeholder="Search name or number…" label="Search name or number" />
              <Chips label="Type" options={KIND_CHIPS} value={txKind} onChange={setTxKind} />
              <Chips label="Date" options={DATE_CHIPS} value={txDays} onChange={setTxDays} />
              <div className="ml-auto flex items-center gap-2">
                {exportFailed ? <span role="alert" className="text-xs text-red-300">Export failed.</span> : null}
                <button type="button" onClick={doTxExport} disabled={exporting} className={BTN.ghost}><Download className="h-3.5 w-3.5" />{exporting ? 'Exporting…' : 'Export CSV'}</button>
                <PageNav {...paging} stale={ledgerLoading} />
              </div>
            </>
          )}
        >
          <RowList
            isEmpty={!txRows.length}
            empty={ledgerLoading ? 'Loading…' : ledger.failed
              ? <span role="alert">Could not load transactions. <button type="button" onClick={retryLedger} className="underline underline-offset-2">Retry</button></span>
              : 'No transactions match.'}
          >
            {pageTx.map(txRow)}
          </RowList>
        </QueuePanel>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? detail.number : ''} size="md">
        {detail ? (
          <dl className="space-y-2 text-sm">
            {[
              ['Date', detail.date],
              ['Party', detail.party],
              ['Type', KINDS[detail.kind]?.label || detail.kind],
              [detail.amount < 0 ? 'Refunded' : 'Paid', money(detail.amount)],
              ['Draazy fee', money(detail.fee)],
              ['Pass-through', money(detail.amount - detail.fee)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-white/5 py-1.5">
                <dt className="text-gray-400">{k}</dt>
                <dd className="font-medium tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </Modal>
    </div>
  );
}