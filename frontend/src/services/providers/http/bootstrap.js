import { PUBLIC_READ_TTL, get } from '../../http.js';

export async function bootstrapSection(name) {
  const doc = await get('/bootstrap', null, { auth: false, ttl: PUBLIC_READ_TTL });
  return doc?.[name];
}
