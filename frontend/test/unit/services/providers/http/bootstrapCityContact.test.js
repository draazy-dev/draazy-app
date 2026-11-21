import { describe, expect, it } from 'vitest';
import { setupFetch, status } from '../net.js';
import { writeTokens } from '../../../../../src/lib/auth.js';
import { clearReads } from '../../../../../src/services/http.js';
import { NO_CONTACT_GATE } from '../../../../../src/lib/contact.js';
import { bootstrapSection } from '../../../../../src/services/providers/http/bootstrap.js';
import { joinCityWaitlist, listCities, listCityWaitlist } from '../../../../../src/services/providers/http/cityProvider.js';
import {
  contactStatus, myContactRequests, requestContact, respondToContactRequest,
} from '../../../../../src/services/providers/http/contactProvider.js';

describe('bootstrap + cityProvider', () => {
  const net = setupFetch();

  it('bootstrapSection reads /bootstrap unauthenticated and picks a section', async () => {
    net.reply({ cities: [{ slug: 'pune' }] });
    expect(await bootstrapSection('cities')).toEqual([{ slug: 'pune' }]);
    expect(net.last()).toMatchObject({ path: '/bootstrap', method: 'GET' });
    expect(net.last().headers.Authorization).toBeUndefined();
  });

  it('bootstrapSection tolerates an empty document', async () => {
    expect(await bootstrapSection('cities')).toBeUndefined();
  });

  it('listCities returns an array only', async () => {
    net.reply({ cities: 'nope' });
    expect(await listCities()).toEqual([]);
  });

  it('joinCityWaitlist posts optional email and turnstile header', async () => {
    await joinCityWaitlist({ city: 'Nagpur', mobile: '1', email: 'a@x.in', turnstileToken: 'ts' });
    expect(net.last()).toMatchObject({ path: '/cities/waitlist', method: 'POST', body: { city: 'Nagpur', mobile: '1', email: 'a@x.in' } });
    expect(net.last().headers['CF-Turnstile-Response']).toBe('ts');
    await joinCityWaitlist({ city: 'Nagpur', mobile: '1' });
    expect(net.last().body).toEqual({ city: 'Nagpur', mobile: '1' });
    expect(net.last().headers['CF-Turnstile-Response']).toBeUndefined();
  });

  it('listCityWaitlist requires an array', async () => {
    writeTokens({ accessToken: 't' });
    net.reply([{ city: 'x' }]);
    expect(await listCityWaitlist()).toEqual([{ city: 'x' }]);
    net.reply({ nope: 1 });
    await expect(listCityWaitlist()).rejects.toThrow('expected an array');
  });
});

describe('contactProvider', () => {
  const net = setupFetch();

  it('contactStatus short-circuits without an id or a session', async () => {
    expect(await contactStatus('')).toBe(NO_CONTACT_GATE);
    expect(await contactStatus('p1')).toBe(NO_CONTACT_GATE);
    expect(net.calls).toHaveLength(0);
  });

  it('contactStatus fetches when signed in and maps 401/404 to the open gate', async () => {
    writeTokens({ accessToken: 't' });
    net.reply({ status: 'approved' });
    expect(await contactStatus('p1')).toEqual({ status: 'approved' });
    expect(net.last()).toMatchObject({ path: '/contacts/status', query: { propertyId: 'p1' } });
    clearReads();
    net.reply(status(404, { message: 'none' }));
    expect(await contactStatus('p1')).toBe(NO_CONTACT_GATE);
  });

  it('contactStatus rethrows other failures', async () => {
    writeTokens({ accessToken: 't' });
    net.reply(status(500, { message: 'down' }));
    await expect(contactStatus('p1')).rejects.toMatchObject({ status: 500 });
  });

  it('requestContact includes the message only when present', async () => {
    await requestContact('p1', 'hello');
    expect(net.last()).toMatchObject({ path: '/contacts/request', method: 'POST', body: { propertyId: 'p1', message: 'hello' } });
    await requestContact('p1');
    expect(net.last().body).toEqual({ propertyId: 'p1' });
  });

  it('myContactRequests unwraps a page', async () => {
    writeTokens({ accessToken: 't' });
    net.reply({ content: [{ id: 1 }], totalElements: 1, totalPages: 1, number: 0, size: 100 });
    expect(await myContactRequests()).toEqual({ items: [{ id: 1 }], page: 0, size: 100, total: 1, totalPages: 1 });
    expect(net.last().query).toEqual({ page: '0', size: '100' });
  });

  it('myContactRequests accepts a bare array', async () => {
    writeTokens({ accessToken: 't' });
    net.reply([{ id: 1 }, { id: 2 }]);
    expect(await myContactRequests({ page: 1, size: 5 })).toEqual({ items: [{ id: 1 }, { id: 2 }], page: 1, size: 5, total: 2, totalPages: 0 });
  });

  it('respondToContactRequest patches with an encoded id', async () => {
    await respondToContactRequest('a b', 'approved');
    expect(net.last()).toMatchObject({ path: '/me/contact-requests/a%20b', method: 'PATCH', body: { status: 'approved' } });
  });
});
