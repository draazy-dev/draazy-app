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

const count = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function toSummary(s) {
  if (!s) return s;
  const rewards = s.rewards || {};
  const friend = s.friendReward || {};
  return {
    code: s.code || '',
    invited: count(s.invited),
    joined: count(s.joined),
    qualified: count(s.qualified),
    checking: count(s.checking),
    rewards: {
      earned: count(rewards.earned),
      used: count(rewards.used),
      remaining: count(rewards.remaining),
      discountPercent: count(rewards.discountPercent),
    },
    friendReward: {
      redeemed: !!friend.redeemed,
      status: friend.status || '',
      contacts: count(friend.contacts),
      featuredDays: count(friend.featuredDays),
    },
  };
}

export function toInviteResult(dto) {
  const url = typeof dto?.whatsappUrl === 'string' ? dto.whatsappUrl : '';
  if (dto?.delivery === 'sent' || !url) return { delivery: 'sent', whatsappUrl: '' };
  if (!isWhatsAppUrl(url)) throw new Error('Refusing to open a non-WhatsApp invite link');
  return { delivery: 'open_whatsapp', whatsappUrl: url };
}

function isWhatsAppUrl(url) {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'https:' && hostname === 'wa.me';
  } catch {
    return false;
  }
}

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
