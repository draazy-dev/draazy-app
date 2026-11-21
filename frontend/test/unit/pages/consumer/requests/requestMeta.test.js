import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  CONNECTION_KINDS,
  requestKey,
  shareLabel,
  threadId,
  leadKey,
  isPending,
  isGroupJoin,
  stateLabel,
  stateTone,
  kindLabel,
  formatSlot,
  messageOf,
  initialsOf,
  remindState,
  targetSlug,
  withdrawCopy,
} from '../../../../../src/pages/consumer/requests/requestMeta.js';

describe('requestMeta', () => {
  it('lists connection kinds', () => {
    expect([...CONNECTION_KINDS].sort()).toEqual(['contact', 'flatmate', 'group', 'offer', 'visit']);
  });

  it('builds request and thread keys', () => {
    expect(requestKey({ kind: 'visit', id: 7 })).toBe('visit:7');
    expect(threadId({ kind: 'visit', id: 7 })).toBe('request:visit:7');
  });

  it('maps share values to labels', () => {
    expect(shareLabel('bring')).toBe('Coming as 2');
    expect(shareLabel('match')).toBe('Wants a room-sharer');
    expect(shareLabel('x')).toBe('');
    expect(shareLabel()).toBe('');
  });

  it('derives lead keys per kind', () => {
    expect(leadKey({ kind: 'contact', id: 1 })).toBe('number:1');
    expect(leadKey({ kind: 'photo', id: 2 })).toBe('photo:2');
    expect(leadKey({ kind: 'flatmate', id: 3 })).toBe('flatmate:3');
    expect(leadKey({ kind: 'group', id: 4 })).toBe('app:4');
    expect(leadKey({ kind: 'document', party: { id: 'p' }, target: { id: 't' } })).toBe('documents:p|t');
    expect(leadKey({ kind: 'document' })).toBe('documents:|');
    expect(leadKey({ kind: 'offer', id: 9 })).toBe('offer:9');
  });

  it('detects pending and group-join items', () => {
    expect(isPending({ state: 'pending' })).toBe(true);
    expect(isPending({ state: 'accepted' })).toBe(false);
    expect(isGroupJoin({ kind: 'flatmate', target: { type: 'group' } })).toBe(true);
    expect(isGroupJoin({ kind: 'flatmate', target: { type: 'room' } })).toBe(false);
    expect(isGroupJoin({ kind: 'visit', target: { type: 'group' } })).toBe(false);
  });

  it('labels and tones states', () => {
    expect(stateLabel({ kind: 'contact', state: 'accepted' })).toBe('Approved');
    expect(stateLabel({ kind: 'visit', state: 'accepted' })).toBe('Confirmed');
    expect(stateLabel({ kind: 'document', state: 'accepted' })).toBe('Granted');
    expect(stateLabel({ kind: 'offer', state: 'accepted' })).toBe('Agreed');
    expect(stateLabel({ kind: 'photo', state: 'accepted' })).toBe('Accepted');
    expect(stateLabel({ kind: 'photo', state: 'countered' })).toBe('Countered');
    expect(stateLabel({ kind: 'photo', state: 'weird' })).toBe('weird');
    expect(stateTone({ state: 'pending' })).toBe('pend');
    expect(stateTone({ state: 'countered' })).toBe('pend');
    expect(stateTone({ state: 'accepted' })).toBe('ok');
    expect(stateTone({ state: 'declined' })).toBe('no');
    expect(stateTone({ state: 'expired' })).toBe('muted');
    expect(stateTone({ state: 'zzz' })).toBe('muted');
  });

  describe('kindLabel and formatSlot', () => {
    afterEach(() => vi.useRealTimers());

    it('labels kinds', () => {
      expect(kindLabel({ kind: 'contact' })).toBe('Number request');
      expect(kindLabel({ kind: 'document' })).toBe('Documents');
      expect(kindLabel({ kind: 'mystery' })).toBe('mystery');
      expect(kindLabel({ kind: 'visit' })).toBe('Visit');
    });

    it('includes the slot for visits', () => {
      const label = kindLabel({ kind: 'visit', slot: '2026-03-10T10:30:00' });
      expect(label.startsWith('Visit')).toBe(true);
      expect(label).toMatch(/10:30\s?am/);
    });

    it('formats slots and rejects invalid dates', () => {
      const out = formatSlot('2026-03-10T15:05:00');
      expect(out).toMatch(/Tue 10 Mar, 3:05\s?pm/);
      expect(formatSlot('not-a-date')).toBe('');
    });
  });

  it('builds a default or custom message', () => {
    expect(messageOf({ kind: 'visit', message: 'Custom' })).toBe('Custom');
    expect(messageOf({ kind: 'visit', target: { title: 'Flat A' } })).toBe('Would like to visit Flat A.');
    expect(messageOf({ kind: 'contact', target: { title: 'Flat A' } })).toContain('Flat A');
    expect(messageOf({ kind: 'photo' })).toBe('Could you add more photos of your listing?');
    expect(messageOf({ kind: 'document', target: { title: 'X' } })).toBe('Would like to see the papers for X.');
    expect(messageOf({ kind: 'offer', target: { title: 'X' } })).toBe('Made an offer on X.');
    expect(messageOf({ kind: 'group', target: { title: 'G' } })).toBe('Would like to connect about G.');
    expect(messageOf({ kind: 'unknown', target: { title: 'Z' } })).toBe('Would like to connect about Z.');
  });

  it('computes initials', () => {
    expect(initialsOf('priya sharma')).toBe('PS');
    expect(initialsOf('Amit Kumar Singh')).toBe('AK');
    expect(initialsOf('  solo ')).toBe('S');
    expect(initialsOf('')).toBe('?');
    expect(initialsOf(null)).toBe('?');
  });

  describe('remindState', () => {
    const now = Date.parse('2026-03-10T10:00:00Z');
    const pending = (nextAt) => ({ state: 'pending', reminders: { nextAt } });

    it('returns null when not pending or no usable timestamp', () => {
      expect(remindState({ state: 'accepted', reminders: { nextAt: '2026-03-10T09:00:00Z' } }, now)).toBeNull();
      expect(remindState({ state: 'pending' }, now)).toBeNull();
      expect(remindState(pending('garbage'), now)).toBeNull();
    });

    it('enables the reminder once the wait has elapsed', () => {
      expect(remindState(pending('2026-03-10T09:59:00Z'), now)).toEqual({ enabled: true, label: 'Remind' });
    });

    it('shows remaining minutes, hours or tomorrow', () => {
      expect(remindState(pending('2026-03-10T10:00:10Z'), now)).toEqual({ enabled: false, label: 'Remind in 1m' });
      expect(remindState(pending('2026-03-10T10:45:00Z'), now)).toEqual({ enabled: false, label: 'Remind in 45m' });
      expect(remindState(pending('2026-03-10T13:30:00Z'), now)).toEqual({ enabled: false, label: 'Remind in 4h' });
      expect(remindState(pending('2026-03-12T10:00:00Z'), now)).toEqual({ enabled: false, label: 'Remind tomorrow' });
    });
  });

  it('extracts the target slug from a link', () => {
    expect(targetSlug({ target: { link: '/property/flat-in-baner?x=1' } })).toBe('flat-in-baner');
    expect(targetSlug({ target: { link: '/property/abc/' } })).toBe('abc');
    expect(targetSlug({ target: {} })).toBe('');
    expect(targetSlug({})).toBe('');
  });

  it('adds the credit note only for contact withdrawals', () => {
    const contact = withdrawCopy({ kind: 'contact' });
    expect(contact).toContain('contact credit comes back');
    expect(contact.startsWith(withdrawCopy({ kind: 'visit' }))).toBe(true);
    expect(withdrawCopy({ kind: 'visit' })).not.toContain('credit');
  });
});
