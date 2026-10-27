import { test, expect } from '@playwright/test';
import { API, apiLogin, signedInAsNew, uniqueMobile } from '../../../helpers/liveAuth.js';
import { flatmateCleanup } from '../../../helpers/flatmateCleanup.js';
import { trackErrors } from '../../../helpers/console.js';
import { chooseLocality, pickLocalitiesIn } from '../../../helpers/locality.js';

const auth = (token) => ({ 'content-type': 'application/json', authorization: `Bearer ${token}` });

const track = flatmateCleanup(test);

test.describe('LIVE: post-request form', () => {
  test('every field the redesigned form collects reaches the server intact', async ({ page }) => {
    const errors = trackErrors(page);
    const mobile = await signedInAsNew(page);

    await page.goto('/flatmates?post=1');
    await expect(page.getByRole('heading', { name: /Post your flatmate request/i })).toBeVisible({ timeout: 20_000 });
    /* By accessible name, not visible text: the choice rows are named groups, and `NativeSelect` renders
       a button the `<label>` above it does not label. */

    await expect(page.getByRole('button', { name: 'Preferred localities' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Looking to share with' })).toBeVisible();
    await expect(page.locator('input[data-err="age"]')).toBeHidden();
    await expect(page.getByTestId('ls-inline').getByTestId('ls-questions')).toBeVisible();
    await page.getByTestId('seeker-more-details').locator('summary').click();
    await expect(page.getByRole('button', { name: 'Lifestyle preferences' })).toHaveCount(0);
    await expect(page.getByText('Lifestyle', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Room preference' })).toBeVisible();

    await expect(page.getByRole('textbox', { name: 'Your name' })).toHaveCount(0);
    const budget = page.getByLabel('Lowest monthly budget');
    await budget.fill('17500');
    await expect(budget).toHaveValue('17,500');
    await expect(page.getByText('≈ ₹ 17.50 Thousand')).toBeVisible();
    await page.getByLabel('Highest monthly budget').fill('15000');
    await page.getByRole('button', { name: /Post request/i }).click();
    await expect(page.locator('.dz-field-error', { hasText: 'Max budget can’t be below min.' })).toBeVisible();
    await page.getByLabel('Highest monthly budget').fill('22000');

    const age = page.locator('input[data-err="age"]');
    await age.fill('150');
    await page.getByRole('button', { name: /Post request/i }).click();
    await expect(page.locator('.dz-field-error', { hasText: 'Enter an age between 18 and 120.' })).toBeVisible();
    await age.fill('26');
    await expect(page.locator('.dz-field-error', { hasText: 'Enter an age between 18 and 120.' })).toHaveCount(0);

    await pickLocalitiesIn(page, page.getByRole('button', { name: 'Preferred localities' }), ['Baner', 'Wakad']);

    await page.getByRole('group', { name: 'Looking to share with' }).getByRole('button', { name: 'Women only', exact: true }).click();
    await page.getByRole('group', { name: 'Room preference' }).getByRole('button', { name: 'Private room', exact: true }).click();
    await expect(page.getByRole('group', { name: 'I am a' }).getByRole('button', { name: 'Prefer not to say' })).toHaveAttribute('aria-pressed', 'true');

    const moveIn = page.getByTestId('move-in-field');
    await expect(moveIn.getByRole('button', { name: 'Immediate', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await moveIn.getByRole('button', { name: 'Flexible', exact: true }).click();
    await expect(moveIn.getByRole('button', { name: 'Flexible', exact: true })).toHaveAttribute('aria-pressed', 'true');

    const headline = page.getByLabel('Headline');
    await expect(headline).toHaveAttribute('placeholder', 'Flatmate looking for a room in Baner, Wakad');
    await page.getByRole('button', { name: 'Use suggestion' }).click();
    await expect(headline).toHaveValue('Flatmate looking for a room in Baner, Wakad');
    await headline.fill('Call me on 9876543210');
    await page.getByRole('button', { name: /Post request/i }).click();
    await expect(page.locator('.dz-field-error', { hasText: 'Remove phone numbers, emails or links from the headline.' })).toBeVisible();
    await headline.fill('Quiet designer wants a sunny room near Baner');

    const must = page.getByTestId('seeker-must-haves');
    await expect(must, 'the must-haves sit in the open form, not behind "More about you"').toBeVisible();
    await must.getByRole('group', { name: 'Furnishing' }).getByRole('button', { name: 'Semi-furnished' }).click();
    await must.getByRole('group', { name: 'Parking' }).getByRole('button', { name: 'Bike' }).click();
    await must.getByLabel('Gated society only').check();
    await must.getByLabel('Attached bathroom').check();

    const posted = page.waitForResponse(
      (r) => r.url().includes('/flatmates/posts') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /Post request/i }).click();
    const created = await posted;
    expect(created.status(), 'the server should accept everything the form collected').toBe(201);

    const { accessToken } = await apiLogin(mobile);
    const body = await created.json();
    track('posts', body.id, accessToken);
    /* Read back rather than trusting the create response, so a field echoed out of the request body
       without ever being persisted cannot pass. */

    const mine = await (await fetch(`${API}/me/flatmate-posts?size=100`, { headers: auth(accessToken) })).json();
    const rows = mine.content ?? mine.items ?? mine;
    const saved = rows.find((r) => r.id === body.id);
    expect(saved, 'the post should be on the caller own board').toBeTruthy();

    expect(saved.localities?.slice().sort(), 'both localities should have been stored')
      .toEqual(['Baner', 'Wakad']);
    expect(saved.tags, 'lifestyle tags are gone from the post').toBeUndefined();
    /* The selects carry option *labels* on screen and enum values on the wire, so asserting the
       stored value is what proves the translation happened. */
    expect(saved.flatPref, '"Women only" should be stored as the enum').toBe('women');
    expect(saved.roomPref, '"Private room" should be stored as the enum').toBe('private');
    expect(saved.gender, 'an untouched "I am a" stays "any" and is never copied from or onto the profile').toBe('any');
    const me = await (await fetch(`${API}/auth/me`, { headers: auth(accessToken) })).json();
    expect(me.gender ?? null).toBeNull();
    expect(saved.budget, 'the grouped display must not leak commas onto the wire').toBe(17500);
    expect(saved.budgetMax, 'the budget ceiling should be stored as the top of the range').toBe(22000);
    expect(saved.title, 'the headline the poster wrote should be stored as written').toBe('Quiet designer wants a sunny room near Baner');
    expect(saved.moveIn ?? null, '"Flexible" states no move-in date, so every move-in filter passes it').toBeNull();
    expect(saved).toMatchObject({ furnishing: 'semi', parking: 'bike', gatedOnly: true, attachedBath: true });

    await page.goto(`/flatmates/post/${body.id}`);
    await expect(page.getByText('₹17,500 – ₹22,000').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('must-haves').getByRole('listitem'), 'the must-haves lead the "Looking for" section')
      .toHaveText(['Semi-furnished', 'Gated society only', 'Attached bathroom', 'Bike parking']);

    await page.goto('/flatmates?post=1');
    await expect(page.getByRole('button', { name: /Update request/i }), 'a returning poster edits the live request').toBeVisible({ timeout: 20_000 });
    const seeded = page.getByTestId('seeker-must-haves');
    await expect(seeded.getByRole('group', { name: 'Parking' }).getByRole('button', { name: 'Bike' }), 'an edit must not silently clear a must-have').toHaveAttribute('aria-pressed', 'true');
    await expect(seeded.getByRole('group', { name: 'Furnishing' }).getByRole('button', { name: 'Semi-furnished' })).toHaveAttribute('aria-pressed', 'true');
    await expect(seeded.getByLabel('Gated society only')).toBeChecked();
    await expect(seeded.getByLabel('Attached bathroom')).toBeChecked();

    await expect(page.getByRole('heading', { name: 'Edit your flatmate request' })).toBeVisible();
    page.once('dialog', (d) => d.accept());
    const removed = page.waitForResponse((r) => r.url().endsWith(`/flatmates/posts/${body.id}`) && r.request().method() === 'DELETE');
    await page.getByRole('button', { name: 'Take it down to post a new one' }).click();
    expect((await removed).status(), 'take-down should archive the live request').toBeLessThan(300);
    await expect(page.getByRole('heading', { name: 'Post your flatmate request' }), 'the same sheet becomes a new request').toBeVisible();
    await expect(page.getByRole('button', { name: 'Post request' })).toBeVisible();
    await expect(page.getByLabel('Lowest monthly budget')).toHaveValue('');
    const after = await (await fetch(`${API}/me/flatmate-posts?size=100`, { headers: auth(accessToken) })).json();
    expect(after.content ?? after.items ?? after, 'the slot is free for a new request').toHaveLength(0);

    expect(errors, `console errors: ${errors.join('\n')}`).toHaveLength(0);
  });

  test('a profile with no name cannot post: the form says why and sends nothing', async ({ page }) => {
    const session = await apiLogin(uniqueMobile());
    await page.addInitScript(({ accessToken, user }) => {
      localStorage.setItem('draazyTokens', JSON.stringify({ accessToken }));
      localStorage.setItem('draazyUser', JSON.stringify(user));
    }, session);
    const sent = [];
    page.on('request', (r) => { if (r.url().includes('/flatmates/posts') && r.method() === 'POST') sent.push(r.url()); });

    await page.goto('/flatmates?post=1');
    await expect(page.getByRole('heading', { name: /Post your flatmate request/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('profile-name-note')).toContainText('Add your name to your profile to post.');

    await page.getByLabel('Lowest monthly budget').fill('16000');
    const picker = page.getByRole('button', { name: 'Preferred localities' });
    await chooseLocality(page, picker, 'Baner');
    await expect(page.getByRole('button', { name: 'Remove Baner' })).toBeVisible();
    await page.getByRole('button', { name: /Post request/i }).click();

    await expect(page.getByRole('dialog', { name: 'Post your flatmate request' }).getByText('Add your name to your profile first.')).toBeVisible();
    expect(sent, 'nothing may reach the server without a profile name').toEqual([]);
  });

  test('preferred localities stop at three, each shows as a pill inside the field, and its X removes it', async ({ page }) => {
    const errors = trackErrors(page);
    await signedInAsNew(page);
    await page.goto('/flatmates?post=1');
    await expect(page.getByRole('heading', { name: /Post your flatmate request/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('label', { hasText: 'Preferred localities' })).toContainText('(up to 3)');

    const field = page.locator('[data-err="localities"]');
    const picker = page.getByRole('button', { name: 'Preferred localities' });
    await pickLocalitiesIn(page, picker, ['Baner', 'Wakad', 'Kothrud', 'Aundh']);
    const pills = field.locator('.dz-dropdown__box .dz-chip');
    await expect(pills).toHaveText(['Baner', 'Wakad', 'Kothrud']);
    await expect(pills.first()).toHaveClass(/dz-chip--accent/);
    await expect(field.getByRole('button', { name: 'Remove Aundh' })).toHaveCount(0);

    await field.getByRole('button', { name: 'Remove Wakad' }).click();
    await expect(pills).toHaveText(['Baner', 'Kothrud']);
    await expect(page.locator('.dz-dropdown__menu.is-portal-open')).toHaveCount(0);
    await expect(picker).toBeFocused();
    await expect(page.getByLabel('Headline')).toHaveAttribute('placeholder', 'Flatmate looking for a room in Baner, Kothrud');

    await field.getByRole('button', { name: 'Remove Baner' }).click();
    await field.getByRole('button', { name: 'Remove Kothrud' }).click();
    await expect(pills).toHaveCount(0);
    await expect(picker).toContainText('Add localities');
    expect(errors, `console errors: ${errors.join('\n')}`).toHaveLength(0);
  });
});

test.describe('post-request form on a phone', () => {
  test.use({ viewport: { width: 440, height: 956 }, hasTouch: true, isMobile: true });

  test('a tapped locality is chosen and the sheet closes; the verified-only note reads as one sentence', async ({ page }) => {
    // The first-visit cookie bar would sit over the "More about you" toggle at the sheet's foot.
    await page.addInitScript(() => localStorage.setItem('dz_cookie_consent_v1', JSON.stringify({ necessary: true, functional: true, analytics: true, marketing: true, version: 1, ts: Date.now() })));
    await signedInAsNew(page);
    await page.goto('/flatmates?post=1');
    await expect(page.getByRole('heading', { name: /Post your flatmate request/i })).toBeVisible({ timeout: 20_000 });

    const picker = page.getByRole('button', { name: 'Preferred localities' });
    await chooseLocality(page, picker, 'Wakad', { tap: true });
    const pill = page.locator('[data-err="localities"]').getByRole('button', { name: 'Remove Wakad' });
    await expect(pill).toBeVisible();
    const [pillBox, fieldBox] = await Promise.all([pill.boundingBox(), page.locator('[data-err="localities"] .dz-dropdown__box').boundingBox()]);
    expect(pillBox.y, 'the pill sits inside the dropdown field').toBeGreaterThanOrEqual(fieldBox.y);
    expect(pillBox.y + pillBox.height).toBeLessThanOrEqual(fieldBox.y + fieldBox.height);

    const note = page.locator('label', { hasText: 'KYC-done people' });
    await page.getByTestId('seeker-more-details').locator('summary').click();
    await expect(note).toHaveText('Only let KYC-done people express interest in my post');
    expect((await note.boundingBox()).height).toBeLessThan(64);
  });
});
