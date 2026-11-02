import { useState } from 'react';
import Modal from '../../../components/ui/Modal.jsx';

export default function CancelDialog({ request, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const refunds = request?.type === 'rental' && request.amount > 0;

  const submit = async (event) => {
    event.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onConfirm(trimmed);
      onClose();
    } catch {
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={!!request} onClose={onClose} title="Cancel request" size="sm">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-gray-300">The customer receives this reason in their request thread and notification.</p>
        {refunds ? (
          <p className="text-sm text-amber-200" data-testid="cancel-refund-note">
            If the customer paid, what is still refundable is raised as a refund for a manager to approve.
          </p>
        ) : null}
        <div>
          <label htmlFor="service-cancel-reason" className="mb-1 block text-sm font-medium">Reason for cancellation</label>
          <textarea
            id="service-cancel-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form.requestSubmit();
              }
            }}
            maxLength={500}
            required
            className="min-h-24 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">Enter to send · Shift+Enter for a new line</p>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="dz-btn dz-btn-ghost">Keep request</button>
          <button type="submit" disabled={!reason.trim() || busy} className="dz-btn dz-btn-danger">{busy ? 'Cancelling…' : 'Cancel and notify'}</button>
        </div>
      </form>
    </Modal>
  );
}
