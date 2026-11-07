import { useState } from 'react';
import Select from '../../ui/Select.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import { createServiceTicketFromChat } from '../../../services/supportService.js';
import { TEAM_LABEL } from '../../../lib/data/tickets.js';
import { BTN } from '../WorkQueue.jsx';
import { userMessage } from '../../../lib/userMessage.js';

const TEAMS = Object.entries(TEAM_LABEL).map(([value, label]) => ({ value, label }));

/** Hands a chat lead to a service team as an internal ticket; the customer never sees it. */
export default function ServiceTicketForm({ userId, name, propertyId, onDone }) {
  const { toast } = useToast();
  const [team, setTeam] = useState(TEAMS[0].value);
  const [subject, setSubject] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!subject.trim() || busy) return;
    setBusy(true);
    try {
      await createServiceTicketFromChat(userId, { team, subject, note, propertyId });
      toast(`Service ticket raised for ${TEAM_LABEL[team]}`, 'success');
      onDone();
    } catch (err) {
      toast(userMessage(err, 'The ticket was not created. Try again.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-3" data-testid="staff-chat-ticket-form">
      <div>
        <h3 className="text-sm font-bold text-white">New service ticket</h3>
        <p className="text-[11.5px] text-gray-400">Internal lead for a service team. {name} is not notified.</p>
      </div>
      <Select value={team} onChange={setTeam} options={TEAMS} ariaLabel="Team" prefix="Team" size="sm" />
      <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} required placeholder="Subject" aria-label="Ticket subject" className="dz-input w-full py-1.5 text-sm" />
      <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} rows={4} placeholder="Note for the team (optional)" aria-label="Ticket note" className="dz-input w-full resize-none py-1.5 text-sm" />
      <div className="flex justify-end gap-1.5">
        <button type="button" onClick={onDone} className={BTN.ghost}>Cancel</button>
        <button type="submit" disabled={!subject.trim() || busy} className="dz-btn dz-btn-primary py-1 text-xs disabled:opacity-40" data-testid="staff-chat-ticket-submit">Create ticket</button>
      </div>
    </form>
  );
}
