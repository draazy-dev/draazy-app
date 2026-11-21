import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareUpload } from '../../../src/lib/uploads/prepareUpload.js';
import { isBlacklisted } from '../../../src/lib/geoConfig.js';
import { ApiError } from '../../../src/services/http.js';
import { writeUser } from '../../../src/lib/auth.js';
import { getRecentSearches } from '../../../src/lib/localPrefs.js';
import * as adminContent from '../../../src/services/adminContentService.js';
import * as conversation from '../../../src/services/conversationService.js';
import * as demand from '../../../src/services/demandService.js';
import * as document from '../../../src/services/documentService.js';
import * as fees from '../../../src/services/feesService.js';
import * as locality from '../../../src/services/localityService.js';
import * as managed from '../../../src/services/managedService.js';
import * as notification from '../../../src/services/notificationService.js';
import * as outreach from '../../../src/services/outreachService.js';
import * as pageView from '../../../src/services/pageViewService.js';
import * as photo from '../../../src/services/photoService.js';
import * as recentSearch from '../../../src/services/recentSearchService.js';
import * as referral from '../../../src/services/referralService.js';
import * as review from '../../../src/services/reviewService.js';
import * as savedSearch from '../../../src/services/savedSearchService.js';
import * as serviceRequest from '../../../src/services/serviceRequestService.js';
import * as settings from '../../../src/services/settingsService.js';
import * as society from '../../../src/services/societyService.js';

const h = vi.hoisted(() => ({ provider: {}, loadError: null }));

vi.mock('../../../src/services/config.js', () => ({
  API_BASE: '/api',
  createProvider: () => async () => {
    if (h.loadError) throw h.loadError;
    return h.provider;
  },
}));
vi.mock('../../../src/lib/uploads/prepareUpload.js', () => ({ prepareUpload: vi.fn() }));
vi.mock('../../../src/lib/geoConfig.js', () => ({ isBlacklisted: vi.fn() }));

const provider = (methods) => { h.provider = Object.fromEntries(Object.entries(methods).map(([k, v]) => [k, vi.fn(v)])); };

beforeEach(() => {
  h.provider = {};
  h.loadError = null;
  localStorage.clear();
  sessionStorage.clear();
  vi.mocked(isBlacklisted).mockReturnValue(false);
});

describe('adminContentService', () => {
  it('strips server-owned fields from writes without mutating the input', async () => {
    provider({ createContent: async () => 'created', updateContent: async () => 'updated' });
    const body = { id: 1, type: 'faq', archived: false, createdAt: 'x', title: 'T' };
    await adminContent.createContent('faq', body);
    await adminContent.updateContent('faq', 7, body);
    expect(h.provider.createContent).toHaveBeenCalledWith('faq', { title: 'T' });
    expect(h.provider.updateContent).toHaveBeenCalledWith('faq', 7, { title: 'T' });
    expect(body).toHaveProperty('id', 1);
  });

  it('accepts a missing body', async () => {
    provider({ createContent: async () => null });
    await adminContent.createContent('faq');
    expect(h.provider.createContent).toHaveBeenCalledWith('faq', {});
  });
});

describe('conversationService.dropPendingChat', () => {
  it('spreads every key to the provider', async () => {
    provider({ dropPendingChat: async () => null });
    await conversation.dropPendingChat('a', 'b');
    expect(h.provider.dropPendingChat).toHaveBeenCalledWith('a', 'b');
  });
});

describe('demandService.recordSignal', () => {
  it('returns the provider result', async () => {
    provider({ recordSignal: async () => true });
    await expect(demand.recordSignal({ q: 1 })).resolves.toBe(true);
    expect(h.provider.recordSignal).toHaveBeenCalledWith({ q: 1 });
  });

  it('answers false when the provider call or the provider load fails', async () => {
    provider({ recordSignal: async () => { throw new Error('x'); } });
    await expect(demand.recordSignal({})).resolves.toBe(false);
    h.loadError = new Error('chunk');
    await expect(demand.recordSignal({})).resolves.toBe(false);
  });
});

describe('documentService uploads', () => {
  const upload = { file: 'raw', category: 'id' };

  beforeEach(() => {
    vi.mocked(prepareUpload).mockResolvedValue('prepared');
    provider({
      uploadDocument: async () => 'ok', uploadPersonalDocument: async () => 'ok', uploadManagedDocument: async () => 'ok',
    });
  });

  it('prepares the file as a document before uploading', async () => {
    await document.uploadDocument('m', 'p', upload);
    expect(prepareUpload).toHaveBeenCalledWith('raw', { document: true });
    expect(h.provider.uploadDocument).toHaveBeenCalledWith('m', 'p', { file: 'prepared', category: 'id' });
  });

  it('skips preparation when the caller already prepared the file', async () => {
    await document.uploadDocument('m', 'p', { file: 'ready', prepared: true });
    expect(prepareUpload).not.toHaveBeenCalled();
    expect(h.provider.uploadDocument).toHaveBeenCalledWith('m', 'p', { file: 'ready', prepared: true });
  });

  it('prepares personal and managed uploads', async () => {
    await document.uploadPersonalDocument(upload);
    await document.uploadManagedDocument('m', 'mid', upload);
    expect(h.provider.uploadPersonalDocument).toHaveBeenCalledWith({ file: 'prepared', category: 'id' });
    expect(h.provider.uploadManagedDocument).toHaveBeenCalledWith('m', 'mid', { file: 'prepared', category: 'id' });
  });

  it('does not upload when preparation fails', async () => {
    vi.mocked(prepareUpload).mockRejectedValue(new Error('too big'));
    await expect(document.uploadPersonalDocument(upload)).rejects.toThrow('too big');
    expect(h.provider.uploadPersonalDocument).not.toHaveBeenCalled();
  });
});

describe('feesService.getDealFees', () => {
  it('finds the fee row for a deal', async () => {
    provider({ listFees: async () => [{ deal: 'rent', fee: 1 }, { deal: 'buy', fee: 2 }] });
    await expect(fees.getDealFees('buy')).resolves.toEqual({ deal: 'buy', fee: 2 });
    await expect(fees.getDealFees('lease')).resolves.toBeNull();
  });

  it('treats a non-array answer as no fees', async () => {
    provider({ listFees: async () => ({ deal: 'buy' }) });
    await expect(fees.getDealFees('buy')).resolves.toBeNull();
  });
});

describe('localityService.localitiesIn', () => {
  it('searches each distinct word of four or more letters and merges hits by slug', async () => {
    provider({
      searchLocalities: async (q) => ({
        baner: [{ slug: 'baner', name: 'Baner' }],
        road: [{ slug: 'baner', name: 'Baner again' }, { slug: 'road', name: 'Road' }],
      })[q] ?? [],
    });
    const result = await locality.localitiesIn('Near BANER road, baner at 12 km');
    expect(h.provider.searchLocalities.mock.calls.map(([q]) => q)).toEqual(['near', 'baner', 'road']);
    expect(result).toEqual([{ slug: 'baner', name: 'Baner again' }, { slug: 'road', name: 'Road' }]);
  });

  it('caps the lookups at eight words and survives a failing search', async () => {
    provider({
      searchLocalities: async (q) => {
        if (q === 'aaaa') throw new Error('down');
        return [{ slug: q }];
      },
    });
    const text = 'aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj';
    const result = await locality.localitiesIn(text);
    expect(h.provider.searchLocalities).toHaveBeenCalledTimes(8);
    expect(result.map((l) => l.slug)).toEqual(['bbbb', 'cccc', 'dddd', 'eeee', 'ffff', 'gggg', 'hhhh']);
  });

  it('does nothing for empty or short text', async () => {
    provider({ searchLocalities: async () => [] });
    await expect(locality.localitiesIn(null)).resolves.toEqual([]);
    await expect(locality.localitiesIn('a b 12')).resolves.toEqual([]);
    expect(h.provider.searchLocalities).not.toHaveBeenCalled();
  });
});

describe('managedService and outreachService defaults', () => {
  it('lists six months of rent receipts by default', async () => {
    provider({ listRentReceipts: async () => [] });
    await managed.listRentReceipts('p1');
    await managed.listRentReceipts('p1', 12);
    expect(h.provider.listRentReceipts).toHaveBeenNthCalledWith(1, 'p1', 6);
    expect(h.provider.listRentReceipts).toHaveBeenNthCalledWith(2, 'p1', 12);
  });

  it('defaults outreach templates to the whatsapp channel', async () => {
    provider({ listOutreachTemplates: async () => [] });
    await outreach.listOutreachTemplates();
    await outreach.listOutreachTemplates('sms');
    expect(h.provider.listOutreachTemplates).toHaveBeenNthCalledWith(1, 'whatsapp');
    expect(h.provider.listOutreachTemplates).toHaveBeenNthCalledWith(2, 'sms');
  });
});

describe('notificationService preferences', () => {
  it('merges a patch over the current preferences, quiet hours included', async () => {
    const current = { email: true, sms: false, quietHours: { enabled: false, start: '22:00', end: '07:00' } };
    provider({ getNotificationPreferences: async () => current, updateNotificationPreferences: async (n) => n });
    const next = await notification.updateNotificationPreferences({ sms: true, quietHours: { enabled: true } });
    expect(next).toEqual({ email: true, sms: true, quietHours: { enabled: true, start: '22:00', end: '07:00' } });
    expect(current.sms).toBe(false);
  });

  it('keeps the current quiet hours when the patch has none', async () => {
    const current = { quietHours: { enabled: true, start: '23:00', end: '06:00' } };
    provider({ getNotificationPreferences: async () => current, updateNotificationPreferences: async (n) => n });
    expect(await notification.updateNotificationPreferences({ language: 'hi' })).toEqual({
      quietHours: { enabled: true, start: '23:00', end: '06:00' }, language: 'hi',
    });
  });

  it('exposes frozen defaults', () => {
    expect(Object.isFrozen(notification.NOTIFICATION_PREFERENCE_DEFAULTS)).toBe(true);
    expect(Object.isFrozen(notification.NOTIFICATION_PREFERENCE_DEFAULTS.quietHours)).toBe(true);
  });
});

describe('pageViewService.recordPageViews', () => {
  it('sends the batch and resolves to nothing', async () => {
    provider({ recordPageViews: async () => 'ignored' });
    await expect(pageView.recordPageViews([{ p: 1 }])).resolves.toBeUndefined();
    expect(h.provider.recordPageViews).toHaveBeenCalledWith([{ p: 1 }]);
  });

  it('never lets tracking failures reach the caller', async () => {
    provider({ recordPageViews: async () => { throw new Error('x'); } });
    await expect(pageView.recordPageViews([])).resolves.toBeUndefined();
    h.loadError = new Error('chunk');
    await expect(pageView.recordPageViews([])).resolves.toBeUndefined();
  });
});

describe('photoService.uploadPhoto', () => {
  it('uploads the prepared file and attaches the look analysis', async () => {
    vi.mocked(prepareUpload).mockResolvedValue({ file: 'small', look: { blur: 0 } });
    provider({ uploadPhoto: async () => ({ id: 'ph1' }) });
    const options = { slot: 2 };
    await expect(photo.uploadPhoto('raw', options)).resolves.toEqual({ id: 'ph1', look: { blur: 0 } });
    expect(prepareUpload).toHaveBeenCalledWith('raw', { slot: 2, withLook: true });
    expect(h.provider.uploadPhoto).toHaveBeenCalledWith('small', options);
  });

  it('marks a preparation failure as not retryable but leaves aborts alone', async () => {
    provider({ uploadPhoto: async () => ({}) });
    const failure = new Error('bad image');
    vi.mocked(prepareUpload).mockRejectedValueOnce(failure);
    await expect(photo.uploadPhoto('raw')).rejects.toBe(failure);
    expect(failure.retryable).toBe(false);
    const abort = new DOMException('stop', 'AbortError');
    vi.mocked(prepareUpload).mockRejectedValueOnce(abort);
    await expect(photo.uploadPhoto('raw')).rejects.toBe(abort);
    expect(abort.retryable).toBeUndefined();
    expect(h.provider.uploadPhoto).not.toHaveBeenCalled();
  });

  it('does not upload when the caller aborted while the provider loaded', async () => {
    vi.mocked(prepareUpload).mockResolvedValue({ file: 'small', look: null });
    provider({ uploadPhoto: async () => ({}) });
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(photo.uploadPhoto('raw', { signal: ctrl.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(h.provider.uploadPhoto).not.toHaveBeenCalled();
  });
});

describe('recentSearchService', () => {
  const rec = { label: 'Baner', url: '/listings?q=baner' };

  it('keeps recent searches on the device for signed-out visitors', async () => {
    provider({ listRecentSearches: async () => ['server'], recordRecentSearch: async () => ['server'] });
    await recentSearch.recordRecentSearch(rec);
    expect(await recentSearch.listRecentSearches()).toEqual(getRecentSearches());
    expect(getRecentSearches()).toEqual([expect.objectContaining(rec)]);
    expect(h.provider.recordRecentSearch).not.toHaveBeenCalled();
    expect(h.provider.listRecentSearches).not.toHaveBeenCalled();
  });

  it('uses the account store for signed-in users', async () => {
    writeUser({ mobile: '9876543210' });
    provider({ listRecentSearches: async () => ['server'], recordRecentSearch: async () => ['saved'] });
    await expect(recentSearch.listRecentSearches()).resolves.toEqual(['server']);
    await expect(recentSearch.recordRecentSearch(rec)).resolves.toEqual(['saved']);
    expect(h.provider.recordRecentSearch).toHaveBeenCalledWith(rec);
  });

  it('ignores records without a label or url', async () => {
    provider({ recordRecentSearch: async () => ['x'] });
    await expect(recentSearch.recordRecentSearch(null)).resolves.toEqual([]);
    await expect(recentSearch.recordRecentSearch({ label: 'x' })).resolves.toEqual([]);
    await expect(recentSearch.recordRecentSearch({ url: '/x' })).resolves.toEqual([]);
    expect(h.provider.recordRecentSearch).not.toHaveBeenCalled();
    expect(getRecentSearches()).toEqual([]);
  });
});

describe('referralService', () => {
  it('sends invites through the sendReferralInvite provider method', async () => {
    provider({ sendReferralInvite: async () => 'sent' });
    await expect(referral.sendInvite('98')).resolves.toBe('sent');
    expect(h.provider.sendReferralInvite).toHaveBeenCalledWith('98');
  });

  describe('referralLink', () => {
    const origin = window.location.origin;

    it('builds a signup link with the encoded code', () => {
      expect(referral.referralLink(' AB C/1 ')).toBe(`${origin}/signup?ref=AB%20C%2F1`);
    });

    it('appends the encoded share channel', () => {
      expect(referral.referralLink('X', 'whats app')).toBe(`${origin}/signup?ref=X&ch=whats%20app`);
    });

    it('returns an empty link without a code', () => {
      expect(referral.referralLink('')).toBe('');
      expect(referral.referralLink('   ')).toBe('');
      expect(referral.referralLink(null)).toBe('');
    });
  });
});

describe('reviewService.reviewRefusal', () => {
  const t = (key) => `t:${key}`;

  it('translates the already-reviewed refusal', () => {
    expect(review.reviewRefusal({ code: 'already_reviewed' }, t)).toBe('t:common.alreadyReviewed');
  });

  it('shows the server wording for an ineligible reviewer', () => {
    const err = new ApiError({ code: 'review_not_eligible', message: 'Only tenants can review', status: 403 });
    expect(review.reviewRefusal(err, t)).toBe('Only tenants can review');
  });

  it('returns null when an ineligible refusal has no readable message', () => {
    expect(review.reviewRefusal(new ApiError({ code: 'review_not_eligible', status: 403 }), t)).toBeNull();
  });

  it('returns null for anything else', () => {
    expect(review.reviewRefusal({ code: 'other' }, t)).toBeNull();
    expect(review.reviewRefusal(undefined, t)).toBeNull();
  });
});

describe('savedSearchService.setAlertFrequency', () => {
  it.each(['off', 'instant', 'daily', 'weekly'])('accepts %s', async (frequency) => {
    provider({ updateSavedSearch: async () => 'ok' });
    await savedSearch.setAlertFrequency('s1', frequency);
    expect(h.provider.updateSavedSearch).toHaveBeenCalledWith('s1', { alertFrequency: frequency });
  });

  it('rejects an unknown frequency before calling the provider', async () => {
    provider({ updateSavedSearch: async () => 'ok' });
    await expect(savedSearch.setAlertFrequency('s1', 'hourly')).rejects.toThrow('Unknown alert frequency: hourly');
    expect(h.provider.updateSavedSearch).not.toHaveBeenCalled();
  });

  it('uses a default frequency that is one of the allowed ones', () => {
    expect(savedSearch.ALERT_FREQUENCIES).toContain(savedSearch.DEFAULT_ALERT_FREQUENCY);
  });
});

describe('serviceRequestService argument shaping', () => {
  beforeEach(() => {
    provider({
      createCoFillServiceRequest: async () => 'a', inviteServiceRequestParty: async () => 'b', addServiceRequestDocFromVault: async () => 'c',
    });
  });

  it('forwards only the named co-fill fields', async () => {
    await serviceRequest.createCoFillServiceRequest({ request: 'r', role: 'tenant', mobile: '9', extra: 1 });
    expect(h.provider.createCoFillServiceRequest).toHaveBeenCalledWith({ request: 'r', role: 'tenant', mobile: '9' });
  });

  it('forwards only role, mobile and partyIndex when inviting', async () => {
    await serviceRequest.inviteServiceRequestParty('id1', { role: 'owner', mobile: '9', partyIndex: 1, extra: 1 });
    expect(h.provider.inviteServiceRequestParty).toHaveBeenCalledWith('id1', { role: 'owner', mobile: '9', partyIndex: 1 });
  });

  it('forwards only documentId and category from the vault', async () => {
    await serviceRequest.addServiceRequestDocFromVault('id1', { documentId: 'd', category: 'c', extra: 1 });
    expect(h.provider.addServiceRequestDocFromVault).toHaveBeenCalledWith('id1', { documentId: 'd', category: 'c' });
  });
});

describe('settingsService defaults', () => {
  it('ships deeply frozen pricing and grievance defaults', () => {
    expect(Object.isFrozen(settings.PRICING_DEFAULTS)).toBe(true);
    expect(Object.isFrozen(settings.PRICING_DEFAULTS.referral)).toBe(true);
    expect(Object.isFrozen(settings.PRICING_DEFAULTS.refunds)).toBe(true);
    expect(Object.isFrozen(settings.GRIEVANCE_OFFICER_DEFAULT)).toBe(true);
    expect(settings.PRICING_DEFAULTS.listingPass).toBeLessThan(settings.PRICING_DEFAULTS.listingPassBuy);
  });
});

describe('societyService', () => {
  const rows = [
    { name: 'Zeta Heights', localitySlug: 'baner' },
    { name: 'Alpha Court', localitySlug: 'wakad' },
    { name: 'Beta Villas', localitySlug: 'baner-road' },
    { name: 'Gamma Park', localitySlug: 'balewadi' },
  ];

  it('ranks societies in the named locality first, then alphabetically', async () => {
    provider({ searchSocieties: async () => rows });
    const out = await society.searchSocieties('x', 'Baner Road');
    expect(out.map((s) => s.name)).toEqual(['Beta Villas', 'Zeta Heights', 'Alpha Court', 'Gamma Park']);
  });

  it('sorts alphabetically without a locality and passes the mapped flag', async () => {
    provider({ searchSocieties: async () => rows });
    const out = await society.searchSocieties('x', '', { mapped: true });
    expect(out.map((s) => s.name)).toEqual(['Alpha Court', 'Beta Villas', 'Gamma Park', 'Zeta Heights']);
    expect(h.provider.searchSocieties).toHaveBeenCalledWith('x', { mapped: true });
    await society.searchSocieties('x');
    expect(h.provider.searchSocieties).toHaveBeenLastCalledWith('x', { mapped: false });
  });

  it('drops blacklisted names and caps the list at 20', async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ name: `S${String(i).padStart(2, '0')}` }));
    provider({ searchSocieties: async () => many });
    vi.mocked(isBlacklisted).mockImplementation(({ name }) => name === 'S00');
    const out = await society.searchSocieties('x');
    expect(out).toHaveLength(20);
    expect(out[0].name).toBe('S01');
  });

  it('treats a non-array answer as no results', async () => {
    provider({ searchSocieties: async () => null });
    await expect(society.searchSocieties('x')).resolves.toEqual([]);
  });

  it('refuses to mint a society without a Google place id', async () => {
    provider({ mintSociety: async () => 'minted' });
    await expect(society.mintSociety({ name: 'X' })).rejects.toThrow('mintSociety needs a Google placeId');
    await expect(society.mintSociety()).rejects.toThrow('mintSociety needs a Google placeId');
    await expect(society.mintSociety({ placeId: 'p' })).resolves.toBe('minted');
  });

  it('resolves a society from only the place fields', async () => {
    provider({ resolveSociety: async () => 'r' });
    await society.resolveSociety({ placeId: 'p', name: 'n', lat: 1, lng: 2, junk: true });
    expect(h.provider.resolveSociety).toHaveBeenCalledWith({ placeId: 'p', name: 'n', lat: 1, lng: 2 });
  });
});
