import { AREA_UNITS } from './constants.js';

export const readFileAsDataURL = async (file) => {
  if (!file) return null;
  try {
    const { prepareUpload } = await import('../../../../lib/uploads/prepareUpload.js');
    const prepared = await prepareUpload(file, { document: true });
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read the file. Please try again.'));
      reader.readAsDataURL(prepared);
    });
    return { fileName: prepared.name, dataUrl, mime: prepared.type, size: prepared.size };
  } catch (e) {
    return { fileName: file.name, error: e?.message || 'Could not prepare this file.' };
  }
};

export const pickDoc = async (file, before, setDocs, key) => {
  const d = await readFileAsDataURL(file);
  if (!d) return null;
  const held = (x) => x?.dataUrl || (x?.vaultDocId ? null : x?.fileName) || null;
  setDocs((s) => (held(s[key]) !== held(before) ? s : { ...s, [key]: d.error && (before?.dataUrl || before?.vaultDocId) ? { ...before, rejected: d } : d }));
  return d;
};

export const fmt = (n) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
export const fmtPaise = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const digits = (s) => String(s || '').replace(/\D/g, '');
export const num = (s) => parseInt(digits(s), 10) || 0;

const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
export const filingKey = (filing) => JSON.stringify(sortKeys(filing));

export const DETAILS_MAX_CHARS = 16000;

export const detailsChars = (details) => {
  try {
    return JSON.stringify(details).length;
  } catch {
    return 0;
  }
};

const FREE_TEXT_FIELDS = [
  { get: (s) => s.clauses, label: 'services.ra.terms.specialClauses', step: 3 },
  { get: (s) => (s.tenants || []).map((t) => [t.police?.permanent?.address, t.police?.previous?.address, t.police?.workplaceAddress, ...(t.police?.occupants || []).map((o) => o.fullName)].join('')).join(''), label: 'services.ra.tenant.address', step: 2 },
  { get: (s) => (s.furnItems || []).map((f) => f.name).join(''), label: 'services.ra.terms.furniture', step: 3 },
];

export const largestFreeTextField = (state) => {
  let worst = null;
  FREE_TEXT_FIELDS.forEach((f) => {
    const len = String(f.get(state) || '').length;
    if (!worst || len > worst.len) worst = { len, label: f.label, step: f.step };
  });
  return worst && worst.len > 0 ? worst : { len: 0, label: FREE_TEXT_FIELDS[0].label, step: FREE_TEXT_FIELDS[0].step };
};

const POA_BLANK = { poaPrincipal: '', poaRegNo: '', poaDate: '', poaSro: '' };
const PARTY_BLANK = { type: 'individual', residency: 'resident', dob: '', passport: '', visaOci: '', frro: '' };
export const emptyTenantPolice = () => ({ permanentSameAsCurrent: true, permanent: { address: '', pincode: '', village: '', policeStation: '' }, addressProofType: 'uid', previousSameAsPermanent: true, previous: { address: '', pincode: '', village: '', policeStation: '' }, previousAddressProofType: 'uid', workplaceAddress: '', workIdProofType: '', occupants: [] });
export const emptyTenant = () => ({ name: '', age: '', occupation: '', pan: '', mobile: '', police: emptyTenantPolice(), ...PARTY_BLANK });
export const emptyProp = () => ({ propType: 'Flat / Apartment', flatNo: '', society: '', societyId: '', societyNotOnMaps: false, locality: '', gramPanchayat: null, city: 'Pune', taluka: '', landmark: '', policeStation: '', roadVicinity: '', roadType: '', pincode: '', area: '', areaUnit: 'sqft', floor: '' });
export const emptyOwner = (isIn, user) => ({ oName: isIn ? user?.name || '' : '', oDob: '', oAge: '', oPan: '', oMobile: isIn ? user?.mobile || '' : '', capacity: 'owner', type: 'individual', residency: 'resident', passport: '', visaOci: '', frro: '', ...POA_BLANK });
export const emptyCoOwner = () => ({ name: '', age: '', pan: '', mobile: '', capacity: 'co-owner', ...PARTY_BLANK, ...POA_BLANK });
export const emptyInvite = () => ({ invMobile: '', invName: '', invMessage: '' });
export const emptyTerms = () => ({ startDate: '', months: '11', rent: '', deposit: '', nrDeposit: '', increment: '5', incrementEvery: '11', lockin: '6', costBy: 'Split', parking: 'none', parkingArea: '', parkingAreaUnit: 'sqft', language: 'English', visitAt: 'property', visitDate: '', visitSlot: 'any', depositPayments: [] });

export { rentForTerm } from '../../../../lib/toolCalc.js';
export const emptyWit = () => ({ w1Name: '', w1Age: '', w1Mobile: '', w2Name: '', w2Age: '', w2Mobile: '' });

export const fillBlanks = (cur, add) => ({
  ...cur,
  ...Object.fromEntries(Object.entries(add).filter(([k, v]) => v && !String(cur?.[k] ?? '').trim())),
});

const norm = (v) => String(v ?? '').trim().toLowerCase();
export const namesOtherFlat = (cur, add) =>
  ['flatNo', 'society'].some((k) => norm(cur?.[k]) && norm(add?.[k]) && norm(cur[k]) !== norm(add[k]));

export const listingAnswers = (l = {}) => {
  const f = l.form || {};
  const unit = f.areaUnit || 'sqft';
  const area = AREA_UNITS.includes(unit) ? String(f.carpetArea || f.builtUp || '') : '';
  return {
    prop: {
      flatNo: f.flatNumber && f.tower ? `${f.flatNumber}, ${f.tower}` : f.flatNumber || '',
      society: f.society || l.society || '',
      societyId: f.societyId || l.societyId || '',
      locality: f.locality || l.locality || '',
      pincode: f.pincode || l.pincode || '',
      area,
      areaUnit: area ? unit : '',
      floor: f.floor === '' || f.floor == null ? '' : String(f.floor),
    },
    terms: { rent: digits(f.monthlyRent || (l.deal === 'rent' ? l.price : '')), deposit: digits(f.deposit || l.deposit) },
  };
};

const OWNER_KYC_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export const readSavedKyc = (mobile) => {
  const key = 'draazyOwnerKYC:' + digits(mobile);
  let kyc;
  try { kyc = JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
  if (!kyc || typeof kyc !== 'object') return null;
  const savedAt = Number(kyc.savedAt);
  if (savedAt && Date.now() - savedAt > OWNER_KYC_MAX_AGE_MS) {
    try { localStorage.removeItem(key); } catch {}
    return null;
  }
  const { pan: _pan, aadhaar: _aadhaar, at: _at, savedAt: _savedAt, ...clean } = kyc;
  if (savedAt && !('pan' in kyc) && !('aadhaar' in kyc) && !('at' in kyc)) return clean;
  try { localStorage.setItem(key, JSON.stringify({ ...clean, savedAt: Date.now() })); } catch {}
  return clean;
};

const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

export const isAadhaar = (s) => {
  const d = digits(s);
  if (!/^[2-9]\d{11}$/.test(d)) return false;
  let c = 0;
  d.split('').reverse().forEach((ch, i) => { c = VERHOEFF_D[c][VERHOEFF_P[i % 8][Number(ch)]]; });
  return c === 0;
};
export const isPan = (s) => /^[A-Za-z]{5}\d{4}[A-Za-z]$/.test(String(s || ''));
export const isMobile = (s) => /^[6-9]\d{9}$/.test(digits(s));

const blankIds = (rows) => (Array.isArray(rows) ? rows : []).map(({ aadhaar: _aadhaar, ...r }) => ({ ...r, pan: '' }));
const WITNESS_AADHAAR = /^w\d+Aadhaar$/;

export const redactIdentityNumbers = (state) => {
  const { oAadhaar: _oAadhaar, ...owner } = state?.owner || {};
  return {
    ...state,
    owner: { ...owner, oPan: '' },
    coOwners: blankIds(state?.coOwners),
    tenants: blankIds(state?.tenants),
    ...(state?.wit ? { wit: Object.fromEntries(Object.entries(state.wit).filter(([k]) => !WITNESS_AADHAAR.test(k))) } : {}),
  };
};

export const hasIdentityNumbers = (state) => {
  if (!state || typeof state !== 'object') return false;
  if (state.owner?.oPan || state.owner?.oAadhaar) return true;
  if (Object.entries(state.wit || {}).some(([k, v]) => WITNESS_AADHAAR.test(k) && v)) return true;
  return [...(Array.isArray(state.coOwners) ? state.coOwners : []), ...(Array.isArray(state.tenants) ? state.tenants : [])]
    .some((r) => r?.pan || r?.aadhaar);
};

const marker = (role, index, field, step, value) => (value ? { role, index, field, step } : null);

export const identityReminderFields = (state) => {
  if (!state || typeof state !== 'object') return [];
  return [
    marker('licensor', 0, 'pan', 'owner', state.owner?.oPan),
    ...(Array.isArray(state.coOwners) ? state.coOwners : []).map((c, i) => marker('licensor', i + 1, 'pan', 'owner', c?.pan)),
    ...(Array.isArray(state.tenants) ? state.tenants : []).map((t, i) => marker('tenant', i, 'pan', 'tenant', t?.pan)),
  ].filter(Boolean);
};

const identityValue = (state, field) => {
  if (field.role === 'licensor' && field.index === 0) return state.owner?.oPan;
  if (field.role === 'licensor') return (Array.isArray(state.coOwners) ? state.coOwners : [])[field.index - 1]?.pan;
  return (Array.isArray(state.tenants) ? state.tenants : [])[field.index]?.pan;
};

export const missingIdentityReminderFields = (fields, state) => (Array.isArray(fields) ? fields : [])
  .filter((field) => !String(identityValue(state, field) || '').trim());

export const identityParties = ({ owner, coOwners, tenants } = {}) => {
  const party = (partyRole, partyIndex, name, rawPan) => {
    const pan = String(rawPan || '').trim().toUpperCase();
    if (!pan) return null;
    return { partyRole, partyIndex, partyName: String(name || '').trim().slice(0, 120), pan };
  };
  return [
    owner && party('owner', 0, owner.oName, owner.oPan),
    ...(Array.isArray(coOwners) ? coOwners : []).map((c, i) => party('owner', i + 1, c?.name, c?.pan)),
    ...(Array.isArray(tenants) ? tenants : []).map((t, i) => party('tenant', i, t?.name, t?.pan)),
  ].filter(Boolean);
};
