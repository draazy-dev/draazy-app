import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/Icon.jsx';
import Button from '../../../components/ui/Button.jsx';
import ConfirmModal from '../../../components/ui/ConfirmModal.jsx';
import Select from '../../../components/ui/Select.jsx';
import { useSavedSearches } from '../../../context/SavedSearchContext.jsx';
import { ALERT_FREQUENCIES, DEFAULT_ALERT_FREQUENCY } from '../../../services/savedSearchService.js';
import AlertSetupModal, { frequencyOption } from '../listings/AlertSetupModal.jsx';
import { criteriaChips, searchHref } from '../listings/alertCriteria.js';
import { flatmateCriteriaChips, tabMeta } from '../flatmates/alertCriteria.js';
import { normalizeTab } from '../flatmates/model.js';
import { Card, SectionHead } from './components.jsx';

const fmtDate = (ts) => {
  if (!ts) return '';
  try { return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); }
  catch { return ''; }
};

function AlertRow({ alert: a, freqOptions, onFrequency, onEdit, onDelete }) {
  const isShare = a.kind === 'flatmates';
  const label = a.label || 'Saved search';
  const frequency = a.alertFrequency || (a.alerts === false ? 'off' : DEFAULT_ALERT_FREQUENCY);
  const paused = frequency === 'off';
  const chips = isShare ? flatmateCriteriaChips(a) : criteriaChips(a);
  return (
    <li data-testid="dashboard-alert-row" className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start gap-3">
        <span className={'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ' + (paused ? 'bg-white/5' : 'bg-amber-500/10')}>
          <Icon name={isShare ? tabMeta(a.tab).icon : paused ? 'bell-off' : 'bell'} className={'h-5 w-5 ' + (paused ? 'text-gray-500' : 'text-amber-400')} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">{label}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {isShare ? <span className="dz-tag bg-teal-500/15 font-semibold text-teal-300">{tabMeta(a.tab).word}</span> : null}
            <span data-testid="dashboard-alert-match-count" className="dz-tag bg-teal-500/15 font-bold text-teal-300">{Number(a.matchCount ?? 0)} matches</span>
            {a.newCount > 0 ? <span className="dz-tag bg-amber-400/15 font-bold text-amber-300">{a.newCount} new</span> : null}
            {paused ? <span className="dz-tag dz-tag--muted font-semibold">Paused</span> : null}
            {a.at ? <span className="text-[11px] text-gray-500">Since {fmtDate(a.at)}</span> : null}
          </div>
        </div>
        <Button variant="icon" size="sm" icon="trash-2" onClick={onDelete} aria-label={`Delete alert ${label}`} />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {chips.map((c, i) => (
          <span key={i} className="dz-tag dz-tag--muted font-medium">
            <Icon name={c.icon} className="text-gray-400" /> {c.text}
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-white/10 pt-3">
        <Select
          size="sm"
          value={frequency}
          options={freqOptions}
          onChange={onFrequency}
          ariaLabel={`Alert frequency for ${label}`}
          className="w-[8.5rem] shrink-0"
        />
        <div className="ml-auto flex items-center gap-2">
          {isShare ? null : <Button variant="secondary" size="sm" icon="pencil" onClick={onEdit}>Edit</Button>}
          <Button variant="secondary" size="sm" iconRight="arrow-right" to={isShare ? `/flatmates?view=${normalizeTab(a.tab)}` : searchHref(a)}>View matches</Button>
        </div>
      </div>
    </li>
  );
}

export default function AlertsPanel() {
  const { t } = useTranslation();
  // Shared with the Overview stat card, so a change here never leaves the count above it stale.
  const { searches: alerts, status, setFrequency, create, edit, remove, reload } = useSavedSearches();
  const [editor, setEditor] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const activeCount = alerts.filter((a) => a.alerts).length;
  const freqOptions = ALERT_FREQUENCIES.map((f) => frequencyOption(t, f));
  const newAlert = () => setEditor({ initial: { deal: 'buy' } });
  const submit = (record) => (editor.id ? edit(editor.id, record) : create(record));

  return (
    <Card className="p-4 sm:p-6">
      <SectionHead
        icon="bell"
        iconCls="text-amber-400"
        title="Property &amp; Flatmate Alerts"
        sub={alerts.length ? `${activeCount} of ${alerts.length} active · we notify you in the app` : undefined}
        action={alerts.length ? <Button size="sm" icon="plus" onClick={newAlert}>New alert</Button> : null}
      />

      {status === 'loading' ? (
        <div className="space-y-3" aria-label="Loading alerts">
          {[0, 1].map((n) => (
            <div key={n} className="h-36 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
          ))}
        </div>
      ) : status === 'error' ? (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-6 py-10 text-center">
          <p className="text-sm font-semibold text-white">Couldn't load your alerts.</p>
          <Button variant="secondary" className="mt-4" onClick={() => { void reload().catch(() => {}); }}>Retry</Button>
        </div>
      ) : alerts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10">
            <Icon name="bell-plus" className="h-6 w-6 text-amber-400" />
          </div>
          <p className="text-sm font-semibold text-white">No alerts yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-gray-500">Pick an area, budget and BHK — we’ll notify you when a new home matches.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button icon="bell-plus" onClick={newAlert}>Create alert</Button>
            <Button variant="secondary" icon="search" to="/listings">Browse listings</Button>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {alerts.map((a) => (
            <AlertRow
              key={a.id}
              alert={a}
              freqOptions={freqOptions}
              onFrequency={(f) => setFrequency(a.id, f)}
              onEdit={() => setEditor({ initial: a, id: a.id })}
              onDelete={() => setDeleting(a)}
            />
          ))}
        </ul>
      )}

      {editor ? (
        <AlertSetupModal initial={editor.initial} editing={!!editor.id} onSubmit={submit} onClose={() => setEditor(null)} />
      ) : null}
      {deleting ? (
        <ConfirmModal
          danger
          title="Delete this alert?"
          message={`You’ll stop getting notifications for ${deleting.label || 'this search'}.`}
          confirmLabel="Delete"
          cancelLabel="Keep"
          onConfirm={() => { remove(deleting.id); setDeleting(null); }}
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </Card>
  );
}
