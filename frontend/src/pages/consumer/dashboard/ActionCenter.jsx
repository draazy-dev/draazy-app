import Icon from '../../../components/Icon.jsx';
import { timeAgo } from '../../../lib/format.js';
import { Card, SectionHead } from './components.jsx';

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

function AgePill({ at }) {
  if (!at) return null;
  if (isStale(at)) {
    const days = Math.max(1, Math.round((Date.now() - at) / 86400000));
    return <span className="dz-tag flex-shrink-0 bg-rose-500/15 font-bold text-rose-300">{days}d waiting</span>;
  }
  return <span className="flex-shrink-0 whitespace-nowrap text-[11px] text-gray-500">{timeAgo(at)}</span>;
}

// Grouped so Home says what is waiting and where; every decision happens on the page that shows the full request.
const GROUPS = [
  { key: 'numbers', kinds: ['contact'], label: 'Number requests', icon: 'lock-keyhole', tone: 'rose', to: 'leads-numbers' },
  { key: 'flatmate', kinds: ['flatmate', 'app'], label: 'Flatmate requests', icon: 'users-round', tone: 'teal', to: 'leads-flatmate' },
  { key: 'photos', kinds: ['photo'], label: 'Photo requests', icon: 'image', tone: 'amber', to: 'leads-photos' },
  { key: 'documents', kinds: ['doc'], label: 'Document requests', icon: 'folder-check', tone: 'teal', to: 'leads-documents' },
  { key: 'visits', kinds: ['visit'], label: 'Visits to confirm', icon: 'calendar-check', tone: 'indigo', to: 'visits' },
  { key: 'listings', kinds: ['clarify', 'message'], label: 'Listings need you', icon: 'alert-circle', tone: 'rose', to: 'properties' },
];

// Items arrive oldest-first, so each group's first item is the one waiting longest.
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
    <Card className="p-5 sm:p-6" data-testid="action-center">
      <SectionHead
        icon="bell"
        iconCls="text-amber-400"
        title="Needs your attention"
        sub="Tap to review and respond."
        action={
          <span className="dz-tag bg-amber-500/15 font-semibold text-amber-300">
            {items.length} pending
          </span>
        }
      />
      <div className="-mx-3 divide-y divide-white/[0.05]">
        {groupItems(items).map((g) => {
          const lead = g.items[0];
          const stale = isStale(lead.at);
          const open = g.items.length === 1 && lead.open ? lead.open : () => onOpen?.(g.to);
          return (
            <button
              key={g.key}
              type="button"
              data-testid="action-item"
              data-group={g.key}
              onClick={open}
              className={
                'relative flex min-h-[56px] w-full items-center gap-3.5 rounded-xl py-3 pl-4 pr-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/50 ' +
                (stale ? 'bg-rose-500/[0.05] hover:bg-rose-500/[0.08]' : 'hover:bg-white/[0.03]')
              }
            >
              {stale ? (
                <span aria-hidden="true" className="absolute left-0 top-1/2 h-9 w-[3px] -translate-y-1/2 rounded-full bg-rose-400" />
              ) : null}
              <span className={'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ' + (TONES[g.tone] || TONES.teal)}>
                <Icon name={g.icon} className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-white">{g.label}</span>
                  <span className="dz-tag flex-shrink-0 bg-white/10 font-bold text-white" data-testid="action-count">{g.items.length}</span>
                </span>
                <span className="block truncate text-xs text-gray-400">{summary(g.items)}</span>
              </span>
              <AgePill at={lead.at} />
              <Icon name="chevron-right" className="h-4 w-4 flex-shrink-0 text-gray-500" aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </Card>
  );
}
