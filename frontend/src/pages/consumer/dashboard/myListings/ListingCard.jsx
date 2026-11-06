import Icon from '../../../../components/Icon.jsx';
import PropertyImage from '../../../../components/ui/PropertyImage.jsx';
import ListingStatusCard, { getOwnerListingStatusMeta, mayResubmit } from '../../../../components/listing/ListingStatusCard.jsx';
import { flatmateCaseKey } from '../../../../lib/data/myListings.js';
import { useVerification } from '../../../../context/VerificationContext.jsx';
import { fmtINR, fmtNum, fmtDate } from '../../../../lib/format.js';
import { onlySeeksOwnershipBadge } from '../../../../lib/recheckFields.js';
import { qualityTips, qualityColor } from '../../../../lib/qualityScore.js';
import { listingFreshness } from '../../../../lib/freshness.js';
import { availabilityLabel } from '../../../../lib/availability.js';
import { canSplitIntoRooms } from '../../../../lib/data/flatSplit.js';
import { detailPath, roomEditHref } from '../../flatmates/helpers.js';
import PassValueLine from '../../../../components/billing/PassValueLine.jsx';
import { passSlug } from '../../../../lib/dealPlans.js';
import StatChip from './StatChip.jsx';
import CardActions from './CardActions.jsx';
import {
  FURNISH_LABEL, LISTING_STATUS_CLS, STATUS_LABEL, STATUS_ICON, FRESHNESS_ICON,
} from './helpers.js';

export default function ListingCard({
  l, review = null, split = null,
  navigate, openReview,
  onConfirmFresh, onReopen, onMarkUnderOffer, onFinalize, onDelete,
  onSplit, onUnsplit, onPause, onResume, onShare, onOpenTools, onEditGroup, onEditPost, onRenew, quota = null, passPrice = '', t,
}) {
  const unread = review?.unread || 0;
  const dealStatus = l.dealStatus || 'active';
  const closed = dealStatus === 'closed';
  const reserved = dealStatus === 'reserved';
  const isSale = l.deal === 'buy' || l.deal === 'sale';
  const displayStatus = closed ? (isSale ? 'sold' : 'rented') : reserved ? 'under_offer' : l.status;
  const fr = !l.flatmate && !closed && l.status === 'approved' ? listingFreshness(l) : null;
  const leads = !l.flatmate ? l.pendingLeads || 0 : 0;
  const qScore = !l.flatmate && Number.isFinite(l.qualityScore) ? l.qualityScore : null;
  const qMeta = qScore === null ? null : qualityColor(qScore);
  const qTone = qScore >= 80 ? 'emerald' : qScore >= 60 ? 'amber' : 'rose';
  const hasReview = !closed && !reserved && !!review;
  const ownerStatusMeta = !l.flatmate && !closed && !reserved ? getOwnerListingStatusMeta(l, review, t) : null;
  const resubmittable = mayResubmit(ownerStatusMeta?.state, review);
  const finalRejected = ownerStatusMeta?.state === 'rejected' && !resubmittable;
  const editLocked = !l.flatmate && (closed || l.archived || ['sold', 'rented', 'archived'].includes(l.status)
    || (l.status === 'rejected' && !resubmittable));
  const statusPill = ownerStatusMeta ? null : {
    label: STATUS_LABEL[displayStatus] || displayStatus,
    cls: LISTING_STATUS_CLS[displayStatus] || 'bg-white/10 text-gray-300',
    icon: STATUS_ICON[displayStatus],
    onClick: hasReview ? () => openReview(l.id) : undefined,
  };
  const StatusTag = statusPill?.onClick ? 'button' : 'span';
  const splitEligible = !l.flatmate && !closed && !reserved && canSplitIntoRooms(l);
  const isSplit = splitEligible && !!split;
  const splitRooms = isSplit ? split.rooms : 0;
  const movedIn = isSplit ? split.movedIn : 0;
  const listingId = l.uuid || l.id;
  const availability = !l.flatmate && !closed && l.deal === 'rent' ? availabilityLabel(t, l) : '';
  const facts = [
    !l.flatmate && l.bhk && { icon: 'bed-double', text: /BHK|RK/i.test(l.bhk) ? l.bhk : `${l.bhk} BHK` },
    !l.flatmate && l.furnishing && { icon: 'sofa', text: FURNISH_LABEL[String(l.furnishing).toLowerCase()] || l.furnishing },
    availability && { icon: 'calendar-days', text: availability },
  ].filter(Boolean);
  const passTill = !l.flatmate && quota?.passes ? fmtDate(quota.passes[String(listingId)]) : '';
  const needsPass = !l.flatmate && l.status === 'paused' && !passTill && quota?.full;
  const flatmateKind = l.flatmateGroup ? 'group' : l.flatmatePost ? 'post' : l.flatmate ? 'room' : null;
  const splitRoom = flatmateKind === 'room' && !!l.propertyId;
  const tenantRoom = flatmateKind === 'room' && l.hostRole === 'tenant' && !splitRoom;
  const tenantGroup = flatmateKind === 'group' && l.hostRole === 'tenant' && !l.hunting;
  const personKind = flatmateKind === 'post' || (flatmateKind === 'group' && !!l.hunting);
  const { verified: idVerified } = useVerification();
  const roomBadgeStatus = l.verificationTier === 'tenant' ? l.reviewStatus : null;
  const editHref = `/list-property?edit=${l.id}`;
  const viewHref = flatmateKind ? detailPath(flatmateKind, l.id) : `/property/${l.id}`;
  const editAction = l.flatmateGroup
    ? { icon: 'edit', label: 'Edit', onClick: () => onEditGroup(l.id) }
    : l.flatmatePost
      ? { icon: 'edit', label: 'Edit', onClick: () => onEditPost(l.id) }
      : flatmateKind === 'room'
        ? (splitRoom ? null : { icon: 'edit', label: 'Edit', to: roomEditHref(l.id) })
        : { icon: 'edit', label: 'Edit', to: editHref };
  let primary = null;
  if (flatmateKind && l.status === 'expired') primary = { label: 'Renew for 30 days', icon: 'refresh-cw', tone: 'emerald', onClick: () => onRenew(flatmateKind, l) };
  else if (needsPass) primary = { label: t('listingLifecycle.goLive', { price: passPrice }), icon: 'zap', tone: 'teal', to: `/checkout?plan=${passSlug(l.deal)}&property=${encodeURIComponent(listingId)}` };
  else if (!l.flatmate && l.status === 'paused') primary = { label: t('listingLifecycle.resume'), icon: 'play-circle', tone: 'emerald', onClick: () => onResume(l) };
  else if (fr && fr.owner.cta === 'confirm') primary = { label: 'Confirm available', icon: 'check-circle', tone: 'emerald', onClick: () => onConfirmFresh(l) };
  else if (fr && fr.owner.cta === 'reactivate') primary = { label: 'Reactivate', icon: 'refresh-cw', tone: 'emerald', onClick: () => onConfirmFresh(l) };
  else if (closed) primary = { label: 'Reopen listing', icon: 'rotate-ccw', tone: 'teal', onClick: () => onReopen(l) };
  else if (!l.flatmate && leads > 0) primary = { label: `${leads} waiting`, icon: 'users-round', tone: 'teal', onClick: () => navigate('/dashboard#leads') };

  const roomAction = (splitEligible && !isSplit)
    ? { icon: 'layout-grid', label: 'Let room by room', onClick: () => onSplit && onSplit(l) }
    : (isSplit && movedIn === 0)
      ? { icon: 'undo-2', label: 'Stop letting room by room', onClick: () => onUnsplit && onUnsplit(l) }
      : null;
  const withdrawAction = {
    icon: 'trash-2',
    label: l.status === 'approved' ? 'Take down' : 'Withdraw',
    tone: 'danger',
    onClick: () => onDelete(l),
  };
  const viewAction = { icon: 'eye', label: 'View listing', to: viewHref };
  const toolsAction = !l.flatmate
    ? {
        icon: 'gauge',
        label: `Tools${typeof l.passportPct === 'number' ? ` · ${l.passportPct}%` : ''}`,
        onClick: () => onOpenTools?.(l),
      }
    : null;
  const cardActions = [
    !finalRejected && !editLocked && editAction,
    viewAction,
    toolsAction,
    roomAction,
    (!l.flatmate && !closed && !reserved && l.status === 'approved') && { icon: 'handshake', label: 'Mark under offer', onClick: () => onMarkUnderOffer(l) },
    (!l.flatmate && !closed && (reserved || l.status === 'approved')) && { icon: 'check-circle', label: `Finalize ${isSale ? 'sale' : 'rental'}`, onClick: () => onFinalize(l) },
    (!l.flatmate && !closed && !reserved && l.status === 'approved') && { icon: 'pause-circle', label: t('listingLifecycle.pause'), onClick: () => onPause(l) },
    splitRoom ? null
      : (l.flatmate || l.flatmatePost || l.flatmateGroup
        ? { icon: 'trash-2', label: 'Delete', tone: 'danger', onClick: () => onDelete(l) }
        : withdrawAction),
  ];
  const recheckReason = l.recheckReason || 'Core details you edited are being re-checked. Your listing stays live.';
  const statusTag = statusPill && (
    <StatusTag
      type={statusPill.onClick ? 'button' : undefined}
      onClick={statusPill.onClick}
      title={statusPill.onClick ? 'Open the verification review for this listing' : undefined}
      aria-label={statusPill.onClick && unread ? `${statusPill.label} — ${unread} unread verification message${unread > 1 ? 's' : ''}` : undefined}
      className={'dz-tag relative font-semibold ' + statusPill.cls + (statusPill.onClick ? ' hover:brightness-110 transition' : '')}
    >
      <Icon name={statusPill.icon} className="w-3 h-3" /> {statusPill.label}
      {statusPill.onClick && unread ? <span aria-hidden="true" className="dz-count absolute -top-1.5 -right-1.5 bg-rose-500 text-white">{unread}</span> : null}
    </StatusTag>
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-ink-card shadow-[var(--tile-shadow)] overflow-hidden" data-testid="owner-listing-card">
      <div className="flex items-start gap-3 p-3 sm:gap-4 sm:p-4">
        <PropertyImage src={l.image} alt={l.title} className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 sm:flex-1">
            <p className="text-white text-sm font-semibold leading-snug line-clamp-2">{l.title}</p>
            {l.locality && (
              <p className="mt-1 flex items-center gap-1 text-xs text-gray-400">
                <Icon name="map-pin" className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                <span className="truncate">{l.locality}</span>
              </p>
            )}
            <p className="mt-1 text-base font-bold tabular-nums text-white">
              {fmtINR(l.price)}{l.deal === 'rent' ? <span className="text-xs font-medium text-gray-400">/mo</span> : null}
            </p>
            {l.flatmate && (
              <div className="mt-1.5">
                <span className="dz-tag bg-teal-500/15 text-teal-300 font-semibold"><Icon name="users-round" className="w-3 h-3" /> {l.flatmateGroup ? 'Flatmate group' : l.flatmatePost ? 'Flatmate request' : 'Flatmate'}</span>
                {splitRoom && <p className="text-xs text-gray-500 mt-1">Part of a flat let room by room. To remove it, open the flat's listing and choose "Stop letting room by room".</p>}
              </div>
            )}
            {isSplit && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="dz-tag bg-teal-500/15 text-teal-300 font-semibold"><Icon name="layout-grid" className="w-3 h-3" /> {splitRooms} room{splitRooms > 1 ? 's' : ''} listed</span>
                {movedIn > 0
                  ? <span className="dz-tag bg-amber-400/15 text-amber-300 font-semibold"><Icon name="eye-off" className="w-3 h-3" /> {movedIn} moved in · whole-flat listing hidden</span>
                  : <span className="text-xs text-gray-500">Whole-flat listing still live</span>}
              </div>
            )}
          </div>
          <div className="flex flex-row flex-wrap items-center gap-1.5 sm:flex-col sm:items-end sm:flex-shrink-0">
            {!l.flatmate && statusTag}
            {l.archived && l.archivedNote && <p className="w-full text-xs leading-snug text-gray-400 sm:max-w-[16rem] sm:text-right">{l.archivedNote}</p>}
            {((l.recheckPending && !onlySeeksOwnershipBadge(l)) || l.reReview) && (
              <div className="w-full sm:max-w-[16rem]">
                <span className="dz-tag bg-amber-500/15 text-amber-300 font-semibold">
                  <Icon name="history" className="w-3 h-3" /> Update under review
                </span>
                <p className="mt-1 text-xs leading-snug text-amber-100/80">{recheckReason}</p>
              </div>
            )}
            {passTill && (
              <span className="dz-tag bg-teal-500/15 text-teal-300 font-semibold">
                <Icon name="ticket" className="w-3 h-3" /> {t('listingLifecycle.passTill', { date: passTill })}
              </span>
            )}
            {l.priceReduced && (
              <span className="dz-tag bg-emerald-500/15 text-emerald-300 font-semibold">
                <Icon name="trending-down" className="w-3 h-3" /> Price reduced
              </span>
            )}
          </div>
        </div>
      </div>

      {facts.length > 0 && (
        <ul className="flex gap-2 px-3 pb-3 sm:max-w-lg sm:px-4" data-testid="listing-facts">
          {facts.map((f) => (
            <li key={f.icon} className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg border border-white/8 bg-white/[0.04] px-1.5 py-2 text-center">
              <Icon name={f.icon} className="w-4 h-4 text-brand-teal-3" aria-hidden="true" />
              <span className="text-xs font-semibold leading-tight text-white">{f.text}</span>
            </li>
          ))}
        </ul>
      )}

      {l.flatmate && (
        <div className="px-3 pb-3 sm:px-4">
          <ListingStatusCard
            listing={{ ...l, reviewStatus: undefined }}
            review={review}
            variant="slim"
            testId={`flatmate-status-${l.id}`}
            viewHref={viewHref}
            omitView
            onOpenReview={hasReview ? () => openReview(flatmateCaseKey(l)) : undefined}
            onShare={onShare ? () => onShare(l, viewHref) : undefined}
            flatmate={{
              idVerified: personKind && idVerified,
              badge: (tenantRoom || tenantGroup) ? {
                href: `/dashboard?tab=documents&${flatmateKind}=${encodeURIComponent(l.id)}`,
                testId: `room-verification-${l.id}`,
                label: t(roomBadgeStatus === 'approved' ? 'dash.roomBadge.verified' : roomBadgeStatus === 'pending' ? 'dash.roomBadge.pendingAction' : 'dash.roomBadge.getBadge'),
              } : personKind && !idVerified ? {
                href: `/dashboard?tab=documents&${flatmateKind}=${encodeURIComponent(l.id)}`,
                testId: `id-verification-${l.id}`,
                label: t('dash.idBadge.cta'),
              } : null,
            }}
            t={t}
          />
        </div>
      )}

      {!l.flatmate && !closed && !reserved && (
        <div className="px-3 pb-3 sm:px-4">
          <ListingStatusCard
            listing={l}
            review={review}
            variant="slim"
            editHref={`${editHref}&step=photos`}
            viewHref={viewHref}
            omitView
            onOpenReview={hasReview ? () => openReview(l.id) : undefined}
            onShare={onShare ? () => onShare(l, viewHref) : undefined}
            claimHref={editHref}
            t={t}
          />
        </div>
      )}

      {!l.flatmate && (
        <div className="grid grid-cols-2 gap-x-2 gap-y-2 px-3 py-3 border-t sm:px-4 border-white/6 sm:flex sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-1">
          <StatChip icon="eye" value={fmtNum(l.views || 0)} label="Views" title="Times buyers opened this listing" />
          <StatChip
            icon="users-round"
            value={leads}
            label={leads === 1 ? 'Lead' : 'Leads'}
            tone={leads > 0 ? 'teal' : 'muted'}
            onClick={leads > 0 ? () => navigate('/dashboard#leads') : undefined}
            title={leads > 0 ? 'Buyers who requested your contact' : 'No leads yet'}
            ariaLabel={leads > 0 ? `View ${leads} waiting lead${leads > 1 ? 's' : ''}` : undefined}
          />
          {fr && (
            <StatChip
              icon={FRESHNESS_ICON[fr.state]}
              value={fr.owner.label}
              label="Availability"
              tone={fr.owner.tone === 'gray' ? 'muted' : fr.owner.tone}
              title={fr.state === 'active' ? 'Buyers see this as actively managed' : `Last confirmed available ${fr.since}`}
            />
          )}
          {qScore !== null && <StatChip icon="gauge" value={`${qScore}/100`} label={qMeta.label} tone={qTone} title={`Listing quality: ${qScore}/100`} />}
        </div>
      )}

      <CardActions primary={l.archived ? null : primary} items={l.archived ? [] : cardActions} />
      {needsPass && (
        <div className="space-y-1 px-3 pb-3 sm:px-4">
          <PassValueLine deal={l.deal} />
          <p className="text-[11px] text-gray-400">{t('listingLifecycle.orPauseOther')}</p>
        </div>
      )}
      {qScore !== null && qScore < 80 && (
        <div className="px-3 pb-3 sm:px-4 sm:pb-4">
          <div className="border-l-2 border-amber-500/40 pl-3">
            <p className="text-[11px] font-semibold text-amber-300 mb-1 inline-flex items-center gap-1"><Icon name="sparkles" className="w-3.5 h-3.5" /> Lift your score to reach more buyers:</p>
            <ul className="text-[10px] text-gray-400 space-y-0.5">
              {qualityTips(l).slice(0, 3).map((tip) => <li key={tip}>• {tip}</li>)}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
