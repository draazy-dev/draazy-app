import { decideIdentityAppeal } from '../../../services/identityReviewService.js';
import { dateLabel } from './vocabulary.js';

const box = 'rounded-xl border border-sky-400/25 bg-sky-500/[0.06] p-4';

export default function KycAppealPanel({ detail, kase, canWrite, onSettled }) {
  const appeal = detail.appeal;
  if (!appeal) return null;
  const open = appeal.status === 'open';
  const { deciding } = kase;

  const decide = async (outcome) => {
    await kase.decide(() => decideIdentityAppeal(detail.id, outcome), `Could not ${outcome} this appeal.`);
    onSettled();
  };

  return (
    <section className={box} aria-label="Appeal" data-testid="kyc-appeal-panel">
      <p className="text-sm font-semibold text-white">Appeal · {appeal.status}</p>
      <p className="mt-1 text-xs text-gray-400">Opened {dateLabel(appeal.openedAt && Date.parse(appeal.openedAt))}</p>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm text-gray-200">{appeal.note}</p>
      {open && canWrite ? (
        detail.appealCanDecide ? (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button type="button" data-testid="kyc-appeal-uphold" onClick={() => decide('uphold')} disabled={deciding} className="dz-btn dz-btn-danger">Uphold rejection</button>
            {detail.appealCanReopen ? (
              <button type="button" data-testid="kyc-appeal-reopen" onClick={() => decide('reopen')} disabled={deciding} className="dz-btn dz-btn-success">Reopen for review</button>
            ) : <p data-testid="kyc-appeal-purged" className="self-center text-xs text-amber-200">Photos are purged, so this can only be upheld.</p>}
          </div>
        ) : (
          <p className="mt-3 text-xs text-amber-200">A different reviewer than the one who rejected this case must decide the appeal.</p>
        )
      ) : null}
    </section>
  );
}
