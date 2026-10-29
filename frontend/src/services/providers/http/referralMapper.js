const epoch = (iso) => (iso ? Date.parse(iso) || 0 : 0);

export function toViewModel(dto) {
  if (!dto) return null;
  return {
    id: dto.id,
    referrer: dto.referrer || '',
    referrerMobile: dto.referrerMobile || '',
    referred: dto.referred || '',
    referredMobile: dto.referredMobile || '',
    track: dto.track || null,
    reward: dto.reward || '',
    rewardAmount: dto.rewardAmount ?? 0,
    status: dto.status || 'pending',
    risk: dto.risk || 'low',
    identityVerified: !!dto.identityVerified,
    identityUnique: !!dto.identityUnique,
    sameDevice: !!dto.sameDevice,
    sameIp: !!dto.sameIp,
    velocityHigh: !!dto.velocityHigh,
    activated: !!dto.activated,
    holdUntil: epoch(dto.holdUntil),
    autoReason: dto.autoReason || '',
    at: epoch(dto.at),
  };
}

export const toDecision = (dto) => toViewModel(dto);

export function toViewModelPage(res, fallback = {}) {
  const rows = Array.isArray(res?.content) ? res.content : [];
  return {
    items: rows.map(toViewModel).filter(Boolean),
    total: res?.totalElements ?? rows.length,
    page: res?.page ?? fallback.page ?? 0,
    size: res?.size ?? fallback.size ?? rows.length,
    counts: res?.counts ?? null,
  };
}
