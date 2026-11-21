import { describe, expect, it, vi } from 'vitest';
import {
  FILTERS, STAFF_FILTERS, TYPE_META, collapseNotifications, hasUnreadInFilter, isToday, matchesNotificationFilter,
  notificationBucket, notificationTitle, relativeNotificationTime, safeNotificationLink, staffNotificationBucket,
} from '../../../../src/components/notifications/notificationModel.js';

describe('safeNotificationLink', () => {
  it.each(['/listings', '/a/b-c_d?x=1&y=2#frag', '/p/%20x.html', '/'])('keeps in-app path %s', (link) => {
    expect(safeNotificationLink(link)).toBe(link);
  });

  it.each(['//evil.com', 'https://evil.com', 'javascript:alert(1)', '/a b', '/<script>', '', null, undefined, 5])(
    'falls back for %s', (link) => {
      expect(safeNotificationLink(link)).toBe('/notifications');
    },
  );

  it('uses a custom fallback', () => {
    expect(safeNotificationLink('//x', '/home')).toBe('/home');
  });
});

describe('buckets and filters', () => {
  it('sorts consumer notifications into leads and updates', () => {
    for (const type of ['enquiry', 'price', 'visit', 'share']) expect(notificationBucket({ type })).toBe('leads');
    for (const type of ['match', 'system', 'unknown']) expect(notificationBucket({ type })).toBe('updates');
    expect(notificationBucket(undefined)).toBe('updates');
  });

  it('sorts staff notifications into escalations, work and updates', () => {
    expect(staffNotificationBucket({ type: 'escalation' })).toBe('escalations');
    for (const type of ['queue', 'sla', 'refund', 'service']) expect(staffNotificationBucket({ type })).toBe('work');
    expect(staffNotificationBucket({ type: 'match' })).toBe('updates');
    expect(staffNotificationBucket(null)).toBe('updates');
  });

  it('matches everything for the all filter and the bucket otherwise', () => {
    const lead = { type: 'enquiry' };
    expect(matchesNotificationFilter(lead, 'all')).toBe(true);
    expect(matchesNotificationFilter(lead, 'leads')).toBe(true);
    expect(matchesNotificationFilter(lead, 'updates')).toBe(false);
    expect(matchesNotificationFilter({ type: 'sla' }, 'work', staffNotificationBucket)).toBe(true);
  });

  it('detects unread rows inside a filter', () => {
    const rows = [{ type: 'enquiry', read: true }, { type: 'match', read: false }];
    expect(hasUnreadInFilter(rows, 'all')).toBe(true);
    expect(hasUnreadInFilter(rows, 'leads')).toBe(false);
    expect(hasUnreadInFilter(rows, 'updates')).toBe(true);
    expect(hasUnreadInFilter([], 'all')).toBe(false);
    expect(hasUnreadInFilter([{ type: 'queue', read: false }], 'work', staffNotificationBucket)).toBe(true);
  });

  it('declares filters that every bucket belongs to', () => {
    expect(FILTERS.map((f) => f.key)).toEqual(['all', 'leads', 'updates']);
    expect(STAFF_FILTERS.map((f) => f.key)).toEqual(['all', 'escalations', 'work', 'updates']);
  });
});

describe('collapseNotifications', () => {
  const at = new Date(2026, 5, 10, 12).getTime();

  it('merges same-type, same-link, same-day rows and keeps the newest wording', () => {
    const rows = [
      { id: 1, type: 'enquiry', link: '/chat/1', at, read: true, title: 'old', desc: 'd1' },
      { id: 2, type: 'enquiry', link: '/chat/1', at: at + 5000, read: false, title: 'new', desc: 'd2' },
      { id: 3, type: 'enquiry', link: '/chat/1', at: at - 5000, read: true, title: 'older', desc: 'd0' },
    ];
    const [group] = collapseNotifications(rows);
    expect(group).toMatchObject({ ids: [1, 2, 3], count: 3, read: false, at: at + 5000, title: 'new', desc: 'd2' });
    expect(rows[0].ids).toBeUndefined();
  });

  it('marks a group read only when every member is read', () => {
    const [group] = collapseNotifications([
      { id: 1, type: 'visit', at, read: true }, { id: 2, type: 'visit', at, read: true },
    ]);
    expect(group.read).toBe(true);
  });

  it('keeps rows apart when the type, link or day differs, newest first', () => {
    const day = 86_400_000;
    const out = collapseNotifications([
      { id: 1, type: 'enquiry', link: '/a', at },
      { id: 2, type: 'enquiry', link: '/b', at: at + 1 },
      { id: 3, type: 'visit', link: '/a', at: at + 2 },
      { id: 4, type: 'enquiry', link: '/a', at: at - 2 * day },
      { id: 5, type: 'enquiry', link: 'https://evil.com', at: at + 3, wireType: 'x' },
      { id: 6, type: 'enquiry', link: '//evil', at: at + 3, wireType: 'x' },
    ]);
    expect(out.map((g) => g.ids)).toEqual([[5, 6], [3], [2], [1], [4]]);
  });

  it('groups by wire type when one is provided and tolerates missing times', () => {
    const out = collapseNotifications([
      { id: 1, type: 'system', wireType: 'a', link: '/x' },
      { id: 2, type: 'system', wireType: 'b', link: '/x' },
      { id: 3, type: 'system', wireType: 'a', link: '/x' },
    ]);
    expect(out.map((g) => g.count).sort()).toEqual([1, 2]);
  });

  it('returns nothing for no rows', () => {
    expect(collapseNotifications([])).toEqual([]);
  });
});

describe('notificationTitle', () => {
  it('shows the title of a single notification', () => {
    expect(notificationTitle({ title: 'Hi', count: 1 })).toBe('Hi');
    expect(notificationTitle({ title: 'Hi' })).toBe('Hi');
    expect(notificationTitle({})).toBe('');
  });

  it('summarises a group by its type', () => {
    expect(notificationTitle({ count: 3, type: 'price' })).toBe('3 new price updates');
    expect(notificationTitle({ count: 2, type: 'nope' })).toBe('2 new updates');
    expect(Object.keys(TYPE_META)).toContain('contactReturned');
  });
});

describe('relativeNotificationTime and isToday', () => {
  const NOW = new Date(2026, 5, 10, 12).getTime();
  const t = (key) => key.replace('notifications.time.', '');

  const ago = (ms) => { vi.useFakeTimers({ now: NOW }); const out = relativeNotificationTime(NOW - ms, t); vi.useRealTimers(); return out; };

  it.each([
    [0, 'justNow'], [59_000, 'justNow'], [60_000, '1 min'], [29 * 60_000, '29 min'],
    [3_600_000, '1 hour'], [5 * 3_600_000, '5 hours'], [86_400_000, '1 day'], [3 * 86_400_000, '3 days'],
  ])('renders %i ms ago as %s', (ms, expected) => {
    expect(ago(ms)).toBe(expected);
  });

  it('treats a future or missing time as just now', () => {
    vi.useFakeTimers({ now: NOW });
    expect(relativeNotificationTime(NOW + 10_000, t)).toBe('justNow');
    expect(relativeNotificationTime(undefined, t)).toBe('justNow');
    vi.useRealTimers();
  });

  it('knows whether a time falls on today', () => {
    vi.useFakeTimers({ now: NOW });
    expect(isToday(NOW)).toBe(true);
    expect(isToday(new Date(2026, 5, 10, 1).getTime())).toBe(true);
    expect(isToday(new Date(2026, 5, 9, 23).getTime())).toBe(false);
    expect(isToday(undefined)).toBe(false);
    vi.useRealTimers();
  });
});
