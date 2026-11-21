import { describe, it, expect } from 'vitest';
import {
  todayIst, ageFromDob, startDateBounds, visitDateBounds, docReady, residencyOf, isOfflineParty, isForeignParty, partyDocSlugs,
  tenantDocKey, workProofRequired, addressProofUploadRequired, previousAddressProofUploadRequired, ownerDocSlots, coOwnerDocSlots,
  tenantDocSlots, dupMessageKey, stepErrors,
} from '../../../../../../src/pages/consumer/services/rent-agreement/validation.js';

const NOW = new Date('2026-11-20T06:00:00Z');
const TODAY = '2026-11-20';

const addr = () => ({ pincode: '411045', village: 'Baner', address: '12 Main Road' });
const prop = (extra = {}) => ({
  propType: 'Flat / Apartment', flatNo: '12', society: 'Sky', gramPanchayat: false, locality: 'Baner', city: 'Pune', taluka: 'Haveli',
  pincode: '411045', area: '900', floor: '3', landmark: 'Near mall', policeStation: 'Baner PS', roadVicinity: 'Baner Road', roadType: 'Main', ...extra,
});
const owner = (extra = {}) => ({
  oName: 'Asha Rao', type: 'individual', residency: 'resident', gender: 'female', oDob: '1980-01-01', oPan: 'ABCDE1234F',
  oMobile: '9000000001', addr: addr(), capacity: 'owner', ...extra,
});
const tenant = (extra = {}) => ({
  name: 'Ravi Kumar', type: 'individual', residency: 'resident', gender: 'male', dob: '1990-05-05', pan: 'FGHIJ5678K', mobile: '9000000002',
  occupation: 'student', police: { addressProofType: 'uid', permanentSameAsCurrent: true, previousSameAsPermanent: true, occupants: [] }, ...extra,
});
const terms = (extra = {}) => ({
  startDate: TODAY, months: '11', rent: '20000', deposit: '60000', lockin: '6', increment: '5', parkingArea: '', parkingAreaUnit: 'sqft',
  depositPayments: [{ mode: 'upi', ref: 'ABCD1234', amount: '60000', date: TODAY }], ...extra,
});
const form = (extra = {}) => ({
  mode: 'self', ownerMode: 'self', tenantMode: 'self', prop: prop(), owner: owner(), coOwners: [], tenants: [tenant()], terms: terms(),
  ownerDocs: { 'o-own': { dataUrl: 'd' } }, tenantDocs: {}, selfMobile: '9000000001', ...extra,
});

describe('date helpers', () => {
  it('formats IST dates and bounds', () => {
    expect(todayIst(new Date('2026-11-20T20:00:00Z'))).toBe('2026-11-21');
    expect(startDateBounds(NOW)).toEqual({ min: '2026-07-23', max: '2027-05-19', today: TODAY });
    expect(visitDateBounds(NOW)).toEqual({ min: '2026-11-21', max: '2027-02-18' });
  });

  it('computes age from a valid date of birth', () => {
    expect(ageFromDob('1990-05-05', '2026-05-04')).toBe('35');
    expect(ageFromDob('1990-05-05', '2026-05-05')).toBe('36');
    expect(ageFromDob('2027-01-01', '2026-01-01')).toBe('');
    expect(ageFromDob('1990-02-31', '2026-01-01')).toBe('');
    expect(ageFromDob('bad', '2026-01-01')).toBe('');
    expect(ageFromDob('1990-01-01', 'bad')).toBe('');
    expect(ageFromDob(undefined, '2026-01-01')).toBe('');
    expect(ageFromDob('1990-01-01')).toMatch(/^\d+$/);
  });
});

describe('party helpers', () => {
  it('classifies residency and document slots', () => {
    expect(docReady({ dataUrl: 'x' })).toBe(true);
    expect(docReady({ vaultDocId: 1 })).toBe(true);
    expect(docReady({ filedOn: 'R' })).toBe(true);
    expect(docReady({})).toBe(false);
    expect(docReady(null)).toBe(false);
    expect(residencyOf({ residency: 'nri' })).toBe('nri');
    expect(residencyOf({ residency: 'alien' })).toBe('resident');
    expect(residencyOf(null)).toBe('resident');
    expect(isOfflineParty({ residency: 'foreign' })).toBe(true);
    expect(isOfflineParty({})).toBe(false);
    expect(isForeignParty({ residency: 'foreign' })).toBe(true);
    expect(partyDocSlugs({ residency: 'resident' })).toEqual([]);
    expect(partyDocSlugs({ residency: 'nri' })).toEqual(['passport']);
    expect(partyDocSlugs({ residency: 'foreign' })).toEqual(['passport', 'visa']);
    expect(tenantDocKey(2, 'visa')).toBe('t2-4');
  });

  it('decides which proofs are required', () => {
    expect(workProofRequired('Software engineer')).toBe(true);
    expect(workProofRequired('Student')).toBe(false);
    expect(workProofRequired('Home maker')).toBe(false);
    expect(workProofRequired('retired')).toBe(false);
    expect(workProofRequired(undefined)).toBe(true);
    expect(addressProofUploadRequired({ police: { addressProofType: 'passport' } })).toBe(true);
    expect(addressProofUploadRequired({ police: { addressProofType: 'uid' } })).toBe(false);
    expect(addressProofUploadRequired({ police: {} })).toBe(true);
    expect(addressProofUploadRequired({})).toBe(false);
    expect(previousAddressProofUploadRequired({ police: { previousSameAsPermanent: false, previousAddressProofType: 'passport' } })).toBe(true);
    expect(previousAddressProofUploadRequired({ police: { previousSameAsPermanent: false, previousAddressProofType: 'uid' } })).toBe(false);
    expect(previousAddressProofUploadRequired({ police: { previousSameAsPermanent: true } })).toBe(false);
  });

  it('lists owner, co-owner and tenant document slots', () => {
    expect(ownerDocSlots(owner())).toEqual(['o-own']);
    expect(ownerDocSlots(owner({ residency: 'foreign', capacity: 'poa' }))).toEqual(['o-passport', 'o-visa', 'o-own', 'o-poa']);
    expect(coOwnerDocSlots({ residency: 'nri', capacity: 'poa' }, 1)).toEqual(['c1-passport', 'c1-poa']);
    expect(coOwnerDocSlots(undefined, 0)).toEqual([]);
    const slots = tenantDocSlots(tenant({ occupation: 'Engineer', residency: 'foreign', police: { addressProofType: 'passport', previousSameAsPermanent: false, previousAddressProofType: 'passport' } }), 0);
    expect(slots.map((s) => [s.slug, s.required])).toEqual([
      ['passport', true], ['visa', true], ['addressproof', true], ['prevaddressproof', true], ['workidproof', true],
    ]);
    expect(tenantDocSlots(tenant(), 1).filter((s) => s.required)).toEqual([]);
  });

  it('maps duplicate keys to message keys', () => {
    expect(dupMessageKey('oMobile')).toBe('services.ra.err.dupMobile');
    expect(dupMessageKey('t0mobile')).toBe('services.ra.err.dupMobile');
    expect(dupMessageKey('oPan')).toBe('services.ra.err.dupPan');
  });
});

describe('stepErrors: property step', () => {
  it('accepts a complete property', () => {
    expect(stepErrors(0, form(), NOW)).toEqual({});
  });

  it('flags missing and malformed fields', () => {
    const e = stepErrors(0, form({ prop: prop({ flatNo: '', locality: '', society: '', gramPanchayat: null, taluka: 'Mars', pincode: '12', propType: 'Shop', area: '0', floor: '999', landmark: '', roadType: 'x'.repeat(81) }) }), NOW);
    expect(e).toEqual({
      flatNo: 'required', locality: 'required', society: 'required', gramPanchayat: 'required', taluka: 'format', pincode: 'format',
      propType: 'commercial', area: 'required', floor: 'range', landmark: 'required', roadType: 'range',
    });
  });

  it('distinguishes non-Maharashtra pincodes and long flat numbers', () => {
    expect(stepErrors(0, form({ prop: prop({ pincode: '500001', flatNo: 'x'.repeat(41), taluka: '' }) }), NOW)).toMatchObject({ pincode: 'state', flatNo: 'range', taluka: 'required' });
    expect(stepErrors(0, form({ prop: prop({ area: '12.345' }) }), NOW).area).toBe('required');
    expect(stepErrors(0, form({ prop: prop({ area: '100001' }) }), NOW).area).toBe('required');
  });

  it('skips steps that belong to the other invitee', () => {
    expect(stepErrors(0, form({ mode: 'invite', inviteRole: 'owner', prop: prop({ flatNo: '' }) }), NOW)).toEqual({});
    expect(stepErrors(2, form({ mode: 'invite', inviteRole: 'owner', tenants: [tenant({ mobile: '1' })] }), NOW)).toEqual({});
    expect(stepErrors(1, form({ mode: 'invite', inviteRole: 'owner', owner: owner({ oName: '' }) }), NOW)).toMatchObject({ oName: 'required' });
    expect(stepErrors(2, form({ mode: 'invite', inviteRole: 'tenant', tenants: [tenant({ mobile: '1' })] }), NOW)).toMatchObject({ t0mobile: 'format' });
  });

  it('returns no errors for unknown steps', () => {
    expect(stepErrors(9, form(), NOW)).toEqual({});
  });
});

describe('stepErrors: licensor step', () => {
  it('accepts a complete owner', () => {
    expect(stepErrors(1, form(), NOW)).toEqual({});
  });

  it('validates the owner basics', () => {
    const e = stepErrors(1, form({ owner: owner({ oName: '', type: 'entity', residency: 'alien', gender: '', oDob: '', oPan: 'x', oMobile: '1', addr: { pincode: '1', village: '', address: '' } }) }), NOW);
    expect(e).toMatchObject({ oName: 'required', type: 'entity', residency: 'format', gender: 'required', oDob: 'required', oPan: 'format', oMobile: 'format', addrPincode: 'format', addrVillage: 'required', addrAddress: 'required' });
  });

  it('checks names, dob range and unsupported party types', () => {
    expect(stepErrors(1, form({ owner: owner({ oName: '1234', oDob: '2020-01-01', type: 'trust' }) }), NOW)).toMatchObject({ oName: 'format', oDob: 'range', type: 'format' });
    expect(stepErrors(1, form({ owner: owner({ oDob: '1850-01-01' }) }), NOW).oDob).toBe('range');
  });

  it('requires passport and visa details for non-resident owners', () => {
    const e = stepErrors(1, form({ owner: owner({ residency: 'foreign', passport: 'x', visaOci: '' }), ownerDocs: {} }), NOW);
    expect(e).toMatchObject({ passport: 'format', visaOci: 'required', 'doc-o-passport': 'required', 'doc-o-visa': 'required', 'doc-o-own': 'required' });
    expect(stepErrors(1, form({ owner: owner({ residency: 'nri', passport: 'P1234567' }), ownerDocs: { 'o-own': { dataUrl: 'd' }, 'o-passport': { dataUrl: 'd' } } }), NOW)).toEqual({});
  });

  it('accepts PAN on file when blank and held', () => {
    expect(stepErrors(1, form({ owner: owner({ oPan: '' }), held: { 'owner-0': { pan: true } } }), NOW)).toEqual({});
    expect(stepErrors(1, form({ owner: owner({ oPan: '' }) }), NOW).oPan).toBe('format');
  });

  it('requires the signed-in user to be one of the licensors', () => {
    expect(stepErrors(1, form({ selfMobile: '9111111111' }), NOW).oMobile).toBe('notOwner');
    expect(stepErrors(1, form({ selfMobile: '9111111111', listed: true }), NOW)).toEqual({});
    expect(stepErrors(1, form({ selfMobile: '9111111111', coOwners: [{ ...tenant(), mobile: '9111111111', capacity: 'co-owner', addr: addr() }], owner: owner({ capacity: 'co-owner' }) }), NOW).oMobile).toBeUndefined();
  });

  it('checks capacity against the number of licensors', () => {
    expect(stepErrors(1, form({ owner: owner({ capacity: 'co-owner' }) }), NOW).capacity).toBe('mismatch');
    const co = { name: 'Meera Rao', pan: 'ZZZZZ9999Z', mobile: '9000000003', dob: '1985-01-01', gender: 'female', addr: addr(), capacity: 'co-owner' };
    expect(stepErrors(1, form({ coOwners: [co] }), NOW).capacity).toBe('mismatch');
    expect(stepErrors(1, form({ coOwners: [co], owner: owner({ capacity: 'co-owner' }) }), NOW)).toEqual({});
  });

  it('validates power of attorney details', () => {
    const e = stepErrors(1, form({ owner: owner({ capacity: 'poa', poaPrincipal: '', poaRegNo: '', poaSro: '', poaDate: '' }) }), NOW);
    expect(e).toMatchObject({ poaPrincipal: 'required', poaRegNo: 'required', poaSro: 'required', poaDate: 'required', 'doc-o-poa': 'required' });
    expect(stepErrors(1, form({ owner: owner({ capacity: 'poa', poaPrincipal: 'Raj', poaRegNo: '1', poaSro: 'Haveli', poaDate: '2027-01-01' }), ownerDocs: { 'o-own': { dataUrl: 'd' }, 'o-poa': { dataUrl: 'd' } } }), NOW).poaDate).toBe('range');
  });

  it('validates co-owners and flags duplicates', () => {
    const co = { name: '', pan: 'ABCDE1234F', mobile: '9000000001', dob: '', gender: '', addr: {}, capacity: 'poa', residency: 'nri', passport: '' };
    const e = stepErrors(1, form({ owner: owner({ capacity: 'co-owner' }), coOwners: [co] }), NOW);
    expect(e).toMatchObject({ c0name: 'required', c0gender: 'required', c0dob: 'required', c0passport: 'format', c0pan: 'dup', c0mobile: 'dup', c0addrPincode: 'format', 'doc-c0-poa': 'required', 'doc-c0-passport': 'required' });
  });

  it('only validates the invited mobile when inviting the owner', () => {
    expect(stepErrors(1, form({ ownerMode: 'invite', invite: { invMobile: '9000000009' } }), NOW)).toEqual({});
    expect(stepErrors(1, form({ ownerMode: 'invite', invite: { invMobile: '1' } }), NOW)).toEqual({ invMobile: 'format' });
    expect(stepErrors(1, form({ ownerMode: 'invite' }), NOW)).toEqual({ invMobile: 'format' });
  });
});

describe('stepErrors: tenant step', () => {
  it('accepts a complete tenant', () => {
    expect(stepErrors(2, form(), NOW)).toEqual({});
  });

  it('validates the police record', () => {
    const t = tenant({
      occupation: 'Engineer',
      police: {
        addressProofType: '', permanentSameAsCurrent: false, permanent: {}, previousSameAsPermanent: false, previous: {}, previousAddressProofType: '',
        workplaceAddress: '', workIdProofType: '',
        occupants: [{ type: '', relation: '', fullName: '', age: '200', mobile: '1' }],
      },
    });
    const e = stepErrors(2, form({ tenants: [t] }), NOW);
    expect(e).toMatchObject({
      t0policeAddressProofType: 'required',
      t0policePermanentAddress: 'required', t0policePermanentPincode: 'format', t0policePermanentVillage: 'required', t0policePermanentPoliceStation: 'required',
      t0policePreviousAddress: 'required', t0policePreviousAddressProofType: 'required',
      t0policeWorkplaceAddress: 'required', t0policeWorkIdProofType: 'required',
      t0policeOcc0type: 'required', t0policeOcc0relation: 'required', t0policeOcc0fullName: 'required', t0policeOcc0age: 'range', t0policeOcc0mobile: 'format',
      'doc-t0-7': 'required',
    });
  });

  it('caps police occupants', () => {
    const occupants = Array.from({ length: 21 }, () => ({ type: 'family', relation: 'son', fullName: 'Kid', age: '5', mobile: '9000000050' }));
    const t = tenant();
    t.police.occupants = occupants;
    expect(stepErrors(2, form({ tenants: [t] }), NOW).t0policeOccupants).toBe('range');
  });

  it('only validates mobiles when inviting the tenant', () => {
    expect(stepErrors(2, form({ tenantMode: 'invite', tenants: [{ mobile: '9000000002' }] }), NOW)).toEqual({});
    expect(stepErrors(2, form({ tenantMode: 'invite', tenants: [{ mobile: '1' }, { mobile: '9000000001' }] }), NOW)).toEqual({ t0mobile: 'format', t1mobile: 'dup' });
  });

  it('flags tenants that share a mobile or PAN with a licensor or each other', () => {
    const e = stepErrors(2, form({ tenants: [tenant({ mobile: '9000000001' }), tenant({ pan: 'FGHIJ5678K', mobile: '9000000002' }), tenant({ pan: 'fghij5678k', mobile: '9000000002' })] }), NOW);
    expect(e).toMatchObject({ t0mobile: 'dup', t2mobile: 'dup', t2pan: 'dup' });
  });

  it('reports entity tenants and bad residency', () => {
    expect(stepErrors(2, form({ tenants: [tenant({ type: 'entity', residency: 'alien' })] }), NOW)).toMatchObject({ t0type: 'entity', t0residency: 'format' });
    expect(stepErrors(2, form({ tenants: [tenant({ type: 'trust' })] }), NOW).t0type).toBe('format');
  });
});

describe('stepErrors: terms step', () => {
  it('accepts valid terms', () => {
    expect(stepErrors(3, form(), NOW)).toEqual({});
  });

  it('validates required values and ranges', () => {
    const e = stepErrors(3, form({ terms: terms({ startDate: '', rent: '', deposit: '', months: '0', lockin: 'x', increment: '101', parkingArea: '0', parkingAreaUnit: 'acre', depositPayments: [] }) }), NOW);
    expect(e).toMatchObject({ startDate: 'required', rent: 'required', deposit: 'required', months: 'range', lockin: 'range', increment: 'range', parkingArea: 'range' });
    expect(stepErrors(3, form({ terms: terms({ startDate: '2020-01-01' }) }), NOW).startDate).toBe('range');
    expect(stepErrors(3, form({ terms: terms({ startDate: '2030-01-01' }) }), NOW).startDate).toBe('range');
  });

  it('limits lock-in to the agreement length', () => {
    expect(stepErrors(3, form({ terms: terms({ months: '11', lockin: '12' }) }), NOW).lockin).toBe('range');
    expect(stepErrors(3, form({ terms: terms({ months: '11', lockin: '' }) }), NOW)).toEqual({});
    expect(stepErrors(3, form({ terms: terms({ months: '61' }) }), NOW).months).toBe('range');
  });

  it('checks the optional visit date window', () => {
    expect(stepErrors(3, form({ terms: terms({ visitDate: '2000-01-01' }) }), NOW).visitDate).toBe('range');
  });

  it('validates the deposit payment trail', () => {
    expect(stepErrors(3, form({ terms: terms({ depositPayments: [] }) }), NOW).depositPayments).toBe('none');
    expect(stepErrors(3, form({ terms: terms({ deposit: '', depositPayments: undefined }) }), NOW)).toMatchObject({ deposit: 'required' });
    expect(stepErrors(3, form({ terms: terms({ depositPayments: [{ mode: 'upi', ref: 'ABCD1234', amount: '1000', date: TODAY }] }) }), NOW).depositPayments).toBe('total');
    const bad = stepErrors(3, form({ terms: terms({ depositPayments: [{ mode: 'upi', ref: 'x', amount: '', date: '2030-01-01' }, { mode: 'cheque' }, { mode: 'netbanking', bank: 'HDFC Bank', ref: 'ABCD1234', amount: 'abc', date: TODAY }] }) }), NOW);
    expect(bad).toMatchObject({ dp0ref: 'format', dp0amount: 'required', dp0date: 'range', dp1mode: 'required', dp2amount: 'required' });
    expect(bad).not.toHaveProperty('dp2branch');
  });

  it('allows an agreement with no deposit and no payments', () => {
    expect(stepErrors(3, form({ terms: terms({ deposit: '0', depositPayments: [] }) }), NOW)).toEqual({});
  });
});
