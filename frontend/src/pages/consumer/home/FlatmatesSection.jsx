import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/Icon.jsx';
import { flatmatePulse } from '../../../services/flatmateService.js';
import { bhkLabel } from '../../../lib/listingSeo.js';

const AVATAR_TONES = ['from-pink-500 to-rose-400', 'from-blue-500 to-indigo-400', 'from-teal-500 to-teal-700'];
const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

export default function FlatmatesSection({ navigate }) {
  const { t } = useTranslation();
  const [pulse, setPulse] = useState(null);

  useEffect(() => {
    let alive = true;
    flatmatePulse()
      .then((p) => { if (alive) setPulse(p); })
      .catch(() => { /* the pitch stands on its own without live numbers */ });
    return () => { alive = false; };
  }, []);

  const split = pulse?.split;
  const seeking = pulse?.seeking > 0 ? pulse.seeking : 0;
  const faces = seeking ? (pulse.initials || []).slice(0, AVATAR_TONES.length) : [];
  const flat = split && bhkLabel(split.bhk);

  return (
    <section className="relative section-pb">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="reveal relative rounded-2xl sm:rounded-3xl overflow-hidden p-5 sm:p-10 md:p-14" style={{ background: 'var(--cta-bg-alt)' }}>
          <div className="absolute -top-10 -right-8 w-44 h-44 rounded-full" style={{ background: 'radial-gradient(circle,rgb(var(--dz-c-teal-500) / .25),transparent 70%)' }} />
          <div className="absolute bottom-0 left-1/4 w-32 h-32 rounded-full" style={{ background: 'radial-gradient(circle,rgb(var(--dz-c-pink-500) / .18),transparent 70%)' }} />
          <div className={`relative z-10 grid grid-cols-1 gap-5 sm:gap-10 items-center ${split || seeking ? 'lg:grid-cols-2' : ''}`}>
            <div>
              <span className="dz-tag bg-white/10 border border-white/15 text-teal-200 font-semibold mb-2.5 sm:mb-4"><Icon name="users-round" className="w-3.5 h-3.5" /> {t('home.flatmates.badge')}</span>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold leading-tight mb-2 sm:mb-3">{t('home.flatmates.headingLead')} <span className="text-teal-400">{t('home.flatmates.headingHighlight')}</span></h2>
              <p className="text-gray-300 text-[13px] sm:text-base leading-relaxed mb-3.5 sm:mb-6 max-w-xl">{t('home.flatmates.body')}</p>
              <div className="grid grid-flow-col auto-cols-max items-start gap-x-2 sm:gap-x-5 mb-4 sm:mb-7 text-[11px] sm:text-sm text-gray-200 overflow-x-auto no-scrollbar max-[399px]:[mask-image:linear-gradient(to_right,#000_88%,transparent)]">
                <span className="flex shrink-0 items-center gap-1 sm:gap-1.5 whitespace-nowrap"><Icon name="shield-check" className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-teal-300" /> {t('home.flatmates.featVerified')}</span>
                <span className="flex shrink-0 items-center gap-1 sm:gap-1.5 whitespace-nowrap"><Icon name="venus" className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-pink-300" /> {t('home.flatmates.featWomen')}</span>
                <span className="flex shrink-0 items-center gap-1 sm:gap-1.5 whitespace-nowrap"><Icon name="phone-off" className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-teal-300" /> {t('home.flatmates.featNoNumber')}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5 sm:gap-3">
                <button onClick={() => navigate('/flatmates?view=team-up')} className="inline-flex w-full sm:w-auto justify-center items-center gap-2 px-6 h-btn sm:h-btn-lg rounded-full bg-cta-btn text-cta-btn-text font-bold text-sm hover:opacity-90 transition-all duration-300 sm:hover:scale-105 shadow-2xl shadow-black/20">
                  <Icon name="hand-heart" className="w-5 h-5" /> {t('home.flatmates.ctaFind')}
                </button>
                <button onClick={() => navigate('/flatmates?post=1')} className="h-btn sm:h-btn-lg inline-flex w-full sm:w-auto justify-center items-center gap-1.5 px-5 rounded-full border border-white/20 text-white font-semibold text-sm hover:bg-white/10 transition-all duration-300">
                  {t('home.flatmates.ctaPost')} <Icon name="arrow-right" className="w-4 h-4" />
                </button>
              </div>
            </div>
            {(split || seeking > 0) && (
              <div className="glass rounded-2xl p-4 sm:p-7 border border-white/10" style={{ background: 'var(--glass)' }}>
                {split && (
                  /* flex-wrap, not a fixed row: with Android's larger system font sizes the amount drops under its
                     label instead of overlapping it. */
                  <dl>
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 pb-3 sm:pb-4 border-b border-dashed border-white/15">
                      <dt className="min-w-0 leading-snug">
                        <span className="block text-[13px] sm:text-sm text-gray-300">{t('home.flatmates.wholeFlat')}</span>
                        <span className="block text-[11px] sm:text-xs text-gray-400">
                          {flat ? t('home.flatmates.flatIn', { flat, locality: split.locality }) : t('home.flatmates.anyFlatIn', { locality: split.locality })}
                        </span>
                      </dt>
                      <dd className="ml-auto text-sm sm:text-base font-semibold text-gray-300 tabular-nums whitespace-nowrap">{inr(split.rent)}<span className="text-[11px] sm:text-xs font-normal text-gray-400">{t('home.flatmates.perMonth')}</span></dd>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 pt-3 sm:pt-4">
                      <dt className="min-w-0 leading-snug">
                        <span className="block text-[13px] sm:text-sm font-semibold text-white">{t('home.flatmates.yourShare')}</span>
                        <span className="block text-[11px] sm:text-xs text-teal-300">{t('home.flatmates.splitWays', { seats: split.seats })}</span>
                      </dt>
                      <dd className="ml-auto text-xl sm:text-2xl font-extrabold text-teal-400 tabular-nums whitespace-nowrap">{inr(split.share)}<span className="text-[11px] sm:text-xs font-normal text-gray-400">{t('home.flatmates.perMonth')}</span></dd>
                    </div>
                  </dl>
                )}
                {split && seeking > 0 && <div className="h-px bg-white/10 my-4 sm:my-5" />}
                {seeking > 0 && (
                  <div className="flex items-center">
                    {faces.map((initials, i) => (
                      <div key={i} className={`shrink-0 w-8 h-8 sm:w-10 sm:h-10 ${i ? '-ml-2 sm:-ml-3' : ''} rounded-full bg-gradient-to-br ${AVATAR_TONES[i]} flex items-center justify-center text-white text-[10px] sm:text-xs font-bold shadow-md`}>{initials}</div>
                    ))}
                    <span className={`min-w-0 ${faces.length ? 'ml-2.5 sm:ml-3' : ''} text-[13px] sm:text-sm leading-snug text-gray-300`}><b className="text-white tabular-nums">{seeking.toLocaleString('en-IN')}</b> {t('home.flatmates.seeking', { count: seeking })}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
