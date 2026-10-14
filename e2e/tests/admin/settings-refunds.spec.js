import { test, expect } from '../../fixtures/live.js';
import { API, apiLogin, signedInAs, uniqueMobile, seedConsent } from '../../helpers/liveAuth.js';
import { putSettings, settingsSnapshot } from '../../helpers/refunds.js';

const FEE_BOUNDS = {
  contactReplyDays: [1, 30],
  contactPendingMax: [1, 100],
  packRefundDays: [0, 30],
  passGuaranteeDays: [0, 30],
  passGuaranteeMaxEnquiries: [0, 50],
  passGuaranteeEveryMonths: [1, 36],
};
const LABELS = {
  contactReplyDays: /^Owner reply window/,
  contactPendingMax: /^Open contacts and visits per seeker/,
  packRefundDays: /^Contact pack refund window/,
  passGuaranteeDays: /^Listing pass guarantee/,
  passGuaranteeMaxEnquiries: /^Guarantee: max enquiries/,
  passGuaranteeEveryMonths: /^Guarantee: once every/,
};

const bootstrap = async () => (await fetch(`${API}/bootstrap`)).json();
const isSettingsPut = (res) => res.url().includes('/api/admin/settings') && res.request().method() === 'PUT';
const field = (page, key) => page.getByRole('spinbutton', { name: LABELS[key] });

let before;
test.beforeEach(async () => {
  before = await settingsSnapshot();
});
test.afterEach(async () => {
  const fees = Object.fromEntries(Object.keys(FEE_BOUNDS).map((key) => [key, before.fees[key]]));
  const res = await putSettings({ fees, legal: { grievanceOfficer: before.legal.grievanceOfficer } });
  if (!res.status || res.status >= 300) throw new Error(`restoring refund settings failed (${res.status})`);
});

test.describe('LIVE: refund settings', () => {
  test('the Refunds card lists the six keys with their bounds, and a save reaches the public bootstrap', async ({ page, login, consoleErrors }) => {
    test.slow();
    await login.asAdmin();
    await page.goto('/admin/settings?tab=fees');

    for (const [key, [min, max]] of Object.entries(FEE_BOUNDS)) {
      const input = field(page, key);
      await expect(input, key).toBeVisible({ timeout: 20000 });
      await expect(input).toHaveAttribute('min', String(min));
      await expect(input).toHaveAttribute('max', String(max));
      await expect(input).toHaveValue(String(before.fees[key]));
    }

    const next = { contactReplyDays: before.fees.contactReplyDays === 9 ? 8 : 9, packRefundDays: before.fees.packRefundDays === 5 ? 4 : 5 };
    await field(page, 'contactReplyDays').fill(String(next.contactReplyDays));
    await field(page, 'packRefundDays').fill(String(next.packRefundDays));
    const saved = page.waitForResponse(isSettingsPut);
    await page.getByRole('button', { name: 'Save refunds' }).click();
    expect((await saved).status()).toBe(200);
    await expect(page.getByText('Refund settings saved')).toBeVisible();

    const { pricing } = await bootstrap();
    expect(pricing.refunds.contactReplyDays).toBe(next.contactReplyDays);
    expect(pricing.refunds.packRefundDays).toBe(next.packRefundDays);

    await page.reload();
    await expect(field(page, 'contactReplyDays')).toHaveValue(String(next.contactReplyDays), { timeout: 20000 });
    expect(consoleErrors).toEqual([]);
  });

  test('a value outside its range, or a blank, is refused on the card and nothing is sent', async ({ page, login }) => {
    test.slow();
    await login.asAdmin();
    await page.goto('/admin/settings?tab=fees');
    await expect(field(page, 'contactReplyDays')).toBeVisible({ timeout: 20000 });

    let puts = 0;
    page.on('request', (req) => { if (req.method() === 'PUT' && req.url().includes('/api/admin/settings')) puts += 1; });
    const save = page.getByRole('button', { name: 'Save refunds' });
    const alert = page.getByRole('alert').filter({ hasText: /outside its allowed range|Fill in every value/ });

    await field(page, 'contactReplyDays').fill('31');
    await save.click();
    await expect(alert).toContainText('A value is outside its allowed range.');

    await field(page, 'contactReplyDays').fill('7');
    await field(page, 'contactPendingMax').fill('0');
    await save.click();
    await expect(alert).toContainText('A value is outside its allowed range.');

    await field(page, 'contactPendingMax').fill('10');
    await field(page, 'passGuaranteeEveryMonths').fill('');
    await save.click();
    await expect(alert).toContainText('Fill in every value.');

    expect(puts, 'nothing was written').toBe(0);
    expect((await settingsSnapshot()).fees.contactReplyDays).toBe(before.fees.contactReplyDays);
  });

  test('the server enforces every bound on its own: each edge is taken, one past it is refused, and nothing is half-saved', async () => {
    for (const [key, [min, max]] of Object.entries(FEE_BOUNDS)) {
      for (const edge of [min, max]) {
        expect((await putSettings({ fees: { [key]: edge } })).status, `${key}=${edge}`).toBe(200);
        expect((await settingsSnapshot()).fees[key]).toBe(edge);
      }
      for (const bad of [min - 1, max + 1, 1.5]) {
        const refused = await putSettings({ fees: { [key]: bad } });
        expect(refused.status, `${key}=${bad}`).toBe(422);
        expect(JSON.stringify(refused.json)).toContain(key);
      }
    }

    const mixed = await putSettings({ fees: { contactReplyDays: 3, contactPendingMax: 101 } });
    expect(mixed.status).toBe(422);
    expect((await settingsSnapshot()).fees.contactReplyDays, 'a refused save writes none of its keys').toBe(30);
  });

  test('the grievance officer needs a name and a valid email, and a saved officer appears on the Refund Policy page', async ({ page, login }) => {
    test.slow();
    await seedConsent(page);
    await login.asAdmin();
    await page.goto('/admin/settings');
    const card = page.locator('div.dz-card').filter({ has: page.getByRole('heading', { name: 'Grievance officer' }) });
    const name = card.getByRole('textbox', { name: 'Name' });
    const email = card.getByRole('textbox', { name: 'Email' });
    await expect(name).toBeVisible({ timeout: 20000 });
    await expect(name).toHaveAttribute('maxlength', '80');
    await expect(email).toHaveAttribute('maxlength', '120');

    let puts = 0;
    page.on('request', (req) => { if (req.method() === 'PUT' && req.url().includes('/api/admin/settings')) puts += 1; });
    const alert = card.getByRole('alert');

    await name.fill('   ');
    await card.getByRole('button', { name: 'Save officer' }).click();
    await expect(alert).toContainText('Enter a name (1–80 characters) and a valid email');

    await name.fill('Meera Joshi');
    await email.fill('not-an-email');
    await card.getByRole('button', { name: 'Save officer' }).click();
    await expect(alert).toBeVisible();

    await email.fill('');
    await card.getByRole('button', { name: 'Save officer' }).click();
    await expect(alert).toBeVisible();
    expect(puts).toBe(0);

    await email.fill('meera.joshi@draazy.example.com');
    const saved = page.waitForResponse(isSettingsPut);
    await card.getByRole('button', { name: 'Save officer' }).click();
    expect((await saved).status()).toBe(200);
    await expect(page.getByText('Grievance officer saved')).toBeVisible();
    await expect(alert).toHaveCount(0);

    expect((await bootstrap()).legal.grievanceOfficer).toEqual({ name: 'Meera Joshi', email: 'meera.joshi@draazy.example.com' });

    await page.goto('/refund-policy');
    const section = page.locator('.legal-prose');
    await expect(section).toContainText('Meera Joshi');
    await expect(section.getByRole('link', { name: 'meera.joshi@draazy.example.com' })).toHaveAttribute('href', 'mailto:meera.joshi@draazy.example.com');
  });

  test('the server holds the officer to a name of 1 to 80 characters and an email of at most 120', async () => {
    const officer = (patch) => putSettings({ legal: { grievanceOfficer: { name: 'Meera Joshi', email: 'meera@draazy.example.com', ...patch } } });
    const longEmail = `${'a'.repeat(110)}@draazy.com`;

    expect((await officer({ name: '' })).status, 'name required').toBe(422);
    expect((await officer({ name: '   ' })).status, 'a blank name is no name').toBe(422);
    expect((await officer({ name: 'x'.repeat(81) })).status, 'name over 80').toBe(422);
    expect((await officer({ email: '' })).status, 'email required').toBe(422);
    expect((await officer({ email: 'no-at-sign' })).status, 'email shape').toBe(422);
    expect(longEmail.length).toBeGreaterThan(120);
    expect((await officer({ email: longEmail })).status, 'email over 120').toBe(422);
    expect((await bootstrap()).legal.grievanceOfficer.name, 'nothing refused was stored').not.toBe('x'.repeat(81));

    expect((await officer({ name: 'x'.repeat(80) })).status, 'name of exactly 80').toBe(200);
    expect((await bootstrap()).legal.grievanceOfficer.name).toBe('x'.repeat(80));
  });

  test('the public bootstrap exposes the refund windows and the officer, and the guarantee lines vanish when the windows are 0', async ({ page }) => {
    test.slow();
    await seedConsent(page);

    await test.step('the defaults are published', async () => {
      const { pricing, legal } = await bootstrap();
      expect(pricing.refunds).toMatchObject({ packRefundDays: 7, passGuaranteeDays: 7, passGuaranteeMaxEnquiries: 0, passGuaranteeEveryMonths: 12, contactReplyDays: 7 });
      expect(legal.grievanceOfficer.email).toContain('@');
      await page.goto('/plans');
      await expect(page.getByText('Unused? Refund within 7 days.').first()).toBeAttached({ timeout: 20000 });
      await expect(page.getByText('No enquiries in 7 days? Full refund.').first()).toBeAttached();
    });

    const mobile = uniqueMobile();
    await apiLogin(mobile);
    await signedInAs(page, mobile);
    await page.goto('/checkout?plan=contact-pack');
    await expect(page.getByTestId('refund-guarantee-pack')).toContainText('Refund within 7 days', { timeout: 20000 });

    await test.step('a pack window of 0 hides the pack line everywhere and the policy says so', async () => {
      expect((await putSettings({ fees: { packRefundDays: 0 } })).status).toBe(200);
      expect((await bootstrap()).pricing.refunds.packRefundDays).toBe(0);
      await page.goto('/checkout?plan=contact-pack');
      await expect(page.getByRole('button', { name: /^Pay ₹/ }).first()).toBeVisible({ timeout: 20000 });
      await expect(page.getByTestId('refund-guarantee-pack')).toHaveCount(0);
      await page.goto('/plans');
      await expect(page.getByRole('heading', { name: /Contact Pack/i }).first()).toBeVisible({ timeout: 20000 });
      await expect(page.getByText(/Unused\? Refund within/)).toHaveCount(0);
      await page.goto('/refund-policy');
      await expect(page.locator('.legal-prose')).toContainText('Contact Packs are not refundable once bought.');
    });

    await test.step('a pass guarantee of 0 hides the pass line and the policy drops the guarantee', async () => {
      expect((await putSettings({ fees: { passGuaranteeDays: 0 } })).status).toBe(200);
      await page.goto('/plans');
      await expect(page.getByRole('heading', { name: /Listing Pass/i }).first()).toBeVisible({ timeout: 20000 });
      await expect(page.getByText(/No enquiries in \d+ days\? Full refund\./)).toHaveCount(0);
      await page.goto('/refund-policy');
      await expect(page.locator('.legal-prose')).toContainText('Listing Passes are not refundable once bought.');
    });

    await test.step('raising a window changes the number in the copy, not just its presence', async () => {
      expect((await putSettings({ fees: { packRefundDays: 14, passGuaranteeDays: 21 } })).status).toBe(200);
      await page.goto('/plans');
      await expect(page.getByText('Unused? Refund within 14 days.').first()).toBeAttached({ timeout: 20000 });
      await expect(page.getByText('No enquiries in 21 days? Full refund.').first()).toBeAttached();
    });
  });
});
