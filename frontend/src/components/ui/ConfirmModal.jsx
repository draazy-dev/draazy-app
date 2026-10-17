import Modal from './Modal.jsx';

export default function ConfirmModal({ title, message, confirmLabel, cancelLabel, danger = false, onConfirm, onCancel }) {
  return (
    <Modal open onClose={onCancel} title={title} size="sm">
      <div className="space-y-4" data-testid="confirm-modal">
        <p className="text-gray-300 text-sm">{message}</p>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onConfirm} data-testid="confirm-modal-ok" className={`${danger ? 'btn-danger' : 'btn-teal'} flex-1 min-h-[44px] rounded-xl text-sm font-semibold`}>{confirmLabel}</button>
          <button type="button" onClick={onCancel} className="btn-outline flex-1 min-h-[44px] rounded-xl text-sm font-semibold">{cancelLabel}</button>
        </div>
      </div>
    </Modal>
  );
}
