import { fnvHash } from '../hash.js';

const CITY_CENTRE = [18.5204, 73.8567];

const SPREAD = 0.0045;

export function seedPosition(p) {
  const h = fnvHash(p?.id || '');
  return [
    CITY_CENTRE[0] + (((h % 9) - 4) * SPREAD),
    CITY_CENTRE[1] + ((((h >> 8) % 9) - 4) * SPREAD),
  ];
}

export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
