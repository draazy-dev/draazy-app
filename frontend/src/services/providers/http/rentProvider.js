import { PAGE_LOAD_TTL, del, get, patch, post, put, unwrapPage } from '../../http.js';
import { readAccessToken } from '../../../lib/auth.js';
import {
  toBasisViewModel,
  toCashflowPoint,
  toDueViewModel,
  toSummaryViewModel,
  toTenancyViewModel,
  toTenancyDeclarationViewModel,
  toTenantProfileViewModel,
  toTransactionViewModel,
  toRentAgreementViewModel,
  toRentalViewModel,
} from './rentMapper.js';

const signedIn = () => !!readAccessToken();

const toList = (rows, fn) => (Array.isArray(rows) ? rows : []).map(fn);

const unwrapMapped = (res, fn, requested = 0) => {
  const { items, ...rest } = unwrapPage(res, { page: requested });
  return { items: toList(items, fn), ...rest };
};

export async function myTenancies() {
  if (!signedIn()) return [];
  return toList(await get('/me/tenancies', undefined, { ttl: PAGE_LOAD_TTL }), toTenancyViewModel);
}

export async function confirmTenancy(id) {
  return toTenancyViewModel(await post(`/me/tenancies/${encodeURIComponent(id)}/confirm`, {}));
}

export async function declineTenancy(id) {
  return toTenancyViewModel(await post(`/me/tenancies/${encodeURIComponent(id)}/decline`, {}));
}

export async function listTenancyDeclarations(propId) {
  if (!signedIn()) return [];
  return unwrapMapped(await get(`/properties/${encodeURIComponent(propId)}/tenancy-declarations`),
    toTenancyDeclarationViewModel).items;
}

export async function declareTenancy(propId, body = {}) {
  return toTenancyDeclarationViewModel(
    await post(`/properties/${encodeURIComponent(propId)}/tenancy-declarations`, {
      livedFrom: body.livedFrom || null,
      livedTo: body.livedTo || null,
    }));
}

export async function confirmTenancyDeclaration(id) {
  return toTenancyDeclarationViewModel(
    await post(`/tenancy-declarations/${encodeURIComponent(id)}/confirm`, {}));
}

export async function revokeTenancyDeclaration(id) {
  return toTenancyDeclarationViewModel(
    await post(`/tenancy-declarations/${encodeURIComponent(id)}/revoke`, {}));
}

export async function myTenantProfile() {
  if (!signedIn()) return null;
  return toTenantProfileViewModel(await get('/me/tenant-profile'));
}

export async function saveTenantProfile(profile = {}) {
  return toTenantProfileViewModel(await put('/me/tenant-profile', {
    name: profile.name || undefined,
    occupation: profile.occupation || undefined,
    income: profile.income == null ? undefined : Number(profile.income),
    occupants: profile.occupants || undefined,
    moveIn: profile.moveIn || undefined,
    priorLandlord: profile.priorLandlord || undefined,
    about: profile.about || undefined,
  }));
}

const VERIFIED_BATCH_SIZE = 50;

const tenDigits = (mobile) => {
  const d = String(mobile || '').replace(/\D/g, '').slice(-10);
  return d.length === 10 ? d : '';
};

export async function tenantsVerified(mobiles = []) {
  const wanted = [...new Set((Array.isArray(mobiles) ? mobiles : []).map(tenDigits).filter(Boolean))];
  const verified = new Set();
  if (!signedIn() || !wanted.length) return verified;
  for (let i = 0; i < wanted.length; i += VERIFIED_BATCH_SIZE) {
    const rows = await post('/tenant-profiles/verified', {
      mobiles: wanted.slice(i, i + VERIFIED_BATCH_SIZE),
    });
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      if (row?.verified) verified.add(tenDigits(row.mobile));
    });
  }
  verified.delete('');
  return verified;
}

export async function myRentals() {
  if (!signedIn()) return [];
  return toList(await get('/me/rentals'), toRentalViewModel);
}

export async function addRental(rental = {}) {
  return toRentalViewModel(await post('/me/rentals', {
    address: rental.address,
    monthlyRent: Number(rental.monthlyRent) || 0,
    deposit: rental.deposit === undefined || rental.deposit === '' ? undefined : Number(rental.deposit),
    leaseStart: rental.leaseStart,
    leaseEnd: rental.leaseEnd || undefined,
  }));
}

export async function updateRental(rentalId, patchBody = {}) {
  const body = {};
  ['address', 'leaseStart', 'leaseEnd', 'status'].forEach((k) => {
    if (patchBody[k] !== undefined) body[k] = patchBody[k];
  });
  ['monthlyRent', 'deposit'].forEach((k) => {
    if (patchBody[k] !== undefined) body[k] = patchBody[k] === '' ? null : Number(patchBody[k]);
  });
  return toRentalViewModel(await patch(`/me/rentals/${encodeURIComponent(rentalId)}`, body));
}

export async function deleteRental(rentalId) {
  await del(`/me/rentals/${encodeURIComponent(rentalId)}`);
}

export async function listTransactions(propId, page = 0, size = 50) {
  if (!signedIn() || !propId) return unwrapMapped(null, toTransactionViewModel, page);
  return unwrapMapped(
    await get(`/me/finances/${encodeURIComponent(propId)}/transactions`, { page, size }),
    toTransactionViewModel,
    page,
  );
}

export async function addTransaction(propId, txn = {}) {
  return toTransactionViewModel(
    await post(`/me/finances/${encodeURIComponent(propId)}/transactions`, {
      type: txn.type || 'expense',
      category: txn.category || undefined,
      amount: Number(txn.amount) || 0,
      date: txn.date,
      note: txn.note || undefined,
      recurring: txn.recurring || undefined,
    }),
  );
}

export async function updateTransaction(propId, txnId, patchBody = {}) {
  const body = {};
  ['type', 'category', 'note', 'recurring', 'date'].forEach((k) => {
    if (patchBody[k] !== undefined) body[k] = patchBody[k];
  });
  if (patchBody.amount !== undefined) body.amount = Number(patchBody.amount);
  return toTransactionViewModel(
    await patch(`/me/finances/${encodeURIComponent(propId)}/transactions/${encodeURIComponent(txnId)}`, body),
  );
}

export async function deleteTransaction(propId, txnId) {
  await del(`/me/finances/${encodeURIComponent(propId)}/transactions/${encodeURIComponent(txnId)}`);
}

const financeOverview = (propId) => get(`/me/finances/${encodeURIComponent(propId)}/overview`);

export async function getBasis(propId) {
  if (!signedIn() || !propId) return null;
  return toBasisViewModel((await financeOverview(propId))?.basis);
}

export async function setBasis(propId, basis = {}) {
  return toBasisViewModel(await put(`/me/finances/${encodeURIComponent(propId)}/basis`, {
    purchasePrice: basis.purchasePrice == null ? undefined : Number(basis.purchasePrice),
    purchaseDate: basis.purchaseDate || undefined,
    loanOutstanding: basis.loanOutstanding == null ? undefined : Number(basis.loanOutstanding),
    emi: basis.emi == null ? undefined : Number(basis.emi),
    currentValue: basis.currentValue == null ? undefined : Number(basis.currentValue),
  }));
}

export async function financeSummary(propId, period) {
  if (!signedIn() || !propId) return toSummaryViewModel(null);
  return toSummaryViewModel(await get(
    `/me/finances/${encodeURIComponent(propId)}/summary`,
    { period: period && period !== 'all' ? period : undefined },
  ));
}

export async function cashflow(propId) {
  if (!signedIn() || !propId) return [];
  return toList((await financeOverview(propId))?.cashflow, toCashflowPoint);
}

export async function dues(propId) {
  if (!signedIn() || !propId) return [];
  return toList((await financeOverview(propId))?.dues, toDueViewModel);
}

export async function myRentAgreements() {
  if (!signedIn()) return [];
  return toList(await get('/me/rent-agreements'), toRentAgreementViewModel);
}

export async function rentAgreementRenewal(id) {
  const r = await get(`/me/rent-agreements/${encodeURIComponent(id)}/renewal`);
  const party = (p) => ({ name: p?.name || '', mobile: String(p?.mobile || '') });
  return {
    rent: Number(r?.rent) || 0,
    deposit: Number(r?.deposit) || 0,
    months: Number(r?.months) || 0,
    startDate: r?.startDate || null,
    owner: r?.owner ? party(r.owner) : null,
    tenants: Array.isArray(r?.tenants) ? r.tenants.map(party) : [],
  };
}
