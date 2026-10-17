import LogoMark from '../brand/LogoMark.jsx';

/* Phones hide AuthShell's desktop brand panel (rendered `<lg`), so this strip carries the branding and trust points
   instead. */
export default function MobileAuthIntro({ eyebrow, tagline, chips = [] }) {
  return (
    <div className="mb-6 text-center slide-up">
      {eyebrow ? (
        <div className="dz-tag border border-teal-400/25 bg-teal-400/[.08] mb-4">
          <span className="auth-live-dot inline-block w-1.5 h-1.5 rounded-full bg-teal-300" />
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-teal-200">{eyebrow}</span>
        </div>
      ) : null}
      <div className="flex items-center justify-center gap-2.5 mb-3">
        <LogoMark className="auth-brand-badge w-9 h-9 shrink-0 text-teal-400" />
        <span className="text-2xl font-bold tracking-tight text-white">Draazy</span>
      </div>
      {tagline ? <p className="text-gray-400 text-[13px] leading-relaxed mb-4 px-3">{tagline}</p> : null}
      {chips.length ? (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {chips.map(([Ic, label]) => (
            <span key={label} className="dz-tag border border-white/[.06] bg-white/[.04] font-medium text-gray-300">
              <Ic className="w-3.5 h-3.5 text-teal-300" /> {label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
