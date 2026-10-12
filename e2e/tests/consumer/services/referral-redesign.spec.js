/* Loopback redeem signals are identical for every test, so each test sets the stored risk band qualification reads.
 * The hourly hold sweep is off under `e2e`. */
import { test, expect, ACTORS } from '../../../fixtures/live.js';
import { API, E2E_OTP, authHeaders, seedConsent, signedInAs } from '../../../helpers/liveAuth.js';
import { call, entitlementsOf, sql } from '../../../helpers/monetisation.js';
import {
  acceptedContact, ageAccount, codeOf, featuredOf, fillCap, freshMobile, liveListing, member, redeem, referredPair,
  revokeOwnership, rowOf, setRisk, stampVerified, summaryOf, verifyOwnership,
} from '../../../helpers/referral.js';

const userIdOf = (mobile) => sql(`select id from users where mobile = '${mobile}'`);

/** Drives the real sign-up form, already open on the page. */
async function signUp(page, { mobile, name }) {
  await page.locator('#signup-name').fill(name);
  await page.locator('#signup-mobile').fill(mobile);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /Send OTP/i }).click();
  await expect(page.getByLabel('OTP digit 1')).toBeVisible();
  for (let i = 0; i < 6; i += 1) await page.getByLabel(`OTP digit ${i + 1}`).fill(E2E_OTP[i]);
  await page.getByRole('button', { name: /Create Account/i }).click();
  await page.waitForURL(/\/listings/, { timeout: 30_000 });
}

test.describe('LIVE: referral redesign', () => {
  test('a friend signing up from a link redeems the code, and the first accepted contact pays both sides', async ({ page, flags }) => {
    test.slow();
    await flags.enable('referralRewards');
    const referrer = await member('Seeker Referrer');
    const code = await codeOf(referrer);
    const owner = await member('Accepting Owner');
    const listing = await liveListing(owner);
    const plain = await entitlementsOf(await member());

    const friend = freshMobile();
    await seedConsent(page);
    await page.goto(`/signup?ref=${code}`);
    await expect(page.locator('#signup-referral')).toHaveValue(code);
    await signUp(page, { mobile: friend, name: 'Friend Seeker' });

    await expect.poll(async () => (await summaryOf(friend)).friendReward.redeemed, { timeout: 20_000 }).toBe(true);
    expect(rowOf(friend)).toMatchObject({ status: 'pending', track: '' });
    setRisk(friend, 'low');

    // The friend's five extra contacts stand from the moment the code is redeemed.
    const before = (await entitlementsOf(friend)).contacts;
    expect(before.friendBonus).toBe(5);
    expect(before.allowance).toBe(plain.contacts.allowance + 5);
    expect((await summaryOf(friend)).friendReward).toMatchObject({ redeemed: true, status: 'pending', contacts: 5 });

    await acceptedContact(friend, owner, listing.id);

    expect(['qualified', 'rewarded']).toContain(rowOf(friend).status);
    expect(rowOf(friend)).toMatchObject({ track: 'seeker', propertyId: listing.id });
    const earned = await summaryOf(referrer);
    expect(earned).toMatchObject({ invited: 1, converted: 1, held: 0, earned: { seeker: { referrals: 1, contacts: 15 } } });
    expect((await entitlementsOf(referrer)).contacts.referralBonus).toBe(15);
    expect((await entitlementsOf(friend)).contacts.friendBonus).toBe(5);

    await test.step('the friend is told what they got', async () => {
      await page.goto('/refer');
      await expect(page.getByTestId('refer-joined')).toContainText('+5 free contacts');
    });

    await test.step('the referrer sees what was earned', async () => {
      await signedInAs(page, referrer);
      await page.goto('/refer');
      await expect(page.getByTestId('refer-invited')).toHaveText('1');
      await expect(page.getByTestId('refer-held')).toHaveText('0');
      await expect(page.getByTestId('refer-contacts-earned')).toHaveText('15');
    });
  });

  test('a code from the first visit survives until sign-up, and a refusal is told without saying why', async ({ page }) => {
    await seedConsent(page);
    await page.goto('/listings?ref=FIRST-TOUCH');
    await page.goto('/listings?ref=SECOND-TOUCH');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('dz_ref')).code), 'first touch wins').toBe('FIRST-TOUCH');

    await page.goto('/signup');
    await expect(page.locator('#signup-referral')).toHaveValue('FIRST-TOUCH');
    await page.locator('#signup-referral').fill('NO-SUCH-CODE');

    const mobile = freshMobile();
    await signUp(page, { mobile, name: 'Unlucky Friend' });
    await expect(page.getByText(/That code couldn.t be applied/)).toBeVisible({ timeout: 20_000 });
    expect((await summaryOf(mobile)).friendReward.redeemed).toBe(false);
    expect(await page.evaluate(() => localStorage.getItem('dz_ref')), 'a used or refused code is not kept').toBeNull();
  });

  test('the owner track pays the referrer a free agreement and Features the friend\'s listing for 14 days', async ({ page, flags }) => {
    await flags.enable('referralRewards');
    const { referrer, referee } = await referredPair({ referrerName: 'Owner Referrer', refereeName: 'Owner Friend' });
    setRisk(referee, 'low');
    const listing = await liveListing(referee);
    expect(rowOf(referee).status, 'a live listing alone qualifies nothing').toBe('pending');
    expect((await entitlementsOf(referrer)).agreements.free).toBe(0);

    await verifyOwnership(referee, listing);

    expect(['qualified', 'rewarded']).toContain(rowOf(referee).status);
    expect(rowOf(referee)).toMatchObject({ track: 'owner', propertyId: listing.id });
    expect((await entitlementsOf(referrer)).agreements.free).toBe(1);
    expect(await summaryOf(referrer)).toMatchObject({ converted: 1, earned: { owner: { referrals: 1, agreements: 1 } } });
    expect((await summaryOf(referee)).friendReward).toMatchObject({ redeemed: true, track: 'owner', contacts: 0, featuredDays: 14 });
    expect(sql(`select featured_days from properties where id = '${listing.id}'`)).toBe('14');

    expect(await featuredOf(referee, listing.id), 'just verified').toBe(true);
    stampVerified(listing.id, '10 days');
    expect(await featuredOf(referee, listing.id), 'day ten is inside the referral window and outside the ordinary week').toBe(true);
    stampVerified(listing.id, '15 days');
    expect(await featuredOf(referee, listing.id), 'the fortnight has run out').toBe(false);

    await signedInAs(page, referrer);
    await page.goto('/refer');
    await expect(page.getByTestId('refer-owner-track')).toContainText('14 days');
    await expect(page.getByTestId('refer-agreements')).toHaveText('0 / 1');
  });

  test('withdrawing the verification takes the owner reward back', async () => {
    const { referrer, referee } = await referredPair();
    setRisk(referee, 'low');
    const listing = await liveListing(referee);
    await verifyOwnership(referee, listing);
    expect((await entitlementsOf(referrer)).agreements.free).toBe(1);

    await revokeOwnership(listing);

    expect(rowOf(referee)).toMatchObject({ status: 'clawed-back', autoReason: 'verification_revoked' });
    expect((await entitlementsOf(referrer)).agreements.free).toBe(0);
  });

  test('a code is refused for an old account, one with activity, the referrer\'s own device and a switched-off programme, all alike', async ({ flags }) => {
    await flags.enable('referralRewards');
    const referrer = await member('Strict Referrer');
    const device = `e2e-device-${Date.now()}`;
    const code = await codeOf(referrer, device);

    const old = await member();
    ageAccount(old, 25);
    const stale = await redeem(old, code);

    const lister = await member();
    await liveListing(lister);
    const active = await redeem(lister, code);

    const asker = await member();
    const owner = await member();
    const listing = await liveListing(owner);
    expect((await call('POST', '/contacts/request', asker, { propertyId: listing.id })).status).toBe(200);
    const contacted = await redeem(asker, code);

    const sameDevice = await redeem(await member(), code, device);

    await flags.disable('referralRewards');
    const off = await redeem(await member(), code);

    const said = ({ error, message }) => ({ error, message });
    for (const [why, res] of Object.entries({ stale, active, contacted, sameDevice, off })) {
      expect(res.status, why).toBe(409);
      expect(said(res.json), `${why} reads like every other refusal`).toEqual(said(stale.json));
    }
    for (const mobile of [old, lister, asker]) expect(rowOf(mobile), 'a refusal leaves no row').toBeNull();

    await flags.enable('referralRewards');
    const elsewhere = await member();
    expect((await redeem(elsewhere, code, `${device}-other`)).status, 'a different device is fine').toBe(200);
    expect(rowOf(elsewhere).status).toBe('pending');
  });

  test('a referrer at the monthly cap is refused the next reward as cap_reached', async () => {
    const { referrer, referee } = await referredPair();
    setRisk(referee, 'low');
    fillCap(referrer, 10);
    const owner = await member('Accepting Owner');
    const listing = await liveListing(owner);

    await acceptedContact(referee, owner, listing.id);

    expect(rowOf(referee)).toMatchObject({ status: 'rejected', autoReason: 'cap_reached' });
    expect((await summaryOf(referee)).friendReward.contacts, 'a refused referral withdraws the friend\'s bonus too').toBe(0);
    expect((await entitlementsOf(referee)).contacts.friendBonus).toBe(0);
  });

  test('the referrer approving their own referee earns nothing and is refused as self_dealing', async () => {
    const { referrer, referee } = await referredPair({ referrerName: 'Self Dealer' });
    setRisk(referee, 'low');
    const listing = await liveListing(referrer);

    await acceptedContact(referee, referrer, listing.id);

    expect(rowOf(referee)).toMatchObject({ status: 'rejected', autoReason: 'self_dealing' });
    expect((await entitlementsOf(referrer)).contacts.referralBonus).toBe(0);
    expect((await summaryOf(referrer)).earned.seeker.contacts).toBe(0);
    expect((await entitlementsOf(referee)).contacts.friendBonus, 'a refused referral withdraws the friend\'s bonus too').toBe(0);
  });

  test('one owner approving several of a referrer\'s friends is a ring, and only the first is paid', async () => {
    const referrer = await member('Ring Referrer');
    const code = await codeOf(referrer);
    const first = await member('Ring Friend One');
    const second = await member('Ring Friend Two');
    for (const friend of [first, second]) {
      expect((await redeem(friend, code)).status).toBe(200);
      setRisk(friend, 'low');
    }
    const owner = await member('Ring Owner');
    const listing = await liveListing(owner);

    await acceptedContact(first, owner, listing.id);
    await acceptedContact(second, owner, listing.id);

    expect(['qualified', 'rewarded']).toContain(rowOf(first).status);
    expect(rowOf(second)).toMatchObject({ status: 'rejected', autoReason: 'high_risk' });
    expect((await entitlementsOf(referrer)).contacts.referralBonus).toBe(15);
  });

  test('a redeem with no device id is never scored low', async () => {
    const { referee } = await referredPair();
    expect(rowOf(referee).risk).not.toBe('low');
  });
  test('suspending the referee within the clawback window takes the reward back by itself', async () => {
    const { referrer, referee } = await referredPair();
    setRisk(referee, 'low');
    const owner = await member('Accepting Owner');
    const listing = await liveListing(owner);
    await acceptedContact(referee, owner, listing.id);
    expect((await entitlementsOf(referrer)).contacts.referralBonus).toBe(15);

    const id = userIdOf(referee);
    const suspended = await call('PATCH', `/users/${id}/suspend`, ACTORS.admin, { reason: 'Referral fixture suspension' });
    try {
      expect(suspended.status, JSON.stringify(suspended.json)).toBeLessThan(300);
      expect(rowOf(referee)).toMatchObject({ status: 'clawed-back', autoReason: 'referee_suspended' });
      expect((await entitlementsOf(referrer)).contacts.referralBonus).toBe(0);
      expect((await summaryOf(referrer)).earned.seeker.contacts).toBe(0);
    } finally {
      await call('PATCH', `/users/${id}/reactivate`, ACTORS.admin);
    }
  });

  test('a signed-in owner\'s listing share link carries their referral code', async ({ page, flags }) => {
    await flags.enable('referralRewards');
    const owner = await member('Sharing Owner');
    const code = await codeOf(owner);
    const listing = await liveListing(owner);
    await verifyOwnership(owner, listing);

    await page.addInitScript(() => {
      window.__shared = null;
      navigator.share = (d) => { window.__shared = d; return Promise.resolve(); };
    });
    await signedInAs(page, owner);
    await page.goto('/dashboard#properties');
    await page.getByRole('button', { name: /share listing/i }).first().click();

    await expect.poll(() => page.evaluate(() => window.__shared?.url ?? null), { timeout: 20_000 }).not.toBeNull();
    const shared = new URL(await page.evaluate(() => window.__shared.url));
    expect(shared.searchParams.get('ref')).toBe(code);
    expect(shared.pathname).toContain('/property/');
  });

  test('the public pricing and the entitlements speak the new programme, with no listing-slot reward', async () => {
    const doc = await (await fetch(`${API}/admin/settings`, { headers: await authHeaders(ACTORS.admin) })).json();
    const { pricing } = await (await fetch(`${API}/bootstrap`)).json();
    const f = doc.fees;
    expect(pricing.referral).toEqual({
      contactBonus: f.referralContactBonus,
      seekerBonusContacts: f.referralSeekerBonusContacts,
      ownerFeaturedDays: f.referralOwnerFeaturedDays,
      ownerRewardAgreements: f.referralOwnerRewardAgreements,
      featuredDays: f.featuredDays,
      qualifyPerMonth: f.referralQualifyPerMonth,
      qualifyPerYear: f.referralQualifyPerYear,
      holdDays: f.referralHoldDays,
      clawbackDays: f.referralClawbackDays,
      signupWindowHours: f.referralSignupWindowHours,
    });

    const mine = await entitlementsOf(await member());
    expect(mine.listings).not.toHaveProperty('referralBonus');
    expect(mine.contacts).toHaveProperty('friendBonus', 0);
    expect(mine.agreements).toMatchObject({ free: 0, used: 0, remaining: 0 });
  });
});