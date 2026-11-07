/* The invite-by-mobile box on /refer, and redeeming a stored code on the sign-in path. The WhatsApp
 * provider is disabled under `e2e`, so the server answers `open_whatsapp` and the browser opens the wa.me link. */
import { test, expect } from '../../../fixtures/live.js';
import { seedConsent, signIn, signedInAs } from '../../../helpers/liveAuth.js';
import { codeOf, freshMobile, member, rowOf, summaryOf } from '../../../helpers/referral.js';

const FRIEND_MOBILE = '9876543210';

const stubWindowOpen = (page) => page.addInitScript(() => {
  window.__opened = [];
  window.open = (u) => { window.__opened.push(String(u)); return {}; };
});

async function openRefer(page, referrer) {
  await signedInAs(page, referrer);
  await page.goto('/refer');
  await expect(page.getByTestId('refer-invite-form')).toBeVisible();
}

const send = async (page, mobile) => {
  await page.locator('#refer-friend-mobile').fill(mobile);
  await page.getByTestId('refer-invite-send').click();
};

test.describe('LIVE: referral invite by mobile', () => {
  test('a valid number opens WhatsApp on the friend with the referrer\'s link, and the page says so', async ({ page, flags }) => {
    await flags.enable('referralRewards');
    const referrer = await member('Inviting Referrer');
    const code = await codeOf(referrer);
    await stubWindowOpen(page);
    await openRefer(page, referrer);

    const [res] = await Promise.all([
      page.waitForResponse((r) => /\/api\/me\/referrals\/invites$/.test(r.url()) && r.request().method() === 'POST'),
      send(page, FRIEND_MOBILE),
    ]);
    expect(res.status()).toBe(200);
    expect((await res.json()).delivery).toBe('open_whatsapp');

    await expect.poll(() => page.evaluate(() => window.__opened.length)).toBe(1);
    const url = await page.evaluate(() => window.__opened[0]);
    expect(url).toContain(`wa.me/91${FRIEND_MOBILE}`);
    expect(decodeURIComponent(url)).toContain(`ref=${code}`);
    await expect(page.getByTestId('refer-invite-status')).toHaveText('Opening WhatsApp…');
    await expect(page.locator('#refer-friend-mobile'), 'the box is cleared for the next friend').toHaveValue('');
  });

  test('a blocked popup leaves a tappable WhatsApp link instead of navigating away', async ({ page, flags }) => {
    await flags.enable('referralRewards');
    const referrer = await member('Blocked Popup Referrer');
    await page.addInitScript(() => { window.open = () => null; });
    await openRefer(page, referrer);

    await send(page, FRIEND_MOBILE);

    await expect(page.getByTestId('refer-invite-status')).toHaveText('Your browser stopped WhatsApp from opening. Tap below to send the invite.');
    const link = page.getByTestId('refer-invite-open');
    await expect(link).toHaveAttribute('href', new RegExp(`^https://wa\\.me/91${FRIEND_MOBILE}`));
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(page).toHaveURL(/\/refer$/);
  });

  test('a short number is refused on the page before anything is sent', async ({ page }) => {
    const referrer = await member('Typo Referrer');
    const invites = [];
    page.on('request', (req) => { if (req.url().includes('/me/referrals/invites')) invites.push(req.url()); });
    await openRefer(page, referrer);

    await send(page, '98765');

    await expect(page.getByTestId('refer-invite-status')).toHaveText('Enter a valid 10-digit mobile number.');
    expect(invites, 'an invalid number never leaves the browser').toEqual([]);
  });

  test('the referrer\'s own number is refused by the server with a friendly line', async ({ page }) => {
    const referrer = await member('Self Inviter');
    await openRefer(page, referrer);

    const [res] = await Promise.all([
      page.waitForResponse((r) => /\/api\/me\/referrals\/invites$/.test(r.url())),
      send(page, referrer),
    ]);
    expect(res.status()).toBe(422);
    expect((await res.json()).error).toBe('own_number');
    await expect(page.getByTestId('refer-invite-status')).toHaveText('That is your own number. Enter your friend\'s number.');
  });

  test('a 429 reads as the daily limit and a 409 as paused', async ({ page }) => {
    const referrer = await member('Capped Referrer');
    await openRefer(page, referrer);

    await page.route('**/api/me/referrals/invites', (route) => route.fulfill({
      status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'invite_limit' }),
    }));
    await send(page, FRIEND_MOBILE);
    await expect(page.getByTestId('refer-invite-status')).toHaveText('You have reached today\'s invite limit. Try again tomorrow.');

    await page.unroute('**/api/me/referrals/invites');
    await page.route('**/api/me/referrals/invites', (route) => route.fulfill({
      status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'conflict' }),
    }));
    await send(page, FRIEND_MOBILE);
    await expect(page.getByTestId('refer-invite-status')).toHaveText('Referrals are paused right now. Please try again later.');
  });

  test('a server-sent invite is confirmed with the number and opens nothing', async ({ page }) => {
    const referrer = await member('Delivered Referrer');
    await stubWindowOpen(page);
    await openRefer(page, referrer);
    await page.route('**/api/me/referrals/invites', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ delivery: 'sent' }),
    }));

    await send(page, FRIEND_MOBILE);

    await expect(page.getByTestId('refer-invite-status')).toHaveText(`Invite sent to +91 ${FRIEND_MOBILE}`);
    expect(await page.evaluate(() => window.__opened)).toEqual([]);
  });

  test('a friend who signs in for the first time with a stored code is redeemed, and the code is cleared', async ({ page, flags }) => {
    test.slow();
    await flags.enable('referralRewards');
    const referrer = await member('Signin Referrer');
    const code = await codeOf(referrer);
    const friend = freshMobile();

    await seedConsent(page);
    await page.goto(`/listings?ref=${code}&ch=whatsapp`);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('dz_ref')).code)).toBe(code);

    await signIn(page, friend);

    await expect.poll(async () => (await summaryOf(friend)).friendReward.redeemed, { timeout: 20_000 }).toBe(true);
    expect(rowOf(friend)).toMatchObject({ status: 'pending' });
    expect(await page.evaluate(() => localStorage.getItem('dz_ref')), 'a used code is not kept').toBeNull();
  });
});
