import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutGrid } from 'lucide-react';
import { useToast } from '../../../context/ToastContext.jsx';
import { splitProperty } from '../../../services/flatmateService.js';
import SplitFlatModal from '../flatmates/SplitFlatModal.jsx';
import { userMessage } from '../../../lib/userMessage.js';

export default function PostSuccessSplitNudge({ listing }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);

  const confirm = async ({ maxOccupants, rooms }) => {
    let created;
    try {
      created = await splitProperty(listing?.uuid || listing?.id, { maxOccupants, rooms });
    } catch (err) {
      toast(userMessage(err, t('listProperty.split.failed')), 'error');
      return;
    }
    setOpen(false);
    setDone(true);
    const count = created?.rooms?.length || rooms.length;
    const unbadged = (created?.rooms || []).some((r) => !r.verified);
    toast(
      unbadged ? t('listProperty.split.donePending', { count }) : t('listProperty.split.done', { count }),
      'success',
    );
  };

  if (done) {
    return (
      <p className="mt-6 text-xs text-emerald-300 flex items-center justify-center gap-1.5">
        <LayoutGrid className="w-3.5 h-3.5" /> {t('listProperty.split.liveNote')}
      </p>
    );
  }

  return (
    <>
      <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left">
        <p className="text-sm font-semibold text-white">{t('listProperty.split.nudgeTitle')}</p>
        <p className="text-xs text-gray-400 mt-1 leading-relaxed">{t('listProperty.split.nudgeBody')}</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn-ghost mt-3 h-9 inline-flex items-center gap-1.5 px-3.5 rounded-full text-teal-300 text-xs font-semibold"
        >
          <LayoutGrid className="w-3.5 h-3.5" /> {t('listProperty.split.nudgeCta')}
        </button>
      </div>
      {open && <SplitFlatModal listing={listing} onClose={() => setOpen(false)} onConfirm={confirm} />}
    </>
  );
}
