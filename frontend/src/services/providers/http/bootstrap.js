import { PUBLIC_READ_TTL, get } from '../../http.js';

// Every public reference read is one section of `GET /bootstrap`, fetched once per TTL.
export async function bootstrapSection(name) {
  const doc = await get('/bootstrap', null, { auth: false, ttl: PUBLIC_READ_TTL });
  return doc?.[name];
}
