import { useState } from 'react';
import { Check, Copy, MessageCircle, Phone } from 'lucide-react';
import Modal from '../../../components/ui/Modal.jsx';
import Loading from '../../../components/ui/Loading.jsx';
import { BTN } from '../../../components/admin/WorkQueue.jsx';
import { fmtPhone } from '../../../lib/contact.js';
import { classNames } from '../../../lib/format.js';
import {
  addLeadNote, assignLead, changeLeadStage, claimLead, convertLead, creditConversion, logLeadContact,
  releaseLead, setLeadInterests, setLeadProfile,
} from '../../../services/leadService.js';
import { ConsentChip, OwnerChip, StageChip } from './LeadParts.jsx';
import { ProfileSheet } from './LeadProfileFields.jsx';
import {
  ConversionsSection, InterestsSection, ProfileSection, SignalsSection, Timeline,
} from './LeadSections.jsx';
import { NoteSheet, OutcomeSheet, StageSheet } from './ContactSheets.jsx';
import { ConvertSheet, StaffPickSheet } from './ManageSheets.jsx';
import { OPEN_STAGES, openLink, when } from './leadsFormat.js';
import { useLeadDetail } from './useLeadDetail.js';

const ACT = 'min-h-[44px] flex-1 justify-center';

function ContactBar({ lead, busy, onContact }) {
  const waiting = Boolean(lead.nextContactAfter);
  return (
    <div className="space-y-2" data-testid="lead-contact-bar">
      <div className="flex gap-2">
        <button type="button" disabled={busy || waiting} onClick={() => onContact('call')} className={classNames(BTN.primary, ACT, (busy || waiting) && 'opacity-50')} data-testid="lead-call">
          <Phone className="h-4 w-4" aria-hidden="true" />Call
        </button>
        <button type="button" disabled={busy || waiting} onClick={() => onContact('whatsapp')} className={classNames(BTN.ghost, ACT, (busy || waiting) && 'opacity-50')} data-testid="lead-whatsapp">
          <MessageCircle className="h-4 w-4" aria-hidden="true" />WhatsApp
        </button>
      </div>
      {waiting ? (
        <p className="text-xs text-amber-200" data-testid="lead-cooldown">Next contact after {when(lead.nextContactAfter)}</p>
      ) : null}
    </div>
  );
}

function OwnerActions({ lead, busy, canWrite, canManage, setSheet, act }) {
  const closed = lead.stage === 'do-not-call';
  const mine = lead.mine && canWrite;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {canWrite ? <button type="button" onClick={() => setSheet('note')} className={classNames(BTN.ghost, 'min-h-[44px]')} data-testid="lead-note-open">Add note</button> : null}
      {mine && !closed ? <button type="button" onClick={() => setSheet('stage')} className={classNames(BTN.ghost, 'min-h-[44px]')} data-testid="lead-change-stage">Change stage</button> : null}
      {mine && !closed ? <button type="button" onClick={() => setSheet('convert')} className={classNames(BTN.ghost, 'min-h-[44px]')} data-testid="lead-convert"><Check className="h-4 w-4" aria-hidden="true" />Convert</button> : null}
      {!lead.ownerId && canWrite && !closed ? (
        <button type="button" disabled={busy} onClick={() => act(() => claimLead(lead.id), 'Lead claimed')} className={classNames(BTN.primary, 'min-h-[44px]')} data-testid="lead-claim-detail">Claim</button>
      ) : null}
      {canManage ? <button type="button" onClick={() => setSheet('assign')} className={classNames(BTN.ghost, 'min-h-[44px]')} data-testid="lead-assign">{lead.ownerId ? 'Reassign' : 'Assign'}</button> : null}
      {lead.ownerId && (mine || canManage) ? (
        <button type="button" disabled={busy} onClick={() => act(() => releaseLead(lead.id), 'Lead released')} className={classNames(BTN.danger, 'min-h-[44px]')} data-testid="lead-release">Release</button>
      ) : null}
    </div>
  );
}

function MobileLine({ lead, toast }) {
  if (!lead.mobile) return <p className="mt-2 font-mono text-sm text-gray-400">{lead.maskedMobile}</p>;
  const copy = () => navigator.clipboard?.writeText(lead.mobile)
    .then(() => toast('Number copied'), () => toast('Copy failed', 'error'));
  return (
    <div className="mt-2 flex items-center gap-2">
      <a href={`tel:+91${lead.mobile}`} className="font-mono text-lg font-semibold text-white hover:text-teal-300" data-testid="lead-mobile">
        {fmtPhone(lead.mobile)}
      </a>
      <button type="button" onClick={copy} aria-label="Copy number" className={classNames(BTN.ghost, 'min-h-[44px] min-w-[44px] justify-center')} data-testid="lead-mobile-copy">
        <Copy className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export default function LeadDetail({ id, canWrite, canManage, toast, onClose, onChanged }) {
  const { status, lead, error, busy, act } = useLeadDetail(id, { toast, onChanged });
  const [sheet, setSheet] = useState(null);
  const [contact, setContact] = useState(null);
  const [credit, setCredit] = useState(null);
  const close = () => { setSheet(null); setContact(null); setCredit(null); };

  const startContact = (channel) => {
    const { mobile } = lead;
    openLink(channel === 'call' ? `tel:+91${mobile}` : `https://wa.me/91${mobile}`, channel !== 'call');
    setContact({ channel, mobile });
  };

  const sheetAct = (fn, success) => async (...args) => {
    const ok = await act(() => fn(...args), success);
    if (ok) close();
    return ok;
  };

  const mine = lead?.mine && canWrite;
  const contactable = mine && OPEN_STAGES.includes(lead.stage);

  return (
    <Modal open onClose={onClose} title={lead?.name || 'Lead'} size="lg">
      {status === 'loading' ? <Loading /> : null}
      {status === 'error' ? <p className="text-sm text-rose-200" role="alert">{error}</p> : null}
      {lead ? (
        <div data-testid="lead-detail">
          <div className="flex flex-wrap items-center gap-1.5">
            <StageChip stage={lead.stage} />
            <OwnerChip lead={lead} />
            <ConsentChip consent={lead.consent} />
          </div>
          <MobileLine lead={lead} toast={toast} />
          {lead.nextFollowUpAt ? <p className="mt-1 text-xs text-gray-400">Next follow-up {when(lead.nextFollowUpAt)}</p> : null}
          <div className="mt-4">
            {contactable ? <ContactBar lead={lead} busy={busy} onContact={startContact} /> : null}
            <OwnerActions lead={lead} busy={busy} canWrite={canWrite} canManage={canManage} setSheet={setSheet} act={act} />
          </div>
          <ProfileSection lead={lead} editable={canWrite} onEdit={() => setSheet('profile')} />
          <InterestsSection
            key={lead.interests.join()}
            lead={lead}
            editable={canWrite}
            busy={busy}
            onSave={(list) => act(() => setLeadInterests(id, list), 'Interests saved')}
          />
          <SignalsSection signals={lead.signals} />
          <ConversionsSection conversions={lead.conversions} canCredit={canManage} onCredit={setCredit} />
          <Timeline activities={lead.activities} />
        </div>
      ) : null}

      {contact ? (
        <OutcomeSheet
          channel={contact.channel}
          mobile={contact.mobile}
          onClose={close}
          onSubmit={sheetAct((body) => logLeadContact(id, body), 'Outcome saved')}
        />
      ) : null}
      {sheet === 'stage' ? <StageSheet lead={lead} onClose={close} onSubmit={sheetAct((body) => changeLeadStage(id, body), 'Stage updated')} /> : null}
      {sheet === 'note' ? <NoteSheet onClose={close} onSubmit={sheetAct((text) => addLeadNote(id, text), 'Note added')} /> : null}
      {sheet === 'profile' ? <ProfileSheet lead={lead} onClose={close} onSubmit={sheetAct((body) => setLeadProfile(id, body), 'Profile saved')} /> : null}
      {sheet === 'convert' ? <ConvertSheet leadId={id} toast={toast} onClose={close} onSubmit={sheetAct((reqId) => convertLead(id, reqId), 'Marked as converted')} /> : null}
      {sheet === 'assign' ? <StaffPickSheet title="Assign lead" testId="lead-assign-confirm" toast={toast} onClose={close} onSubmit={sheetAct((staffId) => assignLead(id, staffId), 'Lead assigned')} /> : null}
      {credit ? (
        <StaffPickSheet
          title="Credit conversion to"
          testId="lead-credit-confirm"
          toast={toast}
          onClose={close}
          onSubmit={sheetAct(async (staffId) => { await creditConversion(credit.id, staffId); return null; }, 'Credit changed')}
        />
      ) : null}
    </Modal>
  );
}
