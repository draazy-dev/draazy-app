import { useEffect, useState } from 'react';
import { getFlatmateDetail, getOwnerHomePrefill } from '../../../services/flatmateService.js';
import { HOME_TYPE_PILLS } from './constants.js';
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

/** The flat a tenant described in a room post, as the owner's whole-flat listing; no room or rent fields. */
export const homeToForm = (home) => {
  const asRoom = roomToForm({ ...home, host: { details: home } });
  return {
    ...initialForm,
    deal: 'rent',
    ...Object.fromEntries(HOME_FIELDS.map((key) => [key, asRoom[key]])),
    facing: home.facing || initialForm.facing,
    overlooking: home.overlooking || initialForm.overlooking,
  };
};

export function useHomePrefill({ homeId, canLoad, setForm }) {
  useEffect(() => {
    if (!homeId || !canLoad) return undefined;
    let live = true;
    // A failed read leaves the wizard blank; the submit still reports the 404 if the home isn't the caller's.
    getOwnerHomePrefill(homeId)
      .then((home) => { if (live) setForm(homeToForm(home)); })
      .catch(() => {});
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
