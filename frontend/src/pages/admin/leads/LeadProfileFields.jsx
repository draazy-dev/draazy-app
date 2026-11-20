import { useState } from 'react';
import Modal from '../../../components/ui/Modal.jsx';
import { BTN } from '../../../components/admin/WorkQueue.jsx';
import { classNames, fmtINR } from '../../../lib/format.js';
import { Field, PickChips } from './LeadParts.jsx';
import {
  BHK, INTENTS, LEAD_SOURCES, LEAD_TYPES, PROPERTY_TYPES, budgetLabel, profileForm, profileReady, showsBhk, toProfile, toggle, withType,
} from './leadsFormat.js';

const one = (value) => (value ? [value] : []);

function ChipField({ label, children }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-gray-300">{label}</p>
      {children}
    </div>
  );
}

export default function LeadProfileFields({ form, onChange, disabled }) {
  const set = (patch) => onChange({ ...form, ...patch });
  const type = form.leadType;
  const seeker = type === 'seeker';

  return (
    <div className="space-y-4">
      <Field label="Name (optional)">
        <input value={form.name} maxLength={80} disabled={disabled} onChange={(e) => set({ name: e.target.value })} className="dz-input w-full text-base" data-testid="lead-add-name" />
      </Field>
      <ChipField label="Lead type">
        <PickChips label="Lead type" options={LEAD_TYPES} value={one(type)} disabled={disabled} onChange={(v) => onChange(withType(form, v))} />
      </ChipField>
      {type ? (
        <>
          <ChipField label={type === 'flatmate' ? 'Room' : 'Wants to'}>
            <PickChips label="Intent" options={INTENTS[type]} value={one(form.intent)} disabled={disabled} onChange={(v) => set({ intent: v === form.intent ? '' : v })} />
          </ChipField>
          {type !== 'flatmate' ? (
            <ChipField label={seeker ? 'Looking for' : 'Property type'}>
              <PickChips label="Property type" options={PROPERTY_TYPES} value={form.propertyTypes} disabled={disabled} onChange={(v) => set({ propertyTypes: toggle(form.propertyTypes, v) })} />
            </ChipField>
          ) : null}
          {showsBhk(type, form.propertyTypes) ? (
            <ChipField label="BHK">
              <PickChips label="BHK" options={BHK} value={form.bhk} disabled={disabled} onChange={(v) => set({ bhk: toggle(form.bhk, v) })} />
            </ChipField>
          ) : null}
          <Field label={seeker || type === 'flatmate' ? 'Preferred areas' : 'Area'}>
            <input value={form.localities} maxLength={200} disabled={disabled} placeholder="e.g. Baner, Wakad" onChange={(e) => set({ localities: e.target.value })} className="dz-input w-full text-base" data-testid="lead-profile-localities" />
          </Field>
          <Field label={`${budgetLabel(type, form.intent)} (₹)`} hint={Number(form.budget) ? fmtINR(form.budget) : undefined}>
            <input
              type="text"
              inputMode="numeric"
              value={form.budget}
              disabled={disabled}
              maxLength={11}
              onChange={(e) => set({ budget: e.target.value.replace(/\D/g, '') })}
              className="dz-input w-full text-base"
              data-testid="lead-profile-budget"
            />
          </Field>
        </>
      ) : null}
      <ChipField label="Where did this lead come from?">
        <PickChips label="Lead source" options={LEAD_SOURCES} value={one(form.leadSource)} disabled={disabled} onChange={(v) => set({ leadSource: v })} />
      </ChipField>
      {form.leadSource ? (
        <Field label="Source detail (optional)">
          <input value={form.sourceDetail} maxLength={120} disabled={disabled} placeholder="e.g. Pune Flats FB group, referred by Rahul" onChange={(e) => set({ sourceDetail: e.target.value })} className="dz-input w-full text-base" data-testid="lead-profile-source-detail" />
        </Field>
      ) : null}
    </div>
  );
}

export function ProfileSheet({ lead, onClose, onSubmit }) {
  const [form, setForm] = useState(() => profileForm(lead));
  const [busy, setBusy] = useState(false);
  const ready = profileReady(form);

  const submit = async () => {
    setBusy(true);
    const ok = await onSubmit(toProfile(form));
    if (!ok) setBusy(false);
  };

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title="Edit profile"
      footer={(
        <button type="button" disabled={!ready || busy} onClick={submit} className={classNames(BTN.primary, 'min-h-[44px]', (!ready || busy) && 'opacity-50')} data-testid="lead-profile-save">
          Save profile
        </button>
      )}
    >
      <LeadProfileFields form={form} onChange={setForm} disabled={busy} />
    </Modal>
  );
}