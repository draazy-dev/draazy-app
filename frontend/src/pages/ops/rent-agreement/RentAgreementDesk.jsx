import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, MapPin, RefreshCw } from 'lucide-react';
import { getServiceRequestQueueSummary } from '../../../services/serviceRequestService.js';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import Loading from '../../../components/ui/Loading.jsx';
import { classNames, fmtINR } from '../../../lib/format.js';
import { useTabParam } from '../../../lib/useTabParam.js';
import { BTN, CHIP, CHIP_TONE, Cell, Chips, DATE_CHIPS, FactRow, PageNav, QueueTabs, RowCard, RowList, SearchBox } from '../../../components/admin/WorkQueue.jsx';
import AdminServices from '../../admin/AdminServices.jsx';
import useDeskTickets from '../../admin/useDeskTickets.js';
import AgeTone from '../service-queue/AgeTone.jsx';
import { OverdueToggle, stageTabs, useQueue } from '../service-queue/deskQueue.jsx';
import RaCaseModal from './RaCaseModal.jsx';
import { STAGES, caseSummary, nextStep, stagesDone } from './stages.js';

const PAGE_SIZE = 20;
const TABS = stageTabs('case');
const TAB_KEYS = TABS.map((t) => t.key);
const NEXT_TONE = { desk: 'text-teal-200', customer: 'text-gray-400', done: 'text-gray-500' };
const TURN = {
  desk: { label: 'Our move', tone: CHIP_TONE.teal },
  customer: { label: 'With customer', tone: CHIP_TONE.sky },
  done: { label: 'Closed', tone: CHIP_TONE.neutral },
};

export default function RentAgreementDesk() {
  const [tab, setTab] = useTabParam(TAB_KEYS, 'pickup');
  const [q, setQ] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [days, setDays] = useState('');
  const [page, setPage] = useState(1);
  const [pageTab, setPageTab] = useState(tab);
  if (pageTab !== tab) {
    setPageTab(tab);
    setPage(1);
  }

  const [summary, setSummary] = useState(null);
  const tickets = useDeskTickets(summary?.openTickets);
  const summarySeq = useRef(0);
  const summaryKey = useRef('');
  const [reloadToken, setReloadToken] = useState(0);
  const loadSummary = useCallback((polling = false) => {
    const seq = ++summarySeq.current;
    getServiceRequestQueueSummary('rental').then((value) => {
      if (seq !== summarySeq.current) return;
      const key = JSON.stringify(value);
      const moved = key !== summaryKey.current;
      summaryKey.current = key;
      setSummary(value);
      if (polling && moved) setReloadToken((n) => n + 1);
    }, () => {
      if (seq !== summarySeq.current || polling) return;
      summaryKey.current = '';
      setSummary(null);
    });
  }, []);
  useEffect(() => { loadSummary(); }, [loadSummary]);
  const reload = useCallback(() => { loadSummary(); setReloadToken((n) => n + 1); }, [loadSummary]);

  const active = TABS.find((t) => t.key === tab);
  const queue = useQueue({
    type: 'rental', ...active.query, overdue: overdue || undefined, q: q.trim() || undefined, days: days || undefined,
    page: page - 1, size: PAGE_SIZE,
  }, reloadToken);
  const rows = queue.page?.items || [];
  const total = queue.page?.total ?? 0;
  const pageCount = Math.ceil(total / PAGE_SIZE);

  useEffect(() => {
    const poll = () => { if (!document.hidden) loadSummary(true); };
    const t = setInterval(poll, 60_000);
    document.addEventListener('visibilitychange', poll);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', poll); };
  }, [loadSummary]);

  const [open, setOpen] = useState(null);
  const close = useCallback(() => setOpen(null), []);
  const openIndex = rows.findIndex((r) => r.id === open?.id);
  const next = rows.slice(openIndex + 1).find((r) => r.id !== open?.id && (!r.assignedTo || r.assignedToMe)) || null;
  const paging = { page, pageCount, total, size: PAGE_SIZE, onPage: setPage, stale: queue.stale };

  return (
    <div className="pb-20">
      <PageHeader
        title="Rent Agreement"
        subtitle="Paid rent agreements, from pick-up to police intimation."
        actions={<button type="button" onClick={reload} className="dz-btn dz-btn-ghost"><RefreshCw className="h-4 w-4" /> Refresh</button>}
      />

      <QueueTabs
        label="Rent agreement queues"
        idPrefix="ra"
        countTestId="ra-count"
        active={tickets?.on ? 'tickets' : tab}
        onChange={(key) => (key === 'tickets' ? tickets.show() : setTab(key))}
        tabs={[
          ...TABS.map((t) => ({ key: t.key, label: t.label, count: summary ? t.count(summary) : null })),
          ...(tickets ? [tickets.tab] : []),
        ]}
      />

      {tickets?.on ? <AdminServices desk="rental" embedded idPrefix="ra" /> : (
      <section id="ra-panel" role="tabpanel" aria-labelledby={`ra-tab-${tab}`} className="dz-card overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 p-3">
          <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Name, mobile or request id" label="Search name, mobile or request id" className="w-full sm:w-72" />
          <OverdueToggle on={overdue} count={summary?.overdue} onToggle={() => { setOverdue((v) => !v); setPage(1); }} />
          <Chips label="Date" options={DATE_CHIPS} value={days} onChange={(v) => { setDays(v); setPage(1); }} />
          <div className="ml-auto"><PageNav {...paging} /></div>
        </div>

        <div aria-busy={queue.stale || undefined} className={queue.stale ? 'pointer-events-none select-none opacity-50' : undefined}>
          {queue.failed && !queue.stale ? (
            <div className="flex flex-col items-center gap-3 p-10 text-center text-sm text-gray-400" data-testid="queue-error">
              Could not load the rent agreement queue. This is a failed request, not an empty queue.
              <button type="button" onClick={reload} className="dz-btn dz-btn-primary"><RefreshCw className="h-4 w-4" /> Try again</button>
            </div>
          ) : queue.page == null ? <Loading /> : rows.length === 0 ? (
            <p className="p-10 text-center text-sm text-gray-400">{q.trim() || overdue || days ? 'No cases match these filters.' : active.empty}</p>
          ) : (
            <RowList>{rows.map((row) => <CaseRow key={row.id} row={row} onOpen={() => setOpen(row)} />)}</RowList>
          )}
        </div>
        {pageCount > 1 ? <div className="flex justify-end border-t border-white/10 p-3"><PageNav {...paging} /></div> : null}
      </section>
      )}

      <RaCaseModal
        request={open}
        nextId={next?.id || null}
        onNext={() => setOpen(next)}
        onClose={close}
        onChanged={reload}
      />
    </div>
  );
}

function StageLine({ done }) {
  return (
    <span className="ml-auto flex shrink-0 items-center gap-2 text-[11px] text-gray-400">
      <span className="flex gap-1" aria-hidden="true">
        {STAGES.map((label, i) => <span key={label} className={classNames('h-1.5 w-1.5 rounded-full', i < done ? 'bg-teal-500' : 'bg-gray-600')} />)}
      </span>
      {done ? <span>Step {done} of {STAGES.length} · <span className="text-teal-300">{STAGES[done - 1]}</span></span> : <span>Not started</span>}
    </span>
  );
}

function CaseRow({ row, onOpen }) {
  const s = caseSummary(row.details);
  const next = nextStep(row);
  const turn = TURN[next.who];
  const heldByOther = row.assignedTo && !row.assignedToMe;
  return (
    <RowCard
      testId="ra-row"
      id={row.id}
      className={classNames('relative', heldByOther && 'opacity-70')}
      title={s.flat || 'Flat not given'}
      badges={(
        <>
          <span className={classNames(CHIP, turn.tone)}>{turn.label}</span>
          {row.assignedToMe ? <span className={classNames(CHIP, CHIP_TONE.teal)}>Yours</span> : null}
        </>
      )}
      meta={(
        <>
          <MapPin className="h-3.5 w-3.5 shrink-0 text-teal-400" aria-hidden="true" />
          <span className="min-w-0 truncate">{[s.locality, 'Pune'].filter(Boolean).join(', ')}</span>
          <span className="max-sm:hidden text-gray-600" aria-hidden="true">·</span>
          <span className="relative z-10 min-w-0 truncate tabular-nums text-gray-500 max-sm:hidden">{row.id}</span>
        </>
      )}
      facts={(
        <>
          <FactRow label="Parties">
            <Cell className="font-medium text-gray-200 col-span-2 md:col-span-4">{`${s.owner || 'Owner not given'} → ${s.tenants || 'Tenant not given'}`}</Cell>
          </FactRow>
          <FactRow label="Filed by">
            <span className="relative z-10 col-span-2 max-w-full justify-self-start truncate tabular-nums md:col-span-4" data-testid="requester-mobile">
              {[row.requesterName, row.requesterMobile].filter(Boolean).join(' · ') || '—'}
            </span>
          </FactRow>
          <FactRow label="Terms">
            <Cell className="tabular-nums">{s.deposit ? `${fmtINR(s.deposit)} deposit` : 'No deposit given'}</Cell>
            <Cell className="tabular-nums">{s.months ? `${s.months} months` : ''}</Cell>
          </FactRow>
          <FactRow label="Desk">
            <Cell className={row.assignedToMe ? 'text-teal-200' : row.assignedTo ? undefined : 'text-gray-500'}>
              {row.assignedToMe ? 'You' : row.assignedTo || 'Unassigned'}
            </Cell>
            <span className="min-w-0 truncate md:col-span-3"><AgeTone request={row} /></span>
          </FactRow>
        </>
      )}
      chips={(
        <>
          <span className={classNames('min-w-0 text-xs', NEXT_TONE[next.who])}>{next.text}</span>
          {row.status === 'cancelled' ? null : <StageLine done={stagesDone(row)} />}
        </>
      )}
      primary={(
        <>
          <span aria-hidden="true" className={heldByOther ? BTN.ghost : BTN.primary}>Open case <ChevronRight className="h-3.5 w-3.5" /></span>
          <button type="button" onClick={onOpen} aria-label={`Open case ${s.flat || row.id}`} className="absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-400" />
        </>
      )}
      figure={s.rent ? (
        <>
          <div className="text-lg font-extrabold tabular-nums text-white">{fmtINR(s.rent)}<span className="text-sm font-normal text-gray-400">/mo</span></div>
          <div className="mt-0.5 text-[11px] text-gray-400">rent</div>
        </>
      ) : null}
    />
  );
}
