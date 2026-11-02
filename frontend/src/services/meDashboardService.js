import { get, prime, PAGE_LOAD_TTL } from './http.js';
import { MAX_PAGE_SIZE } from './apiLimits.js';
import { readAccessToken } from '../lib/auth.js';
import { myTenancies } from './rentService.js';
import { listMyServiceRequestInvites } from './serviceRequestService.js';

const PAGE = { page: 0, size: MAX_PAGE_SIZE };
const SIZE = { size: MAX_PAGE_SIZE };

const SECTIONS = [
  ['listings', '/me/listings', SIZE],
  ['flatmatePosts', '/me/flatmate-posts', PAGE],
  ['flatmateRooms', '/me/flatmate-rooms', PAGE],
  ['flatmateGroups', '/me/flatmate-groups', PAGE],
  ['contactRequests', '/me/contact-requests', PAGE],
  ['photoRequests', '/me/photo-requests', PAGE],
  ['documentRequests', '/me/documents/requests', SIZE],
  ['flatmateRequests', '/me/flatmate-requests', SIZE],
  ['groupApplications', '/me/group-applications', PAGE],
  ['visits', '/visits', SIZE],
  ['visitRequests', '/me/visit-requests', SIZE],
  ['propertyReviews', '/me/property-reviews', PAGE],
  ['recentSearches', '/me/recent-searches'],
  ['managedProperties', '/me/managed-properties'],
  ['entitlements', '/me/entitlements'],
];

export function primeMeDashboard({ listingTools = false, maxAge } = {}) {
  if (!readAccessToken()) return undefined;
  const doc = get('/me/dashboard', listingTools ? { listingTools: true } : undefined, { ttl: PAGE_LOAD_TTL, maxAge });
  for (const [name, path, query] of SECTIONS) {
    if (name === 'entitlements' && !listingTools) continue;
    prime(path, query, doc.then((d) => d?.[name]), { ttl: PAGE_LOAD_TTL });
  }
  return doc;
}

export async function dashboardCaps(doc) {
  const d = doc ? await doc.catch(() => null) : null;
  const any = (rows) => (rows || []).length > 0;
  const [hasTenancy, hasRentalInvite] = await Promise.all([
    d?.hasTenancy ?? myTenancies().then(any, () => false),
    d?.hasRentalInvite ?? listMyServiceRequestInvites().then(any, () => false),
  ]);
  return { ownsProperty: d?.listings ? d.listings.content.length > 0 : null, hasTenancy, hasRentalInvite };
}
