import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const NOTE_MAX = 500;

const ERROR_KEYS = {
  identity_appeal_open: 'alreadyOpen',
  identity_appeal_not_allowed: 'notAllowed',
};

export function appealErrorKey(error) {
  return ERROR_KEYS[String(error?.code || '').toLowerCase()] || null;
}

export function AppealStatus({ appeal }) {
  const { t } = useTranslation();
  if (!appeal) return null;
  return (
    <p data-testid="verify-appeal-status" className="mt-3 border-t border-white/10 pt-3 text-sm leading-6">
      <span className="font-semibold">{t('verifyIdentity.appeal.statusLabel')}: </span>
      {t(`verifyIdentity.appeal.${appeal.status}`)}
    </p>
  );
}

export function AppealForm({ onSubmit, onCancel }) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const ready = note.trim().length > 0;

  async function send(event) {
    event.preventDefault();
    if (!ready || sending) return;
    setSending(true);
    setError('');
    try {
      await onSubmit(note.trim());
    } catch (err) {
      const key = appealErrorKey(err);
      setError(key ? t(`verifyIdentity.appeal.${key}`) : t('verifyIdentity.errors.genericClient'));
      setSending(false);
    }
  }

  return (
    <form onSubmit={send} data-testid="verify-appeal-form" className="mt-4 space-y-3">
      <p className="text-sm leading-6 text-[var(--text-muted)]">{t('verifyIdentity.appeal.hint')}</p>
      <label className="block text-sm">
        {t('verifyIdentity.appeal.noteLabel')}
        <textarea
          data-testid="verify-appeal-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={NOTE_MAX}
          rows={4}
          className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
        />
      </label>
      {error && <div role="alert" className="rounded-xl border border-[var(--rose)]/30 bg-[var(--rose)]/10 px-4 py-3 text-sm text-rose-300">{error}</div>}
      <div className="grid grid-cols-2 gap-3">
        <button type="button" disabled={sending} onClick={onCancel} className="btn btn-secondary">{t('verifyIdentity.actions.cancel')}</button>
        <button type="submit" data-testid="verify-appeal-send" disabled={!ready || sending} className="btn btn-primary">
          {sending ? t('verifyIdentity.appeal.sending') : t('verifyIdentity.appeal.send')}
        </button>
      </div>
    </form>
  );
}
