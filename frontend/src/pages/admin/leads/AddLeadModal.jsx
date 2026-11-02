import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import Modal from '../../../components/ui/Modal.jsx';
import { BTN } from '../../../components/admin/WorkQueue.jsx';
import { classNames } from '../../../lib/format.js';
import { addLead } from '../../../services/leadService.js';
import { Field, PickChips } from './LeadParts.jsx';
import LeadProfileFields from './LeadProfileFields.jsx';
import {
  SERVICES, emptyProfile, leadError, profileReady, toProfile, toggle,
} from './leadsFormat.js';

const MOBILE_LEN = 10;

export default function AddLeadModal({ onClose, onAdded, toast }) {
  const [mobile, setMobile] = useState('');
  const [form, setForm] = useState(emptyProfile);
  const [interests, setInterests] = useState([]);
  const [note, setNote] = useState('');
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const mobileOk = mobile.length === MOBILE_LEN && /^[6-9]/.test(mobile);
  const ready = mobileOk && profileReady(form);

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const { lead, existing } = await addLead({
        mobile, profile: toProfile(form), interests, note: note.trim() || undefined,
      });
      toast(existing ? 'Already a lead — opened it' : 'Lead added');
      onAdded(lead);
    } catch (e) {
      toast(leadError(e), 'error');
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title="Add lead"
      footer={(
        <button type="button" disabled={!ready || busy} onClick={submit} className={classNames(BTN.primary, 'min-h-[44px]', (!ready || busy) && 'opacity-50')} data-testid="lead-add-submit">
          Add lead
        </button>
      )}
    >
      <div className="space-y-4">
        <Field label="Mobile number" hint="10 digits, no +91. Re-adding a number updates that lead.">
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="off"
            maxLength={MOBILE_LEN}
            value={mobile}
            onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, MOBILE_LEN))}
            className="dz-input w-full text-base"
            data-testid="lead-add-mobile"
          />
        </Field>
        <LeadProfileFields form={form} onChange={setForm} disabled={busy} />
        <button
          type="button"
          aria-expanded={more}
          onClick={() => setMore((m) => !m)}
          className="flex min-h-[44px] cursor-pointer items-center gap-1.5 text-sm font-medium text-teal-200"
          data-testid="lead-add-more"
        >
          <ChevronDown className={classNames('h-4 w-4 transition-transform', more && 'rotate-180')} aria-hidden="true" />
          Services and note
        </button>
        {more ? (
          <>
            <div>
              <p className="mb-1.5 text-sm font-medium text-gray-300">Interested in</p>
              <PickChips label="Interested in" options={SERVICES} value={interests} onChange={(v) => setInterests((l) => toggle(l, v))} />
            </div>
            <Field label="Note (optional)">
              <textarea value={note} maxLength={500} rows={3} onChange={(e) => setNote(e.target.value)} className="dz-input w-full text-base" data-testid="lead-add-note" />
            </Field>
          </>
        ) : null}
        {mobileOk && !ready ? <p className="text-xs text-amber-200" data-testid="lead-add-missing">Pick a lead type and where it came from.</p> : null}
      </div>
    </Modal>
  );
}
