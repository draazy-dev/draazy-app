import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const prep = vi.hoisted(() => ({ prepareUpload: vi.fn() }));
vi.mock('../../../../../../src/lib/uploads/prepareUpload.js', () => prep);

import * as C from '../../../../../../src/pages/consumer/services/rent-agreement/constants.js';
import {
  readFileAsDataURL, pickDoc, scrollToSection, fmt, fmtPaise, digits, num, filingKey, detailsChars, DETAILS_MAX_CHARS,
  largestFreeTextField, emptyTenant, emptyProp, emptyOwner, emptyCoOwner, emptyInvite, emptyTerms, emptyTenantPolice,
  fillBlanks, namesOtherFlat, listingAnswers, readSavedKyc, isAadhaar, isPan, isMobile, redactIdentityNumbers,
  hasIdentityNumbers, identityReminderFields, missingIdentityReminderFields, identityParties, rentForTerm,
} from '../../../../../../src/pages/consumer/services/rent-agreement/helpers.js';
import { collectDocs, draftDocRefs, filedDocSlots, removeIndexedDocs } from '../../../../../../src/pages/consumer/services/rent-agreement/documents.js';

beforeEach(() => {
  prep.prepareUpload.mockReset();
  localStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe('constants', () => {
  it('exposes consistent step and rule constants', () => {
    expect(C.STEP_LABELS).toHaveLength(5);
    expect(C.REVIEW_STEP).toBe(4);
    expect(C.MAX_POLICE_OCCUPANTS).toBe(C.MAX_OCCUPANTS);
    expect(C.FURN_PRESETS.every(([name, icon]) => name && icon)).toBe(true);
    [...C.FIXTURES].forEach((f) => expect(C.FURN_PRESETS.map(([n]) => n)).toContain(f));
  });

  it('validates Maharashtra pincodes and payment references', () => {
    expect(C.MH_PINCODE.test('411045')).toBe(true);
    expect(C.MH_PINCODE.test('403001')).toBe(false);
    expect(C.MH_PINCODE.test('500001')).toBe(false);
    expect(C.PAYMENT_REF.test('ABCD1234')).toBe(true);
    expect(C.PAYMENT_REF.test('ab')).toBe(false);
  });
});

describe('readFileAsDataURL and pickDoc', () => {
  it('returns null without a file', async () => {
    expect(await readFileAsDataURL(null)).toBeNull();
  });

  it('reads the prepared file into a data URL', async () => {
    prep.prepareUpload.mockResolvedValue(new File(['hello'], 'prepared.pdf', { type: 'application/pdf' }));
    const d = await readFileAsDataURL(new File(['x'], 'orig.pdf'));
    expect(d).toMatchObject({ fileName: 'prepared.pdf', mime: 'application/pdf', size: 5 });
    expect(d.dataUrl).toMatch(/^data:application\/pdf;base64,/);
    expect(prep.prepareUpload).toHaveBeenCalledWith(expect.any(File), { document: true });
  });

  it('turns preparation failures into a user-facing error', async () => {
    prep.prepareUpload.mockRejectedValue(new Error('boom'));
    const d = await readFileAsDataURL(new File(['x'], 'orig.pdf'));
    expect(d).toEqual({ fileName: 'orig.pdf', error: 'Could not prepare this file.' });
  });

  it('stores a picked doc only if the slot is unchanged', async () => {
    prep.prepareUpload.mockResolvedValue(new File(['a'], 'a.pdf', { type: 'application/pdf' }));
    let docs = {};
    const setDocs = (fn) => { docs = fn(docs); };
    await pickDoc(new File(['a'], 'a.pdf'), undefined, setDocs, 'o-own');
    expect(docs['o-own'].fileName).toBe('a.pdf');
    const moved = { 'o-own': { dataUrl: 'newer' } };
    docs = moved;
    await pickDoc(new File(['a'], 'a.pdf'), undefined, setDocs, 'o-own');
    expect(docs).toBe(moved);
    expect(await pickDoc(null, undefined, setDocs, 'o-own')).toBeNull();
  });

  it('keeps the previous file and records a rejection when the new one fails', async () => {
    prep.prepareUpload.mockRejectedValue(new Error('x'));
    const before = { dataUrl: 'old', fileName: 'old.pdf' };
    let docs = { k: before };
    await pickDoc(new File(['a'], 'bad.pdf'), before, (fn) => { docs = fn(docs); }, 'k');
    expect(docs.k).toMatchObject({ dataUrl: 'old', rejected: { fileName: 'bad.pdf' } });
    let fresh = { k: undefined };
    await pickDoc(new File(['a'], 'bad.pdf'), undefined, (fn) => { fresh = fn(fresh); }, 'k');
    expect(fresh.k.error).toBeTruthy();
  });

  it('treats vault-backed slots as unchanged only when identical', async () => {
    prep.prepareUpload.mockResolvedValue(new File(['a'], 'a.pdf', { type: 'application/pdf' }));
    const before = { vaultDocId: 'v1' };
    let docs = { k: before };
    await pickDoc(new File(['a'], 'a.pdf'), before, (fn) => { docs = fn(docs); }, 'k');
    expect(docs.k.fileName).toBe('a.pdf');
  });
});

describe('formatting helpers', () => {
  it('formats rupees and strips non digits', () => {
    expect(fmt(1234567.4)).toBe('\u20b912,34,567');
    expect(fmt(null)).toBe('\u20b90');
    expect(fmtPaise(1234.5)).toBe('\u20b91,234.50');
    expect(fmtPaise(undefined)).toBe('\u20b90.00');
    expect(digits('a1-2 b3')).toBe('123');
    expect(digits(null)).toBe('');
    expect(num('\u20b9 12,000')).toBe(12000);
    expect(num('abc')).toBe(0);
  });

  it('scrolls an element into view when present', () => {
    const el = document.createElement('div');
    el.id = 'sec';
    el.scrollIntoView = vi.fn();
    document.body.append(el);
    scrollToSection('sec');
    expect(el.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
    expect(() => scrollToSection('missing')).not.toThrow();
    el.remove();
  });

  it('builds a stable filing key regardless of key order', () => {
    expect(filingKey({ b: 1, a: { d: [{ z: 1, y: 2 }], c: 3 } })).toBe(filingKey({ a: { c: 3, d: [{ y: 2, z: 1 }] }, b: 1 }));
    expect(filingKey({ a: 1 })).not.toBe(filingKey({ a: 2 }));
  });

  it('measures serialized details and survives cycles', () => {
    expect(detailsChars({ a: 1 })).toBe(7);
    const cyc = {};
    cyc.self = cyc;
    expect(detailsChars(cyc)).toBe(0);
    expect(DETAILS_MAX_CHARS).toBe(16000);
  });

  it('finds the largest free-text field', () => {
    expect(largestFreeTextField({})).toMatchObject({ len: 0, step: 3 });
    expect(largestFreeTextField({ clauses: 'abc', furnItems: [{ name: 'Sofa' }, { name: 'Bed' }] })).toMatchObject({ len: 7, label: 'services.ra.terms.furniture', step: 3 });
    const big = largestFreeTextField({
      clauses: 'x',
      owner: { addr: { address: 'a'.repeat(50) } },
      coOwners: [{ addr: { address: 'b'.repeat(10) } }],
      tenants: [{ police: { permanent: { address: 'p'.repeat(5) }, occupants: [{ fullName: 'Kid' }] } }],
    });
    expect(big).toMatchObject({ len: 60, label: 'services.ra.party.address', step: 1 });
    const tenant = largestFreeTextField({ tenants: [{ police: { permanent: { address: 'p'.repeat(30) }, previous: { address: 'q' }, workplaceAddress: 'w', occupants: [{ fullName: 'Kid' }] } }] });
    expect(tenant).toMatchObject({ label: 'services.ra.tenant.address', step: 2 });
  });
});

describe('empty row builders', () => {
  it('builds blank parties and terms', () => {
    expect(emptyTenant()).toMatchObject({ name: '', residency: 'resident', police: emptyTenantPolice() });
    expect(emptyTenantPolice()).toMatchObject({ permanentSameAsCurrent: true, addressProofType: 'uid', occupants: [] });
    expect(emptyProp()).toMatchObject({ city: 'Pune', areaUnit: 'sqft', propType: 'Flat / Apartment' });
    expect(emptyCoOwner()).toMatchObject({ capacity: 'co-owner', poaPrincipal: '' });
    expect(emptyInvite()).toEqual({ invMobile: '', invName: '', invMessage: '' });
    expect(emptyTerms()).toMatchObject({ months: '11', parking: 'none', language: 'English', depositPayments: [] });
    expect(emptyTenant()).not.toBe(emptyTenant());
  });

  it('prefills the owner only when signed in', () => {
    expect(emptyOwner(true, { name: 'Asha', mobile: '9000000001' })).toMatchObject({ oName: 'Asha', oMobile: '9000000001', capacity: 'owner' });
    expect(emptyOwner(true, null)).toMatchObject({ oName: '', oMobile: '' });
    expect(emptyOwner(false, { name: 'Asha', mobile: '9' })).toMatchObject({ oName: '', oMobile: '' });
  });

  it('re-exports rentForTerm', () => {
    expect(typeof rentForTerm).toBe('function');
  });
});

describe('fillBlanks and namesOtherFlat', () => {
  it('only fills blank fields with truthy values', () => {
    expect(fillBlanks({ a: 'keep', b: '  ', c: '' }, { a: 'new', b: 'filled', c: '', d: 'added', e: 0 })).toEqual({ a: 'keep', b: 'filled', c: '', d: 'added' });
    expect(fillBlanks(undefined, { a: 'x' })).toEqual({ a: 'x' });
  });

  it('detects a different flat or society', () => {
    expect(namesOtherFlat({ flatNo: '12', society: 'Sky' }, { flatNo: ' 12 ', society: 'SKY' })).toBe(false);
    expect(namesOtherFlat({ flatNo: '12' }, { flatNo: '13' })).toBe(true);
    expect(namesOtherFlat({ society: 'A' }, { society: 'B' })).toBe(true);
    expect(namesOtherFlat({}, { flatNo: '1' })).toBe(false);
    expect(namesOtherFlat(undefined, undefined)).toBe(false);
  });
});

describe('listingAnswers', () => {
  it('maps listing fields into property and terms', () => {
    const a = listingAnswers({
      deal: 'rent',
      form: { flatNumber: '12', tower: 'B', society: 'Sky', societyId: 's1', locality: 'Baner', pincode: '411045', carpetArea: 950, areaUnit: 'sqft', floor: 3, monthlyRent: '25,000', deposit: '1,00,000' },
    });
    expect(a.prop).toEqual({ flatNo: '12, B', society: 'Sky', societyId: 's1', locality: 'Baner', pincode: '411045', area: '950', areaUnit: 'sqft', floor: '3' });
    expect(a.terms).toEqual({ rent: '25000', deposit: '100000' });
  });

  it('falls back to listing-level fields', () => {
    const a = listingAnswers({ deal: 'rent', price: '30000', deposit: '60000', society: 'S', societyId: 'x', locality: 'L', pincode: '1', form: { flatNumber: '5', builtUp: '700', areaUnit: 'sqm', floor: '' } });
    expect(a.prop).toMatchObject({ flatNo: '5', society: 'S', societyId: 'x', area: '700', areaUnit: 'sqm', floor: '' });
    expect(a.terms).toEqual({ rent: '30000', deposit: '60000' });
  });

  it('ignores price for sale listings and unknown area units', () => {
    const a = listingAnswers({ deal: 'buy', price: '9000000', form: { carpetArea: '10', areaUnit: 'acre' } });
    expect(a.prop).toMatchObject({ area: '', areaUnit: '' });
    expect(a.terms.rent).toBe('');
    expect(listingAnswers()).toMatchObject({ prop: { flatNo: '', floor: '' } });
  });
});

describe('readSavedKyc', () => {
  const key = 'draazyOwnerKYC:9000000001';

  it('returns null for missing or malformed data', () => {
    expect(readSavedKyc('9000000001')).toBeNull();
    localStorage.setItem(key, '{bad');
    expect(readSavedKyc('9000000001')).toBeNull();
    localStorage.setItem(key, '"str"');
    expect(readSavedKyc('9000000001')).toBeNull();
  });

  it('strips identity numbers and refreshes the stamp', () => {
    localStorage.setItem(key, JSON.stringify({ name: 'Asha', pan: 'ABCDE1234F', aadhaar: '1', at: 1 }));
    expect(readSavedKyc('+91 9000000001'.replace('+91 ', ''))).toEqual({ name: 'Asha' });
    expect(JSON.parse(localStorage.getItem(key))).toMatchObject({ name: 'Asha' });
    expect(JSON.parse(localStorage.getItem(key)).pan).toBeUndefined();
    expect(JSON.parse(localStorage.getItem(key)).savedAt).toBeGreaterThan(0);
  });

  it('leaves already-clean records untouched', () => {
    const stored = JSON.stringify({ name: 'Asha', savedAt: Date.now() });
    localStorage.setItem(key, stored);
    expect(readSavedKyc('9000000001')).toEqual({ name: 'Asha' });
    expect(localStorage.getItem(key)).toBe(stored);
  });

  it('expires records older than 30 days', () => {
    localStorage.setItem(key, JSON.stringify({ name: 'Asha', savedAt: Date.now() - 31 * 86400000 }));
    expect(readSavedKyc('9000000001')).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });
});

describe('identifier validators', () => {
  it('validates Aadhaar with the Verhoeff checksum', () => {
    const valid = (() => {
      for (let i = 0; i < 10; i++) {
        const candidate = `23456789012${i}`;
        if (isAadhaar(candidate)) return candidate;
      }
      return null;
    })();
    expect(valid).toBe('234567890124');
    expect(isAadhaar('234567890125')).toBe(false);
    expect(isAadhaar(valid.replace(/(\d{4})(?=\d)/g, '$1 '))).toBe(true);
    expect(isAadhaar('123456789012')).toBe(false);
    expect(isAadhaar('abc')).toBe(false);
  });

  it('validates PAN and mobile formats', () => {
    expect(isPan('ABCDE1234F')).toBe(true);
    expect(isPan('abcde1234f')).toBe(true);
    expect(isPan('ABCD12345F')).toBe(false);
    expect(isPan(null)).toBe(false);
    expect(isMobile('+91 90000 00001'.slice(4))).toBe(true);
    expect(isMobile('5000000000')).toBe(false);
    expect(isMobile('900000000')).toBe(false);
  });
});

describe('identity number handling', () => {
  const state = {
    owner: { oName: 'A', oPan: 'ABCDE1234F', oAadhaar: '1' },
    coOwners: [{ name: 'B', pan: 'BBBBB1111B', aadhaar: '2' }, { name: 'C', pan: '' }],
    tenants: [{ name: 'T', pan: 'TTTTT2222T' }],
    other: 'kept',
  };

  it('redacts PAN and Aadhaar everywhere', () => {
    const r = redactIdentityNumbers(state);
    expect(r.owner).toEqual({ oName: 'A', oPan: '' });
    expect(r.coOwners).toEqual([{ name: 'B', pan: '' }, { name: 'C', pan: '' }]);
    expect(r.tenants).toEqual([{ name: 'T', pan: '' }]);
    expect(r.other).toBe('kept');
    expect(redactIdentityNumbers(undefined)).toMatchObject({ owner: { oPan: '' }, coOwners: [], tenants: [] });
    expect(redactIdentityNumbers({ coOwners: 'x' }).coOwners).toEqual([]);
  });

  it('detects remaining identity numbers', () => {
    expect(hasIdentityNumbers(state)).toBe(true);
    expect(hasIdentityNumbers(redactIdentityNumbers(state))).toBe(false);
    expect(hasIdentityNumbers(null)).toBe(false);
    expect(hasIdentityNumbers({ owner: { oAadhaar: '1' } })).toBe(true);
    expect(hasIdentityNumbers({ tenants: [{ aadhaar: '1' }] })).toBe(true);
    expect(hasIdentityNumbers({ coOwners: 5, tenants: 'x' })).toBe(false);
  });

  it('lists reminder fields for filled PANs and reports missing ones', () => {
    const fields = identityReminderFields(state);
    expect(fields).toEqual([
      { role: 'licensor', index: 0, field: 'pan', step: 'owner' },
      { role: 'licensor', index: 1, field: 'pan', step: 'owner' },
      { role: 'tenant', index: 0, field: 'pan', step: 'tenant' },
    ]);
    expect(identityReminderFields(null)).toEqual([]);
    expect(identityReminderFields({ coOwners: 'x', tenants: 'y' })).toEqual([]);
    expect(missingIdentityReminderFields(fields, state)).toEqual([]);
    expect(missingIdentityReminderFields(fields, redactIdentityNumbers(state))).toEqual(fields);
    expect(missingIdentityReminderFields(null, state)).toEqual([]);
    expect(missingIdentityReminderFields(fields, { owner: { oPan: 'x' }, coOwners: 'bad', tenants: 'bad' })).toHaveLength(2);
  });

  it('lists parties with PANs for the server', () => {
    expect(identityParties({
      owner: { oName: ' Asha ', oPan: ' abcde1234f ' },
      coOwners: [{ name: 'B', pan: '' }, { name: 'C', pan: 'ccccc3333c' }],
      tenants: [{ name: 'T'.repeat(200), pan: 'TTTTT2222T' }],
    })).toEqual([
      { partyRole: 'owner', partyIndex: 0, partyName: 'Asha', pan: 'ABCDE1234F' },
      { partyRole: 'owner', partyIndex: 2, partyName: 'C', pan: 'CCCCC3333C' },
      { partyRole: 'tenant', partyIndex: 0, partyName: 'T'.repeat(120), pan: 'TTTTT2222T' },
    ]);
    expect(identityParties()).toEqual([]);
    expect(identityParties({ coOwners: 'x', tenants: null })).toEqual([]);
  });
});

describe('documents', () => {
  const ready = (name) => ({ fileName: name, dataUrl: `data:${name}`, mime: 'application/pdf' });

  it('collects ready owner and tenant docs for a self-serve agreement', () => {
    const out = collectDocs({
      mode: 'self',
      ownerMode: 'self',
      tenantMode: 'self',
      owner: { residency: 'nri', capacity: 'poa' },
      coOwners: [{ residency: 'resident', capacity: 'poa' }],
      tenants: [{ occupation: 'engineer', police: { addressProofType: 'passport' } }],
      ownerDocs: { 'o-passport': ready('p'), 'o-own': ready('own'), 'o-poa': { error: 'x' }, 'c0-poa': ready('cpoa') },
      tenantDocs: { 't0-5': ready('addr'), 't0-7': ready('work') },
    });
    expect(out.map((d) => [d.key, d.category])).toEqual([
      ['o-passport', 'licensor-0-passport'],
      ['o-own', 'ownership-proof'],
      ['c0-poa', 'licensor-1-poa'],
      ['t0-5', 'tenant-0-addressproof'],
      ['t0-7', 'tenant-0-workidproof'],
    ]);
    expect(out[1].file).toEqual({ fileName: 'own', dataUrl: 'data:own', vaultDocId: undefined, filedOn: undefined, mime: 'application/pdf', category: 'ownership-proof' });
  });

  it('respects invite roles', () => {
    const base = { owner: {}, tenants: [{ police: {} }], ownerDocs: { 'o-own': ready('own') }, tenantDocs: { 't0-7': ready('w') } };
    expect(collectDocs({ ...base, mode: 'invite', inviteRole: 'owner' }).map((d) => d.key)).toEqual(['o-own']);
    expect(collectDocs({ ...base, mode: 'invite', inviteRole: 'tenant' }).map((d) => d.key)).toEqual(['t0-7']);
    expect(collectDocs({ ...base, mode: 'self', ownerMode: 'invite', tenantMode: 'invite' })).toEqual([]);
  });

  it('serializes uploaded docs into draft references', () => {
    expect(draftDocRefs({
      a: { fileName: 'a.pdf', dataUrl: 'x' },
      b: { fileName: 'b.pdf', mime: 'application/pdf', vaultDocId: 7 },
      c: { fileName: 'c.pdf', error: 'bad' },
      d: { dataUrl: 'no-name' },
    })).toEqual({
      a: { fileName: 'a.pdf', reattach: true },
      b: { fileName: 'b.pdf', mime: 'application/pdf', vaultDocId: '7', fromVault: true },
    });
    expect(draftDocRefs(null)).toEqual({});
    expect(draftDocRefs('x')).toEqual({});
  });

  it('maps filed documents back to slots', () => {
    const filed = filedDocSlots({
      id: 'REQ1',
      docs: [
        { category: 'ownership-proof', fileName: 'own.pdf' },
        { category: 'Licensor-0-Passport', fileName: 'pass.pdf' },
        { category: 'licensor-2-poa', fileName: 'poa.pdf' },
        { category: 'tenant-1-addressproof', fileName: 'addr.pdf' },
        { category: 'tenant-1-unknown', fileName: 'x' },
        { category: 'ownership-proof', fileName: 'dup.pdf' },
        { category: 'nonsense', fileName: 'y' },
        {},
      ],
    });
    expect(filed.owner).toEqual({
      'o-own': { fileName: 'own.pdf', filedOn: 'REQ1' },
      'o-passport': { fileName: 'pass.pdf', filedOn: 'REQ1' },
      'c1-poa': { fileName: 'poa.pdf', filedOn: 'REQ1' },
    });
    expect(filed.tenant).toEqual({ 't1-5': { fileName: 'addr.pdf', filedOn: 'REQ1' } });
    expect(filedDocSlots(undefined)).toEqual({ owner: {}, tenant: {} });
  });

  it('re-indexes docs when a row is removed', () => {
    const docs = { 'c0-poa': 1, 'c1-poa': 2, 'c2-passport': 3, 'o-own': 4, 'c1-x-y': 5 };
    expect(removeIndexedDocs(docs, 'c', 1)).toEqual({ 'c0-poa': 1, 'c1-passport': 3, 'o-own': 4 });
    expect(removeIndexedDocs({ 't0-1': 'a', 't1-1': 'b' }, 't', 0)).toEqual({ 't0-1': 'b' });
  });
});
