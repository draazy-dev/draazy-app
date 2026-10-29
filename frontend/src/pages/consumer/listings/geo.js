import { seedPosition } from '../../../lib/listings/coords.js';

export function propLatLng(p) {
  if (p && p.lat != null && p.lng != null) return [p.lat, p.lng];
  return seedPosition(p);
}
