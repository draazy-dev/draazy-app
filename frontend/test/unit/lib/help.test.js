import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const staffHelpContent = vi.fn();
const staffHelpIndex = vi.fn();
vi.mock('../../../src/services/contentService.js', () => ({
  staffHelpContent: (...a) => staffHelpContent(...a),
  staffHelpIndex: (...a) => staffHelpIndex(...a),
}));
vi.mock('virtual:help-content', () => ({
  sections: [{ id: 's2', order: 2 }, { id: 's1', order: 1 }, { id: 'orphan-section' }],
  categories: [
    { id: 'c1', section: 's1', order: 1 },
    { id: 'c2', section: 's2', order: 2 },
    { id: 'cx', section: 'missing', order: 3 },
  ],
  articles: [
    { slug: 'start', title: 'Getting started', category: 'c1', order: 2, summary: 'Begin here', tags: ['intro'], headings: [{ text: 'Welcome' }], text: 'You can post a rental listing in minutes. Verified owners get a badge.', featured: true },
    { slug: 'alpha', title: 'Alpha rent guide', category: 'c1', order: 1, summary: 'Rent basics', tags: ['rent'], headings: [], text: 'About rent agreements and deposits.' },
    { slug: 'pay', title: 'Payments', category: 'c2', order: 1, summary: 'Pay rent online', tags: [], headings: [{ text: 'Cashfree' }], text: 'Pay rent with UPI. ' + 'x'.repeat(300) },
    { slug: 'lost', title: 'Lost', category: 'cx', order: 1, summary: '', tags: [], headings: [], text: '' },
  ],
  changelog: [{ v: 1 }],
}));

let help;
beforeEach(async () => {
  vi.resetModules();
  staffHelpContent.mockReset();
  staffHelpIndex.mockReset();
  localStorage.clear();
  help = await import('../../../src/lib/help.js');
});
afterEach(() => localStorage.clear());

describe('isStaff', () => {
  it('accepts admin, manager and staff roles only', () => {
    expect(help.isStaff({ role: 'admin' })).toBe(true);
    expect(help.isStaff({ role: 'manager' })).toBe(true);
    expect(help.isStaff({ role: 'staff' })).toBe(true);
    expect(help.isStaff({ role: 'tenant' })).toBe(false);
    expect(help.isStaff(null)).toBe(false);
  });

  it('re-exports the changelog', () => {
    expect(help.changelog).toEqual([{ v: 1 }]);
  });
});

describe('helpTree', () => {
  it('orders sections and drops orphans', () => {
    const tree = help.helpTree();
    expect(tree.sections.map((s) => s.id)).toEqual(['s1', 's2', 'orphan-section']);
    expect(tree.categories.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(tree.articles.map((a) => a.slug)).toEqual(['alpha', 'pay', 'start']);
  });

  it('merges staff content', () => {
    const tree = help.helpTree({
      sections: [{ id: 'staff', order: 0 }],
      categories: [{ id: 'sc', section: 'staff', order: 0 }],
      articles: [{ slug: 'desk', title: 'Desk', category: 'sc', order: 0 }],
    });
    expect(tree.sections[0].id).toBe('staff');
    expect(tree.articles[0].slug).toBe('desk');
  });
});

describe('article lookups', () => {
  it('lists articles in a category', () => {
    expect(help.articlesInCategory('c1').map((a) => a.slug)).toEqual(['alpha', 'start']);
    expect(help.articlesInCategory('nope')).toEqual([]);
  });

  it('prefers featured articles, else the first ones', () => {
    expect(help.featuredArticles().map((a) => a.slug)).toEqual(['start']);
    const staff = { sections: [], categories: [], articles: [] };
    expect(help.featuredArticles(2, staff).map((a) => a.slug)).toEqual(['start']);
  });

  it('finds previous and next articles', () => {
    const [alpha, start] = help.articlesInCategory('c1');
    expect(help.articleNeighbours(alpha)).toEqual({ prev: null, next: start });
    expect(help.articleNeighbours(start)).toEqual({ prev: alpha, next: null });
    expect(help.articleNeighbours(null)).toEqual({ prev: null, next: null });
    expect(help.articleNeighbours({ slug: 'unknown', category: 'c1' })).toEqual({ prev: null, next: null });
  });
});

describe('searchHelp', () => {
  it('ignores short queries', () => {
    expect(help.searchHelp('')).toEqual([]);
    expect(help.searchHelp(' a ')).toEqual([]);
    expect(help.searchHelp(null)).toEqual([]);
  });

  it('ranks title matches above body matches', () => {
    const results = help.searchHelp('rent');
    expect(results.map((r) => r.article.slug)).toEqual(['alpha', 'pay', 'start']);
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it('requires every term to match somewhere', () => {
    expect(help.searchHelp('rent upi').map((r) => r.article.slug)).toEqual(['pay']);
    expect(help.searchHelp('rent zzzz')).toEqual([]);
  });

  it('gives a bonus for word-start matches and respects limit', () => {
    const word = help.searchHelp('listing')[0].score;
    const inner = help.searchHelp('isting')[0].score;
    expect(word).toBeGreaterThan(inner);
    expect(help.searchHelp('rent', { limit: 1 })).toHaveLength(1);
  });

  it('searches tags and headings', () => {
    expect(help.searchHelp('intro').map((r) => r.article.slug)).toEqual(['start']);
    expect(help.searchHelp('cashfree').map((r) => r.article.slug)).toEqual(['pay']);
  });
});

describe('excerptFor', () => {
  it('returns the summary when the query is absent', () => {
    expect(help.excerptFor({ text: 'abc', summary: 'sum' }, 'zzz')).toBe('sum');
    expect(help.excerptFor({ summary: 'sum' }, 'zzz')).toBe('sum');
  });

  it('adds ellipses around a mid-text match', () => {
    const text = `${'a'.repeat(100)}NEEDLE${'b'.repeat(200)}`;
    const out = help.excerptFor({ text }, 'needle');
    expect(out.startsWith('\u2026')).toBe(true);
    expect(out.endsWith('\u2026')).toBe(true);
    expect(out).toContain('NEEDLE');
  });

  it('has no ellipsis when the whole text fits', () => {
    expect(help.excerptFor({ text: 'short NEEDLE text' }, 'needle')).toBe('short NEEDLE text');
  });
});

describe('feedback and recents', () => {
  it('stores and reads feedback, truncating comments', () => {
    expect(help.getFeedback('start')).toBeNull();
    expect(help.saveFeedback('start', true, 'x'.repeat(600))).toBe(true);
    const saved = help.getFeedback('start');
    expect(saved.helpful).toBe(true);
    expect(saved.comment).toHaveLength(500);
    expect(Number.isNaN(Date.parse(saved.at))).toBe(false);
  });

  it('survives corrupt or blocked storage', () => {
    localStorage.setItem('dz_help_feedback_v1', '{bad');
    expect(help.getFeedback('x')).toBeNull();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
    expect(help.saveFeedback('x', false)).toBe(false);
    expect(() => help.markViewed('x')).not.toThrow();
  });

  it('tracks the five most recent views, newest first and deduped', () => {
    ['start', 'alpha', 'pay', 'start', 'a', 'b', 'c'].forEach(help.markViewed);
    expect(JSON.parse(localStorage.getItem('dz_help_recent_v1'))).toEqual(['c', 'b', 'a', 'start', 'pay']);
  });

  it('resolves recents to known articles only', () => {
    localStorage.setItem('dz_help_recent_v1', JSON.stringify(['pay', 'ghost', 'start']));
    expect(help.recentArticles().map((a) => a.slug)).toEqual(['pay', 'start']);
    localStorage.setItem('dz_help_recent_v1', '{bad');
    expect(help.recentArticles()).toEqual([]);
  });
});

describe('staff content loading', () => {
  it('starts empty and loads once, notifying listeners', async () => {
    expect(help.getStaffContent()).toMatchObject({ loaded: false, articles: [] });
    staffHelpContent.mockResolvedValue({ sections: [{ id: 'st' }], categories: [], articles: [{ slug: 'a' }] });
    const notify = vi.fn();
    const off = help.onStaffContent(notify);
    await help.loadStaffContent();
    await help.loadStaffContent();
    expect(staffHelpContent).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(help.getStaffContent()).toMatchObject({ loaded: true, articles: [{ slug: 'a' }] });
    expect(help.getStaffIndex()).toBe(help.getStaffContent());
    off();
  });

  it('marks content loaded-but-empty on failure and allows a retry', async () => {
    staffHelpContent.mockRejectedValueOnce(new Error('403')).mockResolvedValueOnce({ sections: [], categories: [], articles: [] });
    await help.loadStaffContent();
    expect(help.getStaffContent()).toMatchObject({ loaded: true, articles: [] });
    await help.loadStaffContent();
    expect(staffHelpContent).toHaveBeenCalledTimes(2);
  });

  it('loads the lightweight index unless full content is already loading', async () => {
    staffHelpIndex.mockResolvedValue({ sections: [], categories: [], articles: [{ slug: 'i' }] });
    await help.loadStaffIndex();
    await help.loadStaffIndex();
    expect(staffHelpIndex).toHaveBeenCalledTimes(1);
    expect(help.getStaffIndex()).toMatchObject({ loaded: true, articles: [{ slug: 'i' }] });
    staffHelpContent.mockResolvedValue({ sections: [], categories: [], articles: [] });
    const full = help.loadStaffContent();
    expect(help.loadStaffIndex()).toBe(full);
    await full;
  });

  it('marks the index loaded-but-empty on failure', async () => {
    staffHelpIndex.mockRejectedValue(new Error('x'));
    await help.loadStaffIndex();
    expect(help.getStaffIndex()).toMatchObject({ loaded: true, articles: [] });
  });
});
