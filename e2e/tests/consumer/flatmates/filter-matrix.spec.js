import { test, expect } from '@playwright/test';
import { API } from '../../../helpers/liveAuth.js';
import { openFlatmateFilters, openFlatmates } from '../../../helpers/app.js';

const TABS = ['move-in', 'people', 'teams'];
const kindOf = (it) => (it.roomType || it.roomKind ? 'room' : (it.members || it.seatsTotal != null) ? 'group' : 'post');
const lower = (s) => String(s || '').toLowerCase();
const today = new Date().toISOString().slice(0, 10);

async function feed(tab, params = {}) {
  const qs = new URLSearchParams({ tab, size: '100' });
  for (const [k, v] of Object.entries(params)) [].concat(v).forEach((x) => qs.append(k, String(x)));
  const res = await fetch(`${API}/flatmates/feed?${qs}`);
  expect(res.status, `feed ${qs}`).toBe(200);
  return res.json();
}

/* Each filter with the per-item rule it promises; `null` means the wire does not carry the
 * compared value, so only the narrowing is checked. */
const FILTERS = [
  ['gender=female', { gender: 'female' }, (it) => (kindOf(it) === 'group' ? ['women', 'any'].includes(it.policy) : ['female', 'any'].includes(it.gender))],
  ['gender=male', { gender: 'male' }, (it) => (kindOf(it) === 'group' ? ['men', 'any'].includes(it.policy) : ['male', 'any'].includes(it.gender))],
  ['locality=Baner', { locality: 'Baner' }, (it) => [it.locality, ...(it.localities || [])].some((l) => lower(l) === 'baner')],
  ['minBudget=15000', { minBudget: 15000 }, (it) => (kindOf(it) === 'room' ? null : (kindOf(it) === 'group' ? it.perHead : it.budget) >= 15000)],
  ['maxBudget=12000', { maxBudget: 12000 }, (it) => (kindOf(it) === 'post' ? it.budget <= 12000 : null)],
  ['moveInDays=0', { moveInDays: 0 }, (it) => (kindOf(it) === 'room' ? !it.availableFrom || it.availableFrom <= today : null)],
  ['attachedBath=attached', { attachedBath: 'attached' }, (it) => (kindOf(it) === 'room' ? it.attachedBath === 'attached' : null)],
  ['sharing=2', { sharing: 2 }, (it) => (kindOf(it) === 'group' ? it.seatsTotal === 2 : null)],
  ['strict women', { gender: 'female', strictGender: true }, (it) => (kindOf(it) === 'group' ? it.policy === 'women' : it.gender === 'female')],
  ['roomType=private', { roomType: 'private' }, (it, tab) => roomOnly(it, tab, () => /^private/i.test(it.roomType), () => ['private', 'any'].includes(it.roomPref))],
  ['roomType=shared', { roomType: 'shared' }, (it, tab) => roomOnly(it, tab, () => /^shared/i.test(it.roomType), () => ['shared', 'any'].includes(it.roomPref))],
  ['furnishing=furnished', { furnishing: 'furnished' }, (it, tab) => roomOnly(it, tab, () => it.furnishing === 'furnished')],
  ['gated', { gated: true }, (it, tab) => roomOnly(it, tab, () => it.gatedCommunity === true)],
];

/* A housed team can't answer a room-only question, so on Rooms it must drop out rather than slip through. */
function roomOnly(it, tab, roomRule, postRule = () => null) {
  if (kindOf(it) === 'room') return roomRule();
  if (kindOf(it) === 'post') return postRule();
  return tab === 'move-in' ? false : null;
}

test.describe('LIVE: flatmate filters narrow every tab honestly', () => {
  for (const tab of TABS) {
    test(`${tab}: each filter returns only rows that satisfy it`, async () => {
      const all = await feed(tab);
      const failures = [];
      for (const [name, params, rule] of FILTERS) {
        const page = await feed(tab, params);
        if (page.totalElements > all.totalElements) failures.push(`${name}: widened ${all.totalElements} → ${page.totalElements}`);
        for (const it of page.content) {
          if (rule(it, tab) === false) failures.push(`${name}: ${kindOf(it)} ${it.id} breaks it`);
        }
      }
      const verified = await feed(tab, { verifiedOnly: true });
      if (verified.verifiedElements !== verified.totalElements) failures.push(`verifiedOnly: ${verified.verifiedElements} of ${verified.totalElements} verified`);
      const women = await feed(tab, { gender: 'female' });
      const strict = await feed(tab, { gender: 'female', strictGender: true });
      if (strict.totalElements >= women.totalElements && women.content.some((it) => (it.policy || it.gender) === 'any')) failures.push('strictGender kept the mixed rows');
      expect(failures, failures.join('\n')).toEqual([]);
    });
  }

  test('move-in dates widen monotonically and the budget sorts order by the shown price', async () => {
    const counts = [];
    for (const days of [0, 30, 730]) counts.push((await feed('people', { moveInDays: days })).totalElements);
    expect(counts, 'a later date never shows fewer people').toEqual([...counts].sort((a, b) => a - b));

    const price = (it) => (kindOf(it) === 'group' ? it.perHead : it.budget);
    for (const tab of ['people', 'teams']) {
      const low = (await feed(tab, { sort: 'budget-low' })).content.map(price);
      const high = (await feed(tab, { sort: 'budget-high' })).content.map(price);
      expect(low, `${tab} budget-low`).toEqual([...low].sort((a, b) => a - b));
      expect(high, `${tab} budget-high`).toEqual([...high].sort((a, b) => b - a));
    }
  });

  test('a girls-only sentence becomes the new filters and survives a reload', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openFlatmates(page);
    await openFlatmateFilters(page);
    const grid = page.locator('#sf-desktop-filters');
    await expect(grid.getByRole('button', { name: 'Women-only homes' }), 'no strict toggle before a gender').toHaveCount(0);

    await page.getByRole('textbox', { name: 'Smart search' }).fill('girls only private room furnished gated');
    await page.getByRole('textbox', { name: 'Smart search' }).press('Enter');
    await expect.poll(() => Object.fromEntries(new URL(page.url()).searchParams)).toMatchObject({ g: 'female', gonly: '1', room: 'private', furn: 'furnished', gated: '1' });

    await page.reload();
    await openFlatmateFilters(page);
    for (const label of ['Women', 'Women-only homes', 'Private', 'Furnished', 'Gated society']) {
      await expect(grid.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true');
    }
    await grid.getByRole('button', { name: 'Everyone', exact: true }).click();
    await expect(grid.getByRole('button', { name: 'Women-only homes' })).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.get('gonly')).toBeNull();
  });

  /* Each tap must reach the wire: a control that tints but never filters is the failure users can't see. */
  const CONTROLS = {
    'move-in': [['Women', 'gender', 'female'], ['Women-only homes', 'strictGender', 'true'], ['Private', 'roomType', 'private'], ['Furnished', 'furnishing', 'furnished'], ['Immediate', 'moveInDays', '0'], ['Verified only', 'verifiedOnly', 'true'], ['Gated society', 'gated', 'true'], ['Attached only', 'attachedBath', 'attached']],
    people: [['Men', 'gender', 'male'], ['Shared', 'roomType', 'shared'], ['Immediate', 'moveInDays', '0'], ['Verified only', 'verifiedOnly', 'true']],
    teams: [['Women', 'gender', 'female'], ['Women-only homes', 'strictGender', 'true'], ['Verified only', 'verifiedOnly', 'true']],
  };
  const ONLY_ON = { Washroom: ['move-in'], Furnishing: ['move-in'], Sharing: ['teams'], Room: ['move-in', 'people'] };
  for (const [tab, controls] of Object.entries(CONTROLS)) {
    test(`${tab}: every control on the board sends its filter`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await openFlatmates(page, `?view=${tab}`);
      await openFlatmateFilters(page);
      const grid = page.locator('#sf-desktop-filters');
      for (const [section, tabs] of Object.entries(ONLY_ON)) {
        await expect(grid.getByText(section, { exact: true }), `${section} on ${tab}`).toHaveCount(tabs.includes(tab) ? 1 : 0);
      }
      await expect(grid.getByRole('button', { name: 'Gated society' })).toHaveCount(tab === 'move-in' ? 1 : 0);
      for (const [label, param, value] of controls) {
        const sent = page.waitForRequest((r) => r.url().includes('/flatmates/feed') && new URL(r.url()).searchParams.getAll(param).includes(value));
        const button = grid.getByRole('button', { name: label, exact: true });
        await button.click();
        await sent;
        await expect(button).toHaveAttribute('aria-pressed', 'true');
      }
      if (tab === 'teams') {
        const sent = page.waitForRequest((r) => r.url().includes('/flatmates/feed') && new URL(r.url()).searchParams.get('sharing') === '3');
        await grid.getByRole('button', { name: /Any size/ }).click();
        await page.getByRole('option', { name: /^3\b/ }).click();
        await sent;
      }
    });
  }
});
