import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';

const h = vi.hoisted(() => ({
  auth: { user: null, isIn: false, loading: false },
  toast: vi.fn(),
  gate: vi.fn(),
  draft: { restored: false, clear: vi.fn(), flush: vi.fn(), startFresh: vi.fn(), args: null },
  ent: { entitlements: null, refresh: vi.fn() },
  fee: vi.fn(() => '\u20b9499'),
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k, o) => (o && typeof o === 'object' && Object.keys(o).length ? `${k}|${JSON.stringify(o)}` : k) }) }));
vi.mock('../../../../../../src/context/AuthContext.jsx', () => ({ useAuth: () => h.auth }));
vi.mock('../../../../../../src/context/PricingContext.jsx', () => ({ usePricing: () => ({ fee: h.fee }) }));
vi.mock('../../../../../../src/context/ToastContext.jsx', () => ({ useToast: () => ({ toast: h.toast }) }));
vi.mock('../../../../../../src/lib/useScrollReveal.js', () => ({ useScrollReveal: () => ({ current: null }) }));
vi.mock('../../../../../../src/lib/useSignInGate.js', async (orig) => ({ ...(await orig()), useSignInGate: () => h.gate }));
vi.mock('../../../../../../src/lib/hooks.js', () => ({
  useFormDraft: (key, form, restore, opts) => {
    h.draft.args = { key, form, restore, opts };
    return { restored: h.draft.restored, clear: h.draft.clear, flush: h.draft.flush, startFresh: h.draft.startFresh };
  },
}));
vi.mock('../../../../../../src/pages/consumer/property/useEntitlements.js', () => ({ useEntitlements: () => h.ent }));
vi.mock('../../../../../../src/services/feesService.js', () => ({ getDealFees: vi.fn() }));
vi.mock('../../../../../../src/services/propertyService.js', () => ({ myListing: vi.fn(), myListings: vi.fn() }));
vi.mock('../../../../../../src/services/rentService.js', () => ({ rentAgreementRenewal: vi.fn(), rentAgreementHomeRenewal: vi.fn() }));
vi.mock('../../../../../../src/services/documentService.js', () => ({ listDocuments: vi.fn(), uploadDocument: vi.fn() }));
vi.mock('../../../../../../src/lib/cashfree.js', () => ({ openCashfreeCheckout: vi.fn() }));
vi.mock('../../../../../../src/services/serviceRequestService.js', () => ({
  addServiceRequestDoc: vi.fn(),
  addServiceRequestDocFromVault: vi.fn(),
  cancelServiceRequest: vi.fn(),
  createCoFillServiceRequest: vi.fn(),
  decideServiceRequestInvite: vi.fn(),
  createServiceRequest: vi.fn(),
  getServiceRequest: vi.fn(),
  inviteServiceRequestParty: vi.fn(),
  listMyServiceRequestInvites: vi.fn(),
  listServiceRequests: vi.fn(),
  openServiceRequestCheckout: vi.fn(),
  recordServiceRequestIdentities: vi.fn(),
  readMaskedServiceRequestIdentities: vi.fn(),
  submitServiceRequestPartyDetails: vi.fn(),
  updateServiceRequestDetails: vi.fn(),
  withdrawServiceRequestParty: vi.fn(),
  simulateServiceRequestPayment: vi.fn(),
}));

import * as SR from '../../../../../../src/services/serviceRequestService.js';
import { getDealFees } from '../../../../../../src/services/feesService.js';
import { myListing, myListings } from '../../../../../../src/services/propertyService.js';
import { rentAgreementRenewal, rentAgreementHomeRenewal } from '../../../../../../src/services/rentService.js';
import { listDocuments, uploadDocument } from '../../../../../../src/services/documentService.js';
import { openCashfreeCheckout } from '../../../../../../src/lib/cashfree.js';
import { ApiError } from '../../../../../../src/services/http.js';
import { todayIst } from '../../../../../../src/pages/consumer/services/rent-agreement/validation.js';
import { useRentAgreement } from '../../../../../../src/pages/consumer/services/rent-agreement/useRentAgreement.js';

const USER = { id: 'u1', name: 'Asha Rao', mobile: '9000000001' };
const TODAY = todayIst();
const FEES = { platformFee: 500, stampDuty: null, registration: null, notes: 'n' };

function mount(url = '/services/rent-agreement', { user = USER, loading = false } = {}) {
  h.auth = { user, isIn: !!user, loading };
  const entry = typeof url === 'string' ? url : url;
  const wrapper = ({ children }) => React.createElement(MemoryRouter, { initialEntries: [entry] }, children);
  const view = renderHook(() => ({ lp: useRentAgreement(), loc: useLocation() }), { wrapper });
  return { view, lp: () => view.result.current.lp, loc: () => view.result.current.loc };
}

const settle = () => act(async () => { await Promise.resolve(); });

beforeEach(() => {
  localStorage.clear();
  h.toast.mockReset();
  h.gate.mockReset();
  h.draft = { restored: false, clear: vi.fn(), flush: vi.fn(), startFresh: vi.fn(), args: null };
  h.ent = { entitlements: null, refresh: vi.fn() };
  h.fee.mockClear();
  Object.values(SR).forEach((fn) => fn.mockReset());
  SR.listServiceRequests.mockResolvedValue([]);
  SR.listMyServiceRequestInvites.mockResolvedValue([]);
  SR.readMaskedServiceRequestIdentities.mockResolvedValue({});
  SR.recordServiceRequestIdentities.mockResolvedValue({});
  SR.addServiceRequestDoc.mockResolvedValue({});
  getDealFees.mockReset().mockResolvedValue(FEES);
  myListings.mockReset().mockResolvedValue([]);
  myListing.mockReset().mockResolvedValue(null);
  rentAgreementRenewal.mockReset();
  rentAgreementHomeRenewal.mockReset();
  listDocuments.mockReset().mockResolvedValue([]);
  uploadDocument.mockReset();
  openCashfreeCheckout.mockReset().mockResolvedValue({});
  window.scrollTo = vi.fn();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const validProp = { propType: 'Flat / Apartment', flatNo: '12', society: 'Sky', locality: 'Baner', city: 'Pune', taluka: 'Haveli', pincode: '411045', area: '900', floor: '3', gramPanchayat: false, landmark: 'Mall', policeStation: 'PS', roadVicinity: 'Road', roadType: 'Main' };

function fillValid(t) {
  act(() => {
    const lp = t.lp();
    lp.setProp((p) => ({ ...p, ...validProp }));
    Object.entries({ oName: 'Asha Rao', oDob: '1980-01-01', oPan: 'ABCDE1234F', gender: 'female', oMobile: '9000000001', addr: { pincode: '411045', village: 'Baner', address: '12 Road' } }).forEach(([k, v]) => lp.setO(k, v));
    lp.setOwnerDocs({ 'o-own': { fileName: 'index.pdf', dataUrl: 'data:x' } });
    Object.entries({ name: 'Ravi Kumar', gender: 'male', dob: '1990-05-05', pan: 'FGHIJ5678K', mobile: '9000000002', occupation: 'student' }).forEach(([k, v]) => lp.setTenant(0, k, v));
    Object.entries({ startDate: TODAY, rent: '20000', deposit: '60000', depositPayments: [{ mode: 'upi', ref: 'ABCD1234', amount: '60000', date: TODAY }] }).forEach(([k, v]) => lp.setT(k, v));
    lp.setDeclare(true);
  });
}

describe('initial state', () => {
  it('starts at the property step with owner details seeded', async () => {
    const t = mount();
    await waitFor(() => expect(t.lp().owner.oName).toBe('Asha Rao'));
    expect(t.lp()).toMatchObject({ step: 0, mode: 'owner', done: false, gated: false, locked: false, joinedOnly: true, regArea: 'urban', ownerMode: 'fill', tenantMode: 'fill' });
    expect(t.lp().owner.oMobile).toBe('9000000001');
    expect(h.draft.args.key).toBe('dzDraft:rentAgreement');
    expect(h.draft.args.opts.enabled).toBe(true);
  });

  it('seeds the owner from saved KYC when available', async () => {
    localStorage.setItem('draazyOwnerKYC:9000000001', JSON.stringify({ name: 'Saved Name', dob: '1975-02-02', age: '51', mobile: '9000000001', savedAt: Date.now() }));
    const t = mount();
    await waitFor(() => expect(t.lp().owner.oDob).toBe('1975-02-02'));
    expect(t.lp().owner.oName).toBe('Asha Rao');
  });

  it('gates guests after the public step', async () => {
    const t = mount('/services/rent-agreement', { user: null });
    expect(t.lp().gated).toBe(true);
    act(() => t.lp().setProp((p) => ({ ...p, ...validProp })));
    act(() => t.lp().next());
    expect(h.gate).toHaveBeenCalledWith('services', undefined, expect.any(Function));
    expect(h.draft.flush).toHaveBeenCalled();
    expect(t.lp().step).toBe(0);
    act(() => t.lp().signInToInvite());
    expect(h.gate).toHaveBeenCalledWith('invite');
  });

  it('migrates unredacted draft identity numbers', () => {
    localStorage.setItem('dzDraft:rentAgreement', JSON.stringify({ owner: { oPan: 'ABCDE1234F' }, tenants: [{ pan: 'FGHIJ5678K' }] }));
    mount();
    const saved = JSON.parse(localStorage.getItem('dzDraft:rentAgreement'));
    expect(saved.owner.oPan).toBe('');
    expect(saved.identityReminders).toHaveLength(2);
  });
});

describe('step navigation and form editing', () => {
  it('blocks next with validation errors and flags the fields', () => {
    const t = mount();
    act(() => t.lp().next());
    expect(t.lp().step).toBe(0);
    expect(t.lp().errors).toMatchObject({ flatNo: 'required' });
    expect(h.toast).toHaveBeenCalledWith('services.ra.validationRequired', 'error');
    expect(t.lp().fc('flatNo')).toContain('err');
    expect(t.lp().fc('city')).not.toContain('err');
    act(() => t.lp().setP('flatNo', '12'));
    expect(t.lp().errors.flatNo).toBeUndefined();
    act(() => t.lp().clearErr('society'));
  });

  it('advances and goes back once a step is valid', () => {
    const t = mount();
    act(() => t.lp().setProp((p) => ({ ...p, ...validProp })));
    act(() => t.lp().next());
    expect(t.lp().step).toBe(1);
    act(() => t.lp().prev());
    expect(t.lp().step).toBe(0);
    act(() => t.lp().prev());
    expect(t.lp().step).toBe(0);
  });

  it('tracks the regulatory area from the gram panchayat flag', () => {
    const t = mount();
    act(() => t.lp().setP('gramPanchayat', true));
    expect(t.lp().regArea).toBe('rural');
  });

  it('adds and removes tenants within limits', () => {
    const t = mount();
    for (let i = 0; i < 8; i++) act(() => t.lp().addTenant());
    expect(t.lp().tenants).toHaveLength(6);
    act(() => t.lp().setTenantMode('invite'));
    act(() => t.lp().setTenantDocs({ 't0-5': { fileName: 'a' }, 't1-5': { fileName: 'b' } }));
    act(() => t.lp().removeTenant(0));
    expect(t.lp().tenants).toHaveLength(5);
    expect(Object.keys(t.lp().tenantDocs)).toEqual(['t0-5']);
    cleanup();
    const single = mount();
    act(() => single.lp().removeTenant(0));
    expect(single.lp().tenants).toHaveLength(1);
  });

  it('adds co-owners and keeps the owner capacity in sync', () => {
    const t = mount();
    act(() => t.lp().addCoOwner());
    expect(t.lp().owner.capacity).toBe('co-owner');
    expect(t.lp().coOwners).toHaveLength(1);
    act(() => t.lp().setCoOwner(0, 'name', 'Meera'));
    act(() => t.lp().setOwnerDocs({ 'c0-poa': { fileName: 'x' } }));
    act(() => t.lp().removeCoOwner(0));
    expect(t.lp().coOwners).toEqual([]);
    expect(t.lp().owner.capacity).toBe('owner');
    expect(t.lp().ownerDocs).toEqual({});
    for (let i = 0; i < 5; i++) act(() => t.lp().addCoOwner());
    expect(t.lp().coOwners).toHaveLength(3);
  });

  it('switches to inviting the owner and prefills the tenant', () => {
    const t = mount();
    act(() => t.lp().chooseOwnerMode('invite'));
    expect(t.lp()).toMatchObject({ ownerMode: 'invite', tenantMode: 'fill' });
    expect(t.lp().tenants[0]).toMatchObject({ name: 'Asha Rao', mobile: '9000000001' });
    act(() => t.lp().chooseOwnerMode('fill'));
    expect(t.lp().ownerMode).toBe('fill');
  });

  it('manages the furniture list through the hook', () => {
    const t = mount();
    act(() => t.lp().toggleFurn('Sofa'));
    expect(t.lp().isChecked('Sofa')).toBe(true);
    expect(t.lp().furnitureText()).toBe('Sofa');
  });

  it('restores drafts through the form draft hook', () => {
    const t = mount();
    act(() => h.draft.args.restore({ step: 9, prop: { flatNo: '77' }, terms: { months: 12, rent: '20,000', deposit: '60,000' }, coOwners: [1, 2, 3, 4, 5].map(() => ({ name: 'x' })), maint: 'Owner', clauses: 'abc', declare: true, furnItems: [{ name: 'Bed', qty: 1 }], identityReminders: [{ role: 'licensor', index: 0, field: 'pan', step: 'owner' }], ownerMode: 'invite', invite: { invMobile: '9000000009' }, tenantMode: 'invite', tenants: [{ name: '', mobile: '' }], selectedPropertyId: 'P9', docRefs: { owner: { 'o-own': { fileName: 'a.pdf', reattach: true } }, tenant: {} } }));
    expect(t.lp()).toMatchObject({ step: 4, maint: 'Owner', clauses: 'abc', declare: true, ownerMode: 'invite', tenantMode: 'invite', selectedPropertyId: 'P9' });
    expect(t.lp().prop.flatNo).toBe('77');
    expect(t.lp().terms).toMatchObject({ months: '12', rent: '20000', deposit: '60000' });
    expect(t.lp().coOwners).toHaveLength(3);
    expect(t.lp().tenants[0]).toMatchObject({ mobile: '9000000009' });
    expect(t.lp().ownerDocs['o-own']).toEqual({ fileName: 'a.pdf', reattach: true });
    expect(t.lp().identityReminders.owner).toHaveLength(1);
    act(() => h.draft.args.restore(() => null));
    act(() => h.draft.args.restore('bad'));
  });

  it('exposes the draft form without identity numbers', () => {
    const t = mount();
    act(() => t.lp().setO('oPan', 'ABCDE1234F'));
    expect(h.draft.args.form.owner.oPan).toBe('');
    expect(h.draft.args.form.identityReminders).toEqual([{ role: 'licensor', index: 0, field: 'pan', step: 'owner' }]);
  });
});

describe('cost', () => {
  it('computes stamp duty and registration when the fee table leaves them open', async () => {
    const t = mount();
    expect(t.lp().cost).toMatchObject({ status: 'loading', total: null });
    await waitFor(() => expect(t.lp().cost.status).toBe('ready'));
    act(() => { t.lp().setT('rent', '20000'); t.lp().setT('deposit', '60000'); t.lp().setT('months', '24'); });
    const c = t.lp().cost;
    expect(c.computed).toEqual(['stamp', 'reg']);
    expect(c.reg).toBe(1000);
    expect(c.service).toBe(500);
    expect(c.total).toBe(c.service + c.stamp + c.reg + 300);
    act(() => t.lp().setP('gramPanchayat', true));
    expect(t.lp().cost.reg).toBe(500);
  });

  it('uses fixed fees and applies the referral credit', async () => {
    getDealFees.mockResolvedValue({ platformFee: 1000, stampDuty: 200, registration: 100 });
    h.ent = { entitlements: { agreements: { remaining: 1, discountPercent: 50 } }, refresh: vi.fn() };
    const t = mount();
    await waitFor(() => expect(t.lp().cost.status).toBe('ready'));
    expect(t.lp().cost).toMatchObject({ stamp: 200, reg: 100, waived: 500, total: 1000 + 200 + 100 + 300 - 500, computed: [], notes: null });
  });

  it('reports fee failures and retries', async () => {
    getDealFees.mockRejectedValueOnce(new Error('x'));
    const t = mount();
    await waitFor(() => expect(t.lp().cost.status).toBe('error'));
    getDealFees.mockResolvedValue(FEES);
    act(() => t.lp().cost.retry());
    await waitFor(() => expect(t.lp().cost.status).toBe('ready'));
    getDealFees.mockResolvedValue(null);
    act(() => t.lp().cost.retry());
    await waitFor(() => expect(t.lp().cost.status).toBe('error'));
  });
});

describe('listings', () => {
  const row = { id: 'L1', uuid: 'U1', slug: 'l1-slug' };
  const full = { form: { flatNumber: '12', society: 'Sky', locality: 'Baner', carpetArea: '900', areaUnit: 'sqft', monthlyRent: '25000', deposit: '100000' } };

  it('lists the owner properties', async () => {
    myListings.mockResolvedValue([row]);
    const t = mount();
    await waitFor(() => expect(t.lp().myProperties).toEqual([row]));
    cleanup();
    myListings.mockRejectedValue(new Error('x'));
    const failing = mount();
    await settle();
    expect(failing.lp().myProperties).toEqual([]);
    cleanup();
    myListings.mockResolvedValue('bad');
    const bad = mount();
    await settle();
    expect(bad.lp().myProperties).toEqual([]);
  });

  it('applies the listing from the URL without overwriting entries', async () => {
    myListings.mockResolvedValue([row]);
    myListing.mockResolvedValue(full);
    const t = mount('/services/rent-agreement?listing=l1-slug&reissue=1');
    await waitFor(() => expect(t.lp().selectedPropertyId).toBe('U1'));
    expect(t.lp().prop).toMatchObject({ flatNo: '12', society: 'Sky', area: '900', areaUnit: 'sqft' });
    expect(t.lp().terms).toMatchObject({ rent: '25000', deposit: '100000' });
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('services.ra.reissueHint'));
    expect(t.lp().vaultEnabled).toBe(true);
  });

  it('falls back to the summary row when the full listing is unavailable', async () => {
    myListings.mockResolvedValue([{ ...row, society: 'Moon', locality: 'Wakad' }]);
    myListing.mockResolvedValue(null);
    const t = mount('/services/rent-agreement?flat=L1');
    await waitFor(() => expect(t.lp().prop.society).toBe('Moon'));
  });

  it('refuses to merge a listing for a different flat and picks explicitly', async () => {
    myListings.mockResolvedValue([row]);
    myListing.mockResolvedValue(full);
    const t = mount('/services/rent-agreement?listing=L1');
    act(() => t.lp().setP('flatNo', '99'));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('services.ra.listingOtherFlat', 'info'));
    expect(t.lp().selectedPropertyId).toBeNull();
    let ok;
    await act(async () => { ok = await t.lp().pickListing(row); });
    expect(ok).toBe(true);
    expect(t.lp().prop).toMatchObject({ flatNo: '12', society: 'Sky' });
    expect(t.lp().selectedPropertyId).toBe('U1');
  });

  it('refreshes the vault and restores Index II from it', async () => {
    listDocuments.mockResolvedValue([{ id: 'd1', category: 'Index II', name: 'idx.pdf', mime: 'application/pdf' }]);
    const t = mount();
    act(() => t.lp().setSelectedPropertyId('U1'));
    await waitFor(() => expect(t.lp().ownerDocs['o-own']).toMatchObject({ vaultDocId: 'd1', fromVault: true }));
    act(() => t.lp().setOwnerDocs({ 'o-own': { fileName: 'gone.pdf', vaultDocId: 'missing' } }));
    act(() => t.lp().setSelectedPropertyId('U2'));
    await waitFor(() => expect(listDocuments).toHaveBeenCalledTimes(2));
  });

  it('saves owner docs to the vault', async () => {
    const t = mount();
    act(() => t.lp().setSelectedPropertyId('U1'));
    const file = new File(['x'], 'idx.pdf');
    listDocuments.mockResolvedValue([]);
    uploadDocument.mockResolvedValue({ id: 'v9' });
    act(() => t.lp().setOwnerDocs({ 'o-own': { fileName: 'idx.pdf', dataUrl: 'data:1' } }));
    await act(async () => { await t.lp().saveOwnerDocToVault('o-own', { fileName: 'idx.pdf', dataUrl: 'data:1' }, file); });
    expect(uploadDocument).toHaveBeenCalledWith('9000000001', 'U1', { category: 'Index II', file });
    expect(t.lp().ownerDocs['o-own'].vaultDocId).toBe('v9');
    uploadDocument.mockClear();
    await act(async () => { await t.lp().saveOwnerDocToVault('o-own', { fromVault: true, dataUrl: 'x' }, file); });
    await act(async () => { await t.lp().saveOwnerDocToVault('nope', { dataUrl: 'x' }, file); });
    expect(uploadDocument).not.toHaveBeenCalled();
    listDocuments.mockRejectedValue(new Error('x'));
    await act(async () => { await t.lp().saveOwnerDocToVault('o-own', { fileName: 'z', dataUrl: 'y' }, file); });
  });
});

describe('renewals', () => {
  const renewal = (extra = {}) => ({
    prop: { flatNo: '5', society: 'Moon' },
    tenants: [{ name: 'Ravi', mobile: '+91 9000000002' }, { name: '', mobile: '' }],
    owner: { name: 'Meera', mobile: '9111111111' },
    startDate: '2000-01-01',
    rent: 30000, deposit: 90000, months: 11,
    ...extra,
  });

  it('prefills from a renewal and strips the URL param', async () => {
    rentAgreementRenewal.mockResolvedValue(renewal());
    const t = mount('/services/rent-agreement?renew=R1');
    await waitFor(() => expect(t.lp().prop.flatNo).toBe('5'));
    expect(t.lp().tenants).toHaveLength(1);
    expect(t.lp().tenants[0]).toMatchObject({ name: 'Ravi', mobile: '9000000002' });
    expect(t.lp()).toMatchObject({ ownerMode: 'invite' });
    expect(t.lp().invite).toMatchObject({ invName: 'Meera', invMobile: '9111111111' });
    expect(t.lp().terms).toMatchObject({ rent: '30000', deposit: '90000', months: '11', startDate: t.lp().startBounds.min });
    expect(h.toast).toHaveBeenCalledWith('services.ra.renewHint|{"price":"\u20b9499"}');
    await waitFor(() => expect(t.loc().search).toBe(''));
    expect(rentAgreementHomeRenewal).not.toHaveBeenCalled();
  });

  it('uses the home renewal and keeps the signed in owner', async () => {
    rentAgreementHomeRenewal.mockResolvedValue(renewal({ owner: { mobile: '9000000001' }, startDate: '2999-01-01', prop: {}, tenants: [] }));
    const t = mount('/services/rent-agreement?renewHome=H1');
    await waitFor(() => expect(h.toast).toHaveBeenCalled());
    expect(rentAgreementRenewal).not.toHaveBeenCalled();
    expect(t.lp().ownerMode).toBe('fill');
    expect(t.lp().terms.startDate).toBe(t.lp().startBounds.max);
  });

  it('still shows the hint when the renewal cannot be loaded', async () => {
    rentAgreementRenewal.mockRejectedValue(new Error('x'));
    mount('/services/rent-agreement?renew=R1');
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith(expect.stringContaining('services.ra.renewHint')));
  });
});

describe('active requests', () => {
  const req = (extra = {}) => ({ id: 'R1', status: 'awaiting_payment', amount: 500, details: {}, parties: [], ...extra });

  it('locks the form while an agreement is active', async () => {
    SR.listServiceRequests.mockResolvedValue([req({ status: 'completed' }), req({ id: 'R2', status: 'in_progress', details: { _state: { owner: {} } } })]);
    const t = mount();
    await waitFor(() => expect(t.lp().locked).toBe(true));
    expect(t.lp().joinedOnly).toBe(false);
    expect(t.lp().payable).toBeNull();
    act(() => t.lp().startNewAgreement());
    expect(t.lp().locked).toBe(false);
    expect(h.draft.clear).toHaveBeenCalled();
  });

  it('survives a failing request list', async () => {
    SR.listServiceRequests.mockRejectedValue(new Error('x'));
    const t = mount();
    await settle();
    expect(t.lp().locked).toBe(false);
  });

  it('pays the filed request and confirms', async () => {
    SR.listServiceRequests.mockResolvedValue([req()]);
    SR.openServiceRequestCheckout.mockResolvedValue({ id: 'R1', paymentSessionId: 's1', amount: 500 });
    SR.getServiceRequest.mockResolvedValue({ status: 'paid' });
    const t = mount();
    await waitFor(() => expect(t.lp().payable?.id).toBe('R1'));
    await act(async () => { await t.lp().payFiled(); });
    expect(SR.openServiceRequestCheckout).toHaveBeenCalledWith('R1', 'ra-decl-2026-10');
    expect(h.toast).toHaveBeenCalledWith('services.ra.pay.paid', 'success');
    expect(h.ent.refresh).toHaveBeenCalled();
    expect(t.lp().paying).toBe(false);
  });

  it('reports a cancelled checkout and refused checkouts', async () => {
    SR.listServiceRequests.mockResolvedValue([req()]);
    SR.openServiceRequestCheckout.mockResolvedValueOnce({ id: 'R1', paymentSessionId: 's1' });
    SR.getServiceRequest.mockResolvedValue({ status: 'cancelled' });
    const t = mount();
    await waitFor(() => expect(t.lp().payable).toBeTruthy());
    await act(async () => { await t.lp().payFiled(); });
    expect(h.toast).toHaveBeenCalledWith('services.ra.checkoutFailed', 'error');
    SR.openServiceRequestCheckout.mockRejectedValueOnce(new ApiError({ code: 'x', message: 'Rent changed', status: 409 }));
    await act(async () => { await t.lp().payFiled(); });
    expect(h.toast).toHaveBeenCalledWith('services.ra.checkoutIncomplete|{"detail":"Rent changed"}', 'error');
    SR.openServiceRequestCheckout.mockRejectedValueOnce(new Error('x'));
    await act(async () => { await t.lp().payFiled(); });
    expect(h.toast).toHaveBeenLastCalledWith('services.ra.checkoutFailed', 'error');
  });

  it('lists payable joined requests', async () => {
    SR.listServiceRequests.mockResolvedValue([req({ id: 'J1', myPartyId: 'P1', payableByMe: true, status: 'in_progress' })]);
    const t = mount();
    await waitFor(() => expect(t.lp().payables).toHaveLength(1));
    expect(t.lp().joinedOnly).toBe(true);
  });

  it('detects a stalled invite and recovers it', async () => {
    const state = { ownerMode: 'invite', tenants: [{}] };
    SR.listServiceRequests.mockResolvedValue([req({ details: { _state: state }, parties: [{ id: 'P1', role: 'owner', status: 'declined', partyIndex: 0 }] })]);
    SR.withdrawServiceRequestParty.mockResolvedValue({});
    SR.inviteServiceRequestParty.mockResolvedValue({});
    const t = mount();
    await waitFor(() => expect(t.lp().stalledInvite).toMatchObject({ requestId: 'R1', role: 'owner', partyIndex: 0, declined: { id: 'P1' } }));
    await act(async () => { await t.lp().recoverInvite('reinvite', '+91 90000 00009'); });
    expect(SR.withdrawServiceRequestParty).toHaveBeenCalledWith('R1', 'P1');
    expect(SR.inviteServiceRequestParty).toHaveBeenCalledWith('R1', { role: 'owner', partyIndex: 0, mobile: '919000000009' });
    expect(h.toast).toHaveBeenCalledWith('services.ra.declined.reinvited', 'success');
    SR.cancelServiceRequest.mockResolvedValue({});
    await act(async () => { await t.lp().recoverInvite('cancel'); });
    expect(SR.cancelServiceRequest).toHaveBeenCalledWith('R1');
    expect(h.toast).toHaveBeenCalledWith('services.ra.declined.cancelled', 'success');
    SR.cancelServiceRequest.mockRejectedValue({ status: 500 });
    await act(async () => { await t.lp().recoverInvite('cancel'); });
    expect(h.toast).toHaveBeenCalledWith('services.ra.declined.failed', 'error');
    expect(t.lp().recovering).toBe(false);
  });

  it('finds the tenant that still needs an invite', async () => {
    const state = { tenantMode: 'invite', tenants: [{}, {}] };
    SR.listServiceRequests.mockResolvedValue([req({ details: { _state: state }, parties: [{ id: 'P1', role: 'tenant', status: 'invited', partyIndex: 0 }] })]);
    const t = mount();
    await waitFor(() => expect(t.lp().stalledInvite).toMatchObject({ role: 'tenant', partyIndex: 1, declined: null }));
  });

  it('continues a filed but unpaid request', async () => {
    const state = { prop: { flatNo: '8' }, owner: { oName: 'Asha Rao' }, tenants: [{ name: 'Ravi' }] };
    SR.listServiceRequests.mockResolvedValue([req({ paymentSessionId: null, propertyId: 'P5', details: { _state: state }, docs: [{ category: 'ownership-proof', fileName: 'own.pdf' }] })]);
    SR.readMaskedServiceRequestIdentities.mockResolvedValue({ 'owner-0': { pan: 'ABXXXXXX4F', name: 'Asha Rao' }, 'tenant-0': { name: 'Someone Else' } });
    const t = mount();
    await waitFor(() => expect(t.lp().continuable?.id).toBe('R1'));
    act(() => t.lp().continueFiled());
    expect(t.lp()).toMatchObject({ pendingRequestId: 'R1', selectedPropertyId: 'P5', step: 0, locked: false });
    expect(t.lp().prop.flatNo).toBe('8');
    expect(t.lp().ownerDocs['o-own']).toMatchObject({ fileName: 'own.pdf', filedOn: 'R1' });
    await waitFor(() => expect(Object.keys(t.lp().maskedIds)).toEqual(['owner-0', 'tenant-0']));
    SR.readMaskedServiceRequestIdentities.mockRejectedValue(new Error('x'));
  });

  it('views a submitted request and navigates for joined ones', async () => {
    const state = { prop: { flatNo: '8' }, owner: { oName: 'Asha Rao' }, tenants: [{ name: 'Ravi' }] };
    const own = req({ status: 'in_progress', details: { _state: state }, mySideSubmitted: true, editableByMe: false });
    SR.listServiceRequests.mockResolvedValue([own]);
    const t = mount();
    await waitFor(() => expect(t.lp().locked).toBe(true));
    expect(t.lp().canView(own)).toBe(true);
    expect(t.lp().canView({ myPartyId: 'p', editableByMe: false })).toBe(false);
    act(() => t.lp().viewSubmitted(own));
    expect(t.lp()).toMatchObject({ viewOnly: true, step: 0 });
    expect(t.lp().viewedRequest.id).toBe('R1');
    act(() => t.lp().next());
    expect(t.lp().step).toBe(1);
    act(() => t.lp().editSubmitted());
    expect(t.lp().viewOnly).toBe(true);
    act(() => t.lp().closeFiled());
    expect(t.lp().viewOnly).toBe(false);
    act(() => t.lp().viewSubmitted({ id: 'R5', myPartyId: 'P7' }));
    expect(t.loc().search).toBe('?party=P7&request=R5');
    expect(t.loc().state).toEqual({ raView: true });
  });

  it('lets an editable filed request be edited and discarded', async () => {
    const state = { prop: { flatNo: '8' }, owner: { oName: 'Asha Rao' }, tenants: [{ name: 'Ravi' }] };
    const own = req({ status: 'in_progress', details: { _state: state }, mySideSubmitted: true, editableByMe: true });
    SR.listServiceRequests.mockResolvedValue([own]);
    const t = mount();
    await waitFor(() => expect(t.lp().locked).toBe(true));
    act(() => t.lp().viewSubmitted(own));
    act(() => t.lp().editSubmitted());
    expect(t.lp()).toMatchObject({ viewOnly: false, editingSubmitted: true });
    act(() => t.lp().discardEdits());
    expect(t.lp().viewOnly).toBe(true);
  });

  it('hands a co-fill request over to the owner for editing', async () => {
    const state = { prop: { flatNo: '8' }, owner: { oName: '' }, tenants: [{ name: 'Ravi' }] };
    const held = req({ details: { _state: state }, parties: [{ id: 'P1', role: 'owner', status: 'accepted' }], paymentSessionId: null });
    SR.listServiceRequests.mockResolvedValue([held]);
    const t = mount({ pathname: '/services/rent-agreement', state: { raHold: 'R1' } });
    await waitFor(() => expect(t.lp().editingSubmitted).toBe(true));
    expect(t.lp().holdingUnpaid).toBe(true);
    expect(t.lp().continuableHeld).toBe(true);
    expect(t.lp().owner.oMobile).toBe('9000000001');
  });
});

describe('invites', () => {
  const invite = { id: 'P1', requestId: 'R1', role: 'tenant', partyIndex: 0, status: 'invited', invitedBy: 'Asha' };
  const request = (extra = {}) => ({ id: 'R1', status: 'in_progress', details: { _state: { prop: { flatNo: '8' }, tenants: [{ name: '' }] } }, parties: [], ...extra });

  it('lists pending invites for the user', async () => {
    SR.listMyServiceRequestInvites.mockResolvedValue([invite, { ...invite, id: 'P2', status: 'accepted' }]);
    const t = mount();
    await waitFor(() => expect(t.lp().myInvites).toHaveLength(1));
    expect(t.lp().myInvites[0]).toMatchObject({ inviteId: 'P1', requestId: 'R1', fromName: 'Asha' });
    cleanup();
    SR.listMyServiceRequestInvites.mockRejectedValue(new Error('x'));
    const failing = mount();
    await settle();
    expect(failing.lp().myInvites).toEqual([]);
  });

  it('asks guests to sign in to the invite once', async () => {
    const t = mount('/services/rent-agreement?party=P1', { user: null });
    await waitFor(() => expect(t.lp().inviteError).toEqual({ kind: 'signin' }));
    expect(h.gate).toHaveBeenCalledWith('invite');
    expect(h.gate).toHaveBeenCalledTimes(1);
  });

  it('waits while the session is loading', async () => {
    const t = mount('/services/rent-agreement?party=P1', { loading: true });
    await settle();
    expect(t.lp().inviteError).toBeNull();
    expect(SR.listMyServiceRequestInvites).not.toHaveBeenCalled();
  });

  it('accepts an invite and prefills the tenant', async () => {
    SR.listMyServiceRequestInvites.mockResolvedValue([invite]);
    SR.decideServiceRequestInvite.mockResolvedValue({});
    SR.getServiceRequest.mockResolvedValue(request());
    const t = mount('/services/rent-agreement?party=P1&request=R1');
    await waitFor(() => expect(t.lp().mode).toBe('invite'));
    expect(SR.decideServiceRequestInvite).toHaveBeenCalledWith('P1', 'accept');
    expect(t.lp().inviteRole).toBe('tenant');
    expect(t.lp().tenants[0]).toMatchObject({ name: 'Asha Rao', mobile: '9000000001' });
    expect(t.lp().prop.flatNo).toBe('8');
    expect(t.lp().inviteAwaitingPayment).toBe(false);
    expect(t.lp().viewOnly).toBe(false);
  });

  it('prefills the owner for owner invites and honours saved KYC', async () => {
    localStorage.setItem('draazyOwnerKYC:9000000001', JSON.stringify({ name: 'Kyc Name', dob: '1970-01-01', age: '56', savedAt: Date.now() }));
    SR.listMyServiceRequestInvites.mockResolvedValue([{ ...invite, role: 'owner', status: 'accepted' }]);
    SR.getServiceRequest.mockResolvedValue(request({ status: 'awaiting_payment' }));
    const t = mount('/services/rent-agreement?request=R1');
    await waitFor(() => expect(t.lp().mode).toBe('invite'));
    expect(SR.decideServiceRequestInvite).not.toHaveBeenCalled();
    expect(t.lp().owner).toMatchObject({ oName: 'Asha Rao', oDob: '1970-01-01', oMobile: '9000000001' });
    expect(t.lp().inviteAwaitingPayment).toBe(true);
  });

  it('shows invite errors for declined, missing and blocked invites', async () => {
    SR.listMyServiceRequestInvites.mockResolvedValue([{ ...invite, status: 'declined' }]);
    const declined = mount('/services/rent-agreement?party=P1');
    await waitFor(() => expect(declined.lp().inviteError).toEqual({ kind: 'expired' }));
    cleanup();
    SR.listMyServiceRequestInvites.mockResolvedValue([]);
    const missing = mount('/services/rent-agreement?party=P1');
    await waitFor(() => expect(missing.lp().inviteError).toEqual({ kind: 'expired' }));
    cleanup();
    SR.listMyServiceRequestInvites.mockResolvedValue([invite]);
    SR.decideServiceRequestInvite.mockRejectedValue(new ApiError({ code: 'x', message: 'Already filled', status: 409 }));
    const blocked = mount('/services/rent-agreement?party=P1');
    await waitFor(() => expect(blocked.lp().inviteError).toEqual({ kind: 'blocked', detail: 'Already filled' }));
    cleanup();
    SR.decideServiceRequestInvite.mockRejectedValue(new Error('x'));
    SR.getServiceRequest.mockResolvedValue(null);
    const gone = mount('/services/rent-agreement?party=P1');
    await waitFor(() => expect(gone.lp().inviteError).toEqual({ kind: 'expired' }));
    cleanup();
    SR.listMyServiceRequestInvites.mockRejectedValue(new Error('x'));
    const broken = mount('/services/rent-agreement?party=P1');
    await waitFor(() => expect(broken.lp().inviteError).toEqual({ kind: 'expired' }));
  });

  it('opens a view-only invite that was already submitted', async () => {
    SR.listMyServiceRequestInvites.mockResolvedValue([{ ...invite, status: 'accepted' }]);
    SR.getServiceRequest.mockResolvedValue(request({ mySideSubmitted: true, myPartyId: 'P1' }));
    const t = mount('/services/rent-agreement?party=P1');
    await waitFor(() => expect(t.lp().viewOnly).toBe(true));
    act(() => t.lp().editSubmitted());
    expect(t.lp()).toMatchObject({ viewOnly: false, step: 2 });
    act(() => t.lp().discardEdits());
    expect(t.lp().viewOnly).toBe(true);
    act(() => t.lp().closeFiled());
    expect(t.loc().pathname).toBe('/services/rent-agreement');
  });

  it('routes a co-fill hand-over back to the owner view', async () => {
    SR.listMyServiceRequestInvites.mockResolvedValue([]);
    SR.getServiceRequest.mockResolvedValue(request({ status: 'awaiting_payment', parties: [{ id: 'X', status: 'accepted' }] }));
    const t = mount('/services/rent-agreement?request=R1');
    await waitFor(() => expect(t.loc().state).toEqual({ raHold: 'R1' }));
  });

  it('submits the invitee details and hands off identities and documents', async () => {
    SR.listMyServiceRequestInvites.mockResolvedValue([invite]);
    SR.decideServiceRequestInvite.mockResolvedValue({});
    SR.getServiceRequest.mockResolvedValue(request());
    SR.submitServiceRequestPartyDetails.mockResolvedValue({});
    const t = mount('/services/rent-agreement?party=P1&request=R1');
    await waitFor(() => expect(t.lp().mode).toBe('invite'));
    act(() => {
      t.lp().setProp((p) => ({ ...p, ...validProp }));
      t.lp().setO('oName', 'Asha Rao');
      Object.entries({ name: 'Ravi Kumar', gender: 'male', dob: '1990-05-05', pan: 'FGHIJ5678K', mobile: '9000000001', occupation: 'student' }).forEach(([k, v]) => t.lp().setTenant(0, k, v));
      t.lp().setDeclare(true);
    });
    await act(async () => { await t.lp().generate(); });
    expect(t.lp().step).not.toBeUndefined();
  });
});

describe('generate (owner)', () => {
  it('does nothing while loading and gates guests', async () => {
    const t = mount('/services/rent-agreement', { loading: true });
    await act(async () => { await t.lp().generate(); });
    expect(h.gate).not.toHaveBeenCalled();
    cleanup();
    const guest = mount('/services/rent-agreement', { user: null });
    await act(async () => { await guest.lp().generate(); });
    expect(h.gate).toHaveBeenCalledWith('services', undefined, expect.any(Function));
  });

  it('jumps to the first invalid step', async () => {
    const t = mount();
    act(() => t.lp().setProp((p) => ({ ...p, ...validProp })));
    await act(async () => { await t.lp().generate(); });
    expect(t.lp().step).toBe(1);
    expect(h.toast).toHaveBeenCalledWith('services.ra.validationRequired', 'error');
  });

  it('requires the declaration', async () => {
    const t = mount();
    fillValid(t);
    act(() => t.lp().setDeclare(false));
    await act(async () => { await t.lp().generate(); });
    expect(h.toast).toHaveBeenCalledWith('services.ra.declarationRequired', 'error');
    expect(SR.createServiceRequest).not.toHaveBeenCalled();
  });

  it('blocks oversized details', async () => {
    const t = mount();
    fillValid(t);
    act(() => t.lp().setClauses('x'.repeat(17000)));
    expect(t.lp().detailsTooLong).toBe(true);
    await act(async () => { await t.lp().generate(); });
    expect(h.toast).toHaveBeenCalledWith(expect.stringContaining('services.ra.detailsTooLong'), 'error');
    expect(t.lp().step).toBe(t.lp().detailsWorstField.step);
    expect(SR.createServiceRequest).not.toHaveBeenCalled();
  });

  it('files the request, uploads documents and pays', async () => {
    SR.createServiceRequest.mockResolvedValue({ id: 'SR1' });
    SR.openServiceRequestCheckout.mockResolvedValue({ id: 'SR1', paymentSessionId: 's1', amount: 1000 });
    SR.getServiceRequest.mockResolvedValue({ status: 'paid' });
    const t = mount();
    await waitFor(() => expect(t.lp().cost.status).toBe('ready'));
    fillValid(t);
    await act(async () => { await t.lp().generate(); });
    expect(SR.createServiceRequest).toHaveBeenCalledWith(expect.objectContaining({ type: 'rental', service: 'Rent Agreement', customer: { name: 'Asha Rao' } }));
    expect(SR.recordServiceRequestIdentities).toHaveBeenCalledWith('SR1', expect.arrayContaining([expect.objectContaining({ partyRole: 'owner', pan: 'ABCDE1234F' })]));
    expect(SR.addServiceRequestDoc).toHaveBeenCalledTimes(1);
    expect(t.lp().done).toBe(true);
    expect(h.draft.clear).toHaveBeenCalled();
    expect(window.scrollTo).toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('draazyOwnerKYC:9000000001'))).toMatchObject({ name: 'Asha Rao' });
    expect(t.lp().pendingRequestId).toBeNull();
  });

  it('reuses an already filed identical request on retry', async () => {
    SR.createServiceRequest.mockResolvedValue({ id: 'SR1' });
    SR.openServiceRequestCheckout.mockRejectedValueOnce(new Error('x')).mockResolvedValue({ id: 'SR1', paymentSessionId: 's1', amount: 1 });
    SR.getServiceRequest.mockResolvedValue({ status: 'paid' });
    const t = mount();
    fillValid(t);
    await act(async () => { await t.lp().generate(); });
    expect(t.lp().done).toBe(false);
    expect(h.toast).toHaveBeenCalledWith('services.ra.checkoutFailed', 'error');
    expect(t.lp().pendingRequestId).toBe('SR1');
    await act(async () => { await t.lp().generate(); });
    expect(SR.createServiceRequest).toHaveBeenCalledTimes(1);
    expect(t.lp().done).toBe(true);
  });

  it('reports identity and document hand-off failures', async () => {
    SR.createServiceRequest.mockResolvedValue({ id: 'SR1' });
    SR.addServiceRequestDoc.mockRejectedValue(new Error('x'));
    const t = mount();
    fillValid(t);
    await act(async () => { await t.lp().generate(); });
    expect(h.toast).toHaveBeenCalledWith('services.ra.docsRetry', 'error');
    expect(t.lp().done).toBe(false);
    SR.recordServiceRequestIdentities.mockRejectedValue(new ApiError({ code: 'x', message: 'm', status: 422 }));
    await act(async () => { await t.lp().generate(); });
    expect(h.toast).toHaveBeenCalledWith('services.ra.identitiesDuplicate', 'error');
    SR.recordServiceRequestIdentities.mockRejectedValue(new Error('x'));
    await act(async () => { await t.lp().generate(); });
    expect(h.toast).toHaveBeenCalledWith('services.ra.identitiesRetry', 'error');
  });

  it('uploads vault-backed documents', async () => {
    SR.createServiceRequest.mockResolvedValue({ id: 'SR1' });
    SR.addServiceRequestDocFromVault.mockResolvedValue({});
    SR.openServiceRequestCheckout.mockResolvedValue({ id: 'SR1', paymentSessionId: 's1' });
    SR.getServiceRequest.mockResolvedValue({ status: 'paid' });
    const t = mount();
    fillValid(t);
    act(() => t.lp().setOwnerDocs({ 'o-own': { fileName: 'idx.pdf', vaultDocId: 'v1' } }));
    await act(async () => { await t.lp().generate(); });
    expect(SR.addServiceRequestDocFromVault).toHaveBeenCalledWith('SR1', { documentId: 'v1', category: 'ownership-proof' });
    expect(t.lp().done).toBe(true);
  });

  it('shows server refusals and a generic save error', async () => {
    SR.createServiceRequest.mockRejectedValueOnce(new ApiError({ code: 'x', message: 'Duplicate agreement', status: 409 }));
    const t = mount();
    fillValid(t);
    await act(async () => { await t.lp().generate(); });
    expect(h.toast).toHaveBeenCalledWith('Duplicate agreement', 'error');
    SR.createServiceRequest.mockRejectedValueOnce(new ApiError({ code: 'x', message: 'Too long', status: 422 }));
    await act(async () => { await t.lp().generate(); });
    expect(h.toast).toHaveBeenCalledWith('services.ra.detailsRejected|{"detail":"Too long"}', 'error');
    SR.createServiceRequest.mockRejectedValueOnce(new Error('x'));
    await act(async () => { await t.lp().generate(); });
    expect(h.toast).toHaveBeenLastCalledWith('services.ra.saveError', 'error');
    expect(t.lp().submitting).toBe(false);
  });

  it('invites the tenant and shares a link', async () => {
    const request = { id: 'SR2', parties: [{ id: 'PT1', role: 'tenant', status: 'invited', mobile: '90******02', pending: true, whatsappQueued: true }] };
    SR.createCoFillServiceRequest.mockResolvedValue(request);
    SR.inviteServiceRequestParty.mockResolvedValue(request);
    SR.openServiceRequestCheckout.mockResolvedValue({ id: 'SR2', paymentSessionId: 's' });
    SR.getServiceRequest.mockResolvedValue({ status: 'paid' });
    const t = mount();
    fillValid(t);
    act(() => { t.lp().setTenantMode('invite'); t.lp().addTenant(); });
    act(() => { t.lp().setTenant(1, 'mobile', '9000000003'); t.lp().setTenant(0, 'mobile', '9000000002'); });
    await act(async () => { await t.lp().generate(); });
    expect(SR.createCoFillServiceRequest).toHaveBeenCalledWith(expect.objectContaining({ role: 'tenant', mobile: '9000000002' }));
    expect(SR.inviteServiceRequestParty).toHaveBeenCalledWith('SR2', { role: 'tenant', mobile: '9000000003', partyIndex: 1 });
    expect(t.lp().done).toBe(true);
    expect(t.lp().inviteResult).toMatchObject({ requestId: 'SR2', partyId: 'PT1', toMobile: '9000000002', queued: true, pending: true });
    expect(t.lp().inviteResult.link).toContain('PT1');
    expect(t.lp().inviteResult.waLink).toContain('https://wa.me/919000000002');
  });

  it('copies and withdraws the invite link', async () => {
    const request = { id: 'SR3', parties: [{ id: 'PO1', role: 'owner', status: 'invited' }] };
    SR.createCoFillServiceRequest.mockResolvedValue(request);
    const t = mount();
    fillValid(t);
    act(() => { t.lp().chooseOwnerMode('invite'); t.lp().setInvite({ invMobile: '9111111111', invName: 'Meera', invMessage: '' }); });
    await act(async () => { await t.lp().generate(); });
    expect(t.lp().done).toBe(true);
    expect(t.lp().inviteResult).toMatchObject({ requestId: 'SR3', partyId: 'PO1', toName: 'Meera' });
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await act(async () => { await t.lp().copyInviteLink(); });
    expect(writeText).toHaveBeenCalledWith(t.lp().inviteResult.link);
    expect(t.lp().copied).toBe(true);
    expect(h.toast).toHaveBeenCalledWith('services.ra.invite.copied', 'success');
    writeText.mockRejectedValue(new Error('x'));
    await act(async () => { await t.lp().copyInviteLink(); });
    expect(h.toast).toHaveBeenCalledWith('services.ra.invite.copyFail', 'error');
    SR.withdrawServiceRequestParty.mockRejectedValueOnce(new Error('x'));
    await act(async () => { await t.lp().withdrawInvite(); });
    expect(h.toast).toHaveBeenCalledWith('services.ra.invite.withdrawFailed', 'error');
    SR.withdrawServiceRequestParty.mockResolvedValue({});
    await act(async () => { await t.lp().withdrawInvite(); });
    expect(SR.withdrawServiceRequestParty).toHaveBeenLastCalledWith('SR3', 'PO1');
    expect(t.lp().inviteResult).toBeNull();
    expect(t.lp().done).toBe(false);
  });

  it('ignores copy and withdraw without an invite result', async () => {
    const t = mount();
    await act(async () => { await t.lp().copyInviteLink(); });
    await act(async () => { await t.lp().withdrawInvite(); });
    expect(SR.withdrawServiceRequestParty).not.toHaveBeenCalled();
  });
});
