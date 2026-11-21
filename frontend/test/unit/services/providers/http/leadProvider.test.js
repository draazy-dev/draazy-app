import { describe, expect, it } from 'vitest';
import { setupFetch, status } from '../net.js';
import * as leads from '../../../../../src/services/providers/http/leadProvider.js';

describe('leadProvider', () => {
  const net = setupFetch({ signedIn: true });
  const lead = { id: 'l1', name: 'A' };
  const normalised = {
    id: 'l1', name: 'A', interests: [], sources: [], signals: [], activities: [], conversions: [], profile: { propertyTypes: [], bhk: [] },
  };

  it('listLeads sends the default view and optional filters', async () => {
    net.reply({ content: [lead], totalElements: 9, counts: { new: 1 } });
    const res = await leads.listLeads({ q: 'x', stage: 'new', type: 'buyer' });
    expect(net.last().query).toEqual({ view: 'mine', page: '0', size: '20', q: 'x', stage: 'new', type: 'buyer' });
    expect(res).toEqual({ items: [normalised], total: 9, counts: { new: 1 } });
  });

  it('listLeads tolerates a malformed page', async () => {
    net.reply({ content: 'nope' });
    expect(await leads.listLeads({ view: 'all' })).toEqual({ items: [], total: 0, counts: null });
    expect(net.last().query.view).toBe('all');
  });

  it('getLead keeps lead data and fills the profile arrays', async () => {
    net.reply({ id: 'l/1', interests: ['x'], profile: { budget: 5, bhk: [2] } });
    expect(await leads.getLead('l/1')).toMatchObject({ interests: ['x'], profile: { budget: 5, bhk: [2], propertyTypes: [] } });
    expect(net.last().path).toBe('/admin/leads/l%2F1');
    net.reply(null);
    expect(await leads.getLead('l2')).toBeNull();
  });

  it('addLead reports whether the lead already existed', async () => {
    net.reply(status(201, lead));
    expect(await leads.addLead({ name: 'A' })).toEqual({ lead: normalised, existing: false });
    expect(net.last()).toMatchObject({ path: '/admin/leads', method: 'POST', body: { name: 'A' } });
    net.reply(lead);
    expect((await leads.addLead({ name: 'A' })).existing).toBe(true);
  });

  it.each([
    ['claimLead', ['l1'], '/admin/leads/l1/claim', 'POST', undefined],
    ['releaseLead', ['l1'], '/admin/leads/l1/release', 'POST', undefined],
    ['assignLead', ['l1', 's9'], '/admin/leads/l1/assign', 'POST', { staffId: 's9' }],
    ['logLeadContact', ['l1', { channel: 'call' }], '/admin/leads/l1/contacts', 'POST', { channel: 'call' }],
    ['changeLeadStage', ['l1', { stage: 'won' }], '/admin/leads/l1/stage', 'POST', { stage: 'won' }],
    ['setLeadInterests', ['l1', ['a']], '/admin/leads/l1/interests', 'PUT', { interests: ['a'] }],
    ['setLeadProfile', ['l1', { budget: 1 }], '/admin/leads/l1/profile', 'PUT', { budget: 1 }],
    ['addLeadNote', ['l1', 'hello'], '/admin/leads/l1/notes', 'POST', { body: 'hello' }],
    ['convertLead', ['l1', 'sr1'], '/admin/leads/l1/conversions', 'POST', { serviceRequestId: 'sr1' }],
  ])('%s hits %s and returns a normalised lead', async (fn, args, path, method, body) => {
    net.reply(lead);
    expect(await leads[fn](...args)).toEqual(normalised);
    expect(net.last()).toMatchObject({ path, method });
    if (body !== undefined) expect(net.last().body).toEqual(body);
  });

  it('assignees and convertible lists default to []', async () => {
    net.reply([{ id: 's' }]);
    expect(await leads.listLeadAssignees()).toEqual([{ id: 's' }]);
    net.reply({});
    expect(await leads.listLeadAssignees()).toEqual([]);
    net.reply([{ id: 'sr' }]);
    expect(await leads.listConvertible('l1')).toEqual([{ id: 'sr' }]);
    expect(net.last().path).toBe('/admin/leads/l1/convertible');
    net.reply(null);
    expect(await leads.listConvertible('l1')).toEqual([]);
  });

  it('creditConversion patches the conversion', async () => {
    await leads.creditConversion('c/1', 's2');
    expect(net.last()).toMatchObject({ path: '/admin/leads/conversions/c%2F1', method: 'PATCH', body: { creditedTo: 's2' } });
  });

  it('getLeadPerformance defaults the window', async () => {
    net.reply({ rows: [{ a: 1 }], totals: { t: 1 } });
    expect(await leads.getLeadPerformance()).toEqual({ days: 30, rows: [{ a: 1 }], totals: { t: 1 } });
    expect(net.last().query).toEqual({ days: '30' });
    net.reply(null);
    expect(await leads.getLeadPerformance(7)).toEqual({ days: 7, rows: [], totals: null });
  });
});
