// One row of equal-width answers, so a 2–4 option question never wraps or hides behind a dropdown on a phone.
export default function ChoiceRow({ label, options, value, onChange, id, cols = options.length }) {
  return (
    <div id={id} role="group" aria-label={label} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={'seg !h-auto min-h-11 px-2 py-1.5 justify-center text-center leading-tight rounded-xl text-sm font-semibold text-gray-300' + (value === v ? ' active' : '')}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
