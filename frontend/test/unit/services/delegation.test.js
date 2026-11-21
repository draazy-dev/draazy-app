import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/services/config.js', () => ({
  API_BASE: '/api',
  createProvider: (domain) => async () => new Proxy({}, {
    get: (_target, method) => (method === 'then' ? undefined : (...args) => ({ domain, method, args })),
  }),
}));

const modules = import.meta.glob('../../../src/services/*Service.js', { eager: true });

const NOT_PLAIN = new Set([
  'meBootstrapService', 'meDashboardService', 'permissionsService',
]);

const METHOD_ALIAS = { sendInvite: 'sendReferralInvite' };

const OWN_LOGIC = new Set([
  'createContent', 'updateContent', 'recordSignal', 'uploadDocument', 'uploadPersonalDocument', 'uploadManagedDocument',
  'getDealFees', 'localitiesIn', 'updateNotificationPreferences', 'recordPageViews', 'uploadPhoto',
  'listRecentSearches', 'recordRecentSearch', 'referralLink', 'reviewRefusal', 'setAlertFrequency',
  'searchSocieties', 'mintSociety', 'resolveSociety', 'createCoFillServiceRequest', 'inviteServiceRequestParty',
  'addServiceRequestDocFromVault', 'listRentReceipts', 'listOutreachTemplates', 'dropPendingChat',
]);

const entries = Object.entries(modules)
  .map(([path, mod]) => [path.match(/([^/]+)Service\.js$/)[1], mod])
  .filter(([stem]) => !NOT_PLAIN.has(`${stem}Service`))
  .flatMap(([stem, mod]) => Object.entries(mod)
    .filter(([name, value]) => typeof value === 'function' && !OWN_LOGIC.has(name))
    .map(([name, fn]) => [stem, name, fn]));

const argsFor = (name, fn) => {
  const variadic = fn.toString().includes('...args');
  return Array.from({ length: variadic ? 3 : fn.length }, (_, i) => ({ arg: `${name}#${i}` }));
};

describe('service facades delegate to their provider', () => {
  it('found a realistic number of delegating exports', () => {
    expect(entries.length).toBeGreaterThan(400);
  });

  it.each(entries)('%s: %s forwards its arguments to the same-named provider method', async (stem, name, fn) => {
    const args = argsFor(name, fn);
    const result = await fn(...args);
    expect(result).toEqual({
      domain: stem,
      method: METHOD_ALIAS[name] ?? name,
      args,
    });
  });
});
