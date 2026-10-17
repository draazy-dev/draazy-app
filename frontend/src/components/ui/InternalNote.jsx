import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, MessageSquareText } from 'lucide-react';
import { addNote, listNotes } from '../../services/noteService.js';
import { classNames } from '../../lib/format.js';

/* The history count is withheld until the read lands: "0 previous notes" is a claim about the case, and showing it
   while still loading would be a false one. */
export default function InternalNote({ entityType, entityId, value, onChange, showHistory = false, className }) {
  const [expanded, setExpanded] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [notes, setNotes] = useState(null);

  useEffect(() => {
    if (!showHistory || !entityType || !entityId) {
      setNotes(null);
      return undefined;
    }
    let alive = true;
    setNotes(null);
    listNotes(entityType, entityId)
      .then((rows) => { if (alive) setNotes(rows); })
      // A history that cannot be read is not a case with no history. Staying at null keeps the
      // toggle hidden rather than asserting a count this component does not have.
      .catch(() => { if (alive) setNotes(null); });
    return () => { alive = false; };
  }, [showHistory, entityType, entityId]);

  return (
    <div className={classNames('mt-3', className)}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition"
      >
        <MessageSquareText className="h-3.5 w-3.5" />
        <span>Internal note (optional)</span>
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {expanded && (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          placeholder="Add a note for the team... (visible only to admins/staff)"
          className="mt-2 dz-input resize-none text-sm"
        />
      )}

      {showHistory && notes?.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setHistoryOpen(!historyOpen)}
            className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300 transition"
          >
            <span>{notes.length} previous note{notes.length > 1 ? 's' : ''}</span>
            {historyOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {historyOpen && (
            <div className="mt-1.5 max-h-40 overflow-y-auto space-y-1.5 rounded-lg border border-white/5 bg-white/[0.02] p-2">
              {notes.map((n) => (
                <div key={n.id} className="text-[11px] leading-relaxed">
                  <div className="flex items-center gap-1.5 text-gray-500">
                    <span className="font-medium text-gray-300">{n.author}</span>
                    {n.action && <span className="dz-tag bg-white/5">{n.action}</span>}
                    {n.at && <span>{new Date(n.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}</span>}
                    {n.editedAt && <span className="text-[10px] italic">edited</span>}
                  </div>
                  <p className="mt-0.5 text-gray-400">{n.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Rejects on a blank note, so callers check the text first; acting without a note is the ordinary case.
export { addNote as submitNote };

/* The decision has already landed when this runs, so a failed note is reported, not thrown: throwing would make the
   caller say the decision failed. */
export async function saveNoteIfAny(entityType, entityId, text, action) {
  const clean = String(text ?? '').trim();
  if (!clean) return { written: false, error: null };
  try {
    await addNote(entityType, entityId, clean, action);
    return { written: true, error: null };
  } catch (error) {
    return { written: false, error };
  }
}


