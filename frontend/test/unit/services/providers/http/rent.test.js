import { describe, expect, it } from 'vitest';
import { setupFetch } from '../net.js';
import * as m from '../../../../../src/services/providers/http/rentMapper.js';
import * as r from '../../../../../src/services/providers/http/rentProvider.js';

describe('rentMapper', () => {
  it('toTenancyViewModel', () => {
    expect(m.toTenancyViewModel()).toEqual({
      id: '', propId: '', propertyId: '', rent: 0, deposit: 0, startDate: null, endDate: null, status: 'active', active: true, pending: false, confirmed: true,
      tenantId: '', tenantName: '', tenantMobile: '', ownerId: '', ownerName: '', ownerMobile: '',
    });
    expect(m.toTenancyViewModel({
      id: 't', propertyId: 'p', rent: '100', deposit: 'x', startDate: 's', endDate: 'e', status: 'pending',
      tenant: { id: 'ti', name: 'T', mobile: '1' }, owner: { id: 'oi', name: 'O', mobile: '2' },
    })).toMatchObject({ rent: 100, deposit: 0, active: false, pending: true, confirmed: false, tenantName: 'T', ownerMobile: '2', propId: 'p' });
    expect(m.toTenancyViewModel({ status: 'ended' })).toMatchObject({ active: false, confirmed: true });
    expect(m.toTenancyViewModel({ status: 'declined' }).confirmed).toBe(false);
  });

  it('toTenancyDeclarationViewModel', () => {
    expect(m.toTenancyDeclarationViewModel()).toEqual({
      id: '', propId: '', propertyId: '', declarantId: '', declarantName: '', livedFrom: null, livedTo: null, status: 'pending', confirmed: false, decidedAt: null,
    });
    expect(m.toTenancyDeclarationViewModel({ id: 'd', propertyId: 'p', declarantId: 'u', declarantName: 'N', livedFrom: 'a', livedTo: 'b', status: 'confirmed', decidedAt: 'c' })).toMatchObject({ confirmed: true, decidedAt: 'c', livedTo: 'b' });
  });

  it('toTenantProfileViewModel', () => {
    expect(m.toTenantProfileViewModel(null)).toBeNull();
    expect(m.toTenantProfileViewModel({ about: 'x' })).toBeNull();
    expect(m.toTenantProfileViewModel({ mobile: '9' })).toEqual({
      mobile: '9', name: '', occupation: '', income: null, occupants: '', moveIn: null, priorLandlord: '', about: '', score: null, verified: false,
    });
    expect(m.toTenantProfileViewModel({ name: 'N', income: '5', score: '7', verified: 1, occupation: 'o', occupants: '2', moveIn: 'd', priorLandlord: 'pl', about: 'a' })).toMatchObject({ income: 5, score: 7, verified: true, name: 'N' });
  });

  it('toTransactionViewModel and toRentalViewModel', () => {
    expect(m.toTransactionViewModel()).toEqual({ id: '', propId: '', propertyId: '', type: 'expense', category: '', amount: 0, date: null, note: '', recurring: '' });
    expect(m.toTransactionViewModel({ id: 'x', propertyId: 'p', type: 'income', category: 'c', amount: '9', date: 'd', note: 'n', recurring: 'monthly' })).toMatchObject({ type: 'income', amount: 9, recurring: 'monthly' });
    expect(m.toRentalViewModel()).toEqual({ id: '', address: '', monthlyRent: 0, deposit: null, leaseStart: null, leaseEnd: null, status: 'active', monthsPaid: 0, totalPaid: 0, fyPaid: 0 });
    expect(m.toRentalViewModel({ id: 'r', address: 'a', monthlyRent: '5', deposit: '10', leaseStart: 's', leaseEnd: 'e', status: 'ended', monthsPaid: 2, totalPaid: 3, fyPaid: 4 })).toMatchObject({ monthlyRent: 5, deposit: 10, status: 'ended', fyPaid: 4 });
  });

  it('summary, cashflow and due view models', () => {
    expect(m.toSummaryViewModel()).toEqual({ income: 0, expense: 0, net: 0, occupancyRate: null });
    expect(m.toSummaryViewModel({ income: '1', expense: 2, net: -1, occupancyRate: '0.5' })).toEqual({ income: 1, expense: 2, net: -1, occupancyRate: 0.5 });
    expect(m.toCashflowPoint()).toEqual({ month: '', income: 0, expense: 0, net: 0 });
    expect(m.toCashflowPoint({ month: '2026-01', income: 1, expense: 2, net: -1 })).toEqual({ month: '2026-01', income: 1, expense: 2, net: -1 });
    expect(m.toDueViewModel()).toMatchObject({ type: 'expense', nextDue: null, daysUntil: 0, overdue: false });
    expect(m.toDueViewModel({ id: 'd', propertyId: 'p', type: 'income', amount: 5, nextDue: 'x', daysUntil: -2 })).toMatchObject({ overdue: true, daysUntil: -2, propId: 'p' });
  });

  it('toBasisViewModel', () => {
    expect(m.toBasisViewModel(null)).toBeNull();
    expect(m.toBasisViewModel({})).toBeNull();
    expect(m.toBasisViewModel({ purchasePrice: '100' })).toEqual({ purchasePrice: 100, purchaseDate: null, loanOutstanding: null, emi: null, currentValue: null });
    expect(m.toBasisViewModel({ purchaseDate: 'd', loanOutstanding: 1, emi: 2 })).toMatchObject({ purchaseDate: 'd', loanOutstanding: 1, emi: 2 });
    expect(m.toBasisViewModel({ currentValue: 0 }).currentValue).toBe(0);
  });

  it('toRentAgreementViewModel', () => {
    expect(m.toRentAgreementViewModel()).toEqual({
      id: '', propId: '', propertyId: '', tenantMobile: '', rent: 0, deposit: 0, startDate: null, durationMonths: null, endDate: null, date: null, status: 'draft', documentUrl: null,
    });
    expect(m.toRentAgreementViewModel({ id: 'a', propertyId: 'p', tenantMobile: '9', rent: '5', deposit: '6', startDate: 's', durationMonths: '11', endDate: 'e', status: 'live', documentUrl: 'u' })).toMatchObject({ durationMonths: 11, date: 's', documentUrl: 'u', status: 'live' });
  });
});

describe('rentProvider signed in', () => {
  const net = setupFetch({ signedIn: true });

  it('tenancies', async () => {
    net.reply([{ id: 't1', propertyId: 'p' }]);
    expect((await r.myTenancies())[0]).toMatchObject({ id: 't1', propId: 'p' });
    expect(net.last().path).toBe('/me/tenancies');
    net.fresh();
    net.reply({});
    expect(await r.myTenancies()).toEqual([]);
    net.reply({ id: 't', status: 'active' });
    await r.confirmTenancy('t/1');
    expect(net.last()).toMatchObject({ path: '/me/tenancies/t%2F1/confirm', method: 'POST', body: {} });
    await r.declineTenancy('t1');
    expect(net.last().path).toBe('/me/tenancies/t1/decline');
  });

  it('tenancy declarations', async () => {
    net.reply({ content: [{ id: 'd1', status: 'confirmed' }], totalElements: 1 });
    expect(await r.listTenancyDeclarations('p/1')).toEqual([expect.objectContaining({ id: 'd1', confirmed: true })]);
    expect(net.last().path).toBe('/properties/p%2F1/tenancy-declarations');
    net.reply({ id: 'd' });
    await r.declareTenancy('p1', { livedFrom: 'a' });
    expect(net.last()).toMatchObject({ path: '/properties/p1/tenancy-declarations', method: 'POST', body: { livedFrom: 'a', livedTo: null } });
    await r.declareTenancy('p1');
    expect(net.last().body).toEqual({ livedFrom: null, livedTo: null });
    await r.confirmTenancyDeclaration('d/1');
    expect(net.last().path).toBe('/tenancy-declarations/d%2F1/confirm');
    await r.revokeTenancyDeclaration('d1');
    expect(net.last().path).toBe('/tenancy-declarations/d1/revoke');
  });

  it('tenant profile', async () => {
    net.reply({ mobile: '9', name: 'N' });
    expect(await r.myTenantProfile()).toMatchObject({ mobile: '9' });
    net.fresh();
    net.reply(null);
    expect(await r.myTenantProfile()).toBeNull();
    net.reply({ name: 'N' });
    await r.saveTenantProfile({ name: 'N', occupation: 'o', income: '5', occupants: '2', moveIn: 'd', priorLandlord: 'p', about: 'a' });
    expect(net.last()).toMatchObject({ path: '/me/tenant-profile', method: 'PUT', body: { name: 'N', occupation: 'o', income: 5, occupants: '2', moveIn: 'd', priorLandlord: 'p', about: 'a' } });
    await r.saveTenantProfile();
    expect(net.last().body).toEqual({});
  });

  it('tenantsVerified batches, de-duplicates and normalises mobiles', async () => {
    expect((await r.tenantsVerified()).size).toBe(0);
    expect((await r.tenantsVerified(['abc', '123'])).size).toBe(0);
    expect((await r.tenantsVerified('x')).size).toBe(0);
    expect(net.calls).toHaveLength(0);
    const many = Array.from({ length: 52 }, (_, i) => `9000000${String(i).padStart(3, '0')}`);
    net.on((call) => call.body.mobiles.map((mobile, i) => ({ mobile: `+91 ${mobile}`, verified: i === 0 })).concat([null, { mobile: '', verified: true }]));
    const out = await r.tenantsVerified([...many, `+91-${many[0]}`]);
    expect(net.calls).toHaveLength(2);
    expect(net.calls[0]).toMatchObject({ path: '/tenant-profiles/verified', method: 'POST' });
    expect(net.calls[0].body.mobiles).toHaveLength(50);
    expect(net.calls[1].body.mobiles).toHaveLength(2);
    expect([...out].sort()).toEqual([many[0], many[50]].sort());
    net.on(() => ({}));
    expect((await r.tenantsVerified([many[0]])).size).toBe(0);
  });

  it('rentals', async () => {
    net.reply([{ id: 'r', monthlyRent: 5 }]);
    expect((await r.myRentals())[0]).toMatchObject({ id: 'r', monthlyRent: 5 });
    net.reply({ id: 'r' });
    await r.addRental({ address: 'a', monthlyRent: '10', deposit: '20', leaseStart: 's', leaseEnd: 'e' });
    expect(net.last()).toMatchObject({ path: '/me/rentals', method: 'POST', body: { address: 'a', monthlyRent: 10, deposit: 20, leaseStart: 's', leaseEnd: 'e' } });
    await r.addRental();
    expect(net.last().body).toEqual({ monthlyRent: 0 });
    await r.addRental({ deposit: '' });
    expect(net.last().body).toEqual({ monthlyRent: 0 });
    await r.updateRental('r/1', { address: 'b', status: 'ended', monthlyRent: '', deposit: '7', ignored: 1 });
    expect(net.last()).toMatchObject({ path: '/me/rentals/r%2F1', method: 'PATCH', body: { address: 'b', status: 'ended', monthlyRent: null, deposit: 7 } });
    await r.updateRental('r1');
    expect(net.last().body).toEqual({});
    await r.deleteRental('r/1');
    expect(net.last()).toMatchObject({ path: '/me/rentals/r%2F1', method: 'DELETE' });
  });

  it('transactions', async () => {
    net.reply({ content: [{ id: 'x', amount: 5 }], totalElements: 9, size: 5, number: 2 });
    const page = await r.listTransactions('p/1', 2, 5);
    expect(net.last()).toMatchObject({ path: '/me/finances/p%2F1/transactions', query: { page: '2', size: '5' } });
    expect(page.items[0]).toMatchObject({ id: 'x', amount: 5 });
    expect(page.total).toBe(9);
    net.fresh();
    net.reply({});
    await r.listTransactions('p1');
    expect(net.last().query).toEqual({ page: '0', size: '50' });
    const none = await r.listTransactions('', 3);
    expect(none).toMatchObject({ items: [], page: 3 });
    net.reply({ id: 'x' });
    await r.addTransaction('p1', { type: 'income', category: 'c', amount: '5', date: 'd', note: 'n', recurring: 'monthly' });
    expect(net.last()).toMatchObject({ path: '/me/finances/p1/transactions', method: 'POST', body: { type: 'income', category: 'c', amount: 5, date: 'd', note: 'n', recurring: 'monthly' } });
    await r.addTransaction('p1');
    expect(net.last().body).toEqual({ type: 'expense', amount: 0 });
    await r.deleteTransaction('p/1', 't/1');
    expect(net.last()).toMatchObject({ path: '/me/finances/p%2F1/transactions/t%2F1', method: 'DELETE' });
  });

  it('finance overview, basis, summary', async () => {
    net.reply({ basis: { purchasePrice: 5 }, cashflow: [{ month: 'm', income: 1 }], dues: [{ id: 'd', daysUntil: -1 }] });
    expect(await r.getBasis('p1')).toMatchObject({ purchasePrice: 5 });
    expect(net.last().path).toBe('/me/finances/p1/overview');
    net.fresh();
    net.reply({ cashflow: [{ month: 'm', income: 1 }], dues: [{ id: 'd', daysUntil: -1 }] });
    expect(await r.cashflow('p1')).toEqual([{ month: 'm', income: 1, expense: 0, net: 0 }]);
    net.fresh();
    net.reply({ dues: [{ id: 'd', daysUntil: -1 }] });
    expect((await r.dues('p1'))[0]).toMatchObject({ overdue: true });
    net.fresh();
    net.reply(null);
    expect(await r.getBasis('p1')).toBeNull();
    net.fresh();
    net.reply({});
    expect(await r.cashflow('p1')).toEqual([]);
    net.fresh();
    net.reply({});
    expect(await r.dues('p1')).toEqual([]);
    net.reply({ purchasePrice: 5 });
    await r.setBasis('p/1', { purchasePrice: '5', purchaseDate: 'd', loanOutstanding: 1, emi: 2, currentValue: 3 });
    expect(net.last()).toMatchObject({ path: '/me/finances/p%2F1/basis', method: 'PUT', body: { purchasePrice: 5, purchaseDate: 'd', loanOutstanding: 1, emi: 2, currentValue: 3 } });
    await r.setBasis('p1');
    expect(net.last().body).toEqual({});
    net.reply({ income: 5 });
    expect(await r.financeSummary('p1', 'fy')).toMatchObject({ income: 5 });
    expect(net.last()).toMatchObject({ path: '/me/finances/p1/summary', query: { period: 'fy' } });
    net.fresh();
    await r.financeSummary('p1', 'all');
    expect(net.last().search).toBe('');
    net.fresh();
    await r.financeSummary('p1');
    expect(net.last().search).toBe('');
  });

  it('rent agreements and renewals', async () => {
    net.reply([{ id: 'a', rent: 5 }]);
    expect((await r.myRentAgreements())[0]).toMatchObject({ id: 'a', rent: 5 });
    net.fresh();
    net.reply({});
    expect(await r.myRentAgreements()).toEqual([]);
    net.reply({ rent: '5', deposit: '6', months: '11', startDate: 's', owner: { name: 'O', mobile: 9 }, tenants: [{ name: 'T' }, null], prop: { a: 1 } });
    expect(await r.rentAgreementRenewal('a/1')).toEqual({
      rent: 5, deposit: 6, months: 11, startDate: 's', owner: { name: 'O', mobile: '9' }, tenants: [{ name: 'T', mobile: '' }, { name: '', mobile: '' }], prop: { a: 1 },
    });
    expect(net.last().path).toBe('/me/rent-agreements/a%2F1/renewal');
    net.fresh();
    net.reply({ prop: 'bad', tenants: 'x' });
    expect(await r.rentAgreementHomeRenewal('h/1')).toEqual({ rent: 0, deposit: 0, months: 0, startDate: null, owner: null, tenants: [], prop: {} });
    expect(net.last().path).toBe('/me/rent-agreements/homes/h%2F1/renewal');
  });
});

describe('rentProvider signed out', () => {
  const net = setupFetch();

  it('returns empty results without calling the API', async () => {
    expect(await r.myTenancies()).toEqual([]);
    expect(await r.listTenancyDeclarations('p')).toEqual([]);
    expect(await r.myTenantProfile()).toBeNull();
    expect((await r.tenantsVerified(['9000000000'])).size).toBe(0);
    expect(await r.myRentals()).toEqual([]);
    expect(await r.listTransactions('p')).toMatchObject({ items: [] });
    expect(await r.getBasis('p')).toBeNull();
    expect(await r.financeSummary('p')).toMatchObject({ income: 0 });
    expect(await r.cashflow('p')).toEqual([]);
    expect(await r.dues('p')).toEqual([]);
    expect(await r.myRentAgreements()).toEqual([]);
    expect(net.calls).toHaveLength(0);
  });
});
