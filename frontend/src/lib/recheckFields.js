export function requestRecheckFields(prev = {}, fields = []) {
  const merged = [...new Set([
    ...String(prev.recheckReason || '').split(/,\s*/).filter(Boolean),
    ...fields,
  ])];
  if (!merged.length) return {};
  return {
    recheckPending: true,
    recheckReason: merged.join(', '),
    recheckRequestedAt: prev.recheckRequestedAt || new Date().toISOString(),
  };
}

export const clearedRecheckFields = () => ({
  recheckPending: false,
  recheckReason: '',
  recheckRequestedAt: '',
});

export const OWNERSHIP_REVIEW_ITEM = 'Ownership documents';

export const seeksOwnershipBadge = (listing) => Boolean(listing?.ownershipRequestedAt && !listing.ownershipVerified);

export const onlySeeksOwnershipBadge = (listing) => Boolean(listing?.recheckPending)
  && String(listing.recheckReason || '').trim() === OWNERSHIP_REVIEW_ITEM;
