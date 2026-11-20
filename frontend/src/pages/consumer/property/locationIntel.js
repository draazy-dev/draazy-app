import { IT_HUBS } from '../../../lib/commuteHubs.js';
import { getCommute } from '../../../lib/commuteCache.js';

export function valueBenchmark(p, loc) {
  const perSqft = (p?.area > 0) ? Math.round((p.price || 0) / p.area) : 0;
  const kind = String(p?.type || '').toLowerCase();
  const isResidential = !/plot|land|farm|office|shop|showroom|retail|mall|warehouse|godown|industrial|factory|co-?work|commercial/.test(kind);
  const localityAvg = loc?.ratePerSqft || 0;
  const hasData = !!(localityAvg && isResidential && perSqft);
  if (!hasData) {
    return { perSqft, localityAvg: 0, diffPct: 0, rating: '', tone: 'fair', arrow: 'minus', pct: 60, hasData: false };
  }
  const diffPct = Math.round(((perSqft - localityAvg) / localityAvg) * 100);
  let rating; let tone; let arrow;
  if (diffPct <= -4) { rating = 'Good deal'; tone = 'good'; arrow = 'arrow-down'; }
  else if (diffPct >= 5) { rating = 'Above average'; tone = 'high'; arrow = 'arrow-up'; }
  else { rating = 'At market'; tone = 'fair'; arrow = 'minus'; }
  const pct = Math.min(95, Math.max(20, Math.round((perSqft / localityAvg) * 55)));
  return { perSqft, localityAvg, diffPct, rating, tone, arrow, pct, hasData: true };
}

const toRad = (d) => (d * Math.PI) / 180;
function haversineKm(aLat, aLng, bLat, bLng) {
  const R = 6371;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function commuteEstimate(lat, lng) {
  return IT_HUBS.map((h) => {
    const km = haversineKm(lat, lng, h.lat, h.lng);
    const roadKm = km * 1.35;
    return { name: h.name, km: +roadKm.toFixed(1), min: Math.max(4, Math.round((roadKm / 24) * 60)) };
  }).sort((a, b) => a.min - b.min);
}

export function commuteInfo(lat, lng) {
  if (lat == null || lng == null) return { legs: [], source: 'none', fetchedAt: 0 };
  const cached = getCommute(lat, lng);
  if (cached && cached.hubs && cached.hubs.length) {
    return { legs: cached.hubs, source: 'live', fetchedAt: cached.fetchedAt };
  }
  return { legs: commuteEstimate(lat, lng), source: 'estimate', fetchedAt: 0 };
}
