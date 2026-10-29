import Icon from '../Icon.jsx';

export default function ActiveFilterChips({ chips, onClearAll, heading, removeLabel, clearAllLabel, className = '', style }) {
  if (!chips.length) return null;
  return (
    <div data-testid="active-filters" style={style} className={'flex items-center gap-2 -mx-4 px-4 py-1.5 mb-3 overflow-x-auto no-scrollbar sm:mx-0 sm:px-0 sm:mb-5 sm:flex-wrap sm:overflow-visible ' + className}>
      <span className="hidden sm:inline text-xs text-gray-500 mr-0.5">{heading}</span>
      {chips.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={c.remove}
          aria-label={removeLabel(c.label)}
          className="af-chip dz-chip dz-chip--accent dz-chip--sm"
        >
          {c.label}
          <Icon name="x" />
        </button>
      ))}
      <button type="button" onClick={onClearAll} className="af-clear-all dz-chip dz-chip--sm">{clearAllLabel}</button>
    </div>
  );
}
