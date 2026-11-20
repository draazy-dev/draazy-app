import { useEffect, useState } from 'react';
import { Chips } from '../../../components/admin/WorkQueue.jsx';
import Loading from '../../../components/ui/Loading.jsx';
import { fmtINR } from '../../../lib/format.js';
import { getLeadPerformance } from '../../../services/leadService.js';
import { leadError } from './leadsFormat.js';

const RANGES = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
];

const hours = (v) => (v == null ? '—' : `${Number(v).toFixed(1)} h`);

function Stat({ label, value }) {
  return (
    <div>
      <dt className="text-[11px] text-gray-400">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums text-white">{value}</dd>
    </div>
  );
}

function PerfCard({ row, name, testId }) {
  return (
    <li className="list-card glass rounded-2xl p-4" data-testid={testId}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="min-w-0 truncate text-[15px] font-bold text-white" data-testid="perf-name">{name}</h3>
        <span className="shrink-0 text-sm font-semibold text-emerald-200" data-testid="perf-conversions">
          {row.conversions} converted
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2.5">
        <Stat label="Rate" value={`${Number(row.conversionRate ?? 0).toFixed(1)}%`} />
        <Stat label="Revenue" value={fmtINR(row.revenue ?? 0)} />
        <Stat label="Open" value={row.openLeads} />
        <Stat label="Claimed" value={row.claimed} />
        <Stat label="Contacted" value={row.contacted} />
        <Stat label="Attempts" value={row.attempts} />
        <Stat label="First contact" value={hours(row.avgFirstContactHours)} />
      </dl>
    </li>
  );
}

export default function PerformanceTab() {
  const [days, setDays] = useState('30');
  const [state, setState] = useState({ status: 'loading', data: null, error: '' });

  useEffect(() => {
    let live = true;
    getLeadPerformance(Number(days))
      .then((data) => live && setState({ status: 'ready', data, error: '' }))
      .catch((e) => live && setState({ status: 'error', data: null, error: leadError(e) }));
    return () => { live = false; };
  }, [days]);

  const changeDays = (v) => {
    setState((s) => ({ ...s, status: 'loading' }));
    setDays(v);
  };

  return (
    <div data-testid="lead-performance">
      <div className="border-b border-white/10 p-3">
        <Chips label="Period" options={RANGES} value={days} onChange={changeDays} />
      </div>
      {state.status === 'loading' ? <div className="p-6"><Loading /></div> : null}
      {state.status === 'error' ? <p className="p-6 text-sm text-rose-200" role="alert">{state.error}</p> : null}
      {state.status === 'ready' ? (
        <ul className="space-y-3 p-3">
          {state.data.totals ? <PerfCard row={state.data.totals} name="Everyone" testId="perf-totals" /> : null}
          {state.data.rows.map((r) => <PerfCard key={r.staffId} row={r} name={r.staffName} testId="perf-row" />)}
          {!state.data.rows.length ? <li className="p-6 text-center text-sm text-gray-400">No lead activity in this period.</li> : null}
        </ul>
      ) : null}
    </div>
  );
}
