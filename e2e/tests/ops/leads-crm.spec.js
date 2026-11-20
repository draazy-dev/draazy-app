import { test, expect, ACTORS, STAFF } from '../../fixtures/live.js';
import { letterTag, signIn, uniqueMobile } from '../../helpers/liveAuth.js';
import { call, sql } from '../../helpers/monetisation.js';

const PHONE = { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true };
const row = (page, name) => page.getByTestId('lead-row').filter({ hasText: name });
const tab = (page, label) => page.getByRole('tab', { name: new RegExp(`^${label}`) });

async function phone(browser, mobile) {
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  await signIn(page, mobile, { screen: 'staff' });
  return { context, page };
}

async function openLeads(page, base = '/staff') {
  await page.goto(`${base}/leads`);
  await expect(page.getByRole('heading', { name: 'Leads', exact: true })).toBeVisible({ timeout: 20000 });
}

async function expectNoSidewaysScroll(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'the page scrolls sideways on a phone').toBeLessThanOrEqual(0);
}

function freeUpStaff(mobile) {
  sql(
    "update crm_leads set owner_id = null where stage in ('new', 'contacted', 'interested')"
    + ` and owner_id = (select id from users where mobile = '${mobile}')`,
  );
}

async function seedLead(name, interests = ['packers']) {
  const mobile = uniqueMobile();
  const profile = { name, leadType: 'seeker', intent: 'rent', leadSource: 'walk-in' };
  const res = await call('POST', '/admin/leads', ACTORS.admin, { mobile, profile, interests });
  expect(res.status, JSON.stringify(res.json)).toBe(201);
  return { id: res.json.id, mobile };
}

async function paidRequestFor(leadMobile) {
  const res = await call('POST', '/service-requests', leadMobile, {
    type: 'packers',
    details: { property: 'Baner, Pune', note: 'Leads CRM spec' },
  });
  expect(res.status, JSON.stringify(res.json)).toBe(201);
  const requestId = res.json.id;
  sql(`update service_requests set status = 'new', amount = 4999 where id = '${requestId}'`);
  sql(`update crm_leads set user_id = (select id from users where mobile = '${leadMobile}') where mobile = '${leadMobile}'`);
  return requestId;
}

test.describe('LIVE: staff Leads CRM on a phone', () => {
  test('claim, call once, cooldown, one owner, convert and performance', async ({ browser, login }) => {
    test.slow();
    await login.scopeStaff('rental', ['leads']);
    await login.scopeStaff('legal', ['leads']);
    freeUpStaff(STAFF.rental);

    const name = `Asha ${letterTag()}`;
    const lead = await seedLead(name);
    await paidRequestFor(lead.mobile);

    const a = await phone(browser, STAFF.rental);
    const b = await phone(browser, STAFF.legal);
    const m = await phone(browser, ACTORS.manager);

    try {
      await test.step('staff sees the lead in the common pool and claims it', async () => {
        await openLeads(a.page);
        await expectNoSidewaysScroll(a.page);
        await expect(tab(a.page, 'Performance'), 'performance is a manager view').toHaveCount(0);
        await expect(tab(a.page, 'All')).toHaveCount(0);
        await tab(a.page, 'Common pool').click();
        const card = row(a.page, name);
        await expect(card).toHaveCount(1, { timeout: 20000 });
        await expect(card).toContainText('Packers');
        await expect(card.getByTestId('lead-type')).toHaveText('Buyer / Tenant · Rent');
        await expect(card.getByTestId('lead-source')).toHaveText('via Walk-in');
        await expect(card.getByTestId('lead-consent')).toBeVisible();
        await expect(card, 'the number stays masked in the list').not.toContainText(lead.mobile);
        const claim = card.getByTestId('lead-claim');
        expect((await claim.boundingBox()).height).toBeGreaterThanOrEqual(44);
        await claim.click();
        await expect(a.page.getByText('Lead claimed')).toBeVisible();
        await expect(row(a.page, name)).toHaveCount(0);
      });

      await test.step('it is now in My leads and opens with Call and WhatsApp', async () => {
        await tab(a.page, 'My leads').click();
        const card = row(a.page, name);
        await expect(card).toHaveCount(1, { timeout: 20000 });
        await card.getByTestId('lead-open').click();
        await expect(a.page.getByTestId('lead-detail')).toBeVisible();
        await expect(a.page.getByTestId('lead-call')).toBeEnabled();
        await expect(a.page.getByTestId('lead-whatsapp')).toBeEnabled();
        expect(await a.page.getByTestId('lead-call').evaluate((el) => el.offsetHeight)).toBeGreaterThanOrEqual(44);
        await expect(a.page.getByTestId('lead-cooldown')).toHaveCount(0);
      });

      await test.step('logging a call outcome starts the cooldown and locks both buttons', async () => {
        await a.page.getByTestId('lead-call').click();
        await expect(a.page.getByRole('dialog', { name: 'How did it go?' })).toBeVisible();
        await a.page.getByRole('group', { name: 'Outcome' }).getByRole('button', { name: 'No answer' }).click();
        await a.page.getByTestId('lead-outcome-submit').click();
        await expect(a.page.getByTestId('lead-cooldown')).toContainText('Next contact after');
        await expect(a.page.getByTestId('lead-call')).toBeDisabled();
        await expect(a.page.getByTestId('lead-whatsapp')).toBeDisabled();
        await expect(a.page.getByTestId('lead-activity').first()).toContainText('No answer');
        const again = await call('POST', `/admin/leads/${lead.id}/contacts`, STAFF.rental, { channel: 'call', outcome: 'no-answer' });
        expect(again.status, 'the server refuses a second call inside the window').toBe(409);
        expect(again.json.error).toBe('lead-cooldown');
      });

      await test.step('another staffer sees who owns it and the full number to dial, cannot log a call, but can fill in the profile', async () => {
        await openLeads(b.page);
        await b.page.getByTestId('lead-search').fill(name);
        const card = row(b.page, name);
        await expect(card).toHaveCount(1, { timeout: 20000 });
        await expect(card.getByTestId('lead-owner')).toContainText('Owned by');
        await expect(card.getByTestId('lead-claim')).toHaveCount(0);
        await expect(card, 'the list stays masked for everyone').not.toContainText(lead.mobile);
        await card.getByTestId('lead-open').click();
        await expect(b.page.getByTestId('lead-detail')).toBeVisible();
        const mobile = b.page.getByTestId('lead-mobile');
        await expect(mobile).toHaveText(`+91 ${lead.mobile.slice(0, 5)} ${lead.mobile.slice(5)}`);
        await expect(mobile).toHaveAttribute('href', `tel:+91${lead.mobile}`);
        await expect(b.page.getByTestId('lead-call')).toHaveCount(0);
        await expect(b.page.getByTestId('lead-claim-detail')).toHaveCount(0);
        const claim = await call('POST', `/admin/leads/${lead.id}/claim`, STAFF.legal);
        expect(claim.status).toBe(409);
        expect(claim.json.error).toBe('lead-owned');

        await b.page.getByTestId('lead-profile-edit').click();
        const sheet = b.page.getByRole('dialog', { name: 'Edit profile' });
        await sheet.getByRole('group', { name: 'Property type' }).getByRole('button', { name: 'Flat / Apartment' }).click();
        await sheet.getByRole('group', { name: 'BHK' }).getByRole('button', { name: '2 BHK' }).click();
        await sheet.getByTestId('lead-profile-localities').fill('Wakad');
        await sheet.getByTestId('lead-profile-budget').fill('25000');
        await sheet.getByTestId('lead-profile-save').click();
        await expect(b.page.getByText('Profile saved')).toBeVisible();
        await expect(b.page.getByTestId('lead-profile-line')).toHaveText('2 BHK · Flat / Apartment · Wakad · ₹25,000/mo');
      });

      await test.step('the owner converts it on a paid request', async () => {
        await a.page.getByTestId('lead-convert').click();
        const option = a.page.getByTestId('lead-convertible');
        await expect(option).toHaveCount(1, { timeout: 20000 });
        await expect(option).toContainText('₹4,999');
        await option.click();
        await a.page.getByTestId('lead-convert-submit').click();
        await expect(a.page.getByTestId('lead-detail').getByTestId('lead-stage')).toHaveText('Converted');
        await expect(a.page.getByTestId('lead-conversion')).toHaveCount(1);
      });

      await test.step('the manager sees the conversion credited to the owner on Performance', async () => {
        const owner = (await call('GET', `/admin/leads/${lead.id}`, STAFF.rental)).json.ownerName;
        await openLeads(m.page, '/admin');
        await tab(m.page, 'Performance').click();
        await expect(m.page.getByTestId('perf-totals')).toBeVisible({ timeout: 20000 });
        const perf = (await call('GET', '/admin/leads/performance?days=30', ACTORS.manager)).json;
        const mine = perf.rows.find((r) => r.staffName === owner);
        expect(mine.conversions).toBeGreaterThanOrEqual(1);
        const card = m.page.getByTestId('perf-row').filter({ hasText: owner }).first();
        await expect(card.getByTestId('perf-conversions')).toHaveText(`${mine.conversions} converted`);
        await m.page.getByRole('button', { name: '7 days' }).click();
        await expect(m.page.getByTestId('perf-totals')).toBeVisible();
        await expectNoSidewaysScroll(m.page);
      });
    } finally {
      await a.context.close();
      await b.context.close();
      await m.context.close();
    }
  });

  test('adding a lead twice opens the same lead instead of duplicating it', async ({ browser, login }) => {
    await login.scopeStaff('rental', ['leads']);
    const mobile = uniqueMobile();
    const name = `Bina ${letterTag()}`;
    const { context, page } = await phone(browser, STAFF.rental);
    const pick = (group, option) => page.getByRole('dialog').getByRole('group', { name: group }).getByRole('button', { name: option, exact: true }).click();
    try {
      await openLeads(page);
      await page.getByTestId('lead-add').click();
      const mobileField = page.getByTestId('lead-add-mobile');
      await expect(mobileField).toHaveAttribute('type', 'tel');
      await expect(mobileField).toHaveAttribute('inputmode', 'numeric');
      await mobileField.fill(mobile);
      await page.getByTestId('lead-add-name').fill(name);
      await expect(page.getByTestId('lead-add-missing')).toBeVisible();
      await expect(page.getByTestId('lead-add-submit')).toBeDisabled();
      await pick('Lead type', 'Owner');
      await pick('Intent', 'Rent out');
      await pick('Property type', 'Flat / Apartment');
      await pick('BHK', '2 BHK');
      await page.getByTestId('lead-profile-localities').fill('Baner');
      await page.getByTestId('lead-profile-budget').fill('32000');
      await pick('Lead source', 'Facebook');
      await page.getByTestId('lead-profile-source-detail').fill('Pune Flats group');
      await expect(page.getByTestId('lead-add-missing')).toHaveCount(0);
      await page.getByTestId('lead-add-more').click();
      await pick('Interested in', 'Legal');
      await expectNoSidewaysScroll(page);
      await page.getByTestId('lead-add-submit').click();
      const detail = page.getByTestId('lead-detail');
      await expect(detail).toContainText('Legal', { timeout: 20000 });
      await expect(page.getByRole('dialog', { name })).toBeVisible();
      await expect(detail.getByTestId('lead-type')).toHaveText('Owner · Rent out');
      await expect(detail.getByTestId('lead-source')).toHaveText('via Facebook');
      await expect(detail.getByTestId('lead-profile-line')).toHaveText('2 BHK · Flat / Apartment · Baner · ₹32,000/mo');
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('lead-detail')).toHaveCount(0);

      await page.getByTestId('lead-add').click();
      await page.getByTestId('lead-add-mobile').fill(mobile);
      await pick('Lead type', 'Buyer / Tenant');
      await pick('Lead source', 'Walk-in');
      await page.getByTestId('lead-add-submit').click();
      await expect(page.getByText('Already a lead — opened it')).toBeVisible();
      await expect(page.getByRole('dialog', { name })).toBeVisible();
      await expect(page.getByTestId('lead-detail').getByTestId('lead-type'), 'a re-add only fills blanks').toHaveText('Owner · Rent out');
      expect(sql(`select count(*) || ':' || lead_type || ':' || lead_source from crm_leads where mobile = '${mobile}' group by lead_type, lead_source`)).toBe('1:owner:facebook');
    } finally {
      await context.close();
    }
  });

  test('seeded leads fill the common pool and filter by type', async ({ page, login }) => {
    await login.asAdmin();
    await page.goto('/admin/leads');
    await expect(page.getByRole('heading', { name: 'Leads', exact: true })).toBeVisible({ timeout: 20000 });
    await tab(page, 'Common pool').click();
    const types = page.getByRole('group', { name: 'Filter by type' });
    await types.getByRole('button', { name: 'Flatmate', exact: true }).click();
    await expect.poll(async () => {
      const shown = await page.getByTestId('lead-type').allTextContents();
      return shown.length > 0 && shown.every((t) => t.startsWith('Flatmate'));
    }, { timeout: 20000 }).toBe(true);
    await page.getByTestId('lead-search').fill('Arjun Mehta');
    const card = row(page, 'Arjun Mehta');
    await expect(card).toHaveCount(1, { timeout: 20000 });
    await expect(card.getByTestId('lead-type')).toHaveText('Flatmate · Needs a room');
    await expect(card.getByTestId('lead-source')).toHaveText('via Instagram');
    await types.getByRole('button', { name: 'Owner', exact: true }).click();
    await expect(card, 'a flatmate is filtered out under Owner').toHaveCount(0);
  });

  test('a buyer and a signed-out visitor cannot reach the leads screen', async ({ page, login }) => {
    await page.goto('/admin/leads');
    await expect(page).toHaveURL(/\/staff-login/);
    await login.asBuyer();
    await page.goto('/admin/leads');
    await expect(page).toHaveURL(/\/staff-login/);
    await expect(page.getByTestId('lead-row')).toHaveCount(0);
  });
});
