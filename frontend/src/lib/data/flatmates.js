import { digits as digitsOf, norm } from './identityNorm.js';
import { readUser } from '../auth.js';

const STORE_KEY = 'draazyFlatmatePosts';
const GROUPS_KEY = 'draazyFlatmateGroups';
const INTERESTS_KEY = 'draazyFlatmateInterests';

const get = (k, def) => {
  try {
    const v = JSON.parse(localStorage.getItem(k));
    return v == null ? def : v;
  } catch {
    return def;
  }
};
const set = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
  return v;
};

const PENDING_REQ_KEY = 'dzPendingRequests';
const currentUserId = () => readUser()?.id ?? null;

export const pushPendingRequest = (req) => {
  try {
    set(PENDING_REQ_KEY, [...get(PENDING_REQ_KEY, []), { ...req, userId: currentUserId() }]);
    return true;
  } catch (e) { console.warn('[flatmates] pending-request write failed', e); return false; }
};

const hasLocalThread = (propertyId) => {
  const queued = get(PENDING_REQ_KEY, []);
  return Array.isArray(queued) && queued.some((r) => r?.propertyId === propertyId);
};

export const recordAskLocally = ({ request }) => {
  const propertyId = request?.propertyId;
  if (propertyId == null || hasLocalThread(propertyId)) return false;
  pushPendingRequest(request);
  return true;
};

export const getFlatmatePosts = () => get(STORE_KEY, []);
export const saveFlatmatePost = (req) => {
  const arr = getFlatmatePosts();
  arr.unshift(req);
  return set(STORE_KEY, arr);
};
export const updateFlatmatePost = (id, patch) => {
  const arr = getFlatmatePosts();
  const idx = arr.findIndex((r) => r.id === id);
  if (idx >= 0) {
    arr[idx] = { ...arr[idx], ...patch };
    set(STORE_KEY, arr);
    return arr[idx];
  }
  return null;
};
export const deleteFlatmatePost = (id) => {
  const arr = getFlatmatePosts().filter((r) => r.id !== id);
  set(STORE_KEY, arr);
};

export const getFlatmateGroups = () => get(GROUPS_KEY, []);
export const saveFlatmateGroup = (group) => {
  const arr = getFlatmateGroups();
  arr.unshift(group);
  return set(GROUPS_KEY, arr);
};
export const updateFlatmateGroup = (id, patch) => {
  const arr = getFlatmateGroups();
  const idx = arr.findIndex((g) => g.id === id);
  if (idx >= 0) {
    arr[idx] = { ...arr[idx], ...patch };
    set(GROUPS_KEY, arr);
    return arr[idx];
  }
  return null;
};
export const deleteFlatmateGroup = (id) => {
  const arr = getFlatmateGroups().filter((g) => g.id !== id);
  set(GROUPS_KEY, arr);
};

export const MOD_PUBLIC = ['live', 'approved'];

export const isPubliclyVisible = (item) => MOD_PUBLIC.includes(item?.modStatus || 'live');

const ROOMS_KEY = 'draazyRoomListings';
const getRoomsRaw = () => {
  const v = get(ROOMS_KEY, []);
  return Array.isArray(v) ? v : [];
};

export const MAX_ACTIVE_HOST_SHARES = 3;

const groupSeatsOpen = (g) =>
  g && g.seatsOpen != null
    ? Math.max(0, Math.min(g.seatsTotal || 0, g.seatsOpen))
    : Math.max(0, (g.seatsTotal || 0) - ((g.members && g.members.length) || 0));
const roomSeatsOpen = (r) => (r && r.seatsOpen != null ? Math.max(0, r.seatsOpen) : 1);
const roomActive = (r) => r && r.status !== 'filled' && r.status !== 'closed' && roomSeatsOpen(r) > 0;

export const countCappedActiveFlatmatePosts = (mobile) => {
  const d = digitsOf(mobile);
  if (!d) return 0;
  const g = getFlatmateGroups().filter(
    (x) => digitsOf(x.ownerMobile) === d && x.verificationTier !== 'owner' && groupSeatsOpen(x) > 0
  ).length;
  const r = getRoomsRaw().filter(
    (x) => digitsOf(x.ownerMobile) === d && x.verificationTier !== 'owner' && roomActive(x)
  ).length;
  return g + r;
};

export const addressFingerprint = ({ propertyId, society, locality, title } = {}) => {
  if (propertyId) return 'prop:' + String(propertyId);
  const loc = norm(locality);
  const soc = norm(society);
  const ttl = norm(title);
  if (soc) return 'addr:' + soc + '|' + loc;
  if (ttl) return 'addr:' + ttl + '|' + loc;
  return '';
};

export const findAddressClaims = (fingerprint) => {
  if (!fingerprint) return [];
  const claims = [];
  getFlatmateGroups().forEach((g) => {
    if (groupSeatsOpen(g) <= 0) return;
    if (addressFingerprint({ propertyId: g.propertyId, locality: g.locality, title: g.title }) === fingerprint)
      claims.push({ kind: 'group', id: g.id, mobile: digitsOf(g.ownerMobile), tier: g.verificationTier });
  });
  getRoomsRaw().forEach((r) => {
    if (!roomActive(r)) return;
    if (addressFingerprint({ propertyId: r.propertyId, society: r.society, locality: r.localities && r.localities[0] }) === fingerprint)
      claims.push({ kind: 'room', id: r.id, mobile: digitsOf(r.ownerMobile), tier: r.verificationTier });
  });
  return claims;
};

export const evaluateHostEligibility = ({ mobile, tier, address } = {}) => {
  const d = digitsOf(mobile);
  const capped = countCappedActiveFlatmatePosts(mobile);
  const overCap = tier !== 'owner' && capped >= MAX_ACTIVE_HOST_SHARES;
  const fingerprint = addressFingerprint(address || {});
  const claims = findAddressClaims(fingerprint);
  const duplicate = claims.some((c) => c.mobile && c.mobile === d);
  const flagForReview = claims.some((c) => c.mobile && c.mobile !== d);
  const reason = overCap
    ? `You already have ${MAX_ACTIVE_HOST_SHARES} live flatmate posts. Fill or close one before posting another.`
    : duplicate
    ? 'You already have a live flatmate for this address.'
    : '';
  return { fingerprint, overCap, duplicate, flagForReview, blocked: overCap || duplicate, reason };
};

const CONSENT_KEY = 'draazyOwnerConsent';
export const getOwnerConsents = () => get(CONSENT_KEY, {});
export const setOwnerConsent = (ownerMobile, byMobile) => {
  const map = getOwnerConsents();
  map[digitsOf(ownerMobile)] = { at: Date.now(), by: digitsOf(byMobile) };
  return set(CONSENT_KEY, map);
};

const REVIEW_KEY = 'draazyFlatmateReviews';
const AGREEMENT_DOC_CAP = 3 * 1024 * 1024;
const normalizeAgreementDoc = (doc) => {
  if (!doc) return null;
  const size = Math.max(0, parseInt(doc.size, 10) || 0);
  const tooLarge = !!doc.tooLarge || size > AGREEMENT_DOC_CAP;
  return {
    name: String(doc.name || 'Agreement').slice(0, 200),
    size,
    mime: String(doc.mime || '').slice(0, 100),
    dataUrl: tooLarge ? null : (doc.dataUrl || null),
    tooLarge,
  };
};
export const getFlatmateReviews = () => get(REVIEW_KEY, []);
export const enqueueFlatmateReview = (rec) => {
  const arr = getFlatmateReviews();
  const key = rec.groupId || rec.roomId;
  if (key && arr.some((r) => (r.groupId || r.roomId) === key)) return arr;
  const { agreementDoc, ...rest } = rec;
  arr.unshift({ id: 'rev' + Date.now(), status: 'pending', reason: '', createdAt: Date.now(), updatedAt: Date.now(), ...rest, agreementDoc: normalizeAgreementDoc(agreementDoc) });
  try {
    return set(REVIEW_KEY, arr);
  } catch {
    if (arr[0] && arr[0].agreementDoc && arr[0].agreementDoc.dataUrl) {
      arr[0] = { ...arr[0], agreementDoc: { ...arr[0].agreementDoc, dataUrl: null, tooLarge: true } };
    }
    return set(REVIEW_KEY, arr);
  }
};
export const decideFlatmateReview = (id, status, reason) => {
  const arr = getFlatmateReviews();
  const idx = arr.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  arr[idx] = { ...arr[idx], status, reason: reason || '', updatedAt: Date.now() };
  set(REVIEW_KEY, arr);
  return arr[idx];
};
export const getFlatmateReviewStatusMap = () => {
  const m = {};
  getFlatmateReviews().forEach((r) => { m[r.groupId || r.roomId] = r.status; });
  return m;
};

export const getMyRequest = (userMobile, userName) => {
  return getFlatmatePosts().find((r) => {
    if (userMobile && r.mobile && r.mobile === userMobile) return true;
    if (userName && r.name && r.name.toLowerCase() === userName.toLowerCase()) return true;
    return false;
  });
};

export const getAskedInterests = (mobile) => (digitsOf(mobile) ? get(INTERESTS_KEY, {})[digitsOf(mobile)] || {} : {});
export const rememberAsk = (mobile, key) => {
  const who = digitsOf(mobile);
  if (!who) return;
  const all = get(INTERESTS_KEY, {});
  all[who] = { ...(all[who] || {}), [key]: true };
  set(INTERESTS_KEY, all);
};
