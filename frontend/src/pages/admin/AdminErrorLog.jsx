import { useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import { getErrorLogEntry, listErrorLog, resolveErrorLogEntry } from '../../services/errorLogService.js';
import { useToast } from '../../context/ToastContext.jsx';
import { classNames, fmtAgo, fmtNum } from '../../lib/format.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Loading from '../../components/ui/Loading.jsx';
import Modal from '../../components/ui/Modal.jsx';
import {
  BTN, CHIP, CHIP_TONE, Chips, ClearFilters, IconAction, PageNav, SearchBox,
} from '../../components/admin/WorkQueue.jsx';

const PAGE_SIZE = 20;
const SOURCES = [{ value: '', label: 'All' }, { value: 'api', label: 'API' }, { value: 'job', label: 'Jobs' }, { value: 'web', label: 'Web' }];
const STATUSES = [{ value: 'open', label: 'Open' }, { value: 'resolved', label: 'Resolved' }, { value: 'all', label: 'All' }];
const TONE = { api: 'sky', job: 'violet', web: 'amber' };
const EMPTY = { items: [], total: 0, totalPages: 0 };

const when = (ts) => (ts ? new Date(ts).toLocaleString('en-IN') : '');
const Dot = () => <span className="text-gray-600" aria-hidden="true">{'\u00b7'}</span>;
const SourceChip = ({ source }) => (
  <span className={classNames(CHIP, 'uppercase', CHIP_TONE[TONE[source] || 'neutral'])}>{source}</span>
);

function ErrorDetail({ id, onClose, onResolved }) {
  const { toast } = useToast();
  const [row, setRow] = useState(null);
  const [failed, setFailed] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getErrorLogEntry(id)
      .then((r) => { if (alive) setRow(r); })
      .catch((err) => { if (alive) setFailed(err?.message || 'Could not load this error'); });
    return () => { alive = false; };
  }, [id]);

  const resolve = async () => {
    setBusy(true);
    try {
      await resolveErrorLogEntry(id);
      toast('Marked resolved', 'success');
      onResolved();
    } catch (err) {
      toast(err?.message || 'Could not resolve', 'error');
      setBusy(false);
    }
  };
  const copyTrace = () => navigator.clipboard.writeText(row.lastTraceId)
    .then(() => toast('Trace id copied', 'success'), () => toast('Could not copy', 'error'));

  const facts = row && [
    ['Path', row.path],
    ['Request', [row.httpMethod, row.httpStatus].filter(Boolean).join(' ')],
    ['Seen', `\u00d7${fmtNum(row.occurrences)}`],
    ['First', when(row.firstSeen)],
    ['Last', when(row.lastSeen)],
    ['Build', row.build],
    ['Role', row.userRole],
    ['User', row.lastUserId],
    ['Fingerprint', row.fingerprint],
    ['Resolved', row.resolvedAt ? `${when(row.resolvedAt)}${row.resolvedBy ? ` by ${row.resolvedBy}` : ''}` : ''],
  ].filter(([, v]) => v);
  const context = row ? Object.entries(row.context) : [];

  return (
    <Modal
      open
      onClose={onClose}
      title="Error"
      size="lg"
      footer={(
        <>
          <button type="button" onClick={onClose} className={BTN.ghost}>Close</button>
          {row && !row.resolvedAt ? <button type="button" onClick={resolve} disabled={busy} className={BTN.primary}>Resolve</button> : null}
        </>
      )}
    >
      {failed ? <p role="alert" className="text-sm text-rose-200">{failed}</p> : !row ? <Loading /> : (
        <div className="space-y-4">
          <p className="break-words text-sm font-medium text-white">{row.message}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <SourceChip source={row.source} />
            {[row.errorType, row.level].filter(Boolean).map((v) => <span key={v} className={classNames(CHIP, CHIP_TONE.neutral)}>{v}</span>)}
            {row.resolvedAt ? <span className={classNames(CHIP, CHIP_TONE.green)}>Resolved</span> : null}
          </div>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
            {facts.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-gray-500">{label}</dt>
                <dd className="break-all text-gray-200">{value}</dd>
              </div>
            ))}
            {row.lastTraceId ? (
              <div className="contents">
                <dt className="self-center text-gray-500">Trace</dt>
                <dd className="flex items-center gap-2 break-all text-gray-200">
                  <span data-testid="error-log-trace">{row.lastTraceId}</span>
                  <IconAction label="Copy trace id" icon={Copy} onClick={copyTrace} />
                </dd>
              </div>
            ) : null}
          </dl>
          {context.length ? (
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-lg border border-white/10 p-3 text-xs">
              {context.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-gray-500">{k}</dt>
                  <dd className="break-all text-gray-200">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {row.stack ? (
            <pre className="max-h-64 overflow-auto whitespace-pre rounded-lg bg-black/40 p-3 text-[11px] leading-snug text-gray-300">{row.stack}</pre>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

export default function AdminErrorLog() {
  const [source, setSource] = useState('');
  const [status, setStatus] = useState('open');
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState('');
  const [openId, setOpenId] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => { setTerm(q.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    let alive = true;
    setData((prev) => (prev ? { ...prev, stale: true } : prev));
    listErrorLog({ source, status, q: term, page: page - 1, size: PAGE_SIZE })
      .then((res) => { if (alive) { setFailed(''); setData(res); } })
      .catch((err) => { if (alive) { setFailed(err?.message || 'Could not load the error log'); setData(EMPTY); } });
    return () => { alive = false; };
  }, [source, status, term, page, reload]);

  const filter = (set) => (value) => { set(value); setPage(1); };
  const filtered = source || status !== 'open' || q;
  const clear = () => { setSource(''); setStatus('open'); setQ(''); setTerm(''); setPage(1); };

  if (!data) return <Loading />;

  return (
    <div>
      <PageHeader title="Error log" subtitle="Failures from the API, jobs and browsers, grouped by cause." />
      {failed ? <div role="alert" className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{failed}</div> : null}
      <section className="dz-card overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 p-3">
          <Chips label="Source" options={SOURCES} value={source} onChange={filter(setSource)} />
          <Chips label="Status" options={STATUSES} value={status} onChange={filter(setStatus)} />
          <SearchBox value={q} onChange={setQ} placeholder="Search errors" label="Search errors" className="w-full sm:w-56" />
          {filtered ? <ClearFilters onClick={clear} /> : null}
          <div className="ml-auto">
            <PageNav page={page} pageCount={Math.max(1, data.totalPages || 1)} total={data.total || 0} size={PAGE_SIZE} onPage={setPage} stale={data.stale} />
          </div>
        </div>
        {data.items.length ? (
          <ul className="divide-y divide-white/10">
            {data.items.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  data-testid="error-log-row"
                  onClick={() => setOpenId(r.id)}
                  className="flex w-full min-w-0 cursor-pointer flex-col gap-1 px-3 py-2.5 text-left transition hover:bg-white/5"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <SourceChip source={r.source} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{r.message || r.errorType}</span>
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-gray-400">
                    <span className="min-w-0 truncate">{r.path || '\u2014'}</span>
                    <Dot />
                    <span className="shrink-0 tabular-nums">{`\u00d7${fmtNum(r.occurrences)}`}</span>
                    <Dot />
                    <span className="shrink-0" title={r.lastSeen}>{fmtAgo(r.lastSeen)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="p-10 text-center text-sm text-gray-400">{filtered ? 'No matching errors.' : 'No errors logged.'}</p>}
      </section>
      {openId ? (
        <ErrorDetail key={openId} id={openId} onClose={() => setOpenId(null)} onResolved={() => { setOpenId(null); setReload((n) => n + 1); }} />
      ) : null}
    </div>
  );
}
