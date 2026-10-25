import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../../components/Icon.jsx';
import Tip from '../../../../components/ui/Tip.jsx';
import { Gallery as PropertyGallery } from '../../property/Gallery.jsx';
import PhotoLightbox from '../../property/PhotoLightbox.jsx';
import { AMEN_ICON } from '../../property/derivations.js';
import { BILL_KEY } from '../constants.js';

const filled = (v) => v != null && v !== '' && v !== false;

export function Identity({ avatar, title, meta, badges, action }) {
  return (
    <div className="reveal">
      <div className="flex items-start gap-3">
        {avatar}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-white leading-snug break-words">{title}</h1>
          {meta && <p className="text-sm text-gray-400 mt-1 break-words">{meta}</p>}
        </div>
        {action}
      </div>
      {badges && <div className="flex flex-wrap items-center gap-1.5 mt-3">{badges}</div>}
    </div>
  );
}

/** The property page's trust card: what this post has proven, then the platform promise every post shares. */
export function TrustPanel({ items = [] }) {
  const { t } = useTranslation();
  const rows = [...items.map(([label, icon, body]) => [label, icon, body, true]), [t('flatmates.trustNumberPrivate'), 'phone-off', t('flatmates.trustNumberPrivateBody'), false]];
  return (
    <div data-testid="fm-trust" className="fm-trust mt-4 rounded-2xl border border-emerald-500/20 px-3.5 py-3 lg:p-4">
      <div className="tag-strip">
        {rows.map(([label, icon, body, proof]) => (
          <Tip key={label} body={body}>
            <span className={'tag' + (proof ? ' tag-emerald' : '')}><Icon name={icon} className="w-4 h-4" /> {label}</span>
          </Tip>
        ))}
      </div>
    </div>
  );
}

/** Icon tiles, as on the property page's key details. Empty values are dropped, not shown as "Not specified". */
export function SpecGrid({ items }) {
  const tiles = items.filter(([, , v]) => filled(v));
  if (!tiles.length) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
      {tiles.map(([icon, label, value]) => (
        <div key={label} className="detail-card">
          <span className="w-8 h-8 rounded-lg bg-brand-teal/10 flex items-center justify-center flex-shrink-0"><Icon name={icon} className="w-4 h-4 text-brand-teal-3" /></span>
          <div className="min-w-0">
            <p className="text-[11px] text-slate-400 leading-tight mb-0.5">{label}</p>
            <p className="text-sm font-semibold text-white break-words">{value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** The property page's amenity tiles, for a room's furniture. */
export function ItemGrid({ items }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
      {items.map((a) => (
        <div key={a} className="amenity-card">
          <span className="w-8 h-8 rounded-lg bg-brand-teal/10 flex items-center justify-center flex-shrink-0"><Icon name={AMEN_ICON[a] || 'sparkles'} className="w-4 h-4 text-brand-teal-3" /></span>
          <span className="text-sm font-medium text-white break-words">{a}</span>
        </div>
      ))}
    </div>
  );
}

/** [label, price, note] per way of splitting the rent, the property page's "sharing" tiles. */
export function SplitTiles({ tiles }) {
  return (
    <div data-testid="fm-split" className="grid gap-2 mt-3" style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }}>
      {tiles.map(([label, price, note]) => (
        <div key={label} className="glass-strong rounded-xl px-2 py-2.5 text-center">
          <p className="text-[11px] text-slate-400">{label}</p>
          <p className="text-base font-bold text-white mt-0.5 tabular-nums">{price}</p>
          {note && <p className="text-[11px] text-slate-500">{note}</p>}
        </div>
      ))}
    </div>
  );
}

export function TermsSection({ item }) {
  const { t } = useTranslation();
  const bill = (v) => BILL_KEY[v] && t('flatmates.' + BILL_KEY[v]);
  const span = (n, key) => n != null && (n === 0 ? t('flatmates.detailNone') : t('flatmates.' + key, { count: n }));
  if (![item.noticePeriodDays, item.lockInMonths, item.maintenanceBilling, item.electricityBilling].some((v) => v != null)) return null;
  return (
    <Section icon="file-text" title={t('flatmates.termsHeading')}>
      <SpecGrid items={[
        ['timer', t('flatmates.detailNotice'), span(item.noticePeriodDays, 'detailDays')],
        ['lock', t('flatmates.detailLockIn'), span(item.lockInMonths, 'detailMonths')],
        ['receipt', t('flatmates.maintenanceBill'), bill(item.maintenanceBilling)],
        ['zap', t('flatmates.electricityBill'), bill(item.electricityBilling)],
      ]} />
    </Section>
  );
}

export function Sheet({ children }) {
  return <div className="fm-sheet sf-card rounded-2xl reveal">{children}</div>;
}

export function Section({ icon, title, aside, children }) {
  return (
    <section className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold text-white inline-flex items-center gap-2">{icon && <Icon name={icon} className="w-4 h-4 text-teal-300" />}{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Gallery({ id, photos, alt, actions }) {
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const close = useCallback(() => setLightbox(false), []);
  return (
    <div className="reveal">
      <PropertyGallery gallery={photos} active={active} setActive={setActive} title={alt} p={{ id }} setLightbox={setLightbox} actions={actions} />
      {lightbox && <PhotoLightbox photos={photos} active={active} setActive={setActive} title={alt} onClose={close} />}
    </div>
  );
}

export function Stepper({ icon, label, value, onStep, canDec, canInc, decClass = '', incClass = '', decLabel, incLabel }) {
  const btn = "relative w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-gray-200 inline-flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed before:absolute before:-inset-1.5 before:content-[''] ";
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white/5 border border-white/10 pl-3 pr-1 py-1">
      <span className="text-[13px] text-gray-200 inline-flex items-center gap-2 min-w-0"><Icon name={icon} className="w-3.5 h-3.5 text-teal-300 shrink-0" /> {label}</span>
      <div className="inline-flex items-center gap-1 shrink-0">
        <button type="button" onClick={() => onStep(-1)} disabled={!canDec} className={btn + decClass} aria-label={decLabel}><Icon name="minus" className="w-3.5 h-3.5" /></button>
        <span className="text-sm font-bold text-white w-5 text-center tabular-nums" aria-live="polite">{value}</span>
        <button type="button" onClick={() => onStep(1)} disabled={!canInc} className={btn + incClass} aria-label={incLabel}><Icon name="plus" className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  );
}

export function PriceCard({ label, value, sub, facts = [], cta, children }) {
  const strip = facts.filter(([, , v]) => filled(v));
  return (
    <div className="sf-card rounded-2xl p-4 sm:p-5 reveal">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-[1.75rem] font-bold gradient-text leading-tight">{value}</p>
      {sub}
      {strip.length > 0 && (
        <dl className="grid mt-4 pt-3 border-t border-white/10" style={{ gridTemplateColumns: `repeat(${strip.length}, minmax(0, 1fr))` }}>
          {strip.map(([icon, k, v], i) => (
            <div key={k} className={'min-w-0 ' + (i ? 'pl-3 border-l border-white/10' : '')}>
              <dt className="text-xs text-gray-500 inline-flex items-center gap-1"><Icon name={icon} className="w-3.5 h-3.5 text-teal-300/80 shrink-0" />{k}</dt>
              <dd className="text-sm font-semibold text-white mt-0.5 break-words">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {children}
      {cta && <div className="hidden lg:flex mt-4">{cta}</div>}
    </div>
  );
}

export function StickyAsk({ price, label, children }) {
  return (
    <div className="dz-sticky-cta fm-sticky lg:hidden items-center">
      <div className="min-w-0 flex-1">
        <p className="text-lg font-bold gradient-text leading-none truncate">{price}</p>
        <p className="text-xs text-gray-400 mt-1 truncate">{label}</p>
      </div>
      <div className="w-1/2 min-w-fit shrink-0 flex">{children}</div>
    </div>
  );
}

export function DetailLayout({ hero, header, aside, sticky, report, children }) {
  return (
    <>
      {hero}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6 lg:items-start">
        <div className="lg:col-start-1 lg:row-start-1 min-w-0">{header}</div>
        <aside className="lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-24 space-y-4">{aside}</aside>
        <div className="lg:col-start-1 lg:row-start-2 min-w-0 space-y-4">{children}{report}</div>
      </div>
      {sticky}
    </>
  );
}
