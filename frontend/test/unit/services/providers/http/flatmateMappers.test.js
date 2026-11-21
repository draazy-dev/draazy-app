import { describe, expect, it } from 'vitest';
import * as fm from '../../../../../src/services/providers/http/flatmateMapper.js';
import * as mod from '../../../../../src/services/providers/http/flatmateModerationMapper.js';

describe('flatmateMapper helpers', () => {
  it('isPubliclyVisible', () => {
    expect(fm.isPubliclyVisible()).toBe(true);
    expect(fm.isPubliclyVisible('approved')).toBe(true);
    expect(fm.isPubliclyVisible('pending')).toBe(false);
  });

  it('conflictSubCode reads the trailing marker on 409s only', () => {
    expect(fm.conflictSubCode({ status: 409, message: 'Nope (group_full)' })).toBe('group_full');
    expect(fm.conflictSubCode({ status: 409, message: 'No marker' })).toBeNull();
    expect(fm.conflictSubCode({ status: 409 })).toBeNull();
    expect(fm.conflictSubCode({ status: 400, message: 'x (group_full)' })).toBeNull();
    expect(fm.conflictSubCode(null)).toBeNull();
    expect('Full (group_full)'.replace(fm.CONFLICT_MARKER, '')).toBe('Full');
  });

  it('seatsLeftOf', () => {
    expect(fm.seatsLeftOf({ seatsOpen: 2 })).toBe(2);
    expect(fm.seatsLeftOf({ seatsOpen: -3 })).toBe(0);
    expect(fm.seatsLeftOf({ seatsTotal: 4, members: [1, 2] })).toBe(2);
    expect(fm.seatsLeftOf({ seatsTotal: 4, occupants: 1 })).toBe(3);
    expect(fm.seatsLeftOf({ seatsTotal: 1, occupants: 5 })).toBe(0);
    expect(fm.seatsLeftOf()).toBe(0);
  });

  it('perHeadOf', () => {
    expect(fm.perHeadOf({ perHead: '5000' })).toBe(5000);
    expect(fm.perHeadOf({ rent: 10000, seatsTotal: 3 })).toBe(3333);
    expect(fm.perHeadOf({ rent: 10000 })).toBe(10000);
    expect(fm.perHeadOf()).toBe(0);
  });

  it('initialsOf', () => {
    expect(fm.initialsOf(' ravi kumar sharma ')).toBe('RK');
    expect(fm.initialsOf('priya')).toBe('P');
    expect(fm.initialsOf(null)).toBe('');
  });

  it('vocab only passes known values as strings', () => {
    expect(fm.vocab('bhk', 2)).toBe('2');
    expect(fm.vocab('bhk', 9)).toBeUndefined();
    expect(fm.vocab('bhk', 3)).toBe('3');
    expect(fm.vocab('gender', 'male')).toBe('male');
    expect(fm.vocab('gender', 'x')).toBeUndefined();
    expect(fm.vocab('gender', null)).toBeUndefined();
    expect(fm.vocab('nope', 'x')).toBeUndefined();
  });
});

describe('flatmateMapper view models', () => {
  it('toRoomViewModel defaults', () => {
    const vm = fm.toRoomViewModel(undefined);
    expect(vm).toMatchObject({
      id: '', kind: 'room', roomKind: 'bedroom', roomType: 'Private room', attachedBath: 'shared', budget: 0, noticePeriodDays: null,
      lockInMonths: null, flatMax: null, seatsTotal: null, seatsOpen: null, lat: null, lng: null, hostRole: 'tenant', modStatus: 'live',
      publiclyVisible: true, gender: 'any', food: 'any', cover: null, photos: [], status: 'active', host: null, amenities: [],
    });
    expect(typeof vm.createdAt).toBe('number');
  });

  it('toRoomViewModel maps populated rows', () => {
    const vm = fm.toRoomViewModel({
      id: 'r1', title: 'T', propertyId: 'p', roomKind: 'master', budget: '9000', deposit: '1', noticePeriodDays: 30, lockInMonths: 0,
      seatsTotal: 2, seatsOpen: 1, lat: '1.5', lng: 2, verified: 1, modStatus: 'pending', photos: ['a', 'b'], createdAt: '2026-01-01T00:00:00Z',
      flatMax: '3', host: { name: 'H' }, cover: 'c',
    });
    expect(vm).toMatchObject({
      id: 'r1', roomKind: 'master', budget: 9000, deposit: 1, noticePeriodDays: 30, lockInMonths: 0, seatsTotal: 2, seatsOpen: 1, lat: 1.5, lng: 2,
      verified: true, modStatus: 'pending', publiclyVisible: false, cover: 'c', flatMax: 3, createdAt: Date.parse('2026-01-01T00:00:00Z'),
    });
    expect(fm.toRoomViewModel({ photos: ['a'] }).cover).toBe('a');
  });

  it('toSeekerPostViewModel', () => {
    expect(fm.toSeekerPostViewModel()).toMatchObject({
      kind: 'post', gender: 'any', age: null, budget: 0, budgetMax: null, flatPref: 'any', roomPref: 'any', furnishing: null,
      gatedOnly: false, parking: null, publiclyVisible: true, lat: null,
    });
    expect(fm.toSeekerPostViewModel({ id: 'p', age: '25', budgetMax: '8000', gatedOnly: 1, attachedBath: 1, modStatus: 'hidden', lat: 2 }))
      .toMatchObject({ id: 'p', age: 25, budgetMax: 8000, gatedOnly: true, attachedBath: true, publiclyVisible: false, lat: 2 });
  });

  it('toGroupViewModel', () => {
    const vm = fm.toGroupViewModel({
      id: 'g', title: 'G', rent: 9000, seatsTotal: 3, members: [{ id: 'm', name: 'Ann Lee', verified: 1, host: 1 }, { initials: 'ZZ' }, null],
      ownerConsent: 1, locality: 'Baner', preferences: { localities: ['Aundh'], rentMin: '5', depositMax: '', bachelors: 1 },
    });
    expect(vm.members).toEqual([
      { id: 'm', name: 'Ann Lee', initials: 'AL', verified: true, host: true },
      { id: '', name: '', initials: 'ZZ', verified: false, host: false },
      { id: '', name: '', initials: '', verified: false, host: false },
    ]);
    expect(vm).toMatchObject({ perHead: 3000, seatsLeft: 0, ownerConsent: true, hunting: true, localities: ['Aundh'] });
    expect(vm.preferences).toEqual({
      localities: ['Aundh'], bhk: [], rentMin: 5, rentMax: null, depositMin: null, depositMax: null, gatedOnly: false, bachelors: true,
      furnishing: null, parking: null, moveInBy: null,
    });
  });

  it('toGroupViewModel defaults', () => {
    const vm = fm.toGroupViewModel();
    expect(vm).toMatchObject({ policy: 'any', members: [], preferences: null, hunting: false, localities: [], hostRole: 'tenant' });
    expect(fm.toGroupViewModel({ locality: 'Baner' }).localities).toEqual(['Baner']);
    expect(fm.toGroupViewModel({ preferences: { localities: [] }, locality: 'X' }).localities).toEqual(['X']);
  });

  it('card view models', () => {
    expect(fm.toRoomCardViewModel()).toMatchObject({ kind: 'room', hostRole: null, cover: null, status: 'active', publiclyVisible: true });
    expect(fm.toRoomCardViewModel({ id: 'r', budget: '5', shareMax: '2', occupants: '1', modStatus: 'pending' }))
      .toMatchObject({ id: 'r', budget: 5, shareMax: 2, occupants: 1, publiclyVisible: false });
    expect(fm.toGroupCardViewModel()).toMatchObject({ kind: 'group', hunting: false, memberCount: 0, perHead: 0 });
    expect(fm.toGroupCardViewModel({ rent: 6000, seatsTotal: 2, memberCount: '2', hunting: 1 })).toMatchObject({ perHead: 3000, memberCount: 2, hunting: true });
  });

  it('toRequestViewModel', () => {
    expect(fm.toRequestViewModel()).toMatchObject({ kind: 'room', action: 'request', share: 'solo', status: 'pending', awaitingDecision: true, decidedAt: null });
    expect(fm.toRequestViewModel({ id: 'q', status: 'approved', requestedAt: '2026-01-01T00:00:00Z', decidedAt: '2026-01-02T00:00:00Z' }))
      .toMatchObject({ awaitingDecision: false, requestedAt: Date.parse('2026-01-01T00:00:00Z'), decidedAt: Date.parse('2026-01-02T00:00:00Z') });
  });
});

describe('flatmateModerationMapper', () => {
  it('toReviewViewModel', () => {
    expect(mod.toReviewViewModel()).toMatchObject({
      id: '', kind: 'room', tier: 'identity', agreementDoc: null, agreementViewable: false, vaultDocId: null, evidenceType: null,
      status: 'pending', createdAt: null, nameMatches: null, host: null,
    });
    expect(mod.toReviewViewModel({ agreementDoc: { dataUrl: 'data:x', tooLarge: 1, id: 'd' }, host: ' H ', createdAt: '2026-01-01T00:00:00Z' }))
      .toMatchObject({ agreementViewable: true, agreementTooLarge: true, vaultDocId: null, evidenceType: 'rent_agreement', host: 'H', createdAt: Date.parse('2026-01-01T00:00:00Z') });
    expect(mod.toReviewViewModel({ agreementDoc: { id: ' d1 ' }, evidenceType: 'tax' })).toMatchObject({ vaultDocId: 'd1', evidenceType: 'tax' });
  });

  it('toReviewRowViewModel', () => {
    expect(mod.toReviewRowViewModel()).toMatchObject({ kind: 'room', tier: 'identity', evidenceType: null, createdAt: null });
    expect(mod.toReviewRowViewModel({ id: 'r', kind: 'group', evidenceType: 'x', flagForReview: 1 })).toMatchObject({ id: 'r', kind: 'group', evidenceType: 'x', flagForReview: true });
  });

  it('toModerationRowViewModel only accepts http(s) or root-relative cover URLs', () => {
    expect(mod.toModerationRowViewModel()).toMatchObject({ kind: 'post', modStatus: 'pending', coverPhoto: null, rent: null, caseStatus: null, unreadFromHost: 0 });
    expect(mod.toModerationRowViewModel({ coverPhoto: 'https://x/y.jpg' }).coverPhoto).toBe('https://x/y.jpg');
    expect(mod.toModerationRowViewModel({ coverPhoto: '/img/a.jpg' }).coverPhoto).toBe('/img/a.jpg');
    expect(mod.toModerationRowViewModel({ coverPhoto: '//evil.com/a.jpg' }).coverPhoto).toBeNull();
    expect(mod.toModerationRowViewModel({ coverPhoto: 'javascript:alert(1)' }).coverPhoto).toBeNull();
    expect(mod.toModerationRowViewModel({ photoCount: '3', unreadFromHost: '2', recheckRequestedAt: '2026-01-01T00:00:00Z' }))
      .toMatchObject({ photoCount: 3, unreadFromHost: 2, recheckRequestedAt: Date.parse('2026-01-01T00:00:00Z') });
  });

  it('toCaseViewModel and summary', () => {
    expect(mod.toCaseViewModel(null)).toBeNull();
    expect(mod.toCaseViewModel({})).toEqual({ status: 'in_review', reasonCode: null, reasonNote: null, checklist: [], messages: [], decidedAt: null });
    expect(mod.toCaseViewModel({
      status: 's', checklist: [{ item: 'i', pass: 1 }, null], messages: [{ id: 5, from: 'owner', body: 'b', at: 'a', read: 1 }, { from: 'x' }], decidedAt: 'd',
    })).toMatchObject({
      checklist: [{ item: 'i', pass: true }, { item: '', pass: false }],
      messages: [{ id: '5', from: 'owner', body: 'b', at: 'a', read: true }, { id: '', from: 'ops', body: '', at: null, read: false }],
      decidedAt: 'd',
    });
    expect(mod.toCaseSummaryViewModel()).toEqual({ kind: 'room', id: '', status: 'in_review', reasonCode: null, reasonNote: null, unread: 0, updatedAt: null, lastMessage: '' });
    expect(mod.toCaseSummaryViewModel({ unread: '2', lastMessage: ' hi ' })).toMatchObject({ unread: 2, lastMessage: 'hi' });
  });

  it('item, summary, application and page helpers', () => {
    expect(mod.toModerationItemViewModel({ photos: ['https://a/1.jpg', 'ftp://bad', '/ok.jpg'] }).photos).toEqual(['https://a/1.jpg', '/ok.jpg']);
    expect(mod.toModerationItemViewModel().photos).toEqual([]);
    expect(mod.toModerationSummaryViewModel()).toEqual({ pending: 0, badgeRequests: 0, published: 0, hidden: 0 });
    expect(mod.toModerationSummaryViewModel({ pending: '2', hidden: 1 })).toMatchObject({ pending: 2, hidden: 1 });
    expect(mod.toGroupApplicationViewModel()).toMatchObject({ id: '', listingId: null, status: 'pending', modStatus: 'pending', at: null, rent: null, members: 0 });
    expect(mod.toGroupApplicationViewModel({ id: 'a', members: '2', at: '2026-01-01T00:00:00Z' })).toMatchObject({ members: 2, at: Date.parse('2026-01-01T00:00:00Z') });
    expect(mod.toViewModelPage({ items: [1, 2], page: 0 }, (n) => n * 2)).toEqual({ items: [2, 4], page: 0 });
    expect(mod.toViewModelPage(undefined, (n) => n)).toEqual({ items: [] });
  });
});
