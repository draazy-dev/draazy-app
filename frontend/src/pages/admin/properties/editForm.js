import { ADDRESS_PARTS } from '../../../lib/listingFormDetails.js';
import { amenitiesList, ageOptions } from '../../consumer/list-property/constants.js';

export const FURNISHING_OPTS = [
  { value: 'unfurnished', label: 'Unfurnished' },
  { value: 'semi', label: 'Semi-furnished' },
  { value: 'furnished', label: 'Furnished' },
];
export const POSSESSION_OPTS = [
  { value: 'ready', label: 'Ready to move' },
  { value: 'new', label: 'New launch' },
  { value: 'under', label: 'Under construction' },
];
export const TENANT_OPTS = [
  ['family', 'Family'], ['bachelors', 'Bachelors'], ['bachelor-male', 'Bachelor (Male)'],
  ['bachelor-female', 'Bachelor (Female)'], ['company', 'Company lease'], ['anyone', 'Anyone'],
];
export const AGE_OPTS = ageOptions;
export const YES_NO_OPTS = [{ value: '', label: 'Not stated' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];
export const isLand = (type) => /plot|farm/i.test(type || '');
export const amenityOpts = (current = []) => [...new Set([...amenitiesList.map((a) => a.label), ...current])];

const str = (v) => (v == null ? '' : String(v));
const yesNo = (v) => (v === true ? 'yes' : v === false ? 'no' : '');
const ageBand = (years) => {
  if (years == null || years === '') return '';
  const y = Number(years);
  return y >= 15 ? '15+' : y >= 10 ? '10-15' : y >= 5 ? '5-10' : y >= 1 ? '1-5' : 'new';
};

// `bhkNum`, not the rendered `bhk`: the label is "3 BHK", and the contract wants an integer.
export const basicsOf = (l) => ({
  id: l.id, title: l.title || '', price: l.price ?? '', area: l.area ?? '',
  bhk: l.bhkNum == null ? '' : String(l.bhkNum), type: l.type || '', locality: l.locality || '',
  localitySlug: l.localitySlug || '', deal: l.deal || 'buy', status: l.status || 'pending',
});

export const detailsOf = (f) => ({
  carpetArea: str(f.carpetArea), builtUpArea: str(f.builtUpArea), superBuiltUpArea: str(f.superBuiltUpArea),
  floor: f.floor === 0 ? 'Ground' : str(f.floor), totalFloors: str(f.totalFloors),
  bathrooms: str(f.bath), balconies: str(f.balconies), parking: str(f.parkingSpaces),
  furnishing: f.furnishing || '', facing: f.facing || '', overlooking: f.overlooking || '',
  age: ageBand(f.ageYears), construction: f.construction || '', reraId: f.reraId || '',
  address: f.address || '', pincode: f.pincode || '', electricityNo: f.electricityConsumerNo || '',
  deposit: str(f.deposit), maintenance: str(f.maintenance), negotiable: yesNo(f.negotiable),
  availableOn: f.availableOn || '', tenants: f.tenants || [], pets: yesNo(f.pets),
  desc: f.desc || '', amenities: f.amenities || [],
});

const num = (v) => (String(v).trim() === '' ? undefined : Number(v));
const sameSet = (a = [], b = []) => a.length === b.length && a.every((x) => b.includes(x));

function basicsPatch(e, ref) {
  const title = e.title.trim();
  const price = +e.price;
  const area = e.area === '' ? '' : +e.area;
  const loc = e.locality.trim();
  if (!title) return { error: 'Title is required' };
  if (Number.isNaN(price) || price <= 0) return { error: 'Enter a valid price' };
  if (area !== '' && (Number.isNaN(area) || area < 0)) return { error: 'Area must be a positive number' };
  if (!loc) return { error: 'Locality is required' };
  const bhkRaw = String(e.bhk ?? '').trim();
  const bhkNum = bhkRaw === '' ? undefined : Number(bhkRaw);
  if (bhkNum !== undefined && (!Number.isInteger(bhkNum) || bhkNum < 0)) {
    return { error: 'Configuration must be a whole number of bedrooms' };
  }
  const locChanged = loc !== (ref.locality || '') || (e.localitySlug && e.localitySlug !== (ref.localitySlug || ''));
  return {
    patch: {
      title: title !== (ref.title || '') ? title : undefined,
      price: price !== Number(ref.price) ? price : undefined,
      area: area !== '' && area !== Number(ref.area) ? area : undefined,
      bhk: bhkNum !== undefined && bhkNum !== ref.bhkNum ? bhkNum : undefined,
      type: e.type.trim() !== (ref.type || '') ? e.type.trim() : undefined,
      locality: locChanged ? loc : undefined,
      localitySlug: locChanged && e.localitySlug ? e.localitySlug : undefined,
      deal: e.deal !== (ref.deal || 'buy') ? e.deal : undefined,
    },
  };
}

const NUMBER_FIELDS = [
  // [form key, patch key, label, minimum]
  ['carpetArea', 'carpetArea', 'Carpet area', 1],
  ['builtUpArea', 'builtUpArea', 'Built-up area', 1],
  ['superBuiltUpArea', 'superBuiltUpArea', 'Super built-up area', 1],
  ['totalFloors', 'totalFloors', 'Total floors', 1],
  ['bathrooms', 'bathrooms', 'Bathrooms', 0],
  ['balconies', 'balconies', 'Balconies', 0],
  ['parking', 'parkingSpaces', 'Parking', 0],
  ['deposit', 'deposit', 'Deposit', 0],
];

function detailsPatch(e, was) {
  const patch = {};
  for (const [key, out, label, min] of NUMBER_FIELDS) {
    if (e[key] === was[key]) continue;
    const n = num(e[key]);
    // These have no PATCH word for "clear", so a blanked box leaves the stored value alone.
    if (n === undefined) continue;
    if (!Number.isFinite(n) || n < min) return { error: `${label} must be ${min ? 'above zero' : 'zero or more'}` };
    patch[out] = n;
  }
  if (e.floor !== was.floor && e.floor !== '') {
    const floor = e.floor === 'Ground' ? 0 : Number(e.floor);
    if (!Number.isInteger(floor) || floor < 0) return { error: 'Floor must be Ground or a whole number' };
    patch.floor = floor;
  }
  if (e.maintenance !== was.maintenance) {
    const n = num(e.maintenance);
    if (n === undefined) patch.clearMaintenance = true;
    else if (!Number.isFinite(n) || n < 0) return { error: 'Maintenance must be zero or more' };
    else patch.maintenance = n;
  }
  if (e.reraId !== was.reraId) {
    const rera = e.reraId.trim().toUpperCase();
    if (rera && !/^P\d{11}$/.test(rera)) return { error: 'RERA id is P followed by 11 digits' };
    patch.reraId = rera;
  }
  if (e.pincode !== was.pincode) {
    if (e.pincode && !/^[1-9]\d{5}$/.test(e.pincode)) return { error: 'Pincode must be 6 digits' };
    patch.pincode = e.pincode;
  }
  for (const key of ['furnishing', 'facing', 'overlooking', 'age', 'construction']) {
    if (e[key] && e[key] !== was[key]) patch[key] = e[key];
  }
  if (e.electricityNo.trim() && e.electricityNo !== was.electricityNo) patch.electricityConsumerNo = e.electricityNo.trim();
  if (e.address !== was.address) patch.address = e.address.trim();
  if (e.negotiable && e.negotiable !== was.negotiable) patch.negotiable = e.negotiable === 'yes';
  if (e.pets !== was.pets) patch.pets = e.pets ? e.pets === 'yes' : null;
  if (e.availableOn !== was.availableOn) patch.available = e.availableOn;
  if (!sameSet(e.tenants, was.tenants)) patch.tenants = e.tenants;
  if (!sameSet(e.amenities, was.amenities)) patch.amenities = e.amenities;
  if (e.desc !== was.desc) patch.desc = e.desc.trim();
  return { patch };
}

/** The changed fields only, so an untouched field can never be rewritten from a stale or partial read. */
export function editPatch(edit) {
  const ref = edit._ref || {};
  const basics = basicsPatch(edit, ref);
  if (basics.error) return basics;
  const full = edit._full;
  const details = full ? detailsPatch(edit, detailsOf(full)) : { patch: {} };
  if (details.error) return details;
  const patch = { ...basics.patch, ...details.patch };
  /* Sent without form details, an address edit makes the server drop the stored address boxes and the
     landmark with them; sending the rest back keeps the landmark and lets the owner's wizard re-split the line. */
  if (patch.address !== undefined && full?.formDetails && Object.keys(full.formDetails).length) {
    patch.formDetails = Object.fromEntries(Object.entries(full.formDetails).filter(([k]) => !ADDRESS_PARTS.includes(k)));
  }
  return { patch: Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) };
}
