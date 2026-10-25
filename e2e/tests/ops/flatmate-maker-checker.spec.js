import { ACTORS, expect, test } from '../../fixtures/live.js';
import { API, apiLogin, uniqueMobile } from '../../helpers/liveAuth.js';
import { flatmateCleanup } from '../../helpers/flatmateCleanup.js';
import { tenantRoomAgreement } from '../../helpers/flatmateAgreement.js';
import { roomBasics } from '../../helpers/roomWizard.js';
import { withSocietyId } from '../../helpers/liveSociety.js';
import { sql } from '../../helpers/monetisation.js';

const STAFF = '9733798115';
const auth = (token) => ({ 'content-type': 'application/json', authorization: `Bearer ${token}` });
const stamp = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const track = flatmateCleanup(test);

async function call(method, path, token, body) {
  const res = await fetch(`${API}${path}`, { method, headers: auth(token), body: body && JSON.stringify(body) });
  return { status: res.status, text: await res.text() };
}

const moderate = async (id, modStatus, note) => call('PATCH', `/admin/flatmates/${id}/moderation`,
  (await apiLogin(STAFF)).accessToken, { modStatus, ...(note ? { note } : {}) });

const postBody = (note) => ({ age: 27, budget: 16000, localities: ['Kothrud'], moveIn: '2026-12-01', note });

async function seekerPost(note) {
  const { accessToken } = await apiLogin(uniqueMobile(), { name: 'Asha' });
  const res = await call('POST', '/flatmates/posts', accessToken, postBody(note));
  expect(res.status, res.text).toBe(201);
  const post = JSON.parse(res.text);
  track('posts', post.id, accessToken);
  return { post, token: accessToken };
}

async function tenantRoom() {
  const { accessToken } = await apiLogin(uniqueMobile());
  const res = await call('POST', '/flatmates/rooms', accessToken, {
    ...(await roomBasics(accessToken)),
    bhk: '2', roomType: 'Private room', attachedBath: 'attached', furnishing: 'semi', locality: 'Baner',
    rentShare: 15000, deposit: 30000, availableFrom: '2026-12-01', lookingFor: 'any', foodPref: 'any',
    ...(await tenantRoomAgreement(accessToken)),
    ...(await withSocietyId(accessToken, { society: `Checker Court ${stamp()}` })),
  });
  expect(res.status, res.text).toBe(201);
  const room = JSON.parse(res.text);
  track('rooms', room.id, accessToken);
  return room;
}

test.describe('Flatmate maker-checker rules hold at the API', () => {
  test('staff cannot moderate or desk-edit a post they authored', async () => {
    const { post } = await seekerPost(`Self check ${stamp()}`);
    const { accessToken } = await apiLogin(STAFF);
    const me = JSON.parse((await call('GET', '/auth/me', accessToken)).text);
    sql(`update flatmate_seeker_posts set user_id = '${me.id}' where id = '${post.id}'`);
    try {
      expect((await moderate(post.id, 'flagged', 'mine')).status).toBe(403);
      expect((await call('PATCH', `/admin/flatmates/${post.id}`, accessToken, { note: 'Edited by me' })).status).toBe(403);
    } finally {
      sql(`update flatmate_seeker_posts set archived = true where id = '${post.id}'`);
    }
  });

  test('hiding needs a note, so does undoing a removal, and a repeat verdict is a no-op', async () => {
    const { post } = await seekerPost(`Ladder check ${stamp()}`);
    expect((await moderate(post.id, 'flagged')).status).toBe(400);
    expect((await moderate(post.id, 'removed', 'Breaks the rules')).status).toBe(200);
    expect((await moderate(post.id, 'approved')).status).toBe(400);
    expect((await moderate(post.id, 'approved', 'Appeal upheld')).status).toBe(200);
    expect((await moderate(post.id, 'approved')).status).toBe(200);
  });

  test('an expired post cannot be moderated back to life', async () => {
    const { post } = await seekerPost(`Expired check ${stamp()}`);
    sql(`update flatmate_seeker_posts set mod_status = 'expired', expired_from = mod_status where id = '${post.id}'`);
    const res = await moderate(post.id, 'approved', 'Bring it back');
    expect(res.status, res.text).toBe(409);
  });

  test('a decided badge review does not flip, and a pending room cannot be saved', async () => {
    const room = await tenantRoom();
    const { accessToken: staff } = await apiLogin(STAFF);
    const queue = JSON.parse((await call('GET', '/admin/flatmate-reviews?status=pending&size=200', staff)).text);
    const review = queue.content.find((row) => row.roomId === room.id);
    expect(review, 'the tenant room should queue a badge review').toBeTruthy();

    expect((await call('PATCH', `/admin/flatmate-reviews/${review.id}`, staff,
      { decision: 'rejected', note: 'Agreement names another flat' })).status).toBe(200);
    expect((await call('PATCH', `/admin/flatmate-reviews/${review.id}`, staff,
      { decision: 'approved', note: 'Changed my mind' })).status).toBe(409);

    const { accessToken: seeker } = await apiLogin(ACTORS.buyer);
    expect((await call('PUT', `/me/flatmate-saves/room/${room.id}`, seeker)).status).toBe(404);
  });

  test('an ask carrying a phone number is refused, and a stranger cannot edit the post', async () => {
    const { post } = await seekerPost(`Ask check ${stamp()}`);
    const { accessToken: stranger } = await apiLogin(uniqueMobile(), { name: 'Asha' });
    const ask = await call('POST', `/flatmates/posts/${post.id}/interest`, stranger,
      { share: 'solo', message: 'Call me on 98765 43210' });
    expect(ask.status, ask.text).toBe(422);
    expect((await call('PATCH', `/flatmates/posts/${post.id}`, stranger, postBody('Hijacked'))).status).toBe(404);
  });
});
