import { PAGE_LOAD_TTL, get } from '../../http.js';

export async function getEntitlements() {
  return get('/me/entitlements', undefined, { ttl: PAGE_LOAD_TTL });
}
