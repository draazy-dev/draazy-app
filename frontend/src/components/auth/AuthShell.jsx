// .otp-* stays global in index.css: OtpBoxes is shared with list-property.
import '../../styles/routes/auth.css';

/* `left` is the desktop panel, `mobileIntro` the brand block shown above the card below lg.
   align='top' pins tall cards (Sign Up) under the navbar so centring cannot clip them. */
export default function AuthShell({ left, children, mobileIntro, align = 'center' }) {
  const colAlign = align === 'top'
    ? 'lg:justify-start lg:pt-[calc(var(--dz-nav-h)+16px)] lg:pb-12'
    : 'lg:justify-center lg:pt-[var(--dz-nav-h)] lg:pb-12';
  return (
    <div className="auth-page min-h-[100dvh] flex pt-[var(--dz-nav-h)] lg:pt-0">
      <div className="auth-mobile-bg lg:hidden" aria-hidden="true" />
      <div className="auth-left theme-dark hidden lg:flex lg:w-1/2 items-center justify-center p-12 relative">
        <div className="floating-shape w-64 h-64 bg-teal-400" style={{ top: '10%', left: '10%' }} />
        <div className="floating-shape w-48 h-48 bg-teal-600" style={{ top: '60%', right: '15%' }} />
        <div className="floating-shape w-32 h-32 bg-purple-400" style={{ bottom: '20%', left: '25%' }} />
        <div className="floating-shape w-40 h-40 bg-teal-300" style={{ top: '35%', right: '30%' }} />
        <div className="relative z-10 max-w-md slide-right">{left}</div>
      </div>
      <div className={'relative z-10 w-full lg:w-1/2 flex flex-col items-center justify-start px-5 pt-6 pb-8 sm:px-8 lg:px-12 lg:min-h-[100dvh] ' + colAlign}>
        <div className="w-full max-w-md">
          {mobileIntro ? <div className="lg:hidden">{mobileIntro}</div> : null}
          {children}
        </div>
      </div>
    </div>
  );
}
