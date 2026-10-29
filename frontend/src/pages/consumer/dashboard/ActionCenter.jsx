import Icon from '../../../components/Icon.jsx';
import { timeAgo } from '../../../lib/format.js';
import { Card } from './components.jsx';

const STALE_MS = 2 * 24 * 60 * 60 * 1000;

const TONES = {
  rose: 'bg-rose-500/15 text-rose-300',
  amber: 'bg-amber-500/15 text-amber-300',
  teal: 'bg-teal-400/15 text-teal-300',
  indigo: 'bg-indigo-500/15 text-indigo-300',
};

function isStale(at) {
  return !!at && Date.now() - at > STALE_MS;
}

function Age({ at }) {
  if (!at) return null;
  if (isStale(at)) {
    const days = Math.max(1, Math.round((Date.now() - at) / 86400000));
    return <span className="whitespace-nowrap text-[11px] font-bold text-rose-300">{days}d waiting</span>;
  }
  return <span className="whitespace-nowrap text-[11px] text-gray-500">{timeAgo(at)}</span>;
}

const GROUPS = [
  { key: 'numbers', kinds: ['contact'], label: 'Number requests', icon: 'lock-keyhole', tone: 'rose', to: 'leads-numbers' },
  { key: 'flatmate', kinds: ['flatmate', 'app'], label: 'Flatmate requests', icon: 'users-round', tone: 'teal', to: 'leads-flatmate' },
  { key: 'photos', kinds: ['photo'], label: 'Photo requests', icon: 'image', tone: 'amber', to: 'leads-photos' },
  { key: 'documents', kinds: ['doc'], label: 'Document requests', icon: 'folder-check', tone: 'teal', to: 'leads-documents' },
  { key: 'visits', kinds: ['visit'], label: 'Visits to confirm', icon: 'calendar-check', tone: 'indigo', to: 'visits' },
  { key: 'listings', kinds: ['clarify', 'message'], label: 'Listings need you', icon: 'alert-circle', tone: 'rose', to: 'properties' },
  { key: 'agreements', kinds: ['agreement'], label: 'Rent agreement', icon: 'file-pen-line', tone: 'amber', to: 'rent-agreement' },
];

function groupItems(items) {
  const groups = new Map();
  for (const it of items) {
    const group = GROUPS.find((g) => g.kinds.includes(it.kind));
    if (!group) continue;
    if (!groups.has(group.key)) groups.set(group.key, { ...group, items: [] });
    groups.get(group.key).items.push(it);
  }
  return [...groups.values()];
}

function summary(items) {
  if (items.length === 1) return items[0].title;
  const others = items.length - 1;
  return `${items[0].who} and ${others} other${others === 1 ? '' : 's'}`;
}

export default function ActionCenter({ items = [], onOpen }) {
  if (!items.length) {
    return (
      <Card className="p-5" data-testid="action-center-clear">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/15">
            <Icon name="check-circle-2" className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">You&apos;re all caught up</p>
            <p className="text-xs text-gray-500">No requests are waiting on you right now.</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <section data-testid="action-center" aria-labelledby="action-center-title">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="action-center-title" className="flex min-w-0 items-center gap-2 text-base font-bold text-white">
          <Icon name="bell" className="h-5 w-5 flex-shrink-0 text-amber-400" aria-hidden="true" />
          <span className="truncate">Needs your attention</span>
        </h2>
        <span className="dz-tag bg-amber-500/15 font-semibold text-amber-300">{items.length} pending</span>
      </div>
      <div className="grid gap-2.5 lg:grid-cols-2">
        {groupItems(items).map((g) => {
          const lead = g.items[0];
          const stale = isStale(lead.at);
          const tone = TONES[g.tone] || TONES.teal;
          const open = g.items.length === 1 && lead.open ? lead.open : () => onOpen?.(g.to);
          return (
            <button
              key={g.key}
              type="button"
              data-testid="action-item"
              data-group={g.key}
              onClick={open}
              className="glass-card relative flex min-h-[68px] w-full items-center gap-3 overflow-hidden rounded-2xl p-3.5 text-left transition-colors hover:border-teal-400/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60 sm:px-4"
            >
              {stale ? <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-rose-400" /> : null}
              <span className={'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ' + tone}>
                <Icon name={g.icon} className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-white">{g.label}</span>
                <span className="mt-0.5 block truncate text-xs text-gray-400">{summary(g.items)}</span>
              </span>
              <span className="flex flex-shrink-0 flex-col items-end gap-1">
                <span className={'dz-count ' + tone} data-testid="action-count">{g.items.length}</span>
                <Age at={lead.at} />
              </span>
              <Icon name="chevron-right" className="h-4 w-4 flex-shrink-0 text-gray-500" aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
