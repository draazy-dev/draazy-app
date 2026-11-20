import { Clock } from 'lucide-react';
import { BTN, Cell, FactRow, RowCard } from '../../../components/admin/WorkQueue.jsx';
import { classNames } from '../../../lib/format.js';
import { ConsentChip, InterestChips, LeadSourceChip, OwnerChip, SourceChips, StageChip, TypeChip } from './LeadParts.jsx';
import { profileLine, when } from './leadsFormat.js';

export default function LeadCard({ lead, onOpen, onClaim, busy, canClaim }) {
  const unowned = !lead.ownerId;
  const follow = lead.nextFollowUpAt ? when(lead.nextFollowUpAt) : '';
  const wants = profileLine(lead.profile);
  return (
    <RowCard
      testId="lead-row"
      id={lead.id}
      title={(
        <button type="button" onClick={() => onOpen(lead.id)} className="min-h-[44px] max-w-full cursor-pointer truncate text-left text-[15px] font-bold text-white hover:underline" data-testid="lead-open">
          {lead.name || 'Unnamed lead'}
        </button>
      )}
      badges={(
        <>
          <StageChip stage={lead.stage} />
          <TypeChip profile={lead.profile} />
          {lead.due ? (
            <span data-testid="lead-due" className="dz-tag inline-flex items-center gap-1 border border-amber-400/40 bg-amber-500/15 font-semibold text-amber-200">
              <Clock className="h-3 w-3" aria-hidden="true" />Due
            </span>
          ) : null}
        </>
      )}
      meta={(
        <>
          <span className="font-mono">{lead.maskedMobile}</span>
          {wants ? <span className="block text-gray-300" data-testid="lead-wants">{wants}</span> : null}
        </>
      )}
      facts={(
        <>
          <FactRow label="Next"><Cell>{follow || (lead.due ? 'Contact now' : '')}</Cell></FactRow>
          <FactRow label="Last"><Cell>{lead.lastContactAt ? when(lead.lastContactAt) : 'Not contacted yet'}</Cell></FactRow>
        </>
      )}
      chips={(
        <>
          <InterestChips interests={lead.interests} />
          <LeadSourceChip profile={lead.profile} />
          <SourceChips sources={lead.sources} />
          <ConsentChip consent={lead.consent} />
          {!lead.mine ? <OwnerChip lead={lead} /> : null}
        </>
      )}
      primary={unowned && canClaim ? (
        <button type="button" disabled={busy} onClick={() => onClaim(lead)} className={classNames(BTN.primary, 'min-h-[44px]', busy && 'opacity-50')} data-testid="lead-claim">
          Claim
        </button>
      ) : null}
    />
  );
}
