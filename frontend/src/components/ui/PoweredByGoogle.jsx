const GOOGLE = [
  ['G', '#4285F4'],
  ['o', '#EA4335'],
  ['o', '#FBBC05'],
  ['g', '#4285F4'],
  ['l', '#34A853'],
  ['e', '#EA4335'],
];

export default function PoweredByGoogle({ className = '' }) {
  return (
    <div className={'pbg' + (className ? ' ' + className : '')} role="img" aria-label="Powered by Google">
      <span className="pbg-by">powered by</span>
      <span className="pbg-word" aria-hidden="true">
        {GOOGLE.map(([ch, color], i) => (
          <span key={i} style={{ color }}>{ch}</span>
        ))}
      </span>
    </div>
  );
}
