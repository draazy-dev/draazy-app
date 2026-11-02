const text = (v) => (v === null || v === undefined || typeof v === 'object' ? '' : String(v).trim());
const maskId = (v) => {
  const value = text(v);
  return value.length >= 4 ? `••••${value.slice(-4)}` : '';
};
const inr = (v) => (text(v) ? `₹${Number(text(v).replace(/,/g, '')).toLocaleString('en-IN')}` : '');
const months = (v) => (text(v) ? `${text(v)} months` : '');
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const list = (v) => (Array.isArray(v) ? v.map(obj) : []);
const area = (value, unit) => (text(value) ? `${text(value)} ${text(unit) || 'sqft'}` : '');
const VISIT_AT = { property: 'At the rented flat', licensor: "At the licensor's address", licensee: "At the licensee's address" };
const RESIDENCY = { resident: 'Resident / Aadhaar e-registration', nri: 'NRI / no Aadhaar — SRO route', foreign: 'Foreign national — SRO route' };
const CAPACITY = { owner: 'Owner', 'co-owner': 'Co-owner', poa: 'Power of attorney holder' };
const PAY_MODE = { upi: 'UPI', netbanking: 'Internet Banking', dd: 'DD / Cheque', cash: 'Cash' };
const ADDRESS_PROOF = { 'driving-license': 'Driving License', 'election-card': 'Election Card', passport: 'Passport', uid: 'UID (Aadhaar)' };
const OCCUPANT_TYPE = { family: 'Family', 'co-tenant': 'Co-tenant' };
const RELATION = { father: 'Father', mother: 'Mother', spouse: 'Spouse', son: 'Son', daughter: 'Daughter', brother: 'Brother', sister: 'Sister', friend: 'Friend', other: 'Other' };
const depositPayments = (rows, deposit) => {
  const lines = list(rows).map((p) => [
    PAY_MODE[text(p.mode)] || text(p.mode), inr(p.amount), text(p.date), text(p.ref) && `Ref ${text(p.ref)}`,
    [text(p.bank), text(p.branch)].filter(Boolean).join(', '),
  ].filter(Boolean).join(' · '));
  const paid = list(rows).reduce((sum, p) => sum + (Number(text(p.amount)) || 0), 0);
  if (lines.length && paid !== (Number(text(deposit)) || 0)) lines.push(`Adds up to ${inr(paid)}, not the deposit — confirm with the customer`);
  return lines.join('\n');
};

const poa = (p) => (text(p.poaRegNo)
  ? `for ${text(p.poaPrincipal) || '—'}, reg. ${text(p.poaRegNo)} (${[text(p.poaSro), text(p.poaDate)].filter(Boolean).join(', ')})`
  : '');

const GENDER = { male: 'Male', female: 'Female', other: 'Other' };
const identity = (p) => [['Gender', GENDER[text(p.gender)] || p.gender], ["Mother's name", p.mother]];
const residence = (a) => [text(a.address), text(a.village), text(a.pincode)].filter(Boolean).join(', ');

const licensor = (p, k) => [
  ['Date of birth', p[k.dob]], ['Age', p[k.age]], ...identity(p), ['Capacity', CAPACITY[p.capacity] || p.capacity], ['Mobile', text(p[k.mobile])],
  ['Address', residence(obj(p.addr))],
  ['Residency', RESIDENCY[p.residency] || 'Resident / Aadhaar e-registration'], ['Passport', maskId(p.passport)],
  ['SRO route', p.residency === 'nri' || p.residency === 'foreign' ? 'Yes — staff appointment required' : ''],
  ['Power of attorney', poa(p)],
];

const policeAddress = (row, same, fallback) => (same ? fallback : [text(row.address), text(row.pincode), text(row.village), text(row.policeStation)].filter(Boolean).join(', '));
const policeRows = (t) => {
  const police = obj(t.police);
  const occupants = list(police.occupants).map((row) => [
    OCCUPANT_TYPE[text(row.type)] || text(row.type), RELATION[text(row.relation)] || text(row.relation), text(row.fullName),
    text(row.age) && `${text(row.age)} yrs`, text(row.mobile),
  ].filter(Boolean).join(' · ')).join('\n');
  return [
    ['Permanent address', policeAddress(obj(police.permanent), police.permanentSameAsCurrent, 'Same as tenant address')],
    ['Address proof', ADDRESS_PROOF[text(police.addressProofType)] || police.addressProofType],
    ['Previous address', policeAddress(obj(police.previous), police.previousSameAsPermanent, 'Same as permanent address')],
    ['Previous address proof', ADDRESS_PROOF[text(police.previousAddressProofType)] || police.previousAddressProofType],
    ['Workplace address', police.workplaceAddress],
    ['Work ID proof', police.workIdProofType],
    ['Family / co-occupants', occupants],
  ];
};

const group = (key, kind, title, rows, name = '') => ({
  key, kind, title, name: text(name),
  rows: rows.map(([label, value]) => [label, text(value)]).filter(([, value]) => value),
});

export function deedGroups(details) {
  const state = obj(obj(details)._state);
  const prop = obj(state.prop);
  const terms = obj(state.terms);
  const owner = obj(state.owner);
  const flatArea = area(prop.area, prop.areaUnit);
  const increment = text(terms.increment) ? `${text(terms.increment)}% every ${text(terms.incrementEvery) || 11} months` : '';
  const furniture = list(state.furnItems).map((f) => text(f.name) + (Number(f.qty) > 1 ? ` ×${f.qty}` : '')).filter(Boolean).join(', ');
  return [
    group('property', 'property', 'Property', [
      ['Type', prop.propType], ['Flat', prop.flatNo], ['Society / building', prop.society],
      ['Locality', prop.locality], ['City', prop.city], ['Taluka', prop.taluka],
      ['Landmark', prop.landmark], ['Police station', prop.policeStation],
      ['Pincode', prop.pincode], ['Area', flatArea],
      ['Road vicinity', prop.roadVicinity], ['Road type', prop.roadType],
      ['Floor', prop.floor], ['Registration area', state.regArea],
    ]),
    group('terms', 'terms', 'Terms', [
      ['Rent', inr(terms.rent)], ['Refundable deposit', inr(terms.deposit)], ['Deposit paid by', depositPayments(terms.depositPayments, terms.deposit)], ['Term', months(terms.months)], ['Start date', terms.startDate],
      ['Non-refundable deposit', inr(terms.nrDeposit)], ['Escalation', increment], ['Lock-in', months(terms.lockin)],
      ['Maintenance paid by', state.maint],
      ['Registration cost borne by', terms.costBy], ['Parking', [terms.parking, area(terms.parkingArea, terms.parkingAreaUnit)].map(text).filter(Boolean).join(' · ')],
      ['Furniture & fittings', furniture], ['Extra clauses', state.clauses], ['Deed language', terms.language],
    ]),
    group('visit', 'visit', 'Biometric visit', [
      ['Where', VISIT_AT[text(terms.visitAt)] || terms.visitAt], ['Preferred date', terms.visitDate],
      ['Preferred time', terms.visitSlot === 'any' ? '' : terms.visitSlot],
    ]),
    group('licensor-0', 'licensor', 'Licensor 1', licensor(owner, { dob: 'oDob', age: 'oAge', mobile: 'oMobile' }), owner.oName),
    ...list(state.coOwners).map((c, i) => group(`licensor-${i + 1}`, 'licensor', `Licensor ${i + 2}`,
      licensor(c, { dob: 'dob', age: 'age', mobile: 'mobile' }), c.name)),
    ...list(state.tenants).map((t, i) => group(`tenant-${i}`, 'licensee', `Licensee ${i + 1}`, [
      ['Date of birth', t.dob], ['Age', t.age], ...identity(t), ['Occupation', t.occupation], ['Mobile', text(t.mobile)],
      ['Residency', RESIDENCY[t.residency] || 'Resident / Aadhaar e-registration'], ['Passport', maskId(t.passport)],
      ['SRO route', t.residency === 'nri' || t.residency === 'foreign' ? 'Yes — staff appointment required' : ''],
      ...policeRows(t),
    ], t.name)),
  ].filter((g) => g.rows.length || g.name);
}

const WIDE = new Set(['Address', 'Permanent address', 'Previous address', 'Workplace address', 'Family / co-occupants', 'Power of attorney', 'Residency', 'Extra clauses', 'Furniture & fittings', 'Where', 'Deposit paid by']);

export function Fields({ rows }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
      {rows.map(([label, value]) => (
        <div key={label} className={WIDE.has(label) ? 'col-span-2 min-w-0' : 'min-w-0'}>
          <dt className="text-[11px] uppercase tracking-wide text-gray-500">{label}</dt>
          <dd className="whitespace-pre-line break-words text-sm text-gray-200">{value}</dd>
        </div>
      ))}
    </dl>
  );
}