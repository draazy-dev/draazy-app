import { test, expect } from '@playwright/test';
import { API, apiLogin, uniqueMobile } from '../../../helpers/liveAuth.js';
import { ACTORS } from '../../../fixtures/live.js';
import { flatmateCleanup } from '../../../helpers/flatmateCleanup.js';
import { istInDays } from '../../../helpers/availability.js';

const MOVE_IN = istInDays(28);

const auth = (token) => ({ 'content-type': 'application/json', authorization: `Bearer ${token}` });
const track = flatmateCleanup(test);

async function createPost(token, { locality = 'Baner', note = 'Moderation coverage' } = {}) {
  const res = await fetch(`${API}/flatmates/posts`, {
    method: 'POST',
    headers: auth(token),
    body: JSON.stringify({
      gender: 'female',
      age: 26,
      occupation: 'Engineer',
      budget: 18000,
      localities: [locality],
      moveIn: MOVE_IN,
      flatPref: 'women',
      roomPref: 'private',
      note,
    }),
  });
  return res;
}

async function created(res, token, kind) {
  const body = await res.text();
  expect(res.status, body).toBe(201);
  const row = JSON.parse(body);
  track(kind, row.id, token);
  return row;
}

test('a new seeker post is live at once and waits on the Ops re-check board', async () => {
  const { accessToken } = await apiLogin(uniqueMobile(), { name: 'Moderation Tester' });
  const post = await created(await createPost(accessToken), accessToken, 'posts');
  expect(post.modStatus).toBe('live');

  const feed = await (await fetch(`${API}/flatmates/feed?tab=team-up&size=100`)).json();
  expect((feed.content ?? feed).some((r) => r.id === post.id), 'a stranger sees it on the public feed').toBe(true);

  const { accessToken: admin } = await apiLogin(ACTORS.admin);
  const board = await (await fetch(`${API}/admin/flatmates/moderation?kind=post&modStatus=recheck&size=100`, {
    headers: auth(admin),
  })).json();
  const row = board.content.find((r) => r.id === post.id);
  expect(row?.recheckReason, 'Ops still reads it, after the fact').toBe('new post');
});

  // Positive first: the public feed is non-empty (other approved posts exist in the seed).
test('a phone number in a seeker post is refused, not published', async () => {
  const { accessToken } = await apiLogin(uniqueMobile(), { name: 'Moderation Tester' });
  const res = await createPost(accessToken, { note: 'Call me on 98200 11223' });
  expect(res.status).toBe(422);
});

test('a group that already has a flat is refused and told to list a room', async () => {
  const { accessToken } = await apiLogin(uniqueMobile(), { name: 'Host' });
  const res = await fetch(`${API}/flatmates/groups`, {
    method: 'POST',
    headers: auth(accessToken),
    body: JSON.stringify({ title: `Held flat ${Date.now().toString(36)}`, locality: 'Kothrud', policy: 'any', rent: 40000, deposit: 50000, seats: 3, seatsOpen: 1 }),
  });
  expect(res.status).toBe(409);
  expect((await res.json()).error).toBe('flat_lists_as_room');
});
