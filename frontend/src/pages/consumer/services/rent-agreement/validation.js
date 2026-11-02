import { ADDRESS_PROOF_TYPES, AREA_UNITS, DEPOSIT_PAY_FIELDS, FAMILY_MEMBER_TYPES, FAMILY_RELATIONS, GENDERS, MAX_AREA, MAX_FLOOR, MAX_MONTHS, MAX_POLICE_OCCUPANTS, MH_PINCODE, PARTY_TYPES, PAYMENT_REF, POA_DOC, PUNE_TALUKAS, RESIDENCIES, RESIDENTIAL_PROPERTY_TYPES, START_DATE_FUTURE_DAYS, START_DATE_PAST_DAYS, VISIT_DATE_FUTURE_DAYS } from './constants.js';
import { digits, isMobile, isPan, num } from './helpers.js';

const IST_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
export const todayIst = (now = new Date()) => IST_DAY.format(now);
const shiftIso = (iso, days) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
export const ageFromDob = (dob, today = todayIst()) => {
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dob || ''));
  const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(today || ''));
  if (!b || !t || dob > today) return '';
  const born = new Date(`${dob}T00:00:00Z`);
  if (Number.isNaN(born.getTime()) || born.toISOString().slice(0, 10) !== dob) return '';
  let age = Number(t[1]) - Number(b[1]);
  if (`${t[2]}-${t[3]}` < `${b[2]}-${b[3]}`) age -= 1;
  return age >= 0 ? String(age) : '';
};
export const startDateBounds = (now = new Date()) => {
  const today = todayIst(now);
  return { min: shiftIso(today, -START_DATE_PAST_DAYS), max: shiftIso(today, START_DATE_FUTURE_DAYS), today };
};
export const visitDateBounds = (now = new Date()) => {
  const today = todayIst(now);
  return { min: shiftIso(today, 1), max: shiftIso(today, VISIT_DATE_FUTURE_DAYS) };
};

export const docReady = (d) => !!(d?.dataUrl || d?.vaultDocId || d?.filedOn);
export const residencyOf = (row) => (RESIDENCIES.includes(row?.residency) ? row.residency : 'resident');
export const isOfflineParty = (row) => ['nri', 'foreign'].includes(residencyOf(row));
export const isForeignParty = (row) => residencyOf(row) === 'foreign';
export const partyDocSlugs = (row) => [...(isOfflineParty(row) ? ['passport'] : []), ...(isForeignParty(row) ? ['visa'] : [])];
export const TENANT_DOC_KEYS = { passport: '1', visa: '4', addressproof: '5', prevaddressproof: '6', workidproof: '7' };
export const tenantDocKey = (i, slug) => `t${i}-${TENANT_DOC_KEYS[slug]}`;
export const workProofRequired = (occupation) => !/\b(student|home\s*maker|homemaker|housewife|retired)\b/i.test(String(occupation || ''));
export const addressProofUploadRequired = (tenant) => (tenant?.police ? tenant.police.addressProofType || '' : 'uid') !== 'uid';
export const previousAddressProofUploadRequired = (tenant) => tenant?.police?.previousSameAsPermanent === false && (tenant.police.previousAddressProofType || '') !== 'uid';
export const ownerDocSlots = (owner) => [
  ...(isOfflineParty(owner) ? ['o-passport'] : []),
  ...(isForeignParty(owner) ? ['o-visa'] : []),
  'o-own',
  ...(owner?.capacity === 'poa' ? [POA_DOC] : []),
];
export const coOwnerDocSlots = (c, i) => [...partyDocSlugs(c), ...(c?.capacity === 'poa' ? ['poa'] : [])].map((s) => `c${i}-${s}`);
export const tenantDocSlots = (tenant, i) => {
  const required = (slug) => slug === 'passport'
    || slug === 'visa'
    || (slug === 'addressproof' && addressProofUploadRequired(tenant))
    || (slug === 'prevaddressproof' && previousAddressProofUploadRequired(tenant))
    || (slug === 'workidproof' && workProofRequired(tenant?.occupation));
  return [...partyDocSlugs(tenant), 'addressproof', 'prevaddressproof', 'workidproof'].map((slug) => ({ slug, key: tenantDocKey(i, slug), required: required(slug) }));
};

const blank = (v) => !String(v ?? '').trim();
const wholeIn = (v, lo, hi) => /^\d+$/.test(String(v).trim()) && Number(v) >= lo && Number(v) <= hi;
const passportOk = (v) => /^[A-Za-z0-9]{6,20}$/.test(String(v || '').trim());

const licensorIds = ({ owner, coOwners = [], ownerMode, invite }) => (ownerMode === 'invite'
  ? [{ m: ['invMobile', invite?.invMobile], pan: ['invPan', ''] }]
  : [
  { m: ['oMobile', owner?.oMobile], pan: ['oPan', owner?.oPan] },
  ...coOwners.map((c, i) => ({ m: [`c${i}mobile`, c.mobile], pan: [`c${i}pan`, c.pan] })),
]);
const tenantIds = ({ tenants = [] }) => tenants.map((t, i) => ({ m: [`t${i}mobile`, t.mobile], pan: [`t${i}pan`, t.pan] }));

const panKey = (v) => String(v || '').trim().toUpperCase();
const flagDuplicates = (e, before, mine, pick, norm = digits) => {
  const seen = new Set(before.map((p) => norm(pick(p)[1])).filter(Boolean));
  mine.forEach((p) => {
    const [key, raw] = pick(p);
    const v = norm(raw);
    if (!v) return;
    if (seen.has(v) && !e[key]) e[key] = 'dup';
    seen.add(v);
  });
};
const distinctParties = (e, before, mine) => {
  flagDuplicates(e, before, mine, (p) => p.m);
  flagDuplicates(e, before, mine, (p) => p.pan, panKey);
};
export const dupMessageKey = (key) => `services.ra.err.${/mobile$/i.test(key) ? 'dupMobile' : 'dupPan'}`;

const checkPoa = (e, prefix, row, today) => {
  if (row?.capacity !== 'poa') return;
  ['poaPrincipal', 'poaRegNo', 'poaSro'].forEach((k) => { if (blank(row[k])) e[prefix + k] = 'required'; });
  if (!row.poaDate) e[prefix + 'poaDate'] = 'required';
  else if (row.poaDate > today) e[prefix + 'poaDate'] = 'range';
};

const checkDocs = (e, docs, slots) => slots.forEach((k) => { if (!docReady(docs?.[k])) e['doc-' + k] = 'required'; });

const checkOptionalArea = (e, key, v) => {
  if (blank(v)) return;
  const area = Number(String(v ?? '').trim());
  if (!/^\d+(\.\d{1,2})?$/.test(String(v ?? '').trim()) || !(area >= 1 && area <= MAX_AREA)) e[key] = 'range';
};
const checkDob = (e, key, dob) => {
  if (blank(dob)) { e[key] = 'required'; return; }
  const age = ageFromDob(dob);
  if (!age || !wholeIn(age, 18, 120)) e[key] = 'range';
};
const onFile = (held, pan) => (blank(pan) && held ? held : {});
const checkMotherGender = (e, p, row) => {
  if (blank(row.mother)) e[p + 'mother'] = 'required';
  else if (String(row.mother).trim().length > 80) e[p + 'mother'] = 'range';
  if (!GENDERS.includes(row.gender || '')) e[p + 'gender'] = 'required';
};
const PARTY_PIN = /^[1-9]\d{5}$/;
const checkPartyAddress = (e, p, addr) => {
  if (!PARTY_PIN.test(digits(addr?.pincode))) e[p + 'Pincode'] = 'format';
  if (blank(addr?.village)) e[p + 'Village'] = 'required';
  if (blank(addr?.address)) e[p + 'Address'] = 'required';
};
const checkPerson = (e, p, row, held) => {
  const kept = onFile(held, row.pan);
  if (!PARTY_TYPES.includes(row.type || 'individual')) e[p + 'type'] = 'format';
  if (row.type === 'entity') e[p + 'type'] = 'entity';
  if (!RESIDENCIES.includes(row.residency || 'resident')) e[p + 'residency'] = 'format';
  if (blank(row.name)) e[p + 'name'] = 'required';
  checkMotherGender(e, p, row);
  checkDob(e, p + 'dob', row.dob);
  if (!kept.pan && !isPan(row.pan)) e[p + 'pan'] = 'format';
  if (isOfflineParty(row)) {
    if (!passportOk(row.passport)) e[p + 'passport'] = 'format';
    if (isForeignParty(row) && blank(row.visaOci)) e[p + 'visaOci'] = 'required';
  }
  if (!isMobile(row.mobile)) e[p + 'mobile'] = 'format';
};

const checkPoliceAddress = (e, p, group, row) => {
  const key = group[0].toUpperCase() + group.slice(1);
  if (blank(row?.address)) e[p + `police${key}Address`] = 'required';
  if (!/^\d{6}$/.test(digits(row?.pincode))) e[p + `police${key}Pincode`] = 'format';
  if (blank(row?.village)) e[p + `police${key}Village`] = 'required';
  if (blank(row?.policeStation)) e[p + `police${key}PoliceStation`] = 'required';
};
const checkPoliceRecord = (e, p, tenant) => {
  const police = tenant.police || {};
  if (!ADDRESS_PROOF_TYPES.includes(police.addressProofType || '')) e[p + 'policeAddressProofType'] = 'required';
  if (!police.permanentSameAsCurrent) checkPoliceAddress(e, p, 'permanent', police.permanent);
  if (!police.previousSameAsPermanent) {
    checkPoliceAddress(e, p, 'previous', police.previous);
    if (!ADDRESS_PROOF_TYPES.includes(police.previousAddressProofType || '')) e[p + 'policePreviousAddressProofType'] = 'required';
  }
  if (workProofRequired(tenant.occupation)) {
    if (blank(police.workplaceAddress)) e[p + 'policeWorkplaceAddress'] = 'required';
    if (blank(police.workIdProofType)) e[p + 'policeWorkIdProofType'] = 'required';
  }
  const occupants = Array.isArray(police.occupants) ? police.occupants : [];
  if (occupants.length > MAX_POLICE_OCCUPANTS) e[p + 'policeOccupants'] = 'range';
  occupants.forEach((row, i) => {
    if (!FAMILY_MEMBER_TYPES.includes(row.type || '')) e[`${p}policeOcc${i}type`] = 'required';
    if (!FAMILY_RELATIONS.includes(row.relation || '')) e[`${p}policeOcc${i}relation`] = 'required';
    if (blank(row.fullName)) e[`${p}policeOcc${i}fullName`] = 'required';
    else if (String(row.fullName).trim().length > 80) e[`${p}policeOcc${i}fullName`] = 'range';
    if (blank(row.age) || !wholeIn(row.age, 0, 120)) e[`${p}policeOcc${i}age`] = 'range';
    if (!isMobile(row.mobile)) e[`${p}policeOcc${i}mobile`] = 'format';
  });
};

function licensorErrors(e, f, today) {
  const { owner, coOwners = [], ownerDocs } = f;
  if (f.ownerMode === 'invite') {
    if (!isMobile(f.invite?.invMobile)) e.invMobile = 'format';
    return;
  }
  if (blank(owner.oName)) e.oName = 'required';
  if (!PARTY_TYPES.includes(owner.type || 'individual')) e.type = 'format';
  if (owner.type === 'entity') e.type = 'entity';
  if (!RESIDENCIES.includes(owner.residency || 'resident')) e.residency = 'format';
  checkMotherGender(e, '', owner);
  checkDob(e, 'oDob', owner.oDob);
  const kept = onFile(f.held?.['owner-0'], owner.oPan);
  if (!kept.pan && !isPan(owner.oPan)) e.oPan = 'format';
  if (isOfflineParty(owner)) {
    if (!passportOk(owner.passport)) e.passport = 'format';
    if (isForeignParty(owner) && blank(owner.visaOci)) e.visaOci = 'required';
  }
  if (!isMobile(owner.oMobile)) e.oMobile = 'format';
  else if (!f.listed && f.selfMobile && ![owner.oMobile, ...coOwners.map((c) => c.mobile)].some((m) => digits(m).slice(-10) === digits(f.selfMobile).slice(-10))) e.oMobile = 'notOwner';
  checkPartyAddress(e, 'addr', owner.addr);
  const cap = owner.capacity || 'owner';
  if ((coOwners.length && cap === 'owner') || (!coOwners.length && cap === 'co-owner')) e.capacity = 'mismatch';
  checkPoa(e, '', owner, today);
  checkDocs(e, ownerDocs, ownerDocSlots(owner));
  coOwners.forEach((c, i) => {
    const p = `c${i}`;
    checkPerson(e, p, c, f.held?.[`owner-${i + 1}`]);
    checkPartyAddress(e, p + 'addr', c.addr);
    checkPoa(e, p, c, today);
    checkDocs(e, ownerDocs, coOwnerDocSlots(c, i));
  });
  distinctParties(e, [], licensorIds(f));
}

function tenantErrors(e, f) {
  const { tenantMode, tenants = [], tenantDocs } = f;
  if (tenantMode === 'invite') {
    tenants.forEach((t, i) => {
      if (!isMobile(t.mobile)) e[`t${i}mobile`] = 'format';
    });
    distinctParties(e, licensorIds(f), tenantIds(f));
    return;
  }
  tenants.forEach((t, i) => {
    checkPerson(e, `t${i}`, t, f.held?.[`tenant-${i}`]);
    checkPoliceRecord(e, `t${i}`, t);
    checkDocs(e, tenantDocs, tenantDocSlots(t, i).filter((slot) => slot.required).map((slot) => slot.key));
  });
  distinctParties(e, licensorIds(f), tenantIds(f));
}

function depositPaymentErrors(e, terms, today) {
  const rows = Array.isArray(terms.depositPayments) ? terms.depositPayments : [];
  const deposit = num(terms.deposit);
  if (!deposit && !rows.length) return;
  if (!rows.length) { e.depositPayments = 'none'; return; }
  rows.forEach((r, i) => {
    (DEPOSIT_PAY_FIELDS[r.mode] || []).filter((f) => f !== 'branch').forEach((f) => { if (blank(r[f])) e[`dp${i}${f}`] = 'required'; });
    if (!DEPOSIT_PAY_FIELDS[r.mode]) e[`dp${i}mode`] = 'required';
    if (!blank(r.amount) && !num(r.amount)) e[`dp${i}amount`] = 'required';
    if (r.date && r.date > today) e[`dp${i}date`] = 'range';
    if (DEPOSIT_PAY_FIELDS[r.mode]?.includes('ref') && !blank(r.ref) && !PAYMENT_REF.test(r.ref)) e[`dp${i}ref`] = 'format';
  });
  if (rows.reduce((sum, r) => sum + num(r.amount), 0) !== deposit) e.depositPayments = 'total';
}

function termErrors(e, { terms }, bounds) {
  if (!terms.startDate) e.startDate = 'required';
  else if (terms.startDate < bounds.min || terms.startDate > bounds.max) e.startDate = 'range';
  if (!num(terms.rent)) e.rent = 'required';
  if (blank(terms.deposit)) e.deposit = 'required';
  const months = Number(terms.months);
  if (!wholeIn(terms.months, 1, MAX_MONTHS)) e.months = 'range';
  const cap = Number.isFinite(months) && months >= 1 ? Math.min(months, MAX_MONTHS) : MAX_MONTHS;
  if (!blank(terms.lockin) && !wholeIn(terms.lockin, 0, cap)) e.lockin = 'range';
  if (!blank(terms.increment) && !wholeIn(terms.increment, 0, 100)) e.increment = 'range';
  checkOptionalArea(e, 'parkingArea', terms.parkingArea);
  if (!blank(terms.parkingAreaUnit) && !AREA_UNITS.includes(terms.parkingAreaUnit)) e.parkingArea = 'range';
  const visit = visitDateBounds();
  if (terms.visitDate && (terms.visitDate < visit.min || terms.visitDate > visit.max)) e.visitDate = 'range';
  depositPaymentErrors(e, terms, bounds.today);
}

const IGR_TEXT_LIMITS = { landmark: 80, policeStation: 80, roadVicinity: 80, roadType: 80 };

function propertyIgrErrors(e, prop) {
  Object.entries(IGR_TEXT_LIMITS).forEach(([key, max]) => {
    if (blank(prop[key])) e[key] = 'required';
    else if (String(prop[key]).trim().length > max) e[key] = 'range';
  });
}

export function stepErrors(step, form, now = new Date()) {
  const e = {};
  if (form.mode === 'invite' && step !== (form.inviteRole === 'owner' ? 1 : 2)) return e;
  const bounds = startDateBounds(now);
  if (step === 0) {
    const { prop } = form;
    ['flatNo', 'locality', 'taluka'].forEach((k) => { if (blank(prop[k])) e[k] = 'required'; });
    if (blank(prop.society)) e.society = 'required';
    if (typeof prop.gramPanchayat !== 'boolean') e.gramPanchayat = 'required';
    if (!blank(prop.taluka) && !PUNE_TALUKAS.includes(prop.taluka)) e.taluka = 'format';
    if (!/^\d{6}$/.test(prop.pincode)) e.pincode = 'format';
    else if (!MH_PINCODE.test(prop.pincode)) e.pincode = 'state';
    if (!RESIDENTIAL_PROPERTY_TYPES.includes(prop.propType)) e.propType = 'commercial';
    const area = Number(String(prop.area ?? '').trim());
    if (!/^\d+(\.\d{1,2})?$/.test(String(prop.area ?? '').trim()) || !(area >= 1 && area <= MAX_AREA)) e.area = 'required';
    if (!blank(prop.floor) && !wholeIn(prop.floor, 0, MAX_FLOOR)) e.floor = 'range';
    propertyIgrErrors(e, prop);
  } else if (step === 1) licensorErrors(e, form, bounds.today);
  else if (step === 2) tenantErrors(e, form);
  else if (step === 3) termErrors(e, form, bounds);
  return e;
}
