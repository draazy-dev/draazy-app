import { PAGE_LOAD_TTL, del, get, patch, post, put, unwrapPage, unwrapFullPage } from '../../http.js';
import { MAX_PAGE_SIZE } from '../../apiLimits.js';
import { readAccessToken } from '../../../lib/auth.js';
import { bootstrapSection } from './bootstrap.js';
import {
  conflictSubCode,
  CONFLICT_MARKER,
  toGroupViewModel,
  toGroupCardViewModel,
  toRequestViewModel,
  toRoomViewModel,
  toRoomCardViewModel,
  toSeekerPostViewModel,
  vocab,
} from './flatmateMapper.js';
import {
  toGroupApplicationViewModel,
  toModerationItemViewModel,
  toModerationRowViewModel,
  toModerationSummaryViewModel,
  toReviewRowViewModel,
  toReviewViewModel,
  toViewModelPage,
} from './flatmateModerationMapper.js';

const signedIn = () => !!readAccessToken();
const toList = (rows, fn) => (Array.isArray(rows) ? rows : []).map(fn);

async function withConflictCode(run) {
  try {
    return await run();
  } catch (err) {
    const sub = conflictSubCode(err);
    if (sub) {
      err.code = sub;
      err.message = String(err.message || '').replace(CONFLICT_MARKER, '');
    }
    throw err;
  }
}

const clean = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== ''));

export async function createRoom(room = {}) {
  return toRoomViewModel(await post('/flatmates/rooms', roomBody(room)));
}

export async function updateRoom(id, room = {}) {
  return toRoomViewModel(await withConflictCode(() => patch(`/flatmates/rooms/${encodeURIComponent(id)}`, {
    ...roomBody(room),
    ...(room.clearSociety ? { societyId: '' } : {}),
  })));
}

function roomBody(room) {
  return clean({
    title: room.title,
    homeTypeLabel: vocab('homeType', room.homeTypeLabel),
    bhk: vocab('bhk', room.bhk),
    roomType: room.roomType,
    attachedBath: vocab('attachedBath', room.attachedBath),
    furnishing: vocab('furnishing', room.furnishing),
    locality: room.locality,
    localitySlug: room.localitySlug || undefined,
    societyId: room.societyId || undefined,
    flatNumber: room.flatNumber,
    rentShare: Number(room.rent ?? room.rentShare) || 0,
    deposit: room.deposit == null ? undefined : Number(room.deposit),
    occupants: room.occupants,
    noticePeriodDays: room.noticePeriodDays,
    lockInMonths: room.lockInMonths,
    maintenanceBilling: room.maintenanceBilling,
    electricityBilling: room.electricityBilling,
    availableFrom: room.availableFrom,
    lookingFor: vocab('gender', room.lookingFor),
    foodPref: vocab('food', room.foodPref),
    hostRole: vocab('hostRole', room.hostRole),
    agreementDeclared: room.agreementDeclared,
    agreementDoc: room.agreementDoc,
    ownerConsentMobile: room.ownerConsentMobile,
    ownerConsent: room.ownerConsent,
    propertyId: room.propertyId || undefined,
    photos: room.photos || [],
    note: room.note,
    lat: room.lat,
    lng: room.lng,
    gatedCommunity: room.gatedCommunity,
    details: room.details && clean(room.details),
  });
}

export async function setRoomSeats(id, seatsOpen) {
  return toRoomViewModel(await patch(`/flatmates/rooms/${encodeURIComponent(id)}/seats`, {
    seatsOpen: Math.max(0, Number(seatsOpen) || 0),
  }));
}

export async function setRoomOccupants(id, occupants) {
  return toRoomViewModel(await patch(`/flatmates/rooms/${encodeURIComponent(id)}/occupants`, {
    occupants: Math.max(0, Number(occupants) || 0),
  }));
}

export async function roomInterest(id, { share = 'solo', message, gender } = {}) {
  await withConflictCode(() => post(`/flatmates/rooms/${encodeURIComponent(id)}/interest`, clean({
    share: vocab('share', share) || 'solo',
    message,
    gender: vocab('gender', gender),
  })));
}

export async function requestRoomBadge(id, body = {}) {
  return post(`/flatmates/rooms/${encodeURIComponent(id)}/badge-request`, body);
}

export async function requestGroupBadge(id, body = {}) {
  return post(`/flatmates/groups/${encodeURIComponent(id)}/badge-request`, body);
}

export async function createGroup(group = {}) {
  return toGroupViewModel(await post('/flatmates/groups', groupBody(group)));
}

export async function updateGroup(id, group = {}) {
  return toGroupViewModel(await patch(`/flatmates/groups/${encodeURIComponent(id)}`, groupBody(group)));
}

const DETAIL_PATH = { group: 'groups', room: 'rooms', post: 'posts' };
const DETAIL_MAPPER = { group: toGroupViewModel, room: toRoomViewModel, post: toSeekerPostViewModel };

export async function getFlatmateDetail(kind, id) {
  if (!DETAIL_PATH[kind]) throw new Error(`Unknown flatmate kind: ${kind}`);
  const res = await get(`/flatmates/${DETAIL_PATH[kind]}/${encodeURIComponent(id)}`);
  const item = DETAIL_MAPPER[kind](res?.item);
  if (kind === 'room' && Array.isArray(res?.photos) && res.photos.length) item.photos = res.photos;
  if (kind === 'room') item.specs = res?.specs || null;
  return { kind, owned: !!res?.owned, item, verification: res?.verification || null };
}

const FLAT_ONLY = new Set(['locality', 'localitySlug', 'rent', 'deposit', 'noticePeriodDays', 'lockInMonths', 'maintenanceBilling', 'electricityBilling', 'role', 'propertyId', 'agreement', 'agreementDoc', 'consentMobile']);

function preferencesBody(p) {
  const money = (v) => (v === '' || v == null ? undefined : Number(v));
  return clean({
    localities: p.localities,
    bhk: p.bhk,
    rentMin: money(p.rentMin),
    rentMax: money(p.rentMax),
    depositMin: money(p.depositMin),
    depositMax: money(p.depositMax),
    gatedOnly: !!p.gatedOnly,
    bachelors: !!p.bachelors,
    furnishing: p.furnishing || undefined,
    parking: p.parking || undefined,
    moveInBy: p.moveInBy || undefined,
  });
}

function groupBody(group) {
  const body = clean({
    title: group.title,
    locality: group.locality,
    localitySlug: group.localitySlug || undefined,
    policy: vocab('policy', group.policy),
    rent: Number(group.rent) || 0,
    deposit: group.deposit,
    noticePeriodDays: group.noticePeriodDays,
    lockInMonths: group.lockInMonths,
    maintenanceBilling: group.maintenanceBilling,
    electricityBilling: group.electricityBilling,
    seats: group.seatsTotal == null ? undefined : Number(group.seatsTotal),
    seatsOpen: group.seatsOpen == null ? undefined : Number(group.seatsOpen),
    role: vocab('hostRole', group.hostRole ?? group.role),
    propertyId: group.propertyId,
    agreement: group.agreementDeclared ?? group.agreement,
    agreementDoc: group.agreementDoc,
    consentMobile: group.ownerConsentMobile ?? group.consentMobile,
    note: group.note,
  });
  if (!group.preferences) return body;
  return { ...Object.fromEntries(Object.entries(body).filter(([k]) => !FLAT_ONLY.has(k))), preferences: preferencesBody(group.preferences) };
}

export async function deleteGroup(id) {
  await del(`/flatmates/groups/${encodeURIComponent(id)}`);
}

export async function deleteRoom(id) {
  await withConflictCode(() => del(`/flatmates/rooms/${encodeURIComponent(id)}`));
}

export async function renewFlatmate(kind, id) {
  await post(`/flatmates/${encodeURIComponent(kind)}/${encodeURIComponent(id)}/renew`);
}

export async function setGroupSeats(id, seatsOpen) {
  return toGroupViewModel(await patch(`/flatmates/groups/${encodeURIComponent(id)}/seats`, {
    seatsOpen: Math.max(0, Number(seatsOpen) || 0),
  }));
}

export async function joinGroup(id, { share = 'solo', message, gender } = {}) {
  return toRequestViewModel(await withConflictCode(() => post(`/flatmates/groups/${encodeURIComponent(id)}/join`, clean({
    share: vocab('share', share) || 'solo',
    message,
    gender: vocab('gender', gender),
  }))));
}

export async function leaveGroup(id) {
  await withConflictCode(() => del(`/flatmates/groups/${encodeURIComponent(id)}/membership`));
}

export async function removeGroupMember(id, memberId) {
  await withConflictCode(() => del(`/flatmates/groups/${encodeURIComponent(id)}/members/${encodeURIComponent(memberId)}`));
}

export async function withdrawInterest(kind, id) {
  await withConflictCode(() => del(`/flatmates/${encodeURIComponent(kind)}/${encodeURIComponent(id)}/interest`));
}

export async function requestOwnerConsent({ ownerMobile, otp, title, society, locality } = {}) {
  const res = await post('/flatmates/owner-consent',
    clean({ ownerMobile, otp, title, society, locality }));
  return { consentRecorded: !!res?.consentRecorded };
}

const noticeAuth = (token) => ({ auth: false, headers: { 'X-Owner-Notice-Token': token } });

export async function getOwnerNotice(token) {
  return get('/flatmates/owner-notice', undefined, noticeAuth(token));
}

export async function answerOwnerNotice(token, answer) {
  return post('/flatmates/owner-notice/answer', { answer }, noticeAuth(token));
}

export async function getOwnerHomes() {
  const rows = await get('/me/owner-homes');
  return Array.isArray(rows) ? rows : [];
}

export async function getOwnerHomePrefill(managedId) {
  return get(`/me/owner-homes/${encodeURIComponent(managedId)}/prefill`);
}

export async function createPost(postBody = {}) {
  return toSeekerPostViewModel(await post('/flatmates/posts', clean({
    title: postBody.title,
    gender: vocab('gender', postBody.gender),
    age: postBody.age == null ? undefined : Number(postBody.age),
    occupation: postBody.occupation,
    budget: Number(postBody.budget) || 0,
    budgetMax: postBody.budgetMax == null ? undefined : Number(postBody.budgetMax),
    localities: postBody.localities || [],
    moveIn: postBody.moveIn,
    flatPref: vocab('flatPref', postBody.flatPref),
    roomPref: vocab('roomPref', postBody.roomPref),
    ...mustHavesBody(postBody),
    note: postBody.note,
    verifiedContactOnly: postBody.verifiedContactOnly,
  })));
}

export async function updatePost(id, patchBody = {}) {
  const body = {};
  ['title', 'occupation', 'moveIn', 'note'].forEach((k) => {
    if (patchBody[k] !== undefined) body[k] = patchBody[k];
  });
  if (patchBody.gender !== undefined) body.gender = vocab('gender', patchBody.gender);
  if (patchBody.flatPref !== undefined) body.flatPref = vocab('flatPref', patchBody.flatPref);
  if (patchBody.roomPref !== undefined) body.roomPref = vocab('roomPref', patchBody.roomPref);
  if (patchBody.budget !== undefined) body.budget = Number(patchBody.budget) || 0;
  body.budgetMax = patchBody.budgetMax == null ? null : Number(patchBody.budgetMax);
  if (patchBody.age !== undefined) body.age = Number(patchBody.age);
  if (patchBody.localities !== undefined) body.localities = patchBody.localities;
  if (patchBody.verifiedContactOnly !== undefined) body.verifiedContactOnly = patchBody.verifiedContactOnly;
  Object.assign(body, mustHavesBody(patchBody));
  return toSeekerPostViewModel(await patch(`/flatmates/posts/${encodeURIComponent(id)}`, body));
}

function mustHavesBody(p) {
  return { furnishing: p.furnishing || null, gatedOnly: !!p.gatedOnly, attachedBath: !!p.attachedBath, parking: p.parking || null };
}

export async function deletePost(id) {
  await del(`/flatmates/posts/${encodeURIComponent(id)}`);
}

export async function postInterest(id, { share = 'solo', message } = {}) {
  await withConflictCode(() => post(`/flatmates/posts/${encodeURIComponent(id)}/interest`, clean({
    share: vocab('share', share) || 'solo',
    message,
  })));
}

export async function myRequests(status) {
  if (!signedIn()) return [];
  const res = await get('/me/flatmate-requests', clean({ status, size: MAX_PAGE_SIZE }));
  return unwrapFullPage(res, 'flatmate').map(toRequestViewModel);
}

export async function myFlatmateInterests() {
  if (!signedIn()) return [];
  const res = await get('/me/flatmate-interests', { size: MAX_PAGE_SIZE });
  return unwrapFullPage(res, 'flatmate');
}

export async function myFlatmateInterestKeys() {
  if (!signedIn()) return [];
  return get('/me/flatmate-interests/keys');
}

export async function decideRequest(id, decision) {
  return withConflictCode(async () => toRequestViewModel(
    await patch(`/me/flatmate-requests/${encodeURIComponent(id)}`, { decision }),
  ));
}
export async function myFlatmatePosts({ page = 0, size = 20 } = {}) {
  const res = await get('/me/flatmate-posts', clean({ page, size }), { ttl: PAGE_LOAD_TTL });
  const paged = unwrapPage(res, { page, size });
  return { ...paged, items: paged.items.map(toSeekerPostViewModel) };
}

export async function getMyFlatmatePost(id) {
  return toSeekerPostViewModel(await get(`/me/flatmate-posts/${encodeURIComponent(id)}`));
}

export async function splitProperty(propertyId, { maxOccupants, rooms } = {}) {
  const res = await post(`/properties/${encodeURIComponent(propertyId)}/split`, {
    maxOccupants: Number(maxOccupants) || 1,
    rooms: (rooms || []).map((r) => clean({
      roomKind: vocab('roomKind', r.roomKind) || 'bedroom',
      rent: Number(r.rent) || 0,
      deposit: r.deposit == null ? undefined : Number(r.deposit),
      note: r.note,
    })),
  });
  return { rooms: toList(res?.rooms, toRoomViewModel), propertyId };
}

export async function unsplitProperty(propertyId) {
  await del(`/properties/${encodeURIComponent(propertyId)}/split`);
}

export async function flatmatePulse() {
  return (await bootstrapSection('flatmatePulse')) ?? null;
}

export async function feed(tab = 'move-in', filters = {}, page = 0, size = 24, { signal, auth = !!readAccessToken() } = {}) {
  const [minBudget, maxBudget] = budgetRange(filters.budget);
  const res = await get('/flatmates/feed', clean({
    tab: vocab('tab', tab) || 'move-in',
    q: filters.q,
    locality: filters.locality,
    ...nearParams(filters),
    minBudget,
    maxBudget,
    gender: vocab('gender', filters.gender),
    strictGender: filters.gender && filters.strictGender ? true : undefined,
    roomType: filters.roomType,
    furnishing: filters.furnishing,
    verifiedOnly: filters.verifiedOnly ? true : undefined,
    gated: filters.gated ? true : undefined,
    moveInDays: moveInDays(filters.moveIn),
    vibe: filters.vibe?.length ? filters.vibe : undefined,
    attachedBath: filters.attachedBath ? 'attached' : undefined,
    sharing: filters.sharing ? Number(filters.sharing) : undefined,
    sort: filters.sort,
    ...meParams(filters.me),
    page,
    size,
  }), { auth, signal });
  const { items, ...rest } = unwrapPage(res, { page, size });
  const matches = res?.matches || {};
  const withMatch = (vm, kind) => {
    const styleMatch = matches[`${kind}:${vm.id}`];
    return Number.isFinite(styleMatch) ? { ...vm, styleMatch } : vm;
  };
  return {
    items: items.map((r) => {
      if (r?.roomType || r?.roomKind) return withMatch(toRoomViewModel(r), 'room');
      if (r?.members || r?.seatsTotal != null) return withMatch(toGroupViewModel(r), 'group');
      return withMatch(toSeekerPostViewModel(r), 'post');
    }),
    verifiedTotal: res?.verifiedElements ?? 0,
    otherTabTotal: Number.isFinite(res?.otherTabElements) ? res.otherTabElements : null,
    tabTotals: res?.tabElements ?? null,
    pageCount: res?.totalPages ?? 0,
    ...rest,
  };
}

const BUDGET_MAX = 40000;

function budgetRange(budget) {
  if (!Array.isArray(budget)) return [undefined, undefined];
  const [min, max] = budget;
  return [
    Number(min) > 0 ? Number(min) : undefined,
    Number(max) < BUDGET_MAX ? Number(max) : undefined,
  ];
}

function meParams(me) {
  if (!me) return {};
  const localities = me.localities?.length ? me.localities : (me.locality ? [me.locality] : undefined);
  return clean({
    meLocalities: localities,
    meBudget: me.budget == null ? undefined : Number(me.budget),
    meGender: me.gender,
  });
}

const KM_PER_MINUTE = 0.4;

const DEFAULT_RADIUS = 5;

function nearParams(filters) {
  const { near, nearRadius, nearMode } = filters;
  if (!near) return {};
  const [lat, lng] = String(near).split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return {};
  const radius = Number(nearRadius) || DEFAULT_RADIUS;
  return {
    nearLat: lat,
    nearLng: lng,
    nearRadiusKm: nearMode === 'min' ? radius * KM_PER_MINUTE : radius,
  };
}

function moveInDays(moveIn) {
  if (!moveIn) return undefined;
  if (moveIn === 'now') return 0;
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(moveIn);
  if (!parts) return undefined;
  const target = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
  if (Number.isNaN(target.getTime())) return undefined;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((target - today) / 86_400_000));
}

export async function listFlatmateSaves({ page = 0, size = MAX_PAGE_SIZE } = {}) {
  if (!signedIn()) return { items: [], page: 0, size, total: 0 };
  const res = await get('/me/flatmate-saves', { page, size });
  const { items, ...rest } = unwrapPage(res, { page, size });
  return {
    items: items.map((r) => {
      const toCard = r?.roomType || r?.roomKind ? toRoomViewModel
        : r?.members || r?.seatsTotal != null ? toGroupViewModel
          : toSeekerPostViewModel;
      return { ...toCard(r), savedAt: r?.savedAt };
    }),
    ...rest,
  };
}

export async function listFlatmateSaveKeys() {
  if (!signedIn()) return [];
  const res = await get('/me/flatmate-saves/keys');
  return Array.isArray(res) ? res.filter((r) => r?.kind && r?.id) : [];
}

export async function saveFlatmatePost(kind, id) {
  await put(`/me/flatmate-saves/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`);
}

export async function unsaveFlatmatePost(kind, id) {
  await del(`/me/flatmate-saves/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`);
}

export async function listFlatmateReviews({ status, flagged, page = 0, size = 20 } = {}) {
  const res = await get('/admin/flatmate-reviews', clean({
    status,
    flagged: flagged === undefined ? undefined : String(!!flagged),
    page,
    size,
  }));
  return toViewModelPage(unwrapPage(res, { page, size }), toReviewRowViewModel);
}

export async function decideFlatmateReview(id, decision, note, checks) {
  return toReviewViewModel(
    await patch(`/admin/flatmate-reviews/${encodeURIComponent(id)}`, clean({
      decision,
      note: String(note || '').trim() || undefined,
      checks,
    })),
  );
}

export async function getFlatmateReviewDocumentUrl(id) {
  return (await get(`/admin/flatmate-reviews/${encodeURIComponent(id)}/document-url`))?.url || null;
}

export async function revokeFlatmateReview(id, reason) {
  return toReviewViewModel(await post(`/admin/flatmate-reviews/${encodeURIComponent(id)}/revoke`, { reason }));
}

const statesParam = (modStatus) => (Array.isArray(modStatus) ? modStatus.join(',') : modStatus) || undefined;

export async function listFlatmateModeration({ kind = 'post', modStatus, sort, page = 0, size = 20 } = {}) {
  const res = await get('/admin/flatmates/moderation', clean({ kind: statesParam(kind), modStatus: statesParam(modStatus), sort, page, size }));
  return toViewModelPage(unwrapPage(res, { page, size }), toModerationRowViewModel);
}

export async function getFlatmateModerationSummary() {
  return toModerationSummaryViewModel(await get('/admin/flatmates/moderation/summary'));
}

const toModerationDetail = (res) => ({
  item: toModerationItemViewModel(res?.item),
  room: res?.room ? toRoomViewModel(res.room) : null,
  group: res?.group ? toGroupViewModel(res.group) : null,
  post: res?.post ? toSeekerPostViewModel(res.post) : null,
  review: res?.review ? toReviewViewModel(res.review) : null,
  livingStyle: res?.livingStyle || {},
});

export async function getFlatmateModerationDetail(id) {
  return toModerationDetail(await get(`/admin/flatmates/${encodeURIComponent(id)}`));
}

export async function editFlatmateAsModerator(id, changes) {
  return toModerationDetail(await patch(`/admin/flatmates/${encodeURIComponent(id)}`, changes));
}

export async function moderateFlatmatePost(id, modStatus, note) {
  await patch(`/admin/flatmates/${encodeURIComponent(id)}/moderation`, clean({
    modStatus,
    note: String(note || '').trim() || undefined,
  }));
}

export async function listGroupApplications({ modStatus, sort, page = 0, size = 20 } = {}) {
  const res = await get('/admin/group-applications', clean({ modStatus: statesParam(modStatus), sort, page, size }));
  return toViewModelPage(unwrapPage(res, { page, size }), toGroupApplicationViewModel);
}

export async function moderateGroupApplication(id, modStatus, note) {
  return toGroupApplicationViewModel(
    await patch(`/admin/group-applications/${encodeURIComponent(id)}`, clean({
      modStatus,
      note: String(note || '').trim() || undefined,
    })),
  );
}

export async function myFlatmateGroups({ page = 0, size = 20 } = {}) {
  const res = await get('/me/flatmate-groups', clean({ page, size }), { ttl: PAGE_LOAD_TTL });
  const paged = unwrapPage(res, { page, size });
  return { ...paged, items: paged.items.map(toGroupCardViewModel) };
}

export async function myFlatmateRooms({ page = 0, size = 20 } = {}) {
  const res = await get('/me/flatmate-rooms', clean({ page, size }), { ttl: PAGE_LOAD_TTL });
  const paged = unwrapPage(res, { page, size });
  return { ...paged, items: paged.items.map(toRoomCardViewModel) };
}

export async function applyGroupToListing(groupId, listingId) {
  return toGroupApplicationViewModel(
    await post(`/flatmates/groups/${encodeURIComponent(groupId)}/apply`, { listingId }),
  );
}

export async function listMyGroupApplications({ page = 0, size = MAX_PAGE_SIZE } = {}) {
  const res = await get('/me/group-applications', clean({ page, size }));
  return toViewModelPage(unwrapPage(res, { page, size }), toGroupApplicationViewModel);
}

export async function decideGroupApplication(id, status) {
  return toGroupApplicationViewModel(
    await patch(`/me/group-applications/${encodeURIComponent(id)}`, { status }),
  );
}

const toLivingStyle = (res) => ({ answers: res?.answers || {}, updatedAt: res?.updatedAt || null });

export async function myLivingStyle() {
  return toLivingStyle(await get('/me/living-style'));
}

export async function saveMyLivingStyle(answers) {
  return toLivingStyle(await put('/me/living-style', { answers }));
}

export async function livingStyleOf(kind, id) {
  const res = await get(`/flatmates/${encodeURIComponent(kind)}/${encodeURIComponent(id)}/living-style`);
  return { answers: res?.answers || {}, match: Number.isFinite(res?.match) ? res.match : null, common: res?.common || 0 };
}
