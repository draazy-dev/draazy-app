import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { removeListingPhoto } from '../../../../services/propertyService.js';
import { useToast } from '../../../../context/ToastContext.jsx';

export const PHOTO_REMOVAL_REASONS = [
  { code: 'not_the_property', label: 'Not this property' },
  { code: 'people_visible', label: 'People visible' },
  { code: 'contact_info', label: 'Contact details shown' },
  { code: 'other', label: 'Other' },
];

export default function RemovePhoto({ listing, photo, onRemoved }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!reason || busy) return;
    setBusy(true);
    try {
      const updated = await removeListingPhoto(listing.uuid || listing.id, photo, reason);
      toast('Photo removed \u2014 owner notified');
      setOpen(false);
      setReason('');
      onRemoved(updated);
    } catch (err) {
      toast(err?.message || 'Could not remove the photo', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" data-testid="remove-photo" onClick={() => setOpen(true)}
        className="mt-1 inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-rose-400/30 px-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/10">
        <Trash2 className="h-3.5 w-3.5" /> Remove photo
      </button>
    );
  }
  return (
    <div className="mt-1 space-y-1.5">
      <select data-testid="remove-photo-reason" aria-label="Reason for removing this photo" value={reason}
        onChange={(e) => setReason(e.target.value)} className="dz-input min-h-[44px] w-full text-xs">
        <option value="">Reason…</option>
        {PHOTO_REMOVAL_REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
      </select>
      <div className="flex gap-1.5">
        <button type="button" data-testid="remove-photo-confirm" onClick={confirm} disabled={!reason || busy}
          className="dz-btn dz-btn-danger min-h-[44px] flex-1 text-xs disabled:opacity-50">
          {busy ? 'Removing…' : 'Remove'}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy} className="dz-btn dz-btn-ghost min-h-[44px] text-xs">
          Cancel
        </button>
      </div>
    </div>
  );
}
