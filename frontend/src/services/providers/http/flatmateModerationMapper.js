const epoch = (iso) => (iso ? Date.parse(iso) : null);

const text = (v) => {
  const s = String(v ?? '').trim();
  return s || null;
};

const httpUrl = (v) => {
  const s = text(v);
  return s && /^(https?:\/\/|\/(?![/\\]))/i.test(s) ? s : null;
};

export function toReviewViewModel(row) {
  const doc = row?.agreementDoc || null;
  return {
    id: row?.id || '',
    kind: row?.kind || 'room',
    roomId: row?.roomId || null,
    groupId: row?.groupId || null,
    host: text(row?.host),
    hostMobile: text(row?.hostMobile),
    address: text(row?.address),
    tier: row?.tier || 'identity',
    flagForReview: !!row?.flagForReview,
    ownerConsent: !!row?.ownerConsent,
    ownerConsentMobile: text(row?.ownerConsentMobile),
    ownerConsentAccount: text(row?.ownerConsentAccount),
    ownerConsentAccountVerified: !!row?.ownerConsentAccountVerified,
    agreementDoc: doc,
    agreementViewable: !!doc?.dataUrl,
    agreementTooLarge: !!doc?.tooLarge,
    vaultDocId: doc?.dataUrl ? null : text(doc?.id),
    evidenceType: text(row?.evidenceType) || (doc ? 'rent_agreement' : null),
    evidenceIssuedOn: text(row?.evidenceIssuedOn),
    nameMatches: row?.nameMatches ?? null,
    addressMatches: row?.addressMatches ?? null,
    hostVerified: !!row?.hostVerified,
    agreementValidTill: text(row?.agreementValidTill),
    status: row?.status || 'pending',
    reason: text(row?.reason),
    createdAt: epoch(row?.createdAt),
    updatedAt: epoch(row?.updatedAt),
  };
}

export function toReviewRowViewModel(row) {
  return {
    id: row?.id || '',
    kind: row?.kind || 'room',
    roomId: row?.roomId || null,
    groupId: row?.groupId || null,
    host: text(row?.host),
    hostMobile: text(row?.hostMobile),
    address: text(row?.address),
    tier: row?.tier || 'identity',
    evidenceType: text(row?.evidenceType) || null,
    flagForReview: !!row?.flagForReview,
    ownerConsent: !!row?.ownerConsent,
    createdAt: epoch(row?.createdAt),
  };
}

export function toModerationRowViewModel(row) {
  return {
    id: row?.id || '',
    kind: row?.kind || 'post',
    modStatus: row?.modStatus || 'pending',
    authorName: text(row?.authorName),
    authorMobile: text(row?.authorMobile),
    headline: text(row?.headline),
    locality: text(row?.locality),
    freeText: text(row?.freeText),
    photoCount: Number(row?.photoCount) || 0,
    coverPhoto: httpUrl(row?.coverPhoto),
    rent: row?.rent ?? null,
    recheckReason: text(row?.recheckReason),
    recheckRequestedAt: epoch(row?.recheckRequestedAt),
    createdAt: epoch(row?.createdAt),
  };
}

export const toModerationItemViewModel = (item) => ({
  ...toModerationRowViewModel(item),
  photos: Array.isArray(item?.photos) ? item.photos.map(httpUrl).filter(Boolean) : [],
});

export const toModerationSummaryViewModel = (res) => ({
  pending: Number(res?.pending) || 0,
  badgeRequests: Number(res?.badgeRequests) || 0,
  published: Number(res?.published) || 0,
  hidden: Number(res?.hidden) || 0,
});

export function toGroupApplicationViewModel(row) {
  return {
    id: row?.id || '',
    listingId: row?.listingId || null,
    listingTitle: text(row?.listingTitle),
    locality: text(row?.locality),
    rent: row?.rent ?? null,
    perHead: row?.perHead ?? null,
    groupTitle: text(row?.groupTitle),
    applicantName: text(row?.applicantName),
    applicantMobile: text(row?.applicantMobile),
    members: Number(row?.members) || 0,
    seatsTotal: Number(row?.seatsTotal) || 0,
    status: row?.status || 'pending',
    modStatus: row?.modStatus || 'pending',
    at: epoch(row?.at),
  };
}

export const toViewModelPage = (unwrapped, fn) => ({
  ...unwrapped,
  items: (unwrapped?.items || []).map(fn),
});
