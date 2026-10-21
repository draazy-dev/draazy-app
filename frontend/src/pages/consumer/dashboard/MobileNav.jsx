import Icon from '../../../components/Icon.jsx';
import { SubNav } from './components.jsx';

const groupCount = (group, attentionCounts) =>
  group.sections.reduce((sum, section) => sum + (attentionCounts[section.tab] || 0), 0);

const activeGroupOf = (groups, activeTab) =>
  groups.find((group) => group.sections.some((section) => section.tab === activeTab)) || groups[0];

export default function MobileNav({ groups = [], activeTab, onSelect, attentionCounts = {}, loading = false, labelFor }) {
  if (loading || !groups.length) {
    return (
      <div className="dz-docks-under-nav sticky top-[var(--dz-nav-h)] z-30 -mx-4 mb-5 border-y border-white/10 bg-ink/95 px-4 py-2 backdrop-blur lg:hidden sm:-mx-6 sm:px-6">
        <div className="grid grid-cols-4 gap-1.5">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-12 rounded-xl skeleton" />)}
        </div>
      </div>
    );
  }

  const activeGroup = activeGroupOf(groups, activeTab);
  const subItems = activeGroup.sections.map((section) => ({
    key: section.tab,
    label: labelFor(section),
    icon: section.icon,
    count: attentionCounts[section.tab] || 0,
  }));

  const hasSubNav = subItems.length > 1;

  return (
    // With a sub-strip, its own underline is the bottom edge; a second border plus padding read as an empty band.
    <div className={'dz-docks-under-nav sticky top-[var(--dz-nav-h)] z-30 -mx-4 mb-5 bg-ink/95 px-4 backdrop-blur lg:hidden sm:-mx-6 sm:px-6 ' + (hasSubNav ? 'border-t border-white/10 pt-2' : 'border-y border-white/10 py-2')} data-testid="dashboard-mobile-nav">
      <div
        role="tablist"
        aria-label="Dashboard sections"
        className="grid gap-1 sm:gap-1.5"
        style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))` }}
      >
        {groups.map((group) => {
          const isActive = group.id === activeGroup?.id;
          const count = groupCount(group, attentionCounts);
          const firstSection = group.sections[0];
          return (
            <button
              key={group.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? 'page' : undefined}
              data-dashboard-group={group.id}
              onClick={() => onSelect(firstSection.tab)}
              className={
                'relative flex h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 sm:px-1 text-center text-[10px] sm:text-[11px] font-semibold leading-tight tracking-tight transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60 ' +
                (isActive ? 'bg-brand-teal/15 text-brand-teal ring-1 ring-inset ring-brand-teal/35' : 'bg-white/[0.04] text-gray-300 hover:bg-white/[0.07] hover:text-white')
              }
            >
              <Icon name={group.icon} className="h-4 w-4 flex-shrink-0" />
              <span className="line-clamp-2 max-w-full">{group.label}</span>
              {isActive ? <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand-teal" /> : null}
              {count > 0 ? (
                <span className="dz-count absolute right-1 top-1 bg-rose-500 text-white">
                  {count > 9 ? '9+' : count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {hasSubNav ? (
        <div className="mt-2" data-testid="dashboard-section-subnav">
          <SubNav items={subItems} active={activeTab} onChange={onSelect} variant="underline" wrapClassName="" />
        </div>
      ) : null}
    </div>
  );
}
