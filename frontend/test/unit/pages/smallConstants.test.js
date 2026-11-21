import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';

const h = vi.hoisted(() => ({ user: { id: 1 }, can: true }));
vi.mock('../../../src/context/AuthContext.jsx', () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock('../../../src/lib/adminModules.js', () => ({ hasPermission: vi.fn(() => h.can) }));

import useDeskTickets from '../../../src/pages/admin/useDeskTickets.js';
import * as pob from '../../../src/pages/admin/post-on-behalf/constants.js';
import * as enq from '../../../src/pages/admin/enquiries/constants.js';
import { TABS, TAB_ALIAS, REVIEW_STATUS_MAP, buildDashboardGroups } from '../../../src/pages/consumer/dashboard/constants.js';
import { passportChecklist, passportPercent, publishHref } from '../../../src/pages/consumer/owner-hub/helpers.js';
import * as ownerHub from '../../../src/pages/consumer/owner-hub/constants.js';
import { FAQS } from '../../../src/pages/consumer/home/constants.js';

beforeEach(() => { h.can = true; });

describe('useDeskTickets', () => {
  const mount = (url, count) => renderHook(() => ({ d: useDeskTickets(count), loc: useLocation() }), {
    wrapper: ({ children }) => React.createElement(MemoryRouter, { initialEntries: [url] }, children),
  });

  it('returns null without permission', () => {
    h.can = false;
    expect(mount('/admin').result.current.d).toBeNull();
  });

  it('exposes the tickets tab and switches the view', () => {
    const { result } = mount('/admin', 4);
    expect(result.current.d).toMatchObject({ on: false, tab: { key: 'tickets', label: 'Customer tickets', count: 4 } });
    act(() => result.current.d.show());
    expect(result.current.loc.search).toBe('?view=tickets');
    expect(result.current.d.on).toBe(true);
  });

  it('defaults the ticket count to null', () => {
    expect(mount('/admin?view=tickets').result.current.d).toMatchObject({ on: true, tab: { count: null } });
  });
});

describe('post-on-behalf constants', () => {
  it('describes the wizard', () => {
    expect(pob.LAST_STEP).toBe(pob.STEPS.length);
    expect(pob.STEPS.map((s) => s.id)).toEqual([1, 2, 3, 4]);
    expect(pob.INITIAL_FORM).toMatchObject({ deal: 'rent', furnishing: 'unfurnished', possession: 'ready', photos: [], lat: null });
    expect(pob.LAND_TYPES.every((t) => pob.NONRES_TYPES.includes(t))).toBe(true);
    expect(pob.bhkOptions).toHaveLength(5);
    expect(pob.furnishingOptions.map((o) => o.value)).toEqual(['unfurnished', 'semi', 'furnished']);
    expect(pob.possessionOptions.map((o) => o.value)).toEqual(['ready', 'new', 'under']);
    expect(pob.shellTypeOptions.every((o) => 'value' in o && 'label' in o)).toBe(true);
    expect(pob.typeOptions.length).toBeGreaterThan(0);
    expect(pob.DRAFT_KEY).toBe('dz_pob_draft_v2');
    expect([pob.fld, pob.label, pob.errCls].every((c) => typeof c === 'string')).toBe(true);
  });
});

describe('enquiry constants', () => {
  it('lists the status filters', () => {
    expect(enq.ENQUIRY_STATUS_OPTS[0]).toEqual(['', 'All']);
    expect(enq.VISIT_STATUS_OPTS.map((o) => o[0])).toContain('no-show');
    expect(enq.DEAL_STATUS_OPTS).toHaveLength(4);
    expect(enq.DEAL_TYPE_OPTS.map((o) => o[0])).toEqual(['', 'rent', 'buy']);
    expect(enq.AWAITING_STATUSES).toEqual(['pending']);
  });
});

describe('dashboard constants', () => {
  const visible = (ids) => ids.map((tab) => TABS.find((t) => t.tab === tab) || { tab });
  const ALL = TABS.map((t) => t.tab);

  it('aliases point at known tabs', () => {
    Object.values(TAB_ALIAS).filter((a) => a.tab).forEach((a) => expect(ALL).toContain(a.tab));
    expect(REVIEW_STATUS_MAP.in_review.label).toBe('Under review');
  });

  it('groups owner tabs', () => {
    const groups = buildDashboardGroups({ visibleTabs: visible(ALL), isOwner: true, showRental: true, hasRentalGroup: false });
    expect(groups.map((g) => g.id)).toEqual(['home', 'requests', 'properties', 'account']);
    expect(groups.at(-1).sections.map((s) => s.tab)).toEqual(['profile', 'billing', 'activity', 'rental']);
    const withRental = buildDashboardGroups({ visibleTabs: visible(ALL), isOwner: true, showRental: true, hasRentalGroup: true });
    expect(withRental.map((g) => g.id)).toContain('rental');
    expect(withRental.at(-1).sections.map((s) => s.tab)).not.toContain('rental');
  });

  it('groups seeker tabs and drops empty groups', () => {
    const groups = buildDashboardGroups({ visibleTabs: visible(ALL), isOwner: false, showRental: false, hasRentalGroup: false });
    expect(groups.map((g) => g.id)).toEqual(['home', 'alerts', 'requests', 'account']);
    expect(groups.at(-1).sections.map((s) => s.tab)).toEqual(['profile', 'billing', 'documents', 'finances', 'properties']);
    const sparse = buildDashboardGroups({ visibleTabs: visible(['overview']), isOwner: false, showRental: false, hasRentalGroup: false });
    expect(sparse.map((g) => g.id)).toEqual(['home']);
  });
});

describe('owner-hub helpers', () => {
  const full = { locality: 'Baner', bhkNum: 2, area: 900, valuation: 1, furnishing: 'semi', rented: true, monthlyRent: 1, tenantName: 'T', tenantMobile: '9' };

  it('scores passport completeness', () => {
    expect(passportPercent(full, 1)).toBe(100);
    expect(passportPercent(full, 0)).toBe(80);
    expect(passportPercent({}, 0)).toBe(20);
    expect(passportChecklist({ rented: true }).find((i) => i.key === 'rent')).toMatchObject({ labelKey: 'ownerHub.ckRent', done: false });
    expect(passportChecklist({}).find((i) => i.key === 'rent')).toMatchObject({ labelKey: 'ownerHub.ckOccupancy', done: true });
  });

  it('builds the publish link', () => {
    expect(publishHref({ id: 'p1', deal: 'rent' })).toBe('/list-property?deal=rent&home=p1');
    expect(publishHref({ managedId: 'm1', deal: 'sale' })).toBe('/list-property?deal=buy&home=m1');
  });

  it('keeps the option tables well formed', () => {
    expect(ownerHub.HOME_TYPES).toHaveLength(3);
    expect(ownerHub.BHK_OPTIONS.map((o) => o.value)).toEqual(['1', '2', '3', '4']);
    expect(ownerHub.FURNISHING_OPTIONS).toHaveLength(3);
    expect(Object.keys(ownerHub.DOC_CAT_KEYS)).toContain('Other');
    expect(typeof ownerHub.FIELD_CLS).toBe('string');
  });
});

describe('home constants', () => {
  it('has question and answer pairs', () => {
    expect(FAQS.length).toBeGreaterThan(0);
    FAQS.forEach((f) => { expect(f).toHaveLength(2); expect(f[0].endsWith('?')).toBe(true); });
  });
});
