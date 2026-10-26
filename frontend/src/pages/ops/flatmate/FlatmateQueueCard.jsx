import { ClipboardCheck, Clock, MapPin } from 'lucide-react';
import Badge from '../../../components/ui/Badge.jsx';
import NoPhotoPlaceholder from '../../../components/ui/NoPhotoPlaceholder.jsx';
import PropertyImage from '../../../components/ui/PropertyImage.jsx';
import { CHIP, CHIP_TONE, Cell, FactRow } from '../../../components/admin/WorkQueue.jsx';
import { classNames, fmtAgo, fmtINR, lastActivity } from '../../../lib/format.js';

const KIND_LABEL = { post: 'Seeker post', room: 'Room', group: 'Group', application: 'Group application' };
const PRICE_NOTE = { post: 'budget', application: 'flat rent' };
const GROUP = 'mt-2.5 border-t border-white/[0.06] pt-2.5';

const WARN_REASONS = new Set(['Contested address', 'Owner consent missing', 'Edited since review', 'Live · not yet reviewed']);

export const entryKind = (e) => (e.application ? 'application' : e.post?.kind || e.review?.kind || 'post');

export function entrySummary(e) {
  if (e.application) {
    const a = e.application;
    return {
      title: a.groupTitle ? `${a.groupTitle} → ${a.listingTitle || 'a listing'}` : a.listingTitle,
      locality: a.locality,
      author: a.applicantName,
      mobile: a.applicantMobile,
      modStatus: a.modStatus,
      rent: a.rent,
    };
  }
  return {
    title: e.post?.headline || e.review?.address,
    locality: e.post?.locality || null,
    author: e.post?.author || e.review?.host,
    mobile: e.post?.authorMobile || e.review?.hostMobile,
    modStatus: e.post?.modStatus || null,
    rent: e.post?.rent ?? null,
  };
}

export const MOD_LABEL = { flagged: 'Hidden for review', live: 'Published', approved: 'Published' };

/* Same clock as the Properties desk: a pending item nobody opens escalates by colour and by a text token. */
function Age({ since, pending }) {
  if (!since) return <span>—</span>;
  if (!pending) return <span className="tabular-nums">{fmtAgo(since)}</span>;
  const hours = Math.max(0, (Date.now() - since) / 3_600_000);
  const tone = hours >= 48 ? 'breach' : hours >= 24 ? 'warn' : 'ok';
  const ago = hours < 1 ? `${Math.max(1, Math.round(hours * 60))}m` : hours < 48 ? `${Math.floor(hours)}h` : `${Math.floor(hours / 24)}d`;
  return (
    <span className={classNames('inline-flex items-center gap-1 tabular-nums', tone === 'breach' ? 'font-semibold text-rose-300' : tone === 'warn' ? 'font-semibold text-amber-300' : '')}>
      <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
      waiting {ago}{tone === 'warn' ? ' · due soon' : tone === 'breach' ? ' · overdue' : ''}
    </span>
  );
}

export default function FlatmateQueueCard({ entry, pending, onReview }) {
  const kind = entryKind(entry);
  const s = entrySummary(entry);
  const photo = entry.post?.coverPhoto;
  const stamp = lastActivity(entry.post?.createdAt ?? entry.review?.createdAt ?? entry.application?.at, entry.latestAt);
  return (
    <li className="flatmate-queue-card list-card glass min-w-0 overflow-hidden rounded-2xl transition hover:border-white/15 max-md:[&_.lr-img]:h-28" data-testid="flatmate-queue-card" data-key={entry.key}>
      <div className="lr min-w-0">
        <div className="lr-img bg-white/5">
          {photo ? <PropertyImage src={photo} alt="" loading="lazy" /> : <NoPhotoPlaceholder className="h-full w-full" label="" />}
          <div className="absolute left-2 top-2">
            <span className="dz-tag bg-teal-600/60 font-bold uppercase tracking-wider text-teal-50 backdrop-blur">{KIND_LABEL[kind]}</span>
          </div>
        </div>
        <div className="lr-body min-w-0">
          <div className="lr-info min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="min-w-0 truncate text-[15px] font-bold leading-snug text-white" title={s.title || undefined}>{s.title || 'Untitled'}</h3>
              {s.modStatus ? <Badge status={s.modStatus}>{MOD_LABEL[s.modStatus] || null}</Badge> : null}
            </div>
            <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-gray-400">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-teal-400" aria-hidden="true" />
              <span className="min-w-0 truncate">{[s.locality, 'Pune'].filter(Boolean).join(', ')}</span>
            </p>
            {/* A scanning aid only; the popup renders the whole text, which is what gets reviewed. */}
            {entry.post?.snippet ? <p className="mt-1.5 line-clamp-2 break-words text-xs text-gray-400">{entry.post.snippet}</p> : null}
            <dl className={classNames(GROUP, 'space-y-1.5')}>
              <FactRow label="Posted by">
                <Cell className="font-medium text-gray-200 md:col-span-2">{s.author}</Cell>
                <span data-testid="author-mobile" className="truncate tabular-nums md:col-span-2">{s.mobile || '—'}</span>
              </FactRow>
              <FactRow label="Activity">
                {kind === 'room' && entry.post ? <Cell className="tabular-nums">{`${entry.post.photoCount || 0} photos`}</Cell> : null}
                <span className="col-span-2 min-w-0 truncate md:col-span-3"><Age since={entry.since} pending={pending} /></span>
              </FactRow>
              {stamp ? (
                <FactRow label={stamp.verb}>
                  <Cell className="tabular-nums md:col-span-2"><span data-testid="activity-stamp">{stamp.text}</span></Cell>
                </FactRow>
              ) : null}
            </dl>
            {entry.reasons.length ? (
              <div className={classNames(GROUP, 'flex flex-wrap items-center gap-1.5')}>
                {entry.reasons.map((r) => (
                  <span key={r} className={classNames(CHIP, WARN_REASONS.has(r) ? CHIP_TONE.amber : CHIP_TONE.teal)}>{r}</span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="flex w-[212px] shrink-0 flex-col items-end border-l border-white/[0.07] pl-[18px] text-right max-md:w-full max-md:items-start max-md:border-l-0 max-md:border-t max-md:pl-0 max-md:pt-3 max-md:text-left">
            <button type="button" onClick={() => onReview(entry)} className="dz-btn dz-btn-primary dz-btn-sm">
              <ClipboardCheck className="h-3.5 w-3.5" /> Review
            </button>
            {s.rent ? (
              <div className="mt-3">
                <div className="text-lg font-extrabold tabular-nums text-white">
                  {kind === 'post' ? <span className="text-sm font-normal text-gray-400">up to </span> : null}
                  {fmtINR(s.rent)}<span className="text-sm font-normal text-gray-400">/mo</span>
                </div>
                {PRICE_NOTE[kind] ? <div className="mt-0.5 text-[11px] text-gray-400">{PRICE_NOTE[kind]}</div> : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}
