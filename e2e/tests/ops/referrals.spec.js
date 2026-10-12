/** Each test mints its own referrer and referee: no run-order coupling, no seeded account to wear out. */
import { ACTORS, expect, test } from '../../fixtures/live.js';
import { API, apiLogin } from '../../helpers/liveAuth.js';
import {
  DESK, acceptedContact, decide, deskRow, deskRows, liveListing, member, referredPair, rowOf, setRisk, summaryOf,
} from '../../helpers/referral.js';
import { entitlementsOf } from '../../helpers/monetisation.js';

const auth = (token) => ({ 'content-type': 'application/json', authorization: `Bearer ${token}` });

const rowFor = (page, mobile) => page.getByTestId('queue-row').filter({ hasText: mobile });

/** `Badge` translates rather than passes through; the wire vocabulary is checked in `ReferralEndpointsTest`. */
const LABEL = {
  pending: 'Under Review',
  held: 'held',
  rewarded: 'rewarded',
  rejected: 'rejected',
  'clawed-back': 'clawed back',
};

/** Exact, so a status word cannot collide with a button carrying the same letters. */
const statusOf = (page, mobile, status) => rowFor(page, mobile).getByText(LABEL[status], { exact: true });

const openTab = (page, label) => page.getByRole('tab', { name: new RegExp(`^${label}`) }).click();

/** A referral is found by the referee's mobile: it is unique, and names repeat across tests. */
async function find(page, mobile) {
  await page.getByPlaceholder('Referrer, referred or ID').fill(mobile);
  await expect(rowFor(page, mobile)).toHaveCount(1, { timeout: 20_000 });
}

/** The desk opens on Held; `tab` follows the row to wherever the referral now lives. */
async function openDesk(page, login, tab) {
  await login.asStaff('rental');
  await page.goto('/ops/referrals');
  await expect(page.getByRole('heading', { name: 'Referral audit' })).toBeVisible();
  // If this fires, the desk fell back to its offline panel and nothing below means anything.
  await expect(page.getByText(/needs the live API/i)).toHaveCount(0);
  if (tab) await openTab(page, tab);
}

/** A referee whose first accepted contact has been made at the given risk band. */
async function qualifiedAt(risk, names) {
  const pair = await referredPair(names);
  setRisk(pair.referee, risk);
  const owner = await member('Accepting Owner');
  const listing = await liveListing(owner);
  await acceptedContact(pair.referee, owner, listing.id);
  return { ...pair, owner, listing };
}

test.describe('Ops: referral audit desk (live)', () => {
  test('a redeemed referral waits under Pending with both numbers in full and its track not yet known', async ({ page, login }) => {
    const { referrer, referee } = await referredPair({ referrerName: 'Tanvi Mehta', refereeName: 'Tanvi Deshpande' });
    await openDesk(page, login, 'Pending');
    await find(page, referee);

    const row = rowFor(page, referee);
    await expect(statusOf(page, referee, 'pending')).toBeVisible();
    await expect(row).toContainText(new RegExp(`${referrer}\\D+${referee}`));
    await expect(row).toContainText('Contacts-only referral');
    await expect(row).toContainText(/(low|medium|high) risk/);
    await expect(row).toContainText('Same IP');
  });

  test('the desk opens on Held, and a medium-risk qualification shows there with the day it releases', async ({ page, login }) => {
    const { referrer, referee } = await qualifiedAt('medium');

    expect(rowOf(referee)).toMatchObject({ status: 'held', track: 'seeker', held: true });
    const dto = await deskRow(referee);
    expect(dto).toMatchObject({ status: 'held', track: 'seeker', risk: 'medium' });
    expect(dto.holdUntil, 'a held row says when it is decided').toBeTruthy();
    expect(dto.autoReason).toBe('medium_risk');
    expect((await deskRows()).counts.held).toBeGreaterThanOrEqual(1);

    await openDesk(page, login);
    await expect(page.getByRole('tab', { name: /^Held/ })).toHaveAttribute('aria-selected', 'true');
    await find(page, referee);
    const row = rowFor(page, referee);
    await expect(statusOf(page, referee, 'held')).toBeVisible();
    await expect(row).toContainText('Held until');
    await expect(row).toContainText('Seeker referral');
    await expect(row).toContainText('medium risk');
    await expect(row).toContainText('Needs review');

    // Held pays nothing yet: the referrer sees it as "checking", not as converted.
    const summary = await summaryOf(referrer);
    expect(summary).toMatchObject({ held: 1, converted: 0, earned: { seeker: { referrals: 0, contacts: 0 } } });
  });

  test('approving a held referral releases the reward the referrer can spend', async ({ page, login }) => {
    const { referrer, referee } = await qualifiedAt('medium');
    await openDesk(page, login);
    await find(page, referee);

    await rowFor(page, referee).getByRole('button', { name: 'Approve' }).click();
    await expect(rowFor(page, referee)).toHaveCount(0);
    await openTab(page, 'Rewarded');
    await find(page, referee);
    await expect(statusOf(page, referee, 'rewarded')).toBeVisible();

    const summary = await summaryOf(referrer);
    expect(summary).toMatchObject({ converted: 1, held: 0, earned: { seeker: { referrals: 1, contacts: 15 } } });
    expect(summary).not.toHaveProperty('contactsEarned');
    const { contacts } = await entitlementsOf(referrer);
    expect(contacts.referralBonus).toBe(15);
    expect(contacts.allowance).toBeGreaterThan(contacts.referralBonus);
  });

  test('a high-risk qualification is refused by the system, and the desk says why', async ({ page, login }) => {
    const { referee } = await qualifiedAt('high');
    expect(rowOf(referee)).toMatchObject({ status: 'rejected', autoReason: 'high_risk' });

    await openDesk(page, login, 'High risk');
    await find(page, referee);
    await expect(rowFor(page, referee)).toContainText('high risk');

    await openTab(page, 'Refused');
    await find(page, referee);
    const row = rowFor(page, referee);
    await expect(statusOf(page, referee, 'rejected')).toBeVisible();
    await expect(row).toContainText('Auto reason');
    await expect(row).toContainText('High risk');
    // Rejecting a rejected row is meaningless; only the appeal is offered.
    await expect(row.getByRole('button', { name: 'Reject' })).toHaveCount(0);
    await expect(row.getByRole('button', { name: 'Appeal: approve' })).toBeVisible();
  });

  test('an appeal needs a reason on the server and on the desk, and an accepted one pays out', async ({ page, login }) => {
    const { referrer, referee } = await qualifiedAt('high');
    const dto = await deskRow(referee);

    // The server's rule first, so the desk's prompt is only a courtesy over it.
    for (const body of [undefined, {}, { reason: '   ' }]) {
      const refused = await decide(dto.id, 'approve', body);
      expect(refused.status, JSON.stringify(body)).toBe(422);
    }
    expect(rowOf(referee).status).toBe('rejected');

    await openDesk(page, login, 'Refused');
    await find(page, referee);
    const appeal = rowFor(page, referee).getByRole('button', { name: 'Appeal: approve' });
    const writes = [];
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('/approve')) writes.push(req.postDataJSON());
    });

    page.once('dialog', (d) => d.dismiss());
    await appeal.click();
    page.once('dialog', (d) => d.accept('   '));
    await appeal.click();
    await expect(page.getByText(/needs the live API/i)).toHaveCount(0);
    expect(writes, 'cancelling or leaving the reason blank writes nothing').toEqual([]);
    expect(rowOf(referee).status).toBe('rejected');

    page.once('dialog', (d) => d.accept('Owner confirmed the contact by phone'));
    await appeal.click();
    await expect(rowFor(page, referee)).toHaveCount(0);
    expect(writes).toEqual([{ reason: 'Owner confirmed the contact by phone' }]);
    expect(rowOf(referee).status).toBe('rewarded');
    expect((await summaryOf(referrer)).earned.seeker.contacts).toBe(15);
  });

  test('approve no longer needs the referee to hold an identity badge', async () => {
    const { referee } = await referredPair();
    const dto = await deskRow(referee);
    expect(dto.identityVerified, 'the fixture really has no badge').toBe(false);

    const approved = await decide(dto.id, 'approve');
    expect(approved.status, JSON.stringify(approved.json)).toBe(200);
    expect(approved.json.status).toBe('rewarded');
  });

  test('a clawback reads clawed-back, which is not the same as rejected', async ({ page, login }) => {
    const { referee } = await referredPair();
    const dto = await deskRow(referee);
    expect((await decide(dto.id, 'approve')).status).toBe(200);

    await openDesk(page, login, 'Rewarded');
    await find(page, referee);
    await rowFor(page, referee).getByRole('button', { name: 'Clawback' }).click();

    /* Rejected-unpaid and rejected-after-payout (recovered) are distinct outcomes a fraud desk needs. */
    await openTab(page, 'Refused');
    await find(page, referee);
    await expect(statusOf(page, referee, 'clawed-back')).toBeVisible();
    await expect(statusOf(page, referee, 'rejected')).toHaveCount(0);
  });

  test('High risk is a risk filter, not a status', async ({ page, login }) => {
    const medium = await referredPair();
    setRisk(medium.referee, 'medium');
    const high = await referredPair();
    setRisk(high.referee, 'high');
    await openDesk(page, login, 'High risk');

    await find(page, high.referee);
    await page.getByPlaceholder('Referrer, referred or ID').fill(medium.referee);
    await expect(rowFor(page, medium.referee)).toHaveCount(0);

    await openTab(page, 'Pending');
    await find(page, medium.referee);

    /* There is no `flagged` status on the server, so a tab filtering on one would have sat
       permanently empty - a fraud desk being told there is nothing suspicious. */
    await expect(page.getByRole('tab', { name: /^Flagged/ })).toHaveCount(0);
  });

  // A redirect is the weakest refusal; the API refusing a buyer's token is what the money rests on.
  test('the referrals API refuses a signed-in buyer and answers the staffer', async () => {
    const { accessToken: buyerToken } = await apiLogin(ACTORS.buyer);
    const refused = await fetch(`${API}/referrals?size=1`, { headers: auth(buyerToken) });
    expect(refused.status, await refused.text()).toBe(403);

    const { accessToken: staffToken } = await apiLogin(DESK);
    const allowed = await fetch(`${API}/referrals?size=1`, { headers: auth(staffToken) });
    expect(allowed.status, await allowed.text()).toBe(200);
  });
});