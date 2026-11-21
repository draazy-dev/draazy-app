import { describe, expect, it } from 'vitest';
import { setupFetch, status } from '../net.js';
import { MAX_PAGE_SIZE } from '../../../../../src/services/apiLimits.js';
import * as fp from '../../../../../src/services/providers/http/flatmateProvider.js';

const room = { id: 'r1', roomType: 'Private room', title: 'R' };
const group = { id: 'g1', seatsTotal: 3, members: [] };
const post = { id: 'p1', title: 'P' };

describe('flatmateProvider (signed in)', () => {
  const net = setupFetch({ signedIn: true });

  it('createRoom builds a cleaned body using the vocabulary', async () => {
    net.reply({ id: 'r1', title: 'Cosy' });
    const vm = await fp.createRoom({
      title: 'Cosy', homeTypeLabel: 'Flat', bhk: 2, roomType: 'Private room', attachedBath: 'attached', furnishing: 'semi', locality: 'Baner',
      localitySlug: '', societyId: 's', flatNumber: '4', rent: '9000', deposit: 0, occupants: 1, lookingFor: 'male', foodPref: 'weird',
      hostRole: 'owner', details: { a: 1, b: '', c: undefined }, parking: 'car',
    });
    expect(vm).toMatchObject({ id: 'r1', kind: 'room', title: 'Cosy' });
    expect(net.last()).toMatchObject({ path: '/flatmates/rooms', method: 'POST' });
    expect(net.last().body).toEqual({
      title: 'Cosy', homeTypeLabel: 'Flat', bhk: '2', roomType: 'Private room', attachedBath: 'attached', furnishing: 'semi', locality: 'Baner',
      societyId: 's', flatNumber: '4', rentShare: 9000, deposit: 0, occupants: 1, lookingFor: 'male', hostRole: 'owner', photos: [],
      parking: 'car', amenities: [], details: { a: 1 },
    });
  });

  it('createRoom with no input sends the minimum', async () => {
    await fp.createRoom();
    expect(net.last().body).toEqual({ rentShare: 0, photos: [], amenities: [] });
  });

  it('updateRoom clears the society on request and maps conflict markers to a code', async () => {
    net.reply({ id: 'r1' });
    await fp.updateRoom('r/1', { rentShare: 5, clearSociety: true });
    expect(net.last()).toMatchObject({ path: '/flatmates/rooms/r%2F1', method: 'PATCH', body: { rentShare: 5, societyId: '' } });
    net.reply(status(409, { message: 'Already in (already_interested)' }));
    const err = await fp.updateRoom('r1').catch((e) => e);
    expect(err).toMatchObject({ status: 409, code: 'already_interested', message: 'Already in' });
    net.reply(status(409, { message: 'Plain conflict' }));
    const plain = await fp.updateRoom('r1').catch((e) => e);
    expect(plain.message).toBe('Plain conflict');
    expect(plain.code).not.toBe('already_interested');
  });

  it('seat and occupant setters clamp at zero', async () => {
    net.reply({ id: 'r1' });
    await fp.setRoomSeats('r1', -4);
    expect(net.last()).toMatchObject({ path: '/flatmates/rooms/r1/seats', method: 'PATCH', body: { seatsOpen: 0 } });
    await fp.setRoomOccupants('r1', '3');
    expect(net.last()).toMatchObject({ path: '/flatmates/rooms/r1/occupants', body: { occupants: 3 } });
    await fp.setGroupSeats('g1', 'x');
    expect(net.last()).toMatchObject({ path: '/flatmates/groups/g1/seats', body: { seatsOpen: 0 } });
  });

  it('roomInterest, postInterest and joinGroup default to solo and drop empty fields', async () => {
    await fp.roomInterest('r1');
    expect(net.last()).toMatchObject({ path: '/flatmates/rooms/r1/interest', method: 'POST', body: { share: 'solo' } });
    await fp.roomInterest('r1', { share: 'bring', message: 'hi', gender: 'female' });
    expect(net.last().body).toEqual({ share: 'bring', message: 'hi', gender: 'female' });
    await fp.postInterest('p1', { share: 'bogus', message: 'm' });
    expect(net.last()).toMatchObject({ path: '/flatmates/posts/p1/interest', body: { share: 'solo', message: 'm' } });
    net.reply({ id: 'q', status: 'pending' });
    expect(await fp.joinGroup('g1', { share: 'match' })).toMatchObject({ id: 'q', awaitingDecision: true });
    expect(net.last()).toMatchObject({ path: '/flatmates/groups/g1/join', body: { share: 'match' } });
    net.reply(status(409, { message: 'Full (group_full)' }));
    await expect(fp.joinGroup('g1')).rejects.toMatchObject({ code: 'group_full', message: 'Full' });
  });

  it('badge requests', async () => {
    net.reply({ ok: 1 });
    expect(await fp.requestRoomBadge('r1', { note: 'n' })).toEqual({ ok: 1 });
    expect(net.last()).toMatchObject({ path: '/flatmates/rooms/r1/badge-request', body: { note: 'n' } });
    await fp.requestGroupBadge('g1');
    expect(net.last()).toMatchObject({ path: '/flatmates/groups/g1/badge-request', body: {} });
  });

  it('createGroup / updateGroup build the body, with preferences replacing the flat fields', async () => {
    net.reply({ id: 'g1' });
    await fp.createGroup({
      title: 'G', locality: 'Baner', rent: 9000, deposit: 100, seatsTotal: 3, seatsOpen: 1, hostRole: 'owner', agreementDeclared: true, ownerConsentMobile: '99', note: 'n',
    });
    expect(net.last()).toMatchObject({ path: '/flatmates/groups', method: 'POST' });
    expect(net.last().body).toEqual({
      title: 'G', locality: 'Baner', rent: 9000, deposit: 100, seats: 3, seatsOpen: 1, role: 'owner', agreement: true, consentMobile: '99', note: 'n',
    });
    await fp.createGroup();
    expect(net.last().body).toEqual({ rent: 0 });
    await fp.updateGroup('g/1', {
      title: 'H', locality: 'x', rent: 5, agreement: false, consentMobile: '1', role: 'tenant', policy: 'women',
      preferences: { localities: ['A'], bhk: ['2'], rentMin: '5000', rentMax: '', depositMin: 1, gatedOnly: 1, furnishing: 'semi', parking: 'bike', moveInBy: '2026-01-01' },
    });
    expect(net.last()).toMatchObject({ path: '/flatmates/groups/g%2F1', method: 'PATCH' });
    expect(net.last().body).toEqual({
      title: 'H', policy: 'women',
      preferences: {
        localities: ['A'], bhk: ['2'], rentMin: 5000, depositMin: 1, gatedOnly: true, bachelors: false, furnishing: 'semi', parking: 'bike', moveInBy: '2026-01-01',
      },
    });
  });

  it('getFlatmateDetail', async () => {
    await expect(fp.getFlatmateDetail('bogus', 'x')).rejects.toThrow('Unknown flatmate kind: bogus');
    net.reply({ owned: 1, item: room, photos: ['p1.jpg'], specs: { a: 1 }, verification: { v: 1 } });
    const res = await fp.getFlatmateDetail('room', 'r/1');
    expect(net.last().path).toBe('/flatmates/rooms/r%2F1');
    expect(res).toMatchObject({ kind: 'room', owned: true, verification: { v: 1 } });
    expect(res.item).toMatchObject({ id: 'r1', photos: ['p1.jpg'], specs: { a: 1 } });
    net.fresh();
    net.reply({ item: room, photos: [] });
    const bare = await fp.getFlatmateDetail('room', 'r1');
    expect(bare).toMatchObject({ owned: false, verification: null });
    expect(bare.item).toMatchObject({ photos: [], specs: null });
    net.fresh();
    net.reply({ item: group });
    expect((await fp.getFlatmateDetail('group', 'g1')).item.kind).toBe('group');
    net.fresh();
    net.reply({ item: post });
    expect((await fp.getFlatmateDetail('post', 'p1')).item.kind).toBe('post');
  });

  it('deletes, renewals and membership endpoints', async () => {
    await fp.deleteGroup('g1');
    expect(net.last()).toMatchObject({ path: '/flatmates/groups/g1', method: 'DELETE' });
    await fp.deleteRoom('r1');
    expect(net.last()).toMatchObject({ path: '/flatmates/rooms/r1', method: 'DELETE' });
    net.reply(status(409, { message: 'Busy (has_interest)' }));
    await expect(fp.deleteRoom('r1')).rejects.toMatchObject({ code: 'has_interest' });
    await fp.renewFlatmate('rooms', 'r1');
    expect(net.last()).toMatchObject({ path: '/flatmates/rooms/r1/renew', method: 'POST' });
    await fp.leaveGroup('g1');
    expect(net.last()).toMatchObject({ path: '/flatmates/groups/g1/membership', method: 'DELETE' });
    await fp.removeGroupMember('g1', 'm/1');
    expect(net.last().path).toBe('/flatmates/groups/g1/members/m%2F1');
    await fp.withdrawInterest('rooms', 'r1');
    expect(net.last()).toMatchObject({ path: '/flatmates/rooms/r1/interest', method: 'DELETE' });
    await fp.deletePost('p1');
    expect(net.last()).toMatchObject({ path: '/flatmates/posts/p1', method: 'DELETE' });
  });

  it('owner consent and notices', async () => {
    net.reply({ consentRecorded: 1 });
    expect(await fp.requestOwnerConsent({ ownerMobile: '99', otp: '1', title: '', society: 'S' })).toEqual({ consentRecorded: true });
    expect(net.last()).toMatchObject({ path: '/flatmates/owner-consent', body: { ownerMobile: '99', otp: '1', society: 'S' } });
    net.reply(null);
    expect(await fp.requestOwnerConsent()).toEqual({ consentRecorded: false });
    net.reply({ n: 1 });
    expect(await fp.getOwnerNotice('tok')).toEqual({ n: 1 });
    expect(net.last().path).toBe('/flatmates/owner-notice');
    expect(net.last().headers['X-Owner-Notice-Token']).toBe('tok');
    expect(net.last().headers.Authorization).toBeUndefined();
    await fp.answerOwnerNotice('tok', 'yes');
    expect(net.last()).toMatchObject({ path: '/flatmates/owner-notice/answer', method: 'POST', body: { answer: 'yes' } });
    expect(net.last().headers['X-Owner-Notice-Token']).toBe('tok');
  });

  it('owner homes', async () => {
    net.reply([{ id: 1 }]);
    expect(await fp.getOwnerHomes()).toEqual([{ id: 1 }]);
    net.fresh();
    net.reply({});
    expect(await fp.getOwnerHomes()).toEqual([]);
    net.reply({ p: 1 });
    expect(await fp.getOwnerHomePrefill('m/1')).toEqual({ p: 1 });
    expect(net.last().path).toBe('/me/owner-homes/m%2F1/prefill');
  });

  it('createPost and updatePost', async () => {
    net.reply({ id: 'p1' });
    await fp.createPost({
      title: 'T', gender: 'female', age: '24', occupation: 'dev', budget: '8000', budgetMax: 9000, localities: ['A'], moveIn: 'now', flatPref: 'women',
      roomPref: 'private', furnishing: 'semi', gatedOnly: 1, attachedBath: 1, parking: 'bike', note: 'n', verifiedContactOnly: true,
    });
    expect(net.last()).toMatchObject({ path: '/flatmates/posts', method: 'POST' });
    expect(net.last().body).toEqual({
      title: 'T', gender: 'female', age: 24, occupation: 'dev', budget: 8000, budgetMax: 9000, localities: ['A'], moveIn: 'now', flatPref: 'women',
      roomPref: 'private', furnishing: 'semi', gatedOnly: true, attachedBath: true, parking: 'bike', note: 'n', verifiedContactOnly: true,
    });
    await fp.createPost();
    expect(net.last().body).toEqual({ budget: 0, localities: [], furnishing: null, gatedOnly: false, attachedBath: false, parking: null });

    await fp.updatePost('p/1');
    expect(net.last()).toMatchObject({ path: '/flatmates/posts/p%2F1', method: 'PATCH' });
    expect(net.last().body).toEqual({ budgetMax: null, furnishing: null, gatedOnly: false, attachedBath: false, parking: null });
    await fp.updatePost('p1', {
      title: 'T', occupation: 'o', moveIn: 'm', note: 'n', gender: 'male', flatPref: 'men', roomPref: 'shared', budget: 'x', budgetMax: '100', age: '30',
      localities: ['L'], verifiedContactOnly: false, furnishing: 'furnished', gatedOnly: 1,
    });
    expect(net.last().body).toEqual({
      title: 'T', occupation: 'o', moveIn: 'm', note: 'n', gender: 'male', flatPref: 'men', roomPref: 'shared', budget: 0, budgetMax: 100, age: 30,
      localities: ['L'], verifiedContactOnly: false, furnishing: 'furnished', gatedOnly: true, attachedBath: false, parking: null,
    });
  });

  it('request and interest lists when signed in', async () => {
    net.reply([{ id: 'q1', status: 'approved' }]);
    expect(await fp.myRequests('pending')).toEqual([expect.objectContaining({ id: 'q1', awaitingDecision: false })]);
    expect(net.last()).toMatchObject({ path: '/me/flatmate-requests', query: { status: 'pending', size: String(MAX_PAGE_SIZE) } });
    net.reply({ content: [{ id: 'q2' }], totalElements: 1 });
    await fp.myRequests();
    expect(net.last().query).toEqual({ size: String(MAX_PAGE_SIZE) });
    net.reply({ content: [{ id: 'i' }] });
    expect(await fp.myFlatmateInterests()).toEqual([{ id: 'i' }]);
    net.reply(['k']);
    expect(await fp.myFlatmateInterestKeys({ maxAge: 10 })).toEqual(['k']);
    expect(net.last().path).toBe('/me/flatmate-interests/keys');
    net.reply({ id: 'q', status: 'approved' });
    expect(await fp.decideRequest('q/1', 'approve')).toMatchObject({ id: 'q' });
    expect(net.last()).toMatchObject({ path: '/me/flatmate-requests/q%2F1', method: 'PATCH', body: { decision: 'approve' } });
    net.reply(status(409, { message: 'Gone (group_full)' }));
    await expect(fp.decideRequest('q', 'approve')).rejects.toMatchObject({ code: 'group_full' });
  });

  it('my posts / groups / rooms', async () => {
    net.reply({ content: [post], totalElements: 4, totalPages: 2, number: 1 });
    const posts = await fp.myFlatmatePosts({ page: 1, size: 2, maxAge: 5 });
    expect(net.last()).toMatchObject({ path: '/me/flatmate-posts', query: { page: '1', size: '2' } });
    expect(posts).toMatchObject({ total: 4, totalPages: 2, page: 1 });
    expect(posts.items[0].kind).toBe('post');
    net.fresh();
    net.reply([]);
    expect((await fp.myFlatmatePosts()).items).toEqual([]);
    net.reply({ id: 'p1' });
    expect((await fp.getMyFlatmatePost('p/1')).id).toBe('p1');
    expect(net.last().path).toBe('/me/flatmate-posts/p%2F1');
    net.reply({ content: [{ id: 'g' }] });
    expect((await fp.myFlatmateGroups()).items[0]).toMatchObject({ id: 'g', kind: 'group' });
    net.reply({ content: [{ id: 'r' }] });
    expect((await fp.myFlatmateRooms()).items[0]).toMatchObject({ id: 'r', kind: 'room' });
  });

  it('splitProperty and unsplitProperty', async () => {
    net.reply({ rooms: [{ id: 'r1' }] });
    const res = await fp.splitProperty('p/1', { maxOccupants: 3, rooms: [{ roomKind: 'master', rent: '5000', deposit: 0, note: 'n' }, { roomKind: 'weird' }] });
    expect(net.last()).toMatchObject({
      path: '/properties/p%2F1/split', method: 'POST',
      body: { maxOccupants: 3, rooms: [{ roomKind: 'master', rent: 5000, deposit: 0, note: 'n' }, { roomKind: 'bedroom', rent: 0 }] },
    });
    expect(res).toMatchObject({ propertyId: 'p/1', rooms: [expect.objectContaining({ id: 'r1' })] });
    net.reply(null);
    expect(await fp.splitProperty('p1')).toMatchObject({ rooms: [] });
    expect(net.last().body).toEqual({ maxOccupants: 1, rooms: [] });
    await fp.unsplitProperty('p1');
    expect(net.last()).toMatchObject({ path: '/properties/p1/split', method: 'DELETE' });
  });

  it('flatmatePulse falls back to null', async () => {
    net.reply({ flatmatePulse: { live: 3 } });
    expect(await fp.flatmatePulse()).toEqual({ live: 3 });
    net.fresh();
    net.reply({});
    expect(await fp.flatmatePulse()).toBeNull();
  });

  describe('feed', () => {
    it('sends defaults', async () => {
      net.reply({ content: [], totalElements: 0 });
      const res = await fp.feed();
      expect(net.last()).toMatchObject({ path: '/flatmates/feed', query: { tab: 'move-in', page: '0', size: '24' } });
      expect(net.last().headers.Authorization).toBe('Bearer tok-1');
      expect(res).toMatchObject({ items: [], verifiedTotal: 0, otherTabTotal: null, tabTotals: null, pageCount: 0 });
    });

    it('translates every filter', async () => {
      const now = new Date();
      const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const inFive = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5);
      net.reply({ content: [] });
      await fp.feed('team-up', {
        q: 'x', locality: 'baner', near: '18.5,73.8', nearRadius: 10, nearMode: 'min', budget: [5000, 20000], gender: 'male', strictGender: true,
        roomType: 'Private room', furnishing: 'semi', verifiedOnly: true, gated: true, moveIn: iso(inFive), vibe: ['a', 'b'], attachedBath: true, sharing: '2',
        bhk: '2', vegOnly: true, parking: 'car', minAge: 20, maxAge: 30, minOpenSeats: 1, sort: 'new',
        me: { locality: 'Baner', budget: '9000', gender: 'female' },
      }, 2, 10, { auth: false });
      const q = net.last().query;
      expect(net.last().headers.Authorization).toBeUndefined();
      expect(q).toMatchObject({
        tab: 'team-up', q: 'x', locality: 'baner', nearLat: '18.5', nearLng: '73.8', nearRadiusKm: '4', minBudget: '5000', maxBudget: '20000', gender: 'male',
        strictGender: 'true', roomType: 'Private room', furnishing: 'semi', verifiedOnly: 'true', gated: 'true', moveInDays: '5', attachedBath: 'attached',
        sharing: '2', bhk: '2', vegOnly: 'true', parking: 'car', minAge: '20', maxAge: '30', minOpenSeats: '1', sort: 'new', meLocalities: 'Baner',
        meBudget: '9000', meGender: 'female', page: '2', size: '10',
      });
      expect(net.last().params.getAll('vibe')).toEqual(['a', 'b']);
    });

    it('handles edge cases in budget, near, moveIn and me', async () => {
      net.reply({ content: [] });
      await fp.feed('bogus-tab', { budget: [0, 40000], near: 'abc', moveIn: 'now', gender: 'x', strictGender: true, me: { localities: ['A', 'B'] } });
      let q = net.last().query;
      expect(q.tab).toBe('move-in');
      expect(q).not.toHaveProperty('minBudget');
      expect(q).not.toHaveProperty('maxBudget');
      expect(q).not.toHaveProperty('nearLat');
      expect(q).not.toHaveProperty('gender');
      expect(q.strictGender).toBe('true');
      expect(q.moveInDays).toBe('0');
      expect(net.last().params.getAll('meLocalities')).toEqual(['A', 'B']);
      net.fresh();
      net.reply({ content: [] });
      await fp.feed('people', { budget: 'x', near: '18,73', moveIn: '2000-01-01', me: {} });
      q = net.last().query;
      expect(q).toMatchObject({ nearRadiusKm: '5', moveInDays: '0' });
      expect(q).not.toHaveProperty('meBudget');
      net.fresh();
      net.reply({ content: [] });
      await fp.feed('teams', { moveIn: 'soon' });
      expect(net.last().query).not.toHaveProperty('moveInDays');
    });

    it('maps each row kind and merges match data', async () => {
      net.reply({
        content: [
          { id: 'r1', roomType: 'Private room' },
          { id: 'r2', roomKind: 'master' },
          { id: 'g1', members: [] },
          { id: 'g2', seatsTotal: 0 },
          { id: 'p1' },
        ],
        matches: { 'room:r1': 80, 'group:g1': 'x' },
        sharedVibes: { 'room:r1': ['early'], 'post:p1': [] },
        verifiedElements: 3,
        otherTabElements: 7,
        tabElements: { a: 1 },
        totalPages: 2,
        totalElements: 5,
      });
      const res = await fp.feed('move-in', {}, 0, 5);
      expect(res.items.map((i) => i.kind)).toEqual(['room', 'room', 'group', 'group', 'post']);
      expect(res.items[0]).toMatchObject({ styleMatch: 80, sharedVibes: ['early'] });
      expect(res.items[2]).not.toHaveProperty('styleMatch');
      expect(res.items[4]).not.toHaveProperty('sharedVibes');
      expect(res).toMatchObject({ verifiedTotal: 3, otherTabTotal: 7, tabTotals: { a: 1 }, pageCount: 2, total: 5 });
    });
  });

  it('flatmate saves', async () => {
    net.reply({ content: [{ ...room, savedAt: 's1' }, { id: 'g1', members: [], savedAt: 's2' }, { id: 'p1', savedAt: 's3' }] });
    const res = await fp.listFlatmateSaves({ page: 1, size: 5 });
    expect(net.last()).toMatchObject({ path: '/me/flatmate-saves', query: { page: '1', size: '5' } });
    expect(res.items.map((i) => [i.kind, i.savedAt])).toEqual([['room', 's1'], ['group', 's2'], ['post', 's3']]);
    net.reply({ content: [] });
    await fp.listFlatmateSaves();
    expect(net.last().query.size).toBe(String(MAX_PAGE_SIZE));
    net.reply([{ kind: 'room', id: 'a' }, { kind: 'room' }, null]);
    expect(await fp.listFlatmateSaveKeys({ maxAge: 1 })).toEqual([{ kind: 'room', id: 'a' }]);
    net.fresh();
    net.reply({});
    expect(await fp.listFlatmateSaveKeys()).toEqual([]);
    await fp.saveFlatmatePost('room', 'r/1');
    expect(net.last()).toMatchObject({ path: '/me/flatmate-saves/room/r%2F1', method: 'PUT' });
    await fp.unsaveFlatmatePost('room', 'r1');
    expect(net.last()).toMatchObject({ path: '/me/flatmate-saves/room/r1', method: 'DELETE' });
  });

  it('admin reviews', async () => {
    net.reply({ content: [{ id: 'v1', kind: 'group' }], totalElements: 1 });
    const page = await fp.listFlatmateReviews({ status: 'pending', flagged: 0, page: 1, size: 5 });
    expect(net.last()).toMatchObject({ path: '/admin/flatmate-reviews', query: { status: 'pending', flagged: 'false', page: '1', size: '5' } });
    expect(page.items[0]).toMatchObject({ id: 'v1', kind: 'group' });
    net.reply([]);
    await fp.listFlatmateReviews();
    expect(net.last().query).toEqual({ page: '0', size: '20' });
    net.reply({ id: 'v1' });
    await fp.decideFlatmateReview('v/1', 'approve', '  ok ', { name: true });
    expect(net.last()).toMatchObject({ path: '/admin/flatmate-reviews/v%2F1', method: 'PATCH', body: { decision: 'approve', note: 'ok', checks: { name: true } } });
    await fp.decideFlatmateReview('v1', 'reject');
    expect(net.last().body).toEqual({ decision: 'reject' });
    net.reply({ url: 'https://doc' });
    expect(await fp.getFlatmateReviewDocumentUrl('v1')).toBe('https://doc');
    net.reply({});
    expect(await fp.getFlatmateReviewDocumentUrl('v1')).toBeNull();
    net.reply({ id: 'v1' });
    await fp.revokeFlatmateReview('v1', 'fraud');
    expect(net.last()).toMatchObject({ path: '/admin/flatmate-reviews/v1/revoke', method: 'POST', body: { reason: 'fraud' } });
  });

  it('moderation lists, summary and detail', async () => {
    net.reply({ content: [{ id: 'm1' }] });
    await fp.listFlatmateModeration({ kind: ['post', 'room'], modStatus: ['pending', 'live'], sort: 'old', page: 1, size: 3 });
    expect(net.last()).toMatchObject({ path: '/admin/flatmates/moderation', query: { kind: 'post,room', modStatus: 'pending,live', sort: 'old', page: '1', size: '3' } });
    net.reply({ content: [] });
    await fp.listFlatmateModeration();
    expect(net.last().query).toEqual({ kind: 'post', page: '0', size: '20' });
    net.reply({ pending: 2 });
    expect(await fp.getFlatmateModerationSummary()).toMatchObject({ pending: 2, hidden: 0 });
    net.reply({ item: { id: 'm1' }, room: room, group, post, review: { id: 'v' }, livingStyle: { a: 1 }, caseFile: { status: 's' } });
    const detail = await fp.getFlatmateModerationDetail('m/1');
    expect(net.last().path).toBe('/admin/flatmates/m%2F1');
    expect(detail).toMatchObject({
      item: { id: 'm1' }, room: { kind: 'room' }, group: { kind: 'group' }, post: { kind: 'post' }, review: { id: 'v' }, livingStyle: { a: 1 }, caseFile: { status: 's' },
    });
    net.fresh();
    net.reply(null);
    expect(await fp.getFlatmateModerationDetail('m1')).toMatchObject({ room: null, group: null, post: null, review: null, livingStyle: {}, caseFile: null });
    await fp.editFlatmateAsModerator('m1', { note: 'x' });
    expect(net.last()).toMatchObject({ path: '/admin/flatmates/m1', method: 'PATCH', body: { note: 'x' } });
    await fp.moderateFlatmatePost('m1', 'live', ' n ', 'code');
    expect(net.last()).toMatchObject({ path: '/admin/flatmates/m1/moderation', method: 'PATCH', body: { modStatus: 'live', note: 'n', reasonCode: 'code' } });
    await fp.moderateFlatmatePost('m1', 'hidden');
    expect(net.last().body).toEqual({ modStatus: 'hidden' });
    await fp.tickFlatmateChecklist('m1', 'photos', 1);
    expect(net.last()).toMatchObject({ path: '/admin/flatmates/m1/moderation/checklist', body: { item: 'photos', pass: true } });
  });

  it('verification cases', async () => {
    net.reply({ status: 'in_review' });
    expect(await fp.getFlatmateCase('room', 'r/1')).toMatchObject({ status: 'in_review' });
    expect(net.last().path).toBe('/flatmates/room/r%2F1/verification');
    await fp.replyToFlatmateCase('room', 'r1', 'hello');
    expect(net.last()).toMatchObject({ path: '/flatmates/room/r1/verification/messages', method: 'POST', body: { body: 'hello' } });
    await fp.markFlatmateCaseRead('group', 'g1');
    expect(net.last()).toMatchObject({ path: '/flatmates/group/g1/verification/read', method: 'POST' });
    net.reply([{ id: 'a', unread: 1 }]);
    expect(await fp.listMyFlatmateCases()).toEqual([expect.objectContaining({ id: 'a', unread: 1 })]);
    net.fresh();
    net.reply({});
    expect(await fp.listMyFlatmateCases()).toEqual([]);
  });

  it('group applications', async () => {
    net.reply({ content: [{ id: 'a' }] });
    await fp.listGroupApplications({ modStatus: ['pending'], sort: 's', page: 1, size: 2 });
    expect(net.last()).toMatchObject({ path: '/admin/group-applications', query: { modStatus: 'pending', sort: 's', page: '1', size: '2' } });
    net.reply([]);
    await fp.listGroupApplications();
    expect(net.last().query).toEqual({ page: '0', size: '20' });
    net.reply({ id: 'a' });
    await fp.moderateGroupApplication('a/1', 'live', ' n ');
    expect(net.last()).toMatchObject({ path: '/admin/group-applications/a%2F1', method: 'PATCH', body: { modStatus: 'live', note: 'n' } });
    await fp.moderateGroupApplication('a', 'live');
    expect(net.last().body).toEqual({ modStatus: 'live' });
    await fp.applyGroupToListing('g/1', 'l1');
    expect(net.last()).toMatchObject({ path: '/flatmates/groups/g%2F1/apply', method: 'POST', body: { listingId: 'l1' } });
    net.reply({ content: [{ id: 'a' }] });
    await fp.listMyGroupApplications();
    expect(net.last()).toMatchObject({ path: '/me/group-applications', query: { page: '0', size: String(MAX_PAGE_SIZE) } });
    net.reply({ id: 'a' });
    await fp.decideGroupApplication('a/1', 'accepted');
    expect(net.last()).toMatchObject({ path: '/me/group-applications/a%2F1', method: 'PATCH', body: { status: 'accepted' } });
  });

  it('living style', async () => {
    net.reply({ answers: { a: 1 }, updatedAt: 'u' });
    expect(await fp.myLivingStyle()).toEqual({ answers: { a: 1 }, updatedAt: 'u' });
    net.reply(null);
    expect(await fp.saveMyLivingStyle({ b: 2 })).toEqual({ answers: {}, updatedAt: null });
    expect(net.last()).toMatchObject({ path: '/me/living-style', method: 'PUT', body: { answers: { b: 2 } } });
    net.reply({ answers: { a: 1 }, match: 70, common: 3 });
    expect(await fp.livingStyleOf('room', 'r/1')).toEqual({ answers: { a: 1 }, match: 70, common: 3 });
    expect(net.last().path).toBe('/flatmates/room/r%2F1/living-style');
    net.reply({});
    expect(await fp.livingStyleOf('room', 'r2')).toEqual({ answers: {}, match: null, common: 0 });
  });
});

describe('flatmateProvider (signed out)', () => {
  const net = setupFetch({ signedIn: false });

  it('short-circuits the personal reads', async () => {
    expect(await fp.myRequests()).toEqual([]);
    expect(await fp.myFlatmateInterests()).toEqual([]);
    expect(await fp.myFlatmateInterestKeys()).toEqual([]);
    expect(await fp.listFlatmateSaves({ size: 7 })).toEqual({ items: [], page: 0, size: 7, total: 0 });
    expect(await fp.listFlatmateSaveKeys()).toEqual([]);
    expect(await fp.listMyFlatmateCases()).toEqual([]);
    expect(net.calls).toHaveLength(0);
  });

  it('feed goes unauthenticated by default', async () => {
    net.reply({ content: [] });
    await fp.feed();
    expect(net.last().headers.Authorization).toBeUndefined();
  });
});
