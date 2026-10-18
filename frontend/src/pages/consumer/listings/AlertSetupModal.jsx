import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/Icon.jsx';
import Button from '../../../components/ui/Button.jsx';
import DualRange from '../../../components/ui/DualRange.jsx';
import Modal from '../../../components/ui/Modal.jsx';
import LocalitySearchInput from '../../../components/search/LocalitySearchInput.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import { fmtINR } from '../../../lib/format.js';
import { RANGE } from '../../../lib/listings/filterState.js';
import { DEFAULT_ALERT_FREQUENCY } from '../../../services/savedSearchService.js';
import { alertLabel } from './alertCriteria.js';
import { BHK_BUY, BHK_RENT, BUY_TYPES, FURN, RENT_TYPES } from './constants.js';
import DealToggle from './DealToggle.jsx';
import { fmtRent } from './format.js';

const FREQUENCIES = ['instant', 'daily', 'weekly'];
const FREQ_KEY = { off: 'Off', instant: 'Instant', daily: 'Daily', weekly: 'Weekly' };

export const frequencyOption = (t, f) => ({
  value: f,
  label: t(`listings.alertFreq${FREQ_KEY[f]}`),
  sublabel: t(`listings.alertFreq${FREQ_KEY[f]}Hint`),
});

const asArr = (v) => (v instanceof Set ? [...v] : Array.isArray(v) ? v : []);
const rangeOr = (v, def) => (Array.isArray(v) && v.length === 2 ? v : [...def]);
const keep = (keys, opts) => keys.filter((k) => opts.some(([o]) => o === k));
const toggle = (list, k) => (list.includes(k) ? list.filter((x) => x !== k) : [...list, k]);

function draftFrom(src, frequencies) {
  return {
    deal: src.deal === 'rent' ? 'rent' : 'buy',
    localities: asArr(src.localities),
    bhk: asArr(src.bhk),
    types: asArr(src.types),
    furnishing: asArr(src.furnishing),
    budget: rangeOr(src.budget, RANGE.budget),
    rent: rangeOr(src.rent, RANGE.rent),
    alertFrequency: frequencies.includes(src.alertFrequency) ? src.alertFrequency : DEFAULT_ALERT_FREQUENCY,
  };
}

// Facets this form has no control for still narrow the alert, so they ride along untouched.
function hiddenFacets(src, deal, types) {
  const out = {};
  if (types.includes('commercial') && asArr(src.commercialTypes).length) out.commercialTypes = asArr(src.commercialTypes);
  if (asArr(src.amenities).length) out.amenities = asArr(src.amenities);
  if (deal === 'rent' && src.pets) out.pets = true;
  return out;
}

function ChipGroup({ icon, label, options, selected, onToggle }) {
  return (
    <fieldset>
      <legend className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-white">
        <Icon name={icon} className="h-4 w-4 text-teal-400" /> {label}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map(([k, text]) => {
          const on = selected.includes(k);
          return (
            <button key={k} type="button" aria-pressed={on} onClick={() => onToggle(k)} className={'dz-chip' + (on ? ' dz-chip--accent' : '')}>
              {on ? <Icon name="check" /> : null}{text}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

// Mount only while open: the draft is seeded once from `initial` (filter state or saved alert record).
export default function AlertSetupModal({ initial, locNameBySlug = {}, editing = false, onSubmit, onClose }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const frequencies = editing ? ['off', ...FREQUENCIES] : FREQUENCIES;
  const [d, setD] = useState(() => draftFrom(initial, frequencies));
  const [names, setNames] = useState(locNameBySlug);
  const [busy, setBusy] = useState(false);
  const isRent = d.deal === 'rent';
  const bhkOpts = isRent ? BHK_RENT : BHK_BUY;
  const typeOpts = isRent ? RENT_TYPES : BUY_TYPES;
  const set = (patch) => setD((prev) => ({ ...prev, ...patch }));
  const nameOf = (slug) => names[slug] || slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const record = {
    kind: 'listings',
    deal: d.deal,
    localities: d.localities,
    bhk: d.bhk,
    types: d.types,
    furnishing: d.furnishing,
    ...(isRent ? { rent: d.rent } : { budget: d.budget }),
    ...hiddenFacets(initial, d.deal, d.types),
    alertFrequency: d.alertFrequency,
    channel: 'push',
    query: '',
  };
  record.label = alertLabel(record, names);

  const switchDeal = (deal) => {
    const next = deal === 'rent' ? { bhk: BHK_RENT, types: RENT_TYPES } : { bhk: BHK_BUY, types: BUY_TYPES };
    set({ deal, bhk: keep(d.bhk, next.bhk), types: keep(d.types, next.types) });
  };

  const addLocality = (loc) => {
    setNames((prev) => ({ ...prev, [loc.slug]: loc.name }));
    setD((prev) => (prev.localities.includes(loc.slug) ? prev : { ...prev, localities: [...prev.localities, loc.slug] }));
  };

  const submit = async () => {
    setBusy(true);
    try {
      await onSubmit(record);
    } catch {
      setBusy(false);
      toast(t('listings.alertFailed'), 'error');
      return;
    }
    toast(t(editing ? 'listings.alertUpdated' : 'listings.alertCreated'), 'success');
    onClose();
  };

  const close = busy ? () => {} : onClose;
  const footer = (
    <>
      <Button variant="secondary" disabled={busy} onClick={onClose}>{t('common.cancel')}</Button>
      <Button variant="primary" icon="bell-plus" loading={busy} onClick={submit}>
        {editing ? t('listings.alertSaveChanges') : t('listings.createAlert')}
      </Button>
    </>
  );

  return (
    <Modal open onClose={close} title={editing ? t('listings.alertEditTitle') : t('listings.alertSetupTitle')} footer={footer}>
      <div className="space-y-5" data-testid="alert-setup">
        <div className="rounded-xl border border-teal-400/20 bg-teal-500/10 px-3 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-teal-300">{t('listings.alertPreview')}</p>
          <p data-testid="alert-setup-label" className="mt-0.5 text-sm font-semibold text-white">{record.label}</p>
        </div>

        <DealToggle deal={d.deal} onChange={switchDeal} />

        <fieldset>
          <legend className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-white">
            <Icon name="map-pin" className="h-4 w-4 text-teal-400" /> {t('listings.localities')}
          </legend>
          {d.localities.length ? (
            <div className="mb-2 flex flex-wrap gap-2">
              {d.localities.map((slug) => (
                <button
                  key={slug}
                  type="button"
                  onClick={() => set({ localities: d.localities.filter((s) => s !== slug) })}
                  aria-label={t('ui.removeItem', { label: nameOf(slug) })}
                  className="dz-chip dz-chip--accent dz-chip--sm"
                >
                  {nameOf(slug)} <Icon name="x" />
                </button>
              ))}
            </div>
          ) : null}
          <LocalitySearchInput onPick={addLocality} clearOnPick placeholder={t('listings.searchLocalityPlaceholder')} ariaLabel={t('listings.localities')} />
          {d.localities.length ? null : <p className="mt-1.5 text-xs text-gray-500">{t('listings.alertAnyArea')}</p>}
        </fieldset>

        <ChipGroup icon="bed-double" label={t('listings.bhkType')} options={bhkOpts} selected={d.bhk} onToggle={(k) => set({ bhk: toggle(d.bhk, k) })} />

        <fieldset>
          <legend className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-white">
            <Icon name="indian-rupee" className="h-4 w-4 text-teal-400" /> {isRent ? t('listings.monthlyRent') : t('listings.budgetRange')}
          </legend>
          {isRent ? (
            <DualRange min={0} max={RANGE.rent[1]} step={1000} value={d.rent} onChange={(v) => set({ rent: v })} label={t('listings.monthlyRent')} format={(v) => fmtRent(v) + (v === RANGE.rent[1] ? '+' : '')} />
          ) : (
            <DualRange min={0} max={RANGE.budget[1]} step={500000} value={d.budget} onChange={(v) => set({ budget: v })} label={t('listings.budgetRange')} format={(v) => fmtINR(v) + (v === RANGE.budget[1] ? '+' : '')} />
          )}
        </fieldset>

        <ChipGroup icon="building-2" label={t('listings.propertyType')} options={typeOpts} selected={d.types} onToggle={(k) => set({ types: toggle(d.types, k) })} />
        <ChipGroup icon="sofa" label={t('listings.furnishing')} options={FURN} selected={d.furnishing} onToggle={(k) => set({ furnishing: toggle(d.furnishing, k) })} />

        <fieldset>
          <legend className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-white">
            <Icon name="bell" className="h-4 w-4 text-teal-400" /> {t('listings.alertFrequency')}
          </legend>
          <div role="radiogroup" aria-label={t('listings.alertFrequency')} className="flex flex-wrap gap-2">
            {frequencies.map((f) => {
              const on = d.alertFrequency === f;
              return (
                <button key={f} type="button" role="radio" aria-checked={on} onClick={() => set({ alertFrequency: f })} className={'dz-chip' + (on ? ' dz-chip--accent' : '')}>
                  {frequencyOption(t, f).label}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-gray-500">{frequencyOption(t, d.alertFrequency).sublabel}</p>
        </fieldset>
      </div>
    </Modal>
  );
}
