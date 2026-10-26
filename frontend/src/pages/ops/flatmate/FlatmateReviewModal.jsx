import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ExternalLink, MapPin, Pencil, User, Users } from 'lucide-react';
import Modal from '../../../components/ui/Modal.jsx';
import Badge from '../../../components/ui/Badge.jsx';
import Loading from '../../../components/ui/Loading.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import { classNames, fmtINR } from '../../../lib/format.js';
import { detailPath } from '../../consumer/flatmates/helpers.js';
import {
  decideFlatmateReview,
  editFlatmateAsModerator,
  getFlatmateModerationDetail,
  moderateFlatmatePost,
  moderateGroupApplication,
  revokeFlatmateReview,
} from '../../../services/flatmateService.js';
import { Block, fmtDate } from './board.jsx';
import { entryKind, entrySummary, MOD_LABEL } from './FlatmateQueueCard.jsx';
import PostDetails, { PostOverview } from './review-modal/PostDetails.jsx';
import EditDetails from './review-modal/EditDetails.jsx';
import BadgeSection from './review-modal/BadgeSection.jsx';
import BadgeRequestBanner from './review-modal/BadgeRequestBanner.jsx';
import DecisionSection from './review-modal/DecisionSection.jsx';

const KIND_LABEL = { post: 'Seeker post', room: 'Room', group: 'Group' };
const PUBLIC = ['approved', 'live'];
const SECTIONS = [['overview', 'Overview'], ['details', 'Details']];
const COLUMN = 'lg:max-h-[calc(100dvh-15rem)]';

function priceOf({ room, group, post }) {
  if (room?.budget) return { price: fmtINR(room.budget), note: room.priceBasis === 'room' ? 'Monthly rent · whole room' : 'Monthly rent · per person' };
  if (group?.rent) return { price: fmtINR(group.rent), note: 'Monthly rent' };
  if (post?.budget) return { price: post.budgetMax ? `${fmtINR(post.budget)} – ${fmtINR(post.budgetMax)}` : fmtINR(post.budget), note: 'Monthly budget' };
  return { price: '', note: '' };
}

function Summary({ title, chips, locality, author, mobile, price, priceNote }) {
  return (
    <div data-testid="review-summary" className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="break-words text-lg font-extrabold text-white">{title || 'Untitled'}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">{chips}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-300">
          {locality ? <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {locality}</span> : null}
          {author ? (
            <span className="inline-flex items-center gap-1">
              <User className="h-3.5 w-3.5" /> {author}
              {mobile ? <a href={`tel:${mobile}`} className="ml-1 text-brand-teal hover:underline">{mobile}</a> : null}
            </span>
          ) : null}
        </div>
      </div>
      {price ? (
        <div className="text-right">
          <div className="text-2xl font-extrabold text-teal-300">{price}</div>
          <div className="mt-0.5 text-xs text-gray-400">{priceNote}</div>
        </div>
      ) : null}
    </div>
  );
}

function Tabs({ active, onChange }) {
  return (
    <div role="tablist" aria-label="Post sections" className="flex gap-1 overflow-x-auto border-b border-white/10 no-scrollbar">
      {SECTIONS.map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="tab"
          id={`fm-review-tab-${key}`}
          aria-controls="fm-review-panel"
          aria-selected={active === key}
          onClick={() => onChange(key)}
          className={classNames('relative -mb-px inline-flex min-h-[40px] flex-shrink-0 items-center border-b-2 px-3 text-sm font-semibold transition-colors', active === key
            ? 'border-brand-teal text-white'
            : 'border-transparent text-gray-400 hover:text-gray-200')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/* The Properties desk's frame: the post on the left, everything that decides it in the right rail. */
function Layout({ main, rail }) {
  return (
    <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6 lg:space-y-0" data-testid="flatmate-review-modal">
      <div className={classNames('min-w-0 space-y-4 lg:flex lg:flex-col', COLUMN)}>{main}</div>
      <aside aria-label="Decision" className={classNames('space-y-4 lg:overflow-y-auto lg:pr-1', COLUMN)}>{rail}</aside>
    </div>
  );
}

function ApplicationBody({ app, busy, onDecide }) {
  return (
    <Layout
      main={(
        <>
          <Summary
            title={app.groupTitle || 'Group application'}
            chips={(
              <>
                <span className="dz-tag border border-white/10 text-gray-300">Group application</span>
                <Badge status={app.status}>{`Owner: ${app.status}`}</Badge>
              </>
            )}
            locality={app.locality}
            author={app.applicantName}
            mobile={app.applicantMobile}
            price={app.rent == null ? '' : fmtINR(app.rent)}
            priceNote="Flat rent / month"
          />
          <Block icon={Users} title="Application">
            <dl className="grid gap-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
              <dt className="text-gray-400">Applying to</dt><dd className="break-words text-gray-100">{app.listingTitle || '—'}</dd>
              <dt className="text-gray-400">Applicant</dt><dd className="text-gray-100">{app.applicantName || '—'}</dd>
              <dt className="text-gray-400">Group size</dt><dd className="text-gray-100">{app.members} of {app.seatsTotal} seats</dd>
              <dt className="text-gray-400">Per head</dt><dd className="text-gray-100">{app.perHead == null ? '—' : fmtINR(app.perHead)}</dd>
              <dt className="text-gray-400">Applied</dt><dd className="text-gray-100">{fmtDate(app.at)}</dd>
            </dl>
            <p className="mt-3 text-xs text-gray-500">The owner&apos;s accept or decline is theirs. This desk only decides whether the application may stand.</p>
          </Block>
        </>
      )}
      rail={<DecisionSection modStatus={app.modStatus} publishLabel="Clear" busy={busy} onDecide={onDecide} />}
    />
  );
}

export default function FlatmateReviewModal({ entry, onClose, onChanged }) {
  const { toast } = useToast();
  const kind = entryKind(entry);
  const isApp = kind === 'application';
  const [detail, setDetail] = useState({ status: isApp ? 'ready' : 'loading', data: null, error: '' });
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [section, setSection] = useState('overview');

  useEffect(() => {
    if (isApp) return undefined;
    let alive = true;
    getFlatmateModerationDetail(entry.key)
      .then((data) => { if (alive) setDetail({ status: 'ready', data, error: '' }); })
      .catch((e) => { if (alive) setDetail({ status: 'error', data: null, error: e.message || 'Could not load this post.' }); });
    return () => { alive = false; };
  }, [entry.key, isApp, nonce]);

  // The server's refusal is shown verbatim: it names the missing field or reason.
  const run = useCallback(async (work, message, tone, close) => {
    setBusy(true);
    try {
      await work();
      toast(message, tone);
      onChanged();
      if (close) onClose(); else setNonce((n) => n + 1);
    } catch (e) {
      toast(e.message || 'That decision was refused.', 'error');
    } finally {
      setBusy(false);
    }
  }, [toast, onChanged, onClose]);

  const moderate = (current) => (next, note) => {
    const settled = next === current;
    const message = settled ? 'Re-check cleared' : next === 'approved' ? (isApp ? 'Cleared' : 'Published — it is on the board now') : `Marked ${next}`;
    const work = isApp
      ? () => moderateGroupApplication(entry.application.id, next, note)
      : () => moderateFlatmatePost(entry.key, next, note);
    return run(work, message, settled || next === 'approved' ? 'success' : 'error', true);
  };

  const [decided, setDecided] = useState(null);
  // The list row is a card with no agreement file or mobile, so the badge section waits for the detail read.
  const review = decided || detail.data?.review || null;
  const decideBadge = (decision, note, checks) => run(
    async () => setDecided(await decideFlatmateReview(review.id, decision, note, checks)),
    decision === 'approved' ? 'Approved — the host now shows Verified property' : 'Rejected — the host is told why',
    decision === 'approved' ? 'success' : 'error',
    false,
  );
  const revokeBadge = (reason) => run(
    async () => setDecided(await revokeFlatmateReview(review.id, reason)),
    'Verified property removed — the host is told why',
    'error',
    false,
  );

  const saveEdit = async (changes) => {
    if (!Object.keys(changes).length) { setEditing(false); return; }
    setBusy(true);
    try {
      setDetail({ status: 'ready', data: await editFlatmateAsModerator(entry.key, changes), error: '' });
      setEditing(false);
      toast('Details updated', 'success');
      onChanged();
    } catch (e) {
      toast(e.message || 'Could not save these changes.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const summary = entrySummary(entry);
  const claim = review || entry.review;
  const seeking = entry.review && claim.status === 'pending';
  const d = detail.data;
  const item = d?.item;
  const { price, note: priceNote } = d ? priceOf(d) : { price: '', note: '' };
  const live = item && PUBLIC.includes(item.modStatus);

  return (
    <Modal
      open
      onClose={onClose}
      title={isApp ? 'Review group application' : entry.review ? 'Review Verified property request' : 'Review flatmate post'}
      size="xl"
      footer={(
        <>
          {isApp ? null : live ? (
            <Link to={detailPath(item.kind, item.id)} target="_blank" rel="noopener noreferrer" className="dz-btn dz-btn-ghost mr-auto">
              <ExternalLink className="h-4 w-4" /> Open live post
            </Link>
          ) : (
            <span className="mr-auto text-xs italic text-gray-500">Not live on the board</span>
          )}
          {d && !editing ? <button type="button" onClick={() => setEditing(true)} className="dz-btn dz-btn-ghost"><Pencil className="h-4 w-4" /> Edit details</button> : null}
          <button type="button" onClick={onClose} className="dz-btn dz-btn-ghost">Close</button>
        </>
      )}
    >
      {isApp ? (
        <ApplicationBody app={entry.application} busy={busy} onDecide={moderate(entry.application.modStatus)} />
      ) : (
        <Layout
          main={(
            <>
              {seeking ? <BadgeRequestBanner review={claim} /> : null}
              <Summary
                title={item?.headline || summary.title}
                chips={(
                  <>
                    {item ? <Badge status={item.modStatus}>{MOD_LABEL[item.modStatus] || null}</Badge> : null}
                    <span className="dz-tag border border-white/10 text-gray-300">{KIND_LABEL[item?.kind || kind]}</span>
                    {entry.reasons.map((r) => (
                      <span key={r} className="dz-tag border border-amber-400/30 bg-amber-500/10 text-amber-300">{r}</span>
                    ))}
                  </>
                )}
                locality={item?.locality || summary.locality}
                author={item?.authorName || summary.author}
                mobile={item?.authorMobile || summary.mobile}
                price={price}
                priceNote={priceNote}
              />
              {detail.status === 'loading' ? <Loading /> : null}
              {detail.status === 'error' ? (
                <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">
                  {detail.error}
                  <button type="button" onClick={() => setNonce((n) => n + 1)} className="dz-btn dz-btn-ghost ml-3">Try again</button>
                </div>
              ) : null}
              {d ? (
                <>
                  {editing ? null : <Tabs active={section} onChange={setSection} />}
                  <div id="fm-review-panel" role={editing ? undefined : 'tabpanel'} aria-labelledby={editing ? undefined : `fm-review-tab-${section}`} className="space-y-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-2">
                    {editing ? <EditDetails detail={d} busy={busy} onSave={saveEdit} onCancel={() => setEditing(false)} />
                      : section === 'overview' ? <PostOverview item={item} /> : <PostDetails detail={d} />}
                  </div>
                </>
              ) : null}
            </>
          )}
          rail={(
            <>
              {review ? <BadgeSection key={`${review.id}:${review.status}`} review={review} busy={busy || editing} onDecide={decideBadge} onRevoke={revokeBadge} /> : null}
              {item ? (
                <DecisionSection
                  modStatus={item.modStatus}
                  recheck={item.recheckRequestedAt ? { at: item.recheckRequestedAt, reason: item.recheckReason } : null}
                  busy={busy || editing}
                  onDecide={moderate(item.modStatus)}
                />
              ) : null}
            </>
          )}
        />
      )}
    </Modal>
  );
}
