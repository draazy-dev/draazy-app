import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { addServiceRequestMessage } from '../services/serviceRequestService.js';
import { timeAgo } from '../lib/format.js';

export default function TrackerChat({ request, open, onSent }) {
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
  const messages = request.messages || [];

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  const send = async (event) => {
    event.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await addServiceRequestMessage(request.id, body);
      setText('');
      onSent();
    } catch (e) {
      console.warn('[service-tracker] send message failed', e);
      toast('Message could not be sent. Please try again.', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <section aria-label="Messages with our team" className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/20">
      <header className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-teal/20"><Icon name="headset" className="h-3.5 w-3.5 text-teal-300" /></span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-white">Draazy team</p>
          <p className="text-[11px] text-gray-500">Replies appear here</p>
        </div>
      </header>
      <div ref={listRef} className="max-h-72 space-y-3 overflow-y-auto px-3 py-3" aria-live="polite">
        {messages.length ? messages.map((x, i) => {
          const mine = x.from === 'user';
          return (
            <div key={x.id || i} className={'flex flex-col ' + (mine ? 'items-end' : 'items-start')}>
              <p className={'max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ' + (mine ? 'rounded-br-md bg-brand-teal/25 text-teal-50' : 'rounded-bl-md bg-white/10 text-gray-100')}>{x.text}</p>
              <span className="mt-0.5 px-1 text-[10px] text-gray-500">{mine ? 'You' : 'Draazy team'}{x.at ? ` · ${timeAgo(x.at)}` : ''}</span>
            </div>
          );
        }) : (
          <div className="py-4 text-center">
            <Icon name="message-circle" className="mx-auto h-6 w-6 text-gray-600" />
            <p className="mt-1 text-xs text-gray-400">Questions about this request? Ask here.</p>
          </div>
        )}
      </div>
      {open ? (
        <form onSubmit={send} className="flex items-center gap-2 border-t border-white/10 p-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={4000}
            aria-label="Message our team"
            placeholder="Type a message…"
            className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-teal-400/50"
          />
          <button type="submit" disabled={!text.trim() || sending} aria-label="Send" className="btn-teal flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:opacity-40">
            <Icon name={sending ? 'loader-2' : 'send'} className={'h-4 w-4' + (sending ? ' animate-spin' : '')} />
          </button>
        </form>
      ) : (
        <p className="border-t border-white/10 px-3 py-2 text-center text-[11px] text-gray-500">This request is closed, so new messages are off.</p>
      )}
    </section>
  );
}
