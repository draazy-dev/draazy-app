import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../../../../components/ui/Modal.jsx';
import AvailabilityField from '../../../../components/ui/AvailabilityField.jsx';

export default function RelistModal({ listing, initialDate, onConfirm, onClose }) {
  const { t } = useTranslation();
  const [date, setDate] = useState(initialDate);
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    await onConfirm(date);
  };
  return (
    <Modal open onClose={onClose} title={t('listingLifecycle.relistTitle')}>
      <div className="space-y-4">
        <p className="text-gray-300 text-sm">{t('listingLifecycle.relistAsk', { title: listing.title })}</p>
        <AvailabilityField value={date} onChange={setDate} ariaLabel={t('listingLifecycle.relistDateAria')} className="field w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm" />
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={confirm} disabled={busy || !date} className="btn-teal flex-1 min-h-[44px] rounded-xl text-sm font-semibold">{t('listingLifecycle.relistConfirm')}</button>
          <button type="button" onClick={onClose} disabled={busy} className="btn-outline flex-1 min-h-[44px] rounded-xl text-sm font-semibold">{t('listingLifecycle.relistCancel')}</button>
        </div>
      </div>
    </Modal>
  );
}
