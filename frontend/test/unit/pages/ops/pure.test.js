import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../../../src/lib/openDoc.js', () => ({ openDocFrom: vi.fn(async (fn) => fn()) }));
vi.mock('../../../../src/services/serviceRequestService.js', () => ({ getServiceRequestDocumentUrl: vi.fn(async (r, d) => `url:${r}:${d}`) }));

import { openDocFrom } from '../../../../src/lib/openDoc.js';
import { STAGES, papersVerified, stagesDone, nextStep, caseSummary } from '../../../../src/pages/ops/rent-agreement/stages.js';
import { fmtAgo, openRequestDoc } from '../../../../src/pages/ops/service-queue/helpers.js';
import {
  DOC_LABELS, DOC_OPTIONS, CHECKLISTS, DEFAULT_CHECKLIST, REJECTION_LABELS, STAFF_REASONS, NOTE_REQUIRED_REASONS,
  STATUS_LABELS, CLAIM_HOLD_LIMIT, docLabel, reasonLabel, dateLabel, sameId, errorCode, errorMessage, normalizedName, elapsed,
} from '../../../../src/pages/ops/kyc/vocabulary.js';
import { TAB_IDS, REVIEW_CATS, REVIEW_CAT_KEYS, HERO, SOC_AMEN, NOW_YEAR, titleCase } from '../../../../src/pages/consumer/society/constants.js';
import { ApiError } from '../../../../src/services/http.js';

afterEach(() => { vi.useRealTimers(); });

describe('rent-agreement stages', () => {
  const verified = { total: 2, ready: 2, items: [{ review: 'verified' }, { review: 'verified' }] };

  it('knows when papers are verified', () => {
    expect(papersVerified(verified)).toBe(true);
    expect(papersVerified({ items: [{ review: 'verified' }, { review: 'pending' }] })).toBe(false);
    expect(papersVerified({ items: [] })).toBe(false);
    expect(papersVerified(null)).toBe(false);
  });

  it.each([
    ['submitted', null, 1],
    ['docs_review', null, 2],
    ['docs_review', verified, 3],
    ['action_required', verified, 3],
    ['draft_shared', null, 4],
    ['changes_requested', null, 4],
    ['approved', null, 5],
    ['completed', null, 7],
    ['awaiting_payment', null, 0],
  ])('counts stages done for %s', (status, checklist, expected) => {
    expect(stagesDone({ status }, checklist)).toBe(expected);
    expect(expected).toBeLessThanOrEqual(STAGES.length);
  });

  it.each([
    [{ status: 'submitted' }, null, 'desk', /Take the case/],
    [{ status: 'docs_review' }, null, 'desk', /Verify papers/],
    [{ status: 'docs_review' }, { total: 3, ready: 1, items: [] }, 'customer', /Waiting for 2 paper/],
    [{ status: 'docs_review' }, verified, 'desk', /prepare and share/],
    [{ status: 'docs_review' }, { total: 1, ready: 1, items: [{ review: 'pending' }] }, 'desk', /Verify or reject/],
    [{ status: 'action_required', attention: { party: 'tenant' } }, null, 'customer', /the tenant for a correction/],
    [{ status: 'action_required' }, null, 'customer', /the customer for a correction/],
    [{ status: 'draft_shared' }, null, 'customer', /every party/],
    [{ status: 'changes_requested' }, null, 'desk', /revise/],
    [{ status: 'approved' }, null, 'desk', /Book the registration/],
    [{ status: 'completed' }, null, 'done', /All done/],
    [{ status: 'cancelled' }, null, 'done', /Cancelled/],
    [{ status: 'awaiting_payment' }, null, 'customer', /Awaiting payment/],
  ])('suggests the next step for %j', (request, checklist, who, text) => {
    const step = nextStep(request, checklist);
    expect(step.who).toBe(who);
    expect(step.text).toMatch(text);
  });

  it('summarises case details from the saved form state', () => {
    expect(caseSummary({
      _state: {
        owner: { oName: ' Asha ' },
        tenants: [{ name: 'Ravi' }, { name: '' }, { name: 'Sita' }],
        prop: { flatNo: '12', society: 'Sky', locality: 'Baner' },
        terms: { rent: '20,000', deposit: '60000', months: 11 },
      },
    })).toEqual({ owner: 'Asha', tenants: 'Ravi, Sita', flat: '12, Sky', locality: 'Baner', rent: 20000, deposit: 60000, months: '11' });
  });

  it('falls back to the flat details fields', () => {
    expect(caseSummary({ ownerName: 'O', tenants: 'T1', property: 'Flat 1', location: 'Wakad', rent: '15,000', deposit: 30000, months: '12' }))
      .toEqual({ owner: 'O', tenants: 'T1', flat: 'Flat 1', locality: 'Wakad', rent: 15000, deposit: 30000, months: '12' });
    expect(caseSummary(null)).toEqual({ owner: '', tenants: '', flat: '', locality: '', rent: 0, deposit: 0, months: '' });
    expect(caseSummary({ _state: { tenants: 'x', prop: [], terms: { rent: {} } }, rent: 'abc' })).toMatchObject({ tenants: '', rent: 0 });
  });
});

describe('service-queue helpers', () => {
  it('opens a request document through its signed url', async () => {
    await expect(openRequestDoc('R1', 'D1')).resolves.toBe('url:R1:D1');
    expect(openDocFrom).toHaveBeenCalledTimes(1);
  });

  it('formats relative times', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
    const ago = (ms) => fmtAgo(Date.now() - ms);
    expect(fmtAgo(0)).toBe('');
    expect(ago(5_000)).toBe('just now');
    expect(ago(5 * 60_000)).toBe('5m ago');
    expect(ago(3 * 3600_000)).toBe('3h ago');
    expect(ago(4 * 86400_000)).toBe('4d ago');
    expect(ago(40 * 86400_000)).toBe(new Date(Date.now() - 40 * 86400_000).toLocaleDateString('en-IN'));
  });
});

describe('kyc vocabulary', () => {
  it('labels documents and reasons with a readable fallback', () => {
    expect(docLabel('aadhaar')).toBe('Aadhaar');
    expect(docLabel('ration_card')).toBe('ration card');
    expect(docLabel('')).toBe('\u2014');
    expect(reasonLabel('blurry')).toBe(REJECTION_LABELS.blurry);
    expect(reasonLabel('bad_light')).toBe('bad light');
    expect(reasonLabel(null)).toBe('\u2014');
  });

  it('formats dates and compares ids', () => {
    expect(dateLabel(null)).toBe('\u2014');
    expect(dateLabel('2026-01-02T03:04:05Z')).toBe(new Date('2026-01-02T03:04:05Z').toLocaleString());
    expect(sameId(5, '5')).toBe(true);
    expect(sameId(5, 6)).toBe(false);
    expect(sameId(null, null)).toBe(false);
    expect(sameId(0, 0)).toBe(false);
  });

  it('normalises error codes and picks a friendly message', () => {
    expect(errorCode({ code: 'IDENTITY_CASE_CLAIMED' })).toBe('identity_case_claimed');
    expect(errorCode(null)).toBe('');
    expect(errorMessage({ code: 'identity_case_claim_limit' }, 'x')).toContain(`${CLAIM_HOLD_LIMIT} cases`);
    expect(errorMessage({ code: 'identity_pose_unconfirmed' }, 'x')).toMatch(/pose/);
    expect(errorMessage(new ApiError({ code: 'other', message: 'Server says no', status: 400 }), 'fallback')).toBe('Server says no');
    expect(errorMessage(new Error('boom'), 'fallback')).toBe('fallback');
  });

  it('normalises names', () => {
    expect(normalizedName('  Asha   RAO ')).toBe('asha rao');
    expect(normalizedName(null)).toBe('');
  });

  it('reports elapsed time and its urgency tone', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
    const at = (hours) => Date.now() - hours * 3600_000;
    expect(elapsed(0)).toBeNull();
    expect(elapsed(Date.now())).toEqual({ text: '1m', tone: 'ok' });
    expect(elapsed(at(0.5))).toEqual({ text: '30m', tone: 'ok' });
    expect(elapsed(at(5))).toEqual({ text: '5h', tone: 'ok' });
    expect(elapsed(at(30))).toEqual({ text: '30h', tone: 'warn' });
    expect(elapsed(at(72))).toEqual({ text: '3d', tone: 'breach' });
    expect(elapsed(Date.now() + 5000)).toEqual({ text: '1m', tone: 'ok' });
  });

  it('keeps the static vocabulary consistent', () => {
    expect(DOC_OPTIONS.map((o) => o.value).filter(Boolean)).toEqual(Object.keys(DOC_LABELS));
    expect(Object.keys(CHECKLISTS)).toEqual(Object.keys(DOC_LABELS));
    expect(DEFAULT_CHECKLIST.length).toBeGreaterThan(0);
    STAFF_REASONS.forEach((r) => expect(REJECTION_LABELS[r]).toBeTruthy());
    NOTE_REQUIRED_REASONS.forEach((r) => expect(STAFF_REASONS).toContain(r));
    expect(Object.keys(STATUS_LABELS)).toContain('pending');
  });
});

describe('society constants', () => {
  it('title-cases slugs', () => {
    expect(titleCase('kalyani-nagar')).toBe('Kalyani Nagar');
    expect(titleCase(null)).toBe('');
  });

  it('keeps tabs, categories and heroes aligned', () => {
    expect(TAB_IDS).toEqual(['overview', 'homes', 'reviews', 'location']);
    expect(REVIEW_CATS.every((c) => REVIEW_CAT_KEYS[c])).toBe(true);
    expect(HERO.length).toBeGreaterThan(0);
    expect(Object.values(SOC_AMEN).every((v) => v.length === 2)).toBe(true);
    expect(NOW_YEAR).toBe(new Date().getFullYear());
  });
});
