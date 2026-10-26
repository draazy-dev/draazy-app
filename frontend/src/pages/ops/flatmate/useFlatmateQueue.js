import { useCallback, useEffect, useState } from 'react';
import {
  getFlatmateModerationSummary,
  listFlatmateModeration,
  listFlatmateReviews,
  listGroupApplications,
} from '../../../services/flatmateService.js';

import { claimLabel } from './board.jsx';

const KINDS = ['post', 'room', 'group'];
const PUBLISHED = ['approved', 'live'];
const HIDDEN = ['flagged', 'removed', 'rejected', 'expired'];
// The API's page ceiling. Past it the desk is told the list is partial rather than shown a short one.
const SOURCE_SIZE = 100;

export const QUEUE_TABS = [
  { id: 'pending', label: 'Pending' },
  { id: 'badge', label: 'Badge requests', countKey: 'badgeRequests' },
  { id: 'published', label: 'Published' },
  { id: 'hidden', label: 'Hidden & removed' },
];

function sourcesFor(tab) {
  const size = SOURCE_SIZE;
  if (tab === 'pending') {
    return [
      { type: 'moderation', load: () => listFlatmateModeration({ kind: KINDS, modStatus: ['pending', 'recheck'], size }) },
      { type: 'application', load: () => listGroupApplications({ modStatus: 'pending', sort: 'createdAt,asc', size }) },
    ];
  }
  if (tab === 'badge') {
    return [{ type: 'badge', load: () => listFlatmateReviews({ status: 'pending', size }) }];
  }
  const modStatus = tab === 'published' ? PUBLISHED : HIDDEN;
  return [
    { type: 'post', load: () => listFlatmateModeration({ kind: KINDS, modStatus, sort: 'createdAt,desc', size }) },
    { type: 'application', load: () => listGroupApplications({ modStatus, size }) },
  ];
}

const fromPost = (row) => ({
  id: row.id,
  kind: row.kind,
  headline: row.headline,
  locality: row.locality,
  author: row.authorName,
  authorMobile: row.authorMobile,
  createdAt: row.createdAt,
  modStatus: row.modStatus,
  photoCount: row.photoCount,
  coverPhoto: row.coverPhoto,
  rent: row.rent,
  snippet: row.freeText,
});

// 'new post' must match FlatmatePublication.UNREVIEWED: a flatless post that published itself.
const recheckLabel = (reason) => ((reason || '').split(', ').includes('new post')
  ? 'Live · not yet reviewed' : 'Edited since review');

const badgeReasons = (review) => [
  claimLabel(review.tier),
  ...(review.flagForReview ? ['Contested address'] : []),
  ...(review.tier === 'tenant' && !review.ownerConsent ? ['Owner consent missing'] : []),
];

function entryPatch(type, row) {
  switch (type) {
    case 'moderation':
      return row.recheckRequestedAt
        ? { post: fromPost(row), reasons: [recheckLabel(row.recheckReason)], since: row.recheckRequestedAt }
        : { post: fromPost(row), reasons: ['Awaiting publish'], since: row.createdAt };
    case 'badge':
      return { review: row, reasons: badgeReasons(row), since: row.createdAt };
    case 'application':
      return { application: row, reasons: ['Group application'], since: row.at };
    default:
      return { post: fromPost(row), reasons: [], since: row.createdAt };
  }
}

const keyOf = (type, row) => {
  if (type === 'application') return `application:${row.id}`;
  if (type === 'badge') return row.roomId || row.groupId || `review:${row.id}`;
  return row.id;
};

/* The badge queue is an SLA queue, so the oldest claim leads; every other tab leads with the newest. */
export function buildQueue(results, tab) {
  const byKey = new Map();
  results.forEach(({ type, page }) => page.items.forEach((row) => {
    const key = keyOf(type, row);
    const patch = entryPatch(type, row);
    byKey.set(key, { key, ...patch, latestAt: patch.since });
  }));
  const direction = tab === 'badge' ? 1 : -1;
  const items = [...byKey.values()].sort((a, b) => direction * ((a.since || 0) - (b.since || 0)));
  const truncated = results.some(({ page }) => page.total > page.items.length);
  return { items, truncated };
}
/* One failed source fails the whole tab: a queue missing a third of its rows would read as
   "nothing to do" when the truth is "the read did not work". */
export default function useFlatmateQueue(tab) {
  const [state, setState] = useState({ status: 'loading', items: [], truncated: false, counts: null, error: '' });
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, status: 'loading', error: '' }));
    const sources = sourcesFor(tab);
    // The tab labels are a nicety: without them the desk still works, so their failure is not the queue's.
    const counts = getFlatmateModerationSummary().catch(() => null);
    Promise.all([Promise.all(sources.map((s) => s.load().then((page) => ({ type: s.type, page })))), counts])
      .then(([results, summary]) => {
        if (alive) setState({ status: 'ready', ...buildQueue(results, tab), counts: summary, error: '' });
      })
      .catch((e) => {
        if (alive) setState({ status: 'error', items: [], truncated: false, counts: null, error: e.message || 'Could not read this queue.' });
      });
    return () => { alive = false; };
  }, [tab, nonce]);

  return { ...state, reload };
}
