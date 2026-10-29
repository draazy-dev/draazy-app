import { useState } from 'react';
import { Send } from 'lucide-react';
import { classNames } from '../../../lib/format.js';
import { fmtAgo } from './helpers.js';

export default function MessageThread({ messages, onSend }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await onSend(body);
      setText('');
    } catch {
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="rounded-xl border border-white/10 bg-black/10 p-4" aria-labelledby="service-thread-title">
      <h4 id="service-thread-title" className="text-sm font-semibold">Customer thread</h4>
      {messages?.length ? (
        <ul className="mt-3 flex max-h-80 flex-col gap-2 overflow-y-auto pr-1" aria-live="polite">
          {messages.map((message) => {
            const desk = message.from === 'staff';
            return (
              <li key={message.id} className={classNames('flex max-w-[85%] flex-col', desk ? 'items-end self-end' : 'items-start self-start')}>
                <p className={classNames(
                  'whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm',
                  desk ? 'rounded-br-md bg-brand-teal/20 text-teal-50' : 'rounded-bl-md bg-white/10 text-gray-100',
                )}>
                  {message.text}
                </p>
                <span className="mt-0.5 px-1 text-[11px] text-gray-500">{desk ? 'Desk' : 'Customer'} · {fmtAgo(message.at)}</span>
              </li>
            );
          })}
        </ul>
      ) : <p className="mt-3 rounded-xl border border-dashed border-white/10 p-4 text-center text-sm text-gray-500">No messages yet. The customer sees replies in their tracker.</p>}
      <form onSubmit={submit} className="mt-3 flex items-end gap-2 rounded-2xl border border-white/10 bg-white/5 p-1.5 focus-within:border-brand-teal/50">
        <label className="sr-only" htmlFor="service-thread-message">Reply to customer</label>
        <input
          id="service-thread-message"
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={4000}
          className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm outline-none"
          placeholder="Reply to the customer"
        />
        <button type="submit" disabled={!text.trim() || sending} className="dz-btn dz-btn-primary rounded-xl px-3 disabled:opacity-40">
          <Send className="h-4 w-4" aria-hidden="true" /> {sending ? 'Sending…' : 'Send'}
        </button>
      </form>
    </section>
  );
}
