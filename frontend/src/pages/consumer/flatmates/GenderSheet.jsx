import { useTranslation } from 'react-i18next';
import useScrollLock from '../../../hooks/useScrollLock.js';
import useModalDialog from '../../../hooks/useModalDialog.js';

export default function GenderSheet({ onPick, onCancel, restrictedTo, kind }) {
  const { t } = useTranslation();
  useScrollLock();
  const panelRef = useModalDialog(true, onCancel);
  const who = t(restrictedTo === 'female' ? 'flatmates.genderWomen' : 'flatmates.genderMen');
  return (
    <div className="sf-modal" onClick={onCancel}>
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t('flatmates.genderSheetTitle')} data-testid="gender-sheet" className="dz-modal-panel border border-white/10 rounded-3xl w-full max-w-sm p-6 outline-none" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-white">{t('flatmates.genderSheetTitle')}</h2>
        <p className="mt-1.5 text-sm text-gray-400">{t('flatmates.genderSheetBody', { kind: t(kind === 'group' ? 'flatmates.kindGroup' : 'flatmates.kindRoom'), who })}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button type="button" onClick={() => onPick('female')} className="btn-teal text-white rounded-xl px-4 py-2.5 text-sm font-semibold">{t('flatmates.optWoman')}</button>
          <button type="button" onClick={() => onPick('male')} className="btn-teal text-white rounded-xl px-4 py-2.5 text-sm font-semibold">{t('flatmates.optMan')}</button>
        </div>
        <button type="button" onClick={onCancel} className="mt-3 w-full rounded-xl px-4 py-2.5 text-sm text-gray-400 hover:text-white hover:bg-white/5">{t('flatmates.cancel')}</button>
      </div>
    </div>
  );
}
