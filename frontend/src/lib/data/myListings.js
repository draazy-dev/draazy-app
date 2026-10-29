import { myListings } from '../../services/propertyService.js';
import { myFlatmateGroups, myFlatmatePosts, myFlatmateRooms } from '../../services/flatmateService.js';

const SHARE_REQ_IMG = 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600&q=80';
const FLATMATE_GROUP_IMG = 'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=600&q=80';

const CARD_STATUS = { live: 'approved', approved: 'approved', pending: 'pending', flagged: 'pending', removed: 'rejected', rejected: 'rejected', expired: 'expired' };
const cardStatus = (modStatus) => CARD_STATUS[modStatus] || 'pending';

export function flatmatePostToListing(r) {
  const locality = (r.localities && r.localities[0]) || 'Pune';
  return {
    id: r.id,
    title: 'Looking to share — ' + locality,
    locality,
    price: r.budget,
    deal: 'rent',
    status: cardStatus(r.modStatus),
    image: SHARE_REQ_IMG,
    img: SHARE_REQ_IMG,
    views: 0,
    ownerMobile: r.mobile || '',
    real: true,
    flatmate: true,
    flatmatePost: true,
    type: 'Flatmate',
    createdAt: r.createdAt,
  };
}

export async function getMyFlatmatePosts() {
  const page = await myFlatmatePosts({ size: 100 });
  return page.items.map(flatmatePostToListing);
}

export function flatmateGroupToListing(g) {
  const perHead = g.seatsTotal ? Math.round(g.rent / g.seatsTotal) : g.rent;
  return {
    id: g.id,
    title: g.title,
    locality: g.locality || 'Pune',
    price: perHead,
    deal: 'rent',
    status: cardStatus(g.modStatus),
    image: FLATMATE_GROUP_IMG,
    img: FLATMATE_GROUP_IMG,
    views: 0,
    real: true,
    flatmate: true,
    flatmateGroup: true,
    hostRole: g.hostRole,
    hunting: g.hunting,
    verificationTier: g.verificationTier,
    reviewStatus: g.reviewStatus,
    type: 'Flatmate group',
    createdAt: g.createdAt,
  };
}

export async function getMyFlatmateGroups() {
  const page = await myFlatmateGroups({ size: 100 });
  return page.items.map(flatmateGroupToListing);
}

export function roomToListing(room) {
  const image = room.cover || null;
  const locality = room.locality || room.localities?.[0] || 'Pune';
  return {
    id: room.id,
    title: room.title || ('Flatmate — ' + (room.flatType ? room.flatType + ' ' : '') + (room.society || locality)),
    locality,
    price: room.budget ?? 0,
    deal: 'rent',
    status: cardStatus(room.modStatus),
    image,
    img: image,
    views: 0,
    real: true,
    flatmate: true,
    propertyId: room.propertyId || null,
    hostRole: room.hostRole,
    verificationTier: room.verificationTier,
    reviewStatus: room.reviewStatus,
    occupants: room.occupants || 0,
    type: 'Flatmate',
    createdAt: room.createdAt,
  };
}

export async function getMyRooms() {
  const page = await myFlatmateRooms({ size: 100 });
  return page.items.map(roomToListing);
}

export function withRooms(rows, rooms) {
  return [...rows.filter((l) => l.flatmatePost), ...rows.filter((l) => l.flatmateGroup), ...rooms, ...rows.filter((l) => !l.flatmate)];
}

export async function loadMyListings(user) {
  const [mine, rooms, flatmatePosts, flatmateGroups] = await Promise.all([
    myListings(user),
    getMyRooms(),
    getMyFlatmatePosts(),
    getMyFlatmateGroups(),
  ]);
  return [...flatmatePosts, ...flatmateGroups, ...rooms, ...mine.filter((l) => !l.archived || l.archivedNote)];
}
