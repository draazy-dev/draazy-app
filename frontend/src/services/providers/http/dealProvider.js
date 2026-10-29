import { del, get, post, unwrapFullPage } from '../../http.js';
import { MAX_PAGE_SIZE } from '../../apiLimits.js';
import { readAccessToken } from '../../../lib/auth.js';
import {
  mayRespond,
  toDealViewModel,
  toFinalizationViewModel,
  toOfferViewModel,
  toPartyViewModel,
} from './dealMapper.js';

const signedIn = () => !!readAccessToken();

const toList = (rows, fn) => (Array.isArray(rows) ? rows : []).map(fn);

const paged = () => ({ size: MAX_PAGE_SIZE });

export async function getDeal(propId) {
  if (!signedIn() || !propId) return null;
  return toDealViewModel(await get(`/me/deals/${encodeURIComponent(propId)}`));
}

export async function dealStatusForBuyer(property) {
  return property?.dealStatus || 'active';
}

export async function reserveDeal(propId) {
  await post(`/me/deals/${encodeURIComponent(propId)}/reserve`, {});
}

export async function closeDeal(propId, { agreedPrice, counterpartyMobile, note } = {}) {
  await post(`/me/deals/${encodeURIComponent(propId)}/close`, {
    agreedPrice: Number(agreedPrice) || 0,
    counterpartyMobile: String(counterpartyMobile || '').replace(/\D/g, ''),
    note: note || undefined,
  });
}

export async function reopenDeal(propId, availableOn) {
  await post(`/me/deals/${encodeURIComponent(propId)}/reopen`, availableOn ? { availableOn } : {});
}

export async function listParties(propId) {
  if (!signedIn() || !propId) return [];
  return toList(await get(`/me/deals/${encodeURIComponent(propId)}/parties`), toPartyViewModel);
}

export async function submitOffer(req = {}) {
  return toOfferViewModel(await post('/offers', {
    propertyId: req.propId || req.propertyId,
    amount: Number(req.amount) || 0,
    message: req.message || undefined,
    moveIn: req.moveIn || undefined,
  }));
}

export async function respondOffer(id, action, counterAmount, opts = {}) {
  if (!mayRespond(action, opts.isOwner)) {
    throw new Error(
      `[deal] Only the listing owner can ${action} an offer. A buyer may only counter.`,
    );
  }
  await post(`/offers/${encodeURIComponent(id)}/respond`, {
    action,
    counterAmount: action === 'counter' ? Number(counterAmount) || 0 : undefined,
    message: opts.message || undefined,
  });
}

export async function myOffers() {
  if (!signedIn()) return [];
  return unwrapFullPage(await get('/offers/mine', paged()), 'offer').map(toOfferViewModel);
}

export async function offersOnMine() {
  if (!signedIn()) return [];
  return unwrapFullPage(await get('/me/offers', paged()), 'offer').map(toOfferViewModel);
}

export async function requestFinalization(propId, { counterpartyMobile, agreedPrice } = {}) {
  return toFinalizationViewModel(
    await post(`/finalization/${encodeURIComponent(propId)}/request`, {
      propertyId: propId,
      counterpartyMobile: String(counterpartyMobile || '').replace(/\D/g, ''),
      agreedPrice: Number(agreedPrice) || 0,
    }),
  );
}

export async function finalizationStatus(propId) {
  if (!signedIn() || !propId) return null;
  return toFinalizationViewModel(await get(`/finalization/${encodeURIComponent(propId)}/status`));
}

export async function cancelFinalization(propId) {
  await del(`/finalization/${encodeURIComponent(propId)}/status`);
}

export async function myFinalizationRequests() {
  if (!signedIn()) return [];
  const rows = unwrapFullPage(await get('/me/finalization-requests', paged()), 'finalization');
  return rows.map(toFinalizationViewModel).filter(Boolean);
}

export async function acceptFinalization(reqId) {
  await post(`/finalization/requests/${encodeURIComponent(reqId)}/accept`, {});
}

export async function declineFinalization(reqId) {
  await post(`/finalization/requests/${encodeURIComponent(reqId)}/decline`, {});
}
