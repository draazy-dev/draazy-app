import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/Icon.jsx';
import HScroll from '../../../components/ui/HScroll.jsx';
import PropertyImage from '../../../components/ui/PropertyImage.jsx';
import { srcSetFor } from '../../../lib/imgSrcSet.js';
import { MAX_PHOTOS_CEILING } from '../../../lib/uploads/policy.js';
import VideoWalkthrough from './VideoWalkthrough.jsx';

export function Gallery({ gallery, active, setActive, title, p, setLightbox, requestPhotos, priceStr, actions = null }) {
  const { t } = useTranslation();
  const count = gallery.length;
  const go = (dir) => setActive((i) => (i + dir + count) % count);
  /* The photo-request ask is the last SLIDE on mobile: a buyer who swiped to the end is the one
   * who wants more photos. */
  const [ask, setAsk] = useState(false);
  const trackRef = useRef(null);
  const settle = useRef(0);
  const dragging = useRef(false);

  /* The browser's own scroller carries the photo, rather than a handler measuring a drag and swapping the src on
     release. */
  const onScroll = () => {
    /* `scroll` fires every frame, and committing `active` mid-drag re-enters the effect below,
     * which would yank the track out from under the finger. */
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      if (dragging.current) return;
      const el = trackRef.current;
      if (!el || !el.clientWidth) return;
      const i = Math.round(el.scrollLeft / el.clientWidth);
      setAsk(i >= count);
      if (i < count) setActive(i);
    }, 120);
  };

  /* Touch, not pointer: iOS fires `pointercancel` the instant a scroll takes over the gesture,
   * so a pointerup-based flag is already false for every drag this needs to see. */
  const onTouchStart = () => { dragging.current = true; };
  const onTouchEnd = () => { dragging.current = false; onScroll(); };

  /* The lightbox, arrows, thumbnails and dots move `active` without touching the scroller, so the track
     follows it here; instant, because a smooth scroll still in flight is cancelled by the next change. */
  useEffect(() => {
    const el = trackRef.current;
    if (!el || !el.clientWidth) return;
    const target = (ask ? count : active) * el.clientWidth;
    if (Math.abs(el.scrollLeft - target) > 1) el.scrollTo({ left: target, behavior: 'auto' });
  }, [active, ask, count]);

  useEffect(() => () => clearTimeout(settle.current), []);

  /* The ask slide stops existing at `sm` (640px), and a phone turned to landscape crosses it; left set,
     `ask` would park the track past the last photo. */
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    const sync = () => { if (mq.matches) setAsk(false); };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const showPhoto = (i) => { setAsk(false); setActive(i); };

  const dotCount = Math.min(count, MAX_PHOTOS_CEILING);
  const litDot = ask ? -1 : Math.min(active, dotCount - 1);
  if (!count) {
    return (
      <>
      <section className="fade-in mb-6 sm:mb-10">
        {/* Full-bleed 4:3 on a phone: a short letterbox reads as a thumbnail. */}
        <div className="relative main-image-wrapper -mx-4 sm:mx-0 rounded-none sm:rounded-2xl overflow-hidden bg-white/[0.04] border border-white/10 flex flex-col items-center justify-center gap-2.5 px-8 text-center w-full aspect-[4/3] sm:aspect-auto sm:h-[320px] lg:h-[360px]" style={{ maxHeight: 400 }}>
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-400">
            <Icon name="image-off" className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="text-slate-300 text-sm font-semibold">{t('common.noPhotos.placeholder')}</p>
          {requestPhotos ? (
            <button
              type="button"
              onClick={requestPhotos}
              className="mt-1 inline-flex items-center gap-2 h-10 px-5 rounded-full bg-brand-teal-2 text-slate-950 text-sm font-bold active:scale-[0.98] transition-transform"
            >
              <Icon name="image-plus" className="w-4 h-4" /> {t('property.requestPhotosShort')}
            </button>
          ) : null}
          {priceStr ? (
            <>
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/85 via-black/45 to-transparent" />
              <p data-testid="property-price" className="pointer-events-none absolute bottom-4 left-4 text-3xl font-extrabold text-pure-white [text-shadow:0_1px_12px_rgb(var(--dz-c-black)/.55)]">{priceStr}</p>
            </>
          ) : null}
        </div>
      </section>
      <VideoWalkthrough id={p.video} title={title} label={t('property.videoTour')} />
      </>
    );
  }
  return (
    <>
    <section className="fade-in mb-6 sm:mb-10">

      <div className="relative main-image-wrapper -mx-4 sm:mx-0 rounded-none sm:rounded-2xl overflow-hidden" style={{ maxHeight: 400 }}>

        {/* Above sm: it stops being user-scrollable (`sm:overflow-hidden`) and the arrows drive it instead.
            `overflow-y-hidden`: x `auto` alone computes y to `auto`, so an overhang drags the photo vertically. */}
        <div
          ref={trackRef}
          onScroll={onScroll}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
          data-gallery-track=""
          className="no-scrollbar flex w-full aspect-[4/3] sm:aspect-auto sm:h-[320px] lg:h-[360px] overflow-x-auto overflow-y-hidden sm:overflow-hidden overscroll-x-contain snap-x snap-mandatory"
        >
          {gallery.map((g, i) => (
            <img
              key={i}
              src={g}
              srcSet={srcSetFor(g)}
              sizes="(max-width: 639px) 100vw, 60vw"
              /* Only the slide on screen at load is worth the priority; the rest are one swipe away at best and a
                 full listing would otherwise fetch all ten before first paint. */
              fetchPriority={i === 0 ? 'high' : undefined}
              loading={i === 0 ? undefined : 'lazy'}
              /* Every slide is in the accessibility tree — a scroll container does not hide the children the viewport
                 has scrolled past. */
              alt={t('property.photoAlt', { title, n: i + 1, total: count })}
              onClick={() => setLightbox(true)}
              className="snap-start shrink-0 w-full h-full object-cover cursor-zoom-in"
              style={i === active ? { viewTransitionName: `property-hero-${p.id}` } : undefined}
            />
          ))}

          {requestPhotos ? (
          /* The ask slide, last and phone-only. */
          <div data-photo-ask="" className="sm:hidden relative z-20 snap-start shrink-0 w-full h-full flex flex-col items-center justify-center gap-3 px-8 text-center bg-ink-2">
            <span className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-brand-teal-1/10 border border-brand-teal-2/30">
              <Icon name="image-plus" className="w-7 h-7 text-brand-teal-3" />
            </span>
            <p className="text-white text-base font-bold leading-snug">{t('property.requestPhotosSlideTitle')}</p>
            <p className="text-slate-400 text-xs leading-relaxed max-w-[16rem]">{t('property.requestPhotosSlideSub')}</p>
            <button
              type="button"
              onClick={requestPhotos}
              className="mt-1 inline-flex items-center gap-2 h-11 px-5 rounded-full bg-brand-teal-2 text-slate-950 text-sm font-bold active:scale-[0.98] transition-transform"
            >
              <Icon name="image-plus" className="w-4 h-4" /> {t('property.requestPhotosShort')}
            </button>
          </div>
          ) : null}
        </div>

        {count > 1 ? (
          <>

            <button type="button" onClick={() => go(-1)} aria-label={t('property.prevPhoto')} className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full glass-strong text-white items-center justify-center hover:bg-white/15 transition-smooth"><Icon name="chevron-left" className="w-5 h-5" /></button>
            <button type="button" onClick={() => go(1)} aria-label={t('property.nextPhoto')} className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full glass-strong text-white items-center justify-center hover:bg-white/15 transition-smooth"><Icon name="chevron-right" className="w-5 h-5" /></button>
          </>
        ) : null}

        {actions}
        {/* The photo itself opens the lightbox on tap; this counter is the keyboard way in. */}
        <button type="button" onClick={() => setLightbox(true)} aria-label={t('property.fullscreen') + ' ' + (active + 1) + '/' + count} className="tap-extend absolute bottom-4 right-4 flex items-center gap-2 px-4 py-2 rounded-full glass-strong text-white text-sm font-semibold cursor-pointer hover:bg-white/15 transition-smooth">
          <Icon name="camera" className="w-4 h-4" aria-hidden="true" /> <span>{active + 1}/{count}</span>
        </button>

        {/* Rendered here rather than duplicated-and-hidden: the parent decides which of the two positions gets the
           price, so exactly one lives in the DOM. */}
        {priceStr ? (
          <>
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/85 via-black/45 to-transparent" />
            <p
              data-testid="property-price"
              className="pointer-events-none absolute bottom-4 left-4 text-3xl font-extrabold text-pure-white [text-shadow:0_1px_12px_rgb(var(--dz-c-black)/.55)]"
            >
              {priceStr}
            </p>
          </>
        ) : null}
      </div>

      {count > 1 || requestPhotos ? (<>
      {/* Centred: the dots answer "where am I?" and stay tappable; the counter over the photo answers "how many". */}
      <div data-gallery-dots="" className="sm:hidden flex items-center justify-center -mb-6 sm:mb-0" role="group" aria-label={t('property.photoDotsAria')}>
        {Array.from({ length: dotCount }, (_, d) => (
          <button
            key={d}
            type="button"
            aria-current={d === litDot ? 'true' : undefined}
            aria-label={t('property.goToPhoto', { n: d + 1 })}
            onClick={() => showPhoto(d)}
            /* min-width, not padding: the dot width changes with state, so only a floor pins
             * every state at the 24px WCAG 2.5.8 target. */
            data-tap-exempt
            className="shrink-0 inline-flex min-w-[24px] items-center justify-center h-11 px-2"
          >
            <span className={'block rounded-full transition-all ' + (d === litDot ? 'w-5 h-1.5 bg-brand-teal-3' : 'w-1.5 h-1.5 bg-white/25')} />
          </button>
        ))}
        {requestPhotos ? (
        <button
          type="button"
          aria-current={ask ? 'true' : undefined}
          aria-label={t('property.requestMorePhotos')}
          onClick={() => setAsk(true)}
          data-tap-exempt
          className="shrink-0 inline-flex min-w-[24px] items-center justify-center h-11 px-2"
        >
          <span className={'block w-2.5 h-2.5 rounded-full border-2 transition-all ' + (ask ? 'border-brand-teal-3 bg-brand-teal-3' : 'border-white/30')} />
        </button>
        ) : null}
      </div>
      <HScroll wrapClassName="hidden sm:block" className="grid grid-flow-col auto-cols-[104px] sm:auto-cols-[120px] gap-3 mt-3 pb-1">
        {gallery.map((g, i) => (
          <button key={i} type="button" onClick={() => showPhoto(i)} aria-label={t('property.photoOf', { n: i + 1, total: count })} aria-current={i === active ? 'true' : undefined} className={'thumbnail h-20 ' + (i === active ? 'active' : '')}>
            <img src={g} alt="" className="w-full h-full object-cover" />
          </button>
        ))}
        {requestPhotos ? (
        <button
          type="button"
          onClick={requestPhotos}
          title={t('property.requestMorePhotos')}
          className="req-photos-tile flex flex-col items-center justify-center gap-1 h-20 rounded-lg border border-dashed border-white/20 bg-white/[0.03] text-slate-400 hover:border-brand-teal-2/60 hover:text-brand-teal-3 hover:bg-brand-teal-1/5 transition-all"
        >
          <Icon name="image-plus" className="w-5 h-5" />
          <span className="text-[10px] font-semibold leading-tight text-center px-1">{t('property.morePhotos')}</span>
        </button>
        ) : null}
      </HScroll>
      </>) : null}
    </section>
    <VideoWalkthrough id={p.video} title={title} label={t('property.videoTour')} />
    </>
  );
}
