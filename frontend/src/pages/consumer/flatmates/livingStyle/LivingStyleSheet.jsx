import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../../../../components/ui/Modal.jsx';
import { useToast } from '../../../../context/ToastContext.jsx';
import LivingStyleQuestions, { LoadError } from './LivingStyleQuestions.jsx';
import { STYLE_KEYS, answeredCount } from './questions.js';
import useLivingStyle from './useLivingStyle.js';

export default function LivingStyleSheet({ onClose }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const style = useLivingStyle();
  const [edited, setEdited] = useState(null);
  const draft = edited ?? style.answers;
  const [busy, setBusy] = useState(false);
  const count = answeredCount(draft);

  const save = async () => {
    setBusy(true);
    try {
      await style.save(draft);
      toast(t(count ? 'flatmates.ls.saved' : 'flatmates.ls.cleared'), 'success');
      onClose();
    } catch {
      toast(t('flatmates.ls.saveFailed'), 'error');
      setBusy(false);
    }
  };

  const footer = (
    <>
      <button type="button" onClick={onClose} className="flex-1 rounded-xl px-4 py-2.5 text-sm text-gray-400 hover:text-white hover:bg-white/5">{t('flatmates.ls.skip')}</button>
      <button type="button" onClick={save} disabled={busy || style.status !== 'ready'} data-testid="ls-save" className="flex-1 btn-teal text-white rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60">{t('flatmates.ls.save')}</button>
    </>
  );

  return (
    <Modal open onClose={onClose} title={t('flatmates.ls.title')} footer={footer}>
      <div data-testid="ls-sheet">
        <p className="text-sm text-gray-400">{t('flatmates.ls.benefit')}</p>
        <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
          <span data-testid="ls-progress">{t('flatmates.ls.progress', { n: count, total: STYLE_KEYS.length })}</span>
          <button type="button" onClick={() => setEdited({})} disabled={count === 0} className="underline hover:text-white disabled:opacity-40 disabled:no-underline">{t('flatmates.ls.clearAll')}</button>
        </div>
        <div className="mt-4">
          {style.status === 'error' && <LoadError onRetry={style.reload} />}
          <LivingStyleQuestions answers={draft} onChange={setEdited} disabled={style.status !== 'ready'} />
        </div>
      </div>
    </Modal>
  );
}