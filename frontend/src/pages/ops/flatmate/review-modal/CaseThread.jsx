import { MessageSquare } from 'lucide-react';
import { Block, fmtDate } from '../board.jsx';

export default function CaseThread({ messages }) {
  if (!messages.length) return null;
  return (
    <Block icon={MessageSquare} title="Support thread" className="flatmate-case-thread">
      <ul className="space-y-2" data-testid="flatmate-case-thread">
        {messages.map((m) => (
          <li key={m.id} data-from={m.from} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-gray-200">
            <div className="mb-1 text-xs text-gray-400">{m.from === 'owner' ? 'Host' : 'Draazy Support'} · {fmtDate(m.at)}</div>
            <p className="break-words">{m.body}</p>
          </li>
        ))}
      </ul>
    </Block>
  );
}
