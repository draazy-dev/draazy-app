import { useEffect, useState } from 'react';
import { addDaysIso, istToday, MAX_AVAILABLE_DAYS } from '../../../lib/availability.js';
import { getFlatmateDetail, getOwnerHomePrefill } from '../../../services/flatmateService.js';
import { getManaged } from '../../../services/managedService.js';
import { HOME_TYPE_PILLS, homeTypeLabelFor } from './constants.js';
import { initialForm } from './initialForm.js';
import { roomHeadline } from './submit.js';

const text = (value) => (value == null ? '' : String(value));

export const roomToForm = (room) => {
  const [propertyType, homeTypeLabel] = HOME_TYPE_PILLS.find(([, label]) => label === room.homeTypeLabel) || HOME_TYPE_PILLS[0];
  const placed = Number.isFinite(room.lat) && Number.isFinite(room.lng);
  const host = room.host || {};
  const details = host.details || {};
  const form = {
    ...initialForm,
    deal: 'rent',
    propertyType,
    homeTypeLabel,
    bhk: text(room.bhk),
    roomType: room.roomType || '',
    attachedBath: room.attachedBath || '',
    bathrooms: text(details.bathrooms),
    balconies: details.balconies == null ? initialForm.balconies : String(details.balconies),
    floor: details.floor || '',
    totalFloors: text(details.totalFloors),
    floorsInHouse: text(details.floorsInHouse),
    gatedCommunity: !!room.gatedCommunity,
    furnishing: room.furnishing || initialForm.furnishing,
    furniture: details.furniture || [],
    occupants: text(room.occupants),
    noticePeriodDays: text(room.noticePeriodDays),
    lockInMonths: text(room.lockInMonths),
    maintenanceBilling: room.maintenanceBilling || '',
    electricityBilling: room.electricityBilling || '',
    locality: room.locality || '',
    localitySlug: room.localitySlug || '',
    society: room.society || '',
    societyId: room.societyId || '',
    flatNumber: room.flatNumber || '',
    tower: details.tower || '',
    street: details.street || '',
    landmark: details.landmark || '',
    pincode: details.pincode || '',
    pinPlaced: placed,
    propLat: placed ? room.lat : initialForm.propLat,
    propLng: placed ? room.lng : initialForm.propLng,
    rentShare: room.budget ? String(room.budget) : '',
    deposit: room.deposit == null ? '' : String(room.deposit),
    availableFrom: room.availableFrom || '',
    lookingFor: room.gender || 'any',
    foodPref: room.food || 'any',
    roomParking: room.parking || '',
    roomAmenities: room.amenities || [],
    note: room.note || '',
    hostRole: room.hostRole || 'owner',
    agreementDeclared: !!room.agreementDeclared,
    agreementDoc: host.agreementDoc || null,
    ownerConsentMobile: host.ownerConsentMobile || '',
    ownerConsent: room.hostRole === 'tenant',
    attachedPropertyId: host.attachedPropertyId || '',
  };
  return { ...form, title: room.title && room.title !== roomHeadline(form) ? room.title : '' };
};

const HOME_FIELDS = ['propertyType', 'homeTypeLabel', 'bhk', 'bathrooms', 'balconies', 'floor', 'totalFloors',
  'floorsInHouse', 'gatedCommunity', 'furnishing', 'furniture', 'locality', 'localitySlug', 'society', 'societyId',
  'flatNumber', 'tower', 'street', 'landmark', 'pincode', 'pinPlaced', 'propLat', 'propLng'];

const homeFields = (home) => {
  const asRoom = roomToForm({ ...home, host: { details: home } });
  return {
    ...Object.fromEntries(HOME_FIELDS.map((key) => [key, asRoom[key]])),
    facing: home.facing || initialForm.facing,
    overlooking: home.overlooking || initialForm.overlooking,
  };
};

const PROPERTY_TYPE_OF = [[/villa/i, 'villa'], [/independent|bungalow|row/i, 'independent'],
  [/commercial|office|shop|retail/i, 'commercial'], [/farm/i, 'farmland'], [/plot/i, 'openplot']];
const propertyTypeOf = (type) => PROPERTY_TYPE_OF.find(([re]) => re.test(type || ''))?.[1] || 'flat';

const furnishingOf = (value) => {
  const v = String(value || '').toLowerCase();
  if (v.includes('semi')) return 'semi';
  if (v.startsWith('furnished') || v === 'fully') return 'furnished';
  return initialForm.furnishing;
};

const availableAfterLease = (leaseEnd) => {
  const today = istToday();
  return leaseEnd && leaseEnd > today && leaseEnd <= addDaysIso(today, MAX_AVAILABLE_DAYS) ? leaseEnd : '';
};

export const managedToForm = (home) => {
  const deal = home.deal === 'rent' ? 'rent' : 'buy';
  const propertyType = propertyTypeOf(home.type);
  const price = home.price ? String(home.price) : '';
  return {
    ...initialForm,
    deal,
    propertyType,
    homeTypeLabel: homeTypeLabelFor(propertyType) || initialForm.homeTypeLabel,
    bhk: home.bhkNum ? String(Math.min(home.bhkNum, 5)) : '',
    furnishing: furnishingOf(home.furnishing),
    locality: home.locality || '',
    localitySlug: home.localitySlug || '',
    society: home.society || '',
    carpetArea: home.area ? String(home.area) : '',
    areaUnit: home.areaUnit || initialForm.areaUnit,
    ...(deal === 'rent'
      ? { monthlyRent: price, deposit: home.deposit ? String(home.deposit) : '', availableFrom: availableAfterLease(home.leaseEnd) }
      : { price }),
  };
};

export function useHomePrefill({ homeId, canLoad, setForm }) {
  useEffect(() => {
    if (!homeId || !canLoad) return undefined;
    let live = true;
    (async () => {
      const record = await getManaged(homeId);
      if (!record) return;
      const room = record.sourceRoomId ? await getOwnerHomePrefill(homeId).catch(() => null) : null;
      if (live) setForm({ ...managedToForm(record), ...(room ? homeFields(room) : {}) });
    })().catch(() => {});
    return () => { live = false; };
  }, [homeId, canLoad, setForm]);
}

export default function useRoomEdit({ roomId, canLoad, setForm, setPhotos }) {
  const [state, setState] = useState({ status: roomId ? 'loading' : 'idle', baseline: null, photoUrls: [], storedTitle: '' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!roomId || !canLoad) return undefined;
    let live = true;
    setState({ status: 'loading', baseline: null, photoUrls: [], storedTitle: '' });
    getFlatmateDetail('room', roomId)
      .then(({ owned, item }) => {
        if (!live) return;
        if (!owned || item.propertyId) throw new Error('Room not editable');
        const baseline = roomToForm(item);
        const photoUrls = (item.photos || []).filter(Boolean);
        setForm(baseline);
        setPhotos(photoUrls.map((url) => ({ url, category: 'Other' })));
        setState({ status: 'ready', baseline, photoUrls, storedTitle: item.title || '' });
      })
      .catch(() => { if (live) setState({ status: 'error', baseline: null, photoUrls: [], storedTitle: '' }); });
    return () => { live = false; };
  }, [roomId, canLoad, attempt, setForm, setPhotos]);

  return { ...state, retry: () => setAttempt((n) => n + 1) };
}
