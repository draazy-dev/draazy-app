import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { classNames } from '../../../lib/format.js';
import Modal from '../../../components/ui/Modal.jsx';
import Select from '../../../components/ui/Select.jsx';
import LocalitySelect from '../../../components/ui/LocalitySelect.jsx';
import DateField from '../../../components/ui/DateField.jsx';
import { facingOptions, floorOptions, overlookingOptions, totalFloorsOptions } from '../../consumer/list-property/constants.js';
import { EDIT_DEAL_OPTS, editBhkOpts, editStatusOpts, editTypeOpts } from './constants.js';
import {
  AGE_OPTS, FURNISHING_OPTS, POSSESSION_OPTS, TENANT_OPTS, YES_NO_OPTS, amenityOpts, detailsOf, isLand,
} from './editForm.js';
import { SubmittedPhotos } from './review-modal/SubmittedContent.jsx';
import { getModerationProperty } from '../../../services/propertyService.js';

const TABS = [['basics', 'Basics'], ['details', 'Details'], ['location', 'Location'], ['pricing', 'Pricing'], ['about', 'Description'], ['photos', 'Photos']];
const labelCls = 'mb-1 block text-gray-300';
const req = <span className="text-rose-400">*</span>;

function Input({ label, value, onChange, type = 'text', ...rest }) {
  return (
    <label className="block text-sm">
      <span className={labelCls}>{label}</span>
      <input type={type} min={type === 'number' ? '0' : undefined} value={value} onChange={(e) => onChange(e.target.value)} className="dz-input" {...rest} />
    </label>
  );
}

function Pick({ label, value, onChange, options }) {
  return (
    <div className="block text-sm">
      <span className={labelCls}>{label}</span>
      <Select value={value} onChange={onChange} options={options} ariaLabel={label} placeholder="Not stated" />
    </div>
  );
}

function Chips({ label, options, value, onChange }) {
  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div role="group" aria-label={label} className="text-sm">
      <span className={labelCls}>{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map(([v, l]) => (
          <button key={v} type="button" aria-pressed={value.includes(v)} onClick={() => toggle(v)}
            className={classNames('min-h-9 rounded-xl border px-3 py-1.5 text-sm font-medium transition', value.includes(v)
              ? 'border-teal-400/60 bg-teal-500/15 text-teal-200'
              : 'border-white/10 bg-white/5 text-gray-300 hover:border-teal-400/40 hover:text-white')}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function Basics({ edit, set, setPicking, canSetStatus }) {
  return (
    <div className="space-y-3">
      <Input label={<>Title {req}</>} value={edit.title} onChange={(v) => set({ title: v })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label={<>Price ({'\u20B9'}) {req}</>} type="number" value={edit.price} onChange={(v) => set({ price: v })} />
        <Input label={`Area (${edit._ref?.areaUnit || 'sq.ft'})`} type="number" value={edit.area} onChange={(v) => set({ area: v })} />
        <Pick label="Configuration (BHK)" value={edit.bhk} onChange={(v) => set({ bhk: v })} options={editBhkOpts(edit._ref?.bhkNum == null ? '' : String(edit._ref.bhkNum))} />
        <Pick label="Property type" value={edit.type} onChange={(v) => set({ type: v })} options={editTypeOpts(edit._ref?.type)} />
        <div className="block text-sm">
          <span className={labelCls}>Locality {req}</span>
          <LocalitySelect
            value={edit.locality}
            onChange={(v) => set({ locality: v, localitySlug: '' })}
            onSelect={(sel) => set({ locality: sel.name, localitySlug: sel.slug || '' })}
            onBusyChange={setPicking}
            placeholder="Select locality"
            ariaLabel="Locality"
            className="w-full"
          />
        </div>
        <Pick label="Deal" value={edit.deal} onChange={(v) => set({ deal: v })} options={EDIT_DEAL_OPTS} />
      </div>
      {canSetStatus ? (
        <div className="block text-sm">
          <Pick label="Status" value={edit.status} onChange={(v) => set({ status: v })} options={editStatusOpts(edit._ref?.status)} />
          <span className="mt-1 block text-xs text-gray-500">Reject, flag and archive have their own actions; owners pause, sell or rent.</span>
        </div>
      ) : null}
    </div>
  );
}

function Details({ edit, set }) {
  const land = isLand(edit.type);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {land ? null : (
        <>
          <Input label="Carpet area (sq.ft)" type="number" value={edit.carpetArea} onChange={(v) => set({ carpetArea: v })} />
          <Input label="Built-up area (sq.ft)" type="number" value={edit.builtUpArea} onChange={(v) => set({ builtUpArea: v })} />
          <Input label="Super built-up area (sq.ft)" type="number" value={edit.superBuiltUpArea} onChange={(v) => set({ superBuiltUpArea: v })} />
          <Pick label="Furnishing" value={edit.furnishing} onChange={(v) => set({ furnishing: v })} options={FURNISHING_OPTS} />
          <Pick label="Floor" value={edit.floor} onChange={(v) => set({ floor: v })} options={floorOptions} />
          <Pick label="Total floors" value={edit.totalFloors} onChange={(v) => set({ totalFloors: v })} options={totalFloorsOptions} />
          <Input label="Bathrooms" type="number" value={edit.bathrooms} onChange={(v) => set({ bathrooms: v })} />
          <Input label="Balconies" type="number" value={edit.balconies} onChange={(v) => set({ balconies: v })} />
          <Input label="Parking spaces" type="number" value={edit.parking} onChange={(v) => set({ parking: v })} />
          <Pick label="Age of property" value={edit.age} onChange={(v) => set({ age: v })} options={AGE_OPTS} />
        </>
      )}
      <Pick label="Facing" value={edit.facing} onChange={(v) => set({ facing: v })} options={facingOptions} />
      {land ? null : <Pick label="Overlooking" value={edit.overlooking} onChange={(v) => set({ overlooking: v })} options={overlookingOptions} />}
      {edit.deal === 'buy' ? <Pick label="Possession" value={edit.construction} onChange={(v) => set({ construction: v })} options={POSSESSION_OPTS} /> : null}
      <Input label="MahaRERA id" value={edit.reraId} onChange={(v) => set({ reraId: v })} placeholder="P00000000000" />
    </div>
  );
}

function Location({ edit, set }) {
  return (
    <div className="space-y-3">
      <Input label="Address" value={edit.address} onChange={(v) => set({ address: v })} maxLength={300} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Pincode" inputMode="numeric" maxLength={6} value={edit.pincode} onChange={(v) => set({ pincode: v.replace(/\D/g, '') })} />
        <Input label="Electricity consumer no." value={edit.electricityNo} onChange={(v) => set({ electricityNo: v })} maxLength={64} />
      </div>
      <p className="text-xs text-gray-500">Change the locality on Basics; the map pin follows it.</p>
    </div>
  );
}

function Pricing({ edit, set }) {
  const rent = edit.deal === 'rent';
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {rent ? <Input label={'Security deposit (\u20B9)'} type="number" value={edit.deposit} onChange={(v) => set({ deposit: v })} /> : null}
        <Input label={'Maintenance (\u20B9/month)'} type="number" value={edit.maintenance} onChange={(v) => set({ maintenance: v })} />
        <Pick label="Price negotiable" value={edit.negotiable} onChange={(v) => set({ negotiable: v })} options={YES_NO_OPTS.slice(1)} />
        {rent ? (
          <div className="block text-sm">
            <span className={labelCls}>Available from</span>
            <DateField value={edit.availableOn} onChange={(v) => set({ availableOn: v })} ariaLabel="Available from" />
          </div>
        ) : null}
        {rent ? <Pick label="Pets allowed" value={edit.pets} onChange={(v) => set({ pets: v })} options={YES_NO_OPTS} /> : null}
      </div>
      {rent ? <Chips label="Preferred tenants" options={TENANT_OPTS} value={edit.tenants} onChange={(v) => set({ tenants: v })} /> : null}
    </div>
  );
}

function About({ edit, set }) {
  return (
    <div className="space-y-3">
      <label className="block text-sm">
        <span className={labelCls}>Description</span>
        <textarea rows={6} maxLength={4000} value={edit.desc} onChange={(e) => set({ desc: e.target.value })} className="dz-input resize-y" />
      </label>
      {isLand(edit.type) ? null : (
        <Chips label="Amenities" options={amenityOpts(edit._full?.amenities).map((a) => [a, a])} value={edit.amenities} onChange={(v) => set({ amenities: v })} />
      )}
    </div>
  );
}

export default function PropertyEditModal({ edit, setEdit, onClose, onSubmit, saving, canSetStatus }) {
  const [picking, setPicking] = useState(false);
  const [tab, setTab] = useState('basics');
  const [loadError, setLoadError] = useState('');
  const id = edit?.id;

  // Queue rows are slim, so everything past Basics comes from one read of the whole listing.
  useEffect(() => {
    if (!id) return undefined;
    let live = true;
    setTab('basics');
    setLoadError('');
    getModerationProperty(id)
      .then((full) => { if (live) setEdit((prev) => (prev?.id === id ? { ...prev, ...detailsOf(full), _full: full } : prev)); })
      .catch((err) => { if (live) setLoadError(err?.message || 'Could not load the listing'); });
    return () => { live = false; };
  }, [id, setEdit]);

  if (!edit) return null;
  const set = (patch) => setEdit((prev) => ({ ...prev, ...patch }));
  const photoRemoved = (updated) => setEdit((prev) => {
    const status = updated?.status;
    const moved = status && status !== prev._ref.status;
    return {
      ...prev,
      _full: { ...prev._full, gallery: updated?.gallery ?? [], image: updated?.image ?? null },
      ...(moved ? { status, _ref: { ...prev._ref, status } } : {}),
    };
  });
  const tabs = canSetStatus ? TABS : TABS.filter(([key]) => key !== 'photos');
  const panel = () => {
    if (tab === 'basics') return <Basics edit={edit} set={set} setPicking={setPicking} canSetStatus={canSetStatus} />;
    if (!edit._full) {
      return loadError
        ? <p role="alert" className="text-sm text-rose-300">Could not load the full listing ({loadError}). Basics can still be saved.</p>
        : <p className="text-sm text-gray-400">Loading the listing{'\u2026'}</p>;
    }
    if (tab === 'details') return <Details edit={edit} set={set} />;
    if (tab === 'location') return <Location edit={edit} set={set} />;
    if (tab === 'pricing') return <Pricing edit={edit} set={set} />;
    if (tab === 'about') return <About edit={edit} set={set} />;
    return <SubmittedPhotos listing={edit._full} onPhotoRemoved={photoRemoved} />;
  };

  return (
    <Modal
      open={!!edit}
      onClose={onClose}
      title="Edit listing"
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={saving} className="dz-btn dz-btn-ghost">Cancel</button>
          <button type="button" onClick={onSubmit} disabled={saving || picking} className="dz-btn dz-btn-primary disabled:opacity-40"><Save className="h-4 w-4" /> {saving ? 'Saving\u2026' : 'Save changes'}</button>
        </>
      }
    >
      <div role="tablist" aria-label="Listing fields" className="no-scrollbar -mt-1 mb-4 flex gap-1 overflow-x-auto border-b border-white/10">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`edit-tab-${key}`}
            aria-controls="edit-panel"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={classNames('relative -mb-px inline-flex min-h-[40px] flex-shrink-0 items-center border-b-2 px-3 text-sm font-semibold transition-colors', tab === key
              ? 'border-brand-teal text-white'
              : 'border-transparent text-gray-400 hover:text-gray-200')}
          >
            {label}
          </button>
        ))}
      </div>
      <div id="edit-panel" role="tabpanel" aria-labelledby={`edit-tab-${tab}`} className="min-h-[18rem]">
        {panel()}
      </div>
    </Modal>
  );
}
