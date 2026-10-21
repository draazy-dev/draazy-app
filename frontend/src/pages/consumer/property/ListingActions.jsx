import { useTranslation } from 'react-i18next';
import Icon from '../../../components/Icon.jsx';
import { useCompare } from '../../../context/CompareContext.jsx';
import { useSaved } from '../../../context/SavedContext.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useSignInGate } from '../../../lib/useSignInGate.js';
import { shareOrCopy } from '../../../lib/share.js';
import { usePrefetchReferralCode } from '../../../lib/usePrefetchReferralCode.js';

const ON_PHOTO = 'heart-on-photo w-11 h-11 flex items-center justify-center rounded-full cursor-pointer transition-colors';

// The shortlist is one shared set, so threading `saved`/`setSaved` in from the property page would
// be a second source of the same truth, free to disagree with the heart on the card behind it.
export function PhotoActions({ p }) {
  usePrefetchReferralCode();
  const { t } = useTranslation();
  const savedList = useSaved();
  const compare = useCompare();
  const { isIn } = useAuth();
  const sendToSignIn = useSignInGate();
  const { toast } = useToast();
  const saved = savedList.has(p.id);
  const inCompare = compare.has(p.id);

  const save = () => {
    if (!isIn) { sendToSignIn('save', undefined, () => savedList.save(p.id, p.uuid)); return; }
    savedList.toggle(p.id, p.uuid);
  };

  const toggleCompare = () => {
    if (!inCompare && compare.count >= 4) { toast(t('property.compareLimitAlert'), 'info'); return; }
    compare.toggle(p.id);
  };

  // Cancelling the OS share sheet rejects with AbortError and must not raise "Couldn't copy link"
  // for something that worked as intended — that logic lives in lib/share.js for every surface.
  const share = async () => {
    const status = await shareOrCopy({ title: p.title || 'Draazy listing' });
    if (status === 'copied') toast(t('property.shareCopied'), 'success');
    if (status === 'failed') toast(t('property.shareCopyFail'), 'error');
  };

  const compareLabel = inCompare ? t('property.removeFromCompare') : t('property.addToCompare');

  return (
    <>
      <button type="button" className={ON_PHOTO + ' absolute top-3 left-3'} onClick={save} aria-label={t('property.saveProperty')} aria-pressed={saved}>
        <Icon name="heart" weight={saved ? 'fill' : 'regular'} className="w-6 h-6" aria-hidden="true" />
      </button>
      <div className="absolute top-3 right-3 flex items-center">
        {/* heart-on-photo turns a pressed control rose; a compared listing reads teal instead. */}
        <button type="button" className={ON_PHOTO + (inCompare ? ' !text-brand-teal-3' : '')} onClick={toggleCompare} aria-label={compareLabel} title={compareLabel} aria-pressed={inCompare}>
          <Icon name="scale" weight={inCompare ? 'fill' : 'regular'} className="w-6 h-6" aria-hidden="true" />
        </button>
        <button type="button" className={ON_PHOTO} onClick={() => void share()} aria-label={t('property.share')}>
          <Icon name="share-network" className="w-6 h-6" aria-hidden="true" />
        </button>
      </div>
    </>
  );
}