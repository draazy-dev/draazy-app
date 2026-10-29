import {
  LISTING_REPORT_REASONS,
  SHARE_REPORT_REASONS,
  OWNER_REPORT_REASONS,
  REVIEW_REPORT_REASONS,
} from '../../../lib/reportReasons.js';

const KIND_TO_TARGET = {
  listing: 'property',
  property: 'property',
  user: 'user',
  review: 'review',
  share: 'post',
  post: 'post',
};

const TARGET_TO_KIND = {
  property: 'listing',
  user: 'user',
  review: 'review',
  post: 'share',
};

const warned = new Set();

export function toTargetType(kind) {
  const mapped = KIND_TO_TARGET[kind];
  if (!mapped) {
    if (!warned.has(kind)) {
      warned.add(kind);
      console.warn(
        `[reports] Unknown report kind "${kind}" — filing it as \`property\`. The server validates `
          + 'the reason against the target type, so a wrong type is a 400, not a mislabel. Add it to '
          + 'KIND_TO_TARGET in reportMapper.js.',
      );
    }
    return 'property';
  }
  return mapped;
}

const LABELS_BY_TARGET = {
  property: Object.fromEntries(LISTING_REPORT_REASONS),
  post: Object.fromEntries(SHARE_REPORT_REASONS),
  user: Object.fromEntries(OWNER_REPORT_REASONS),
  review: Object.fromEntries(REVIEW_REPORT_REASONS),
};

export const REASON_LABELS = {
  ...LABELS_BY_TARGET.post,
  ...LABELS_BY_TARGET.user,
  ...LABELS_BY_TARGET.property,
};

export const reasonLabel = (reason, targetType) =>
  LABELS_BY_TARGET[targetType]?.[reason] || REASON_LABELS[reason] || reason || '';


function epoch(iso) {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

const LIVE_STATUSES = new Set(['open', 'reviewing']);

export const canTriage = (report) => LIVE_STATUSES.has(report?.status);

export function toViewModel(r) {
  if (!r) return null;
  return {
    id: r.id,
    kind: TARGET_TO_KIND[r.targetType] || r.targetType,
    targetId: r.targetId || '',
    targetTitle: r.targetTitle || r.targetName || '',
    targetOwner: r.targetName || '',
    ownerMobile: r.targetMobile || '',
    reportedBy: '',
    reason: r.reason || '',
    reasonLabel: reasonLabel(r.reason, r.targetType),
    details: r.details || '',
    status: r.status || 'open',
    actionTaken: '',
    at: epoch(r.createdAt),
    handledAt: 0,
    targetReportCount: Number(r.targetReportCount) || 1,
  };
}

export function toViewModelPage(res, fallback = {}) {
  const rows = Array.isArray(res?.content) ? res.content : [];
  return {
    items: rows.map(toViewModel).filter(Boolean),
    total: res?.totalElements ?? rows.length,
    page: res?.page ?? res?.number ?? fallback.page ?? 0,
    size: res?.size ?? fallback.size ?? rows.length,
    counts: res?.counts || null,
  };
}

export function toReportCreate(report) {
  const out = {
    targetType: toTargetType(report?.kind),
    targetId: String(report?.targetId || ''),
    reason: report?.reason || '',
  };
  const details = String(report?.details || '').trim();
  if (details) out.details = details;
  return out;
}

export function toReportTriage(decision) {
  const status = decision?.status === 'resolved' ? 'dismissed' : decision?.status;
  const out = { status };
  const note = String(decision?.note || '').trim();
  if (note) out.note = note;
  if (decision?.enforcement) out.enforcement = decision.enforcement;
  return out;
}
