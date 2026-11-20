import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Plus, Search, X } from 'lucide-react';
import { claimLead } from '../../../services/leadService.js';
import { useToast } from '../../../context/ToastContext.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';
import { canWriteModule, hasPermission } from '../../../lib/adminModules.js';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import Loading from '../../../components/ui/Loading.jsx';
import {
  BTN, Chips, PageNav, QueuePanel, QueueTabs, RowList,
} from '../../../components/admin/WorkQueue.jsx';
import { classNames } from '../../../lib/format.js';
import AddLeadModal from './AddLeadModal.jsx';
import LeadCard from './LeadCard.jsx';
import LeadDetail from './LeadDetail.jsx';
import PerformanceTab from './PerformanceTab.jsx';
import { PAGE_SIZE, useLeadList } from './useLeadList.js';
import { STAGE_FILTERS, TYPE_FILTERS, leadError } from './leadsFormat.js';

const MIN_SEARCH = 3;
const EMPTY = {
  mine: 'No leads yet. Claim one from the Common pool.',
  pool: 'The pool is empty — every lead has someone on it.',
  all: 'No leads match.',
  search: 'No lead found with that name or number.',
};

function useDebounced(value, ms) {
  const [out, setOut] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setOut(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return out;
}

export default function AdminLeads() {
  const { toast } = useToast();
  const { user } = useAuth();
  const canWrite = canWriteModule(user, 'leads');
  const canManage = hasPermission(user, 'leads:manage');
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [stage, setStage] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(0);
  const [adding, setAdding] = useState(false);
  const [claiming, setClaiming] = useState(null);

  const term = useDebounced(q.trim(), 250);
  const searching = term.length >= MIN_SEARCH && q.trim().length >= MIN_SEARCH;
  const requested = params.get('tab');
  const keys = canManage ? ['mine', 'pool', 'all', 'performance'] : ['mine', 'pool'];
  const tab = keys.includes(requested) ? requested : 'mine';
  const view = searching ? 'search' : tab;
  const openId = params.get('lead');

  const { state, counts, reloading, reload } = useLeadList({
    view,
    q: searching ? term : undefined,
    stage: view === 'all' ? stage : undefined,
    type: type || undefined,
    page,
    enabled: view !== 'performance',
  });

  const switchTab = (key) => {
    setParams({ tab: key }, { replace: true });
    setPage(0);
  };
  const openLead = (id) => setParams((p) => { const n = new URLSearchParams(p); n.set('lead', id); return n; });
  const closeLead = () => setParams((p) => { const n = new URLSearchParams(p); n.delete('lead'); return n; }, { replace: true });

  const claim = async (lead) => {
    if (claiming) return;
    setClaiming(lead.id);
    try {
      await claimLead(lead.id);
      toast('Lead claimed');
    } catch (e) {
      toast(leadError(e), 'error');
    } finally {
      setClaiming(null);
      reload();
    }
  };

  const tabs = [
    { key: 'mine', label: 'My leads', count: counts?.mine ?? undefined },
    { key: 'pool', label: 'Common pool', count: counts?.pool ?? undefined },
    ...(canManage ? [{ key: 'all', label: 'All' }, { key: 'performance', label: 'Performance' }] : []),
  ];

  const note = !searching && tab === 'mine' && counts?.due ? `${counts.due} due now` : undefined;

  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle="Anyone can add or update a lead. Take one from the Common pool, reach out, log what happened."
        actions={canWrite ? (
          <button type="button" onClick={() => setAdding(true)} className={classNames(BTN.primary, 'min-h-[44px]')} data-testid="lead-add">
            <Plus className="h-4 w-4" aria-hidden="true" />Add lead
          </button>
        ) : null}
      />

      <label className="relative mb-3 block">
        <span className="sr-only">Find by name or mobile</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
        <input
          type="search"
          inputMode="search"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(0); }}
          placeholder="Find by name or mobile"
          className="dz-input min-h-[44px] w-full !pl-9 !pr-11 text-base"
          data-testid="lead-search"
        />
        {q ? (
          <button type="button" aria-label="Clear search" onClick={() => { setQ(''); setPage(0); }} className="absolute right-0 top-1/2 grid h-11 w-11 -translate-y-1/2 cursor-pointer place-items-center text-gray-400">
            <X className="h-4 w-4" />
          </button>
        ) : null}
        {q.trim().length > 0 && !searching ? <span className="mt-1 block text-xs text-gray-400">Type at least {MIN_SEARCH} characters.</span> : null}
      </label>

      <QueueTabs label="Lead queues" idPrefix="leads" tabs={tabs} active={searching ? '' : tab} onChange={(k) => { setQ(''); switchTab(k); }} />

      {view === 'performance' ? (
        <QueuePanel idPrefix="leads" active={tab}><PerformanceTab /></QueuePanel>
      ) : (
        <QueuePanel
          idPrefix="leads"
          active={searching ? undefined : tab}
          note={searching ? `Results for “${term}”` : note}
          noteTestId="lead-note"
          toolbar={(
            <div className="space-y-2">
              <Chips label="Filter by type" options={TYPE_FILTERS} value={type} onChange={(v) => { setType(v); setPage(0); }} />
              {view === 'all' ? <Chips label="Stage" options={STAGE_FILTERS} value={stage} onChange={(v) => { setStage(v); setPage(0); }} /> : null}
            </div>
          )}
          footer={state.total > PAGE_SIZE ? (
            <PageNav
              page={page + 1}
              pageCount={Math.ceil(state.total / PAGE_SIZE)}
              total={state.total}
              size={PAGE_SIZE}
              onPage={(p) => setPage(p - 1)}
              stale={reloading}
            />
          ) : null}
        >
          {state.status === 'loading' ? <div className="p-6"><Loading /></div> : null}
          {state.status === 'error' ? <p className="p-6 text-sm text-rose-200" role="alert">{state.error}</p> : null}
          {state.status === 'ready' ? (
            <RowList isEmpty={!state.items.length} empty={EMPTY[view]}>
              {state.items.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  onOpen={openLead}
                  onClaim={claim}
                  busy={claiming === lead.id}
                  canClaim={canWrite && lead.stage !== 'do-not-call'}
                />
              ))}
            </RowList>
          ) : null}
        </QueuePanel>
      )}

      {adding ? (
        <AddLeadModal
          toast={toast}
          onClose={() => setAdding(false)}
          onAdded={(lead) => { setAdding(false); reload(); openLead(lead.id); }}
        />
      ) : null}
      {openId ? <LeadDetail key={openId} id={openId} canWrite={canWrite} canManage={canManage} toast={toast} onClose={closeLead} onChanged={reload} /> : null}
    </div>
  );
}
