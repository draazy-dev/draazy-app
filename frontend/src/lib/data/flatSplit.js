import { isResidentialHome } from '../../data/propertyTypes.js';

export const bedroomsOf = (bhk) => {
  const n = parseInt(String(bhk ?? '').trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export const maxRoomsForBhk = (bhk) => (bedroomsOf(bhk) >= 4 ? Infinity : (bedroomsOf(bhk) || 1) + 1);
export const ROOM_SHARE_MAX = 3;

export const canSplitIntoRooms = (listing) => !!(
  listing && listing.deal === 'rent' && listing.id && isResidentialHome(listing.type)
);

export const capBoundsFor = (roomCount) => ({
  min: Math.max(1, roomCount),
  max: Math.max(1, roomCount) * ROOM_SHARE_MAX,
});

