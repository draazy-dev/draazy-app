import { get, post } from '../../http.js';
import { bootstrapSection } from './bootstrap.js';

export async function listCities() {
  const rows = await bootstrapSection('cities');
  return Array.isArray(rows) ? rows : [];
}

export async function joinCityWaitlist({ city, mobile, email, turnstileToken }) {
  const body = { city, mobile };
  if (email) body.email = email;
  await post('/cities/waitlist', body, {
    auth: false,
    headers: turnstileToken ? { 'CF-Turnstile-Response': turnstileToken } : undefined,
  });
}

export async function listCityWaitlist() {
  const rows = await get('/admin/cities/waitlist');
  if (!Array.isArray(rows)) throw new Error('GET /admin/cities/waitlist: expected an array');
  return rows;
}

