// @ts-check
import { test, expect } from '@playwright/test';
import { MOBILE, PNG, active, clickNext, expectNoRemovedPartyInputs, fillBuilding, fillCoOwner, fillIgrProperty, fillOwner, fillPartyIgr, fillProperty, fillTenant, fillTenantPolice, fillTerms, pickLocality, uploadAll } from '../../../helpers/rentAgreementWizard.js';
import { pickDate } from '../../../helpers/datePicker.helper.js';
import { gotoSettled, reloadSettled } from '../../../helpers/settle.js';
/* Mock-only: every rule here is enforced in the browser before anything is sent. The same rules are
   re-checked by the server; `rent-agreement-submit.spec.js` pins that half live. */

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const BUYER = { name: 'Anita Verma', mobile: MOBILE.owner, email: '', role: 'buyer', joinedAt: Date.now() };
const DRAFT = 'dzDraft:rentAgreement';
const DOC_REQUIRED = 'This document is required for registration.';

async function login(page, user = BUYER) {
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) }));
  await page.route('**/api/auth/refresh', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ accessToken: 'e2e-nobackend-token' }) }));
  await page.addInitScript((u) => {
    localStorage.setItem('dz_cookie_consent_v1', JSON.stringify({ necessary: true, functional: false, analytics: false, marketing: false, version: 1, ts: Date.now() }));
    localStorage.setItem('draazyUser', JSON.stringify(u));
    localStorage.setItem('draazyTokens', JSON.stringify({ accessToken: 'e2e-nobackend-token' }));
  }, user);
}

const seedDraft = (page, draft) => page.addInitScript(([k, d]) => localStorage.setItem(k, JSON.stringify(d)), [DRAFT, draft]);

const PROP = {
  propType: 'Flat / Apartment', flatNo: 'B-1204', society: 'Skyline Heights', locality: 'Baner', gramPanchayat: false, city: 'Pune', taluka: 'Haveli', pincode: '411045', area: '',
  landmark: 'Near D-Mart', policeStation: 'Chaturshringi', roadVicinity: 'On main road', roadType: 'Tar road',
};

const stillOn = (page, step) => expect(page.locator('.step-dot').nth(step), `the wizard stays on step ${step + 1}`).toHaveClass(/\bactive\b/);

async function choose(page, scope, current, option) {
  await scope.locator('.dz-dropdown__trigger').filter({ hasText: current }).first().click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test.describe('Rent Agreement — what the Sub-Registrar will refuse is refused here first', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('the owner and tenant steps refuse a missing Index II, bad PANs, repeats and minors until each is fixed', async ({ page }) => {
    test.slow();
    const DOB_ERR = 'Choose a valid date of birth for an adult party.';
    await gotoSettled(page, `${BASE}/services/rent-agreement`);
    await fillProperty(page);
    await fillOwner(page, { docs: false, next: false });
    const p = active(page);
    await expect(p.locator('label span.req').filter({ hasText: 'Index II' }), 'the Index II carries the required marker').toBeVisible();
    for (const removed of ['PAN Card', 'Aadhaar Card', 'Passport Photo']) {
      await expect(p.getByText(removed, { exact: true }), `${removed} upload was removed`).toHaveCount(0);
    }
    await expectNoRemovedPartyInputs(p);
    await expect(p.getByPlaceholder('you@example.com'), 'email was removed').toHaveCount(0);
    await expect(p.getByPlaceholder('e.g. 42'), 'age follows the date of birth, never typed').toHaveCount(0);
    await p.getByPlaceholder('ABCDE1234F').first().fill('abcde123');
    await pickDate(page, '[data-err="oDob"]', '2015-01-01');

    await clickNext(page);
    await stillOn(page, 1);
    await expect(p.getByText(DOC_REQUIRED)).toHaveCount(1);
    await expect(p.getByText(DOB_ERR)).toBeVisible();
    await expect(p.getByText(/Enter a valid PAN/)).toBeVisible();
    await expect(p.getByRole('alert'), 'field errors are not individual alerts').toHaveCount(0);
    await expect(page.getByTestId('ra-error-count'), 'one polite region announces the count').toHaveText(/^\d+ fields? need/);
    await p.getByPlaceholder('ABCDE1234F').first().fill('ABCDE1234F');
    await uploadAll(p, 'owner-doc');
    await expect(p.getByText(DOC_REQUIRED)).toHaveCount(0);
    await clickNext(page);
    await stillOn(page, 1);
    await pickDate(page, '[data-err="oDob"]', '1980-01-01');
    await clickNext(page, 2);

    await fillTenant(page, { docs: false, next: false });
    const t = active(page);
    await t.getByPlaceholder('10-digit mobile').fill(MOBILE.owner);
    await t.getByPlaceholder('ABCDE1234F').first().fill('abcde1234f');
    await pickDate(page, '[data-err="t0dob"]', '2015-01-01');

    await clickNext(page);
    await stillOn(page, 2);
    await expect(t.getByText(/This mobile is already used by another party/)).toBeVisible();
    await expect(t.getByText(/This PAN is already entered for another party/), 'PAN case does not hide a repeat').toBeVisible();
    await expect(t.getByText(DOC_REQUIRED), 'a resident tenant proving address by Aadhaar owes only the work ID proof').toHaveCount(1);
    await expect(t.getByText(DOB_ERR)).toBeVisible();

    await t.getByPlaceholder('10-digit mobile').fill(MOBILE.tenant);
    await t.getByPlaceholder('ABCDE1234F').first().fill('PQRSX6789K');
    await clickNext(page);
    await stillOn(page, 2);
    await pickDate(page, '[data-err="t0dob"]', '1995-01-01');
    await uploadAll(t, 'tenant-doc');
    await clickNext(page, 3);
  });

  test('company or firm parties are blocked into the legal desk quote flow', async ({ page }) => {
    await gotoSettled(page, `${BASE}/services/rent-agreement`);
    await fillProperty(page);
    const p = active(page);

    await p.locator('.dz-dropdown__trigger').filter({ hasText: 'Individual' }).first().click();
    await page.getByRole('option', { name: 'Company or firm', exact: true }).click();
    await expect(p.getByText(/self-serve flow cannot handle/)).toBeVisible();
    await expect(p.getByRole('link', { name: 'Get a quote from the legal desk' })).toHaveAttribute('href', '/services/property-legal');

    await clickNext(page);
    await stillOn(page, 1);
    await expect(p.getByText('Company or firm parties need the legal desk quote flow.')).toBeVisible();
  });

  test('a foreign tenant uses passport and visa details, gets SRO-route copy and Form C notice', async ({ page }) => {
    test.slow();
    await gotoSettled(page, `${BASE}/services/rent-agreement`);
    await fillProperty(page);
    await fillOwner(page);
    const t = active(page);
    await t.locator('.dz-dropdown__trigger').filter({ hasText: 'Resident Indian with Aadhaar' }).first().click();
    await page.getByRole('option', { name: 'Foreign national', exact: true }).click();
    await expect(t.getByText(/cannot use Aadhaar e-registration/)).toBeVisible();
    await expect(t.getByPlaceholder('12-digit Aadhaar')).toHaveCount(0);
    await t.getByPlaceholder('As per PAN/Aadhaar').first().fill('Ria Sharma');
    await pickDate(page, '[data-err="t0dob"]', '1995-01-01');
    await fillPartyIgr(page, t, { address: false });
    await t.getByPlaceholder('ABCDE1234F').first().fill('PQRSX6789K');
    await t.getByPlaceholder('e.g. Z1234567').fill('Z1234567');
    await t.getByPlaceholder('Visa, OCI or e-FRRO reference').fill('OCI-123');
    await t.getByPlaceholder('10-digit mobile').first().fill(MOBILE.tenant);
    await fillTenantPolice(page);
    await uploadAll(t, 'foreign-tenant-doc');
    await clickNext(page, 3);
    await fillTerms(page);

    const review = active(page);
    await expect(review.getByText('SRO appointment — offline route')).toBeVisible();
    await expect(review.getByText(/owner must submit Form C to FRRO/)).toBeVisible();
  });

  test('terms are checked against each other and against the registrable window', async ({ page }) => {
    await seedDraft(page, {
      step: 3, prop: PROP, tenantMode: 'fill',
      terms: { startDate: '2000-01-01', months: '11', rent: '30000', deposit: '150000', nrDeposit: '', increment: '150', lockin: '20' },
    });
    await gotoSettled(page, `${BASE}/services/rent-agreement`);
    await stillOn(page, 3);
    const p = active(page);

    await clickNext(page);
    await stillOn(page, 3);
    const istDay = (days) => new Date(Date.now() + 5.5 * 3600e3 + days * 864e5).toISOString().slice(0, 10);
    await expect(p.getByText(`Choose a start date between ${istDay(-120)} and ${istDay(180)}.`), 'back-dating reaches the four-month registration window').toBeVisible();
    await expect(p.getByText('Lock-in must be between 0 and 11 months.')).toBeVisible();
    await expect(p.getByText('Enter an increase between 0 and 100%.')).toBeVisible();
  });

  test('a tenancy with no deposit passes, and high rent draws the tax note on the spot', async ({ page }) => {
    await seedDraft(page, {
      step: 3, prop: PROP, tenantMode: 'fill',
      terms: { startDate: '', months: '11', rent: '30000', deposit: '', nrDeposit: '', increment: '5', lockin: '6' },
    });
    await gotoSettled(page, `${BASE}/services/rent-agreement`);
    await stillOn(page, 3);
    const p = active(page);
    const deposit = p.getByPlaceholder('e.g. 1,00,000');

    await clickNext(page);
    await stillOn(page, 3);
    await expect(p.getByText('Enter the security deposit — 0 if there is none.')).toBeVisible();

    await deposit.fill('0');
    await clickNext(page);
    await expect(p.getByText('Select the license start date.'), 'only the missing start date still holds the step').toBeVisible();
    await expect(p.getByText('Enter the security deposit — 0 if there is none.')).toHaveCount(0);

    await expect(p.getByText(/s\.194-IB/)).toHaveCount(0);
    await p.getByPlaceholder('e.g. 25,000').fill('50001');
    await expect(p.getByText(/s\.194-IB/)).toBeVisible();
  });

  test('the terms step no longer asks notice, due day, payment mode, utilities, property tax or occupants, nor second-guesses the furniture list', async ({ page }) => {
    await seedDraft(page, { step: 3, prop: PROP, tenantMode: 'fill', furnItems: [{ name: 'Fan', qty: 3, custom: false }] });
    await gotoSettled(page, `${BASE}/services/rent-agreement`);
    await stillOn(page, 3);
    const p = active(page);

    for (const removed of ['Notice Period', 'Rent Due Day', 'Payment Mode', 'Utilities paid by', 'Property tax paid by', 'Occupants']) {
      await expect(p.getByText(removed, { exact: false }), `"${removed}" was removed`).toHaveCount(0);
    }
    await expect(p.getByPlaceholder('e.g. 3', { exact: true })).toHaveCount(0);
    await p.getByRole('button', { name: 'Sofa', exact: true }).click();
    await expect(p.getByText(/Step 1 says the flat is/), 'furnishing is no longer asked, so there is nothing to mismatch').toHaveCount(0);
    await expect(p.getByRole('button', { name: 'Mark it Semi-Furnished' })).toHaveCount(0);
  });

  test('the flat\'s area is required; the floor is optional but sane; the removed property rows are gone', async ({ page }) => {
    await seedDraft(page, { step: 0, prop: PROP });
    await gotoSettled(page, `${BASE}/services/rent-agreement`);
    await stillOn(page, 0);
    const p = active(page);

    await clickNext(page);
    await expect(p.getByText("Enter the flat's area")).toBeVisible();
    await stillOn(page, 0);

    for (const removed of ['Measured as', 'Furnishing']) {
      await expect(p.getByText(removed, { exact: false }), `"${removed}" was removed`).toHaveCount(0);
    }
    await expect(p.getByRole('button', { name: 'Unit', exact: true })).toContainText('sq ft');
    await p.getByPlaceholder('e.g. 850').fill('78.5');
    await p.getByRole('button', { name: 'Unit', exact: true }).click();
    await page.getByRole('option', { name: 'sq m', exact: true }).click();
    await p.getByPlaceholder('0 = ground').fill('250');
    await clickNext(page);
    await expect(p.getByText('Enter a floor from 0 to 200.')).toBeVisible();
    await p.getByPlaceholder('0 = ground').fill('0');
    await clickNext(page, 1);
    await expect.poll(() => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}').prop, DRAFT)).toMatchObject({ area: '78.5', areaUnit: 'sqm', floor: '0' });
    const prop = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}').prop, DRAFT);
    for (const retired of ['furnish', 'areaBasis']) {
      expect(prop, `${retired} is no longer kept`).not.toHaveProperty(retired);
    }
  });

  test('the stamp duty payer comes pre-answered, and a non-standard period can be typed', async ({ page }) => {
    await seedDraft(page, { step: 3, prop: PROP, tenantMode: 'fill', terms: { months: '9' } });
    await gotoSettled(page, `${BASE}/services/rent-agreement`);
    await stillOn(page, 3);
    const p = active(page);
    const saved = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}').terms || {}, DRAFT);
    const pick = async (label, option) => {
      await p.getByRole('button', { name: label, exact: true }).click();
      await page.getByRole('option', { name: option, exact: true }).click();
    };

    await expect(p.getByRole('button', { name: 'Stamp duty & registration paid by', exact: true })).toContainText('Split equally');
    await expect(p.getByText('Increase on Renewal (%)'), 'a licence of 11 months or less only rises on renewal').toBeVisible();

    await pick('Stamp duty & registration paid by', 'Tenant');
    await pick('Parking included', 'Car');
    await expect.poll(saved).toMatchObject({ costBy: 'Tenant', parking: 'car' });
    const terms = await saved();
    for (const retired of ['utilitiesBy', 'taxBy', 'notice', 'dueDay', 'payMode', 'occupants']) {
      expect(terms, `${retired} is no longer kept`).not.toHaveProperty(retired);
    }

    const period = p.getByRole('button', { name: 'License Period', exact: true });
    const months = p.getByPlaceholder('1 – 60');
    await expect(period, 'a restored 9-month draft shows as a custom period').toContainText('Other…');
    await expect(months).toHaveValue('9');

    await pick('License Period', '24 Months');
    await expect(months).toHaveCount(0);
    await expect(p.getByText('Rent Increase (%)')).toBeVisible();

    await pick('License Period', 'Other…');
    await months.fill('7');
    await expect.poll(async () => (await saved()).months).toBe('7');
  });

  test('money typed with Indian digit grouping is read as the number it is, not as zero', async ({ page }) => {
    await seedDraft(page, {
      step: 3, prop: PROP, tenantMode: 'fill',
      terms: { startDate: '', months: '11', rent: '30,000', deposit: '1,50,000', nrDeposit: '₹ 5,000', increment: '5', lockin: '6' },
    });
    await gotoSettled(page, `${BASE}/services/rent-agreement`);
    await stillOn(page, 3);
    const p = active(page);
    const deposit = p.getByPlaceholder('e.g. 1,00,000');

    await expect(p.getByPlaceholder('e.g. 25,000'), 'money shows with Indian digit grouping').toHaveValue('30,000');
    await expect(deposit).toHaveValue('1,50,000');
    await expect(p.getByPlaceholder('0', { exact: true })).toHaveValue('5,000');
    const rentBox = p.getByPlaceholder('e.g. 25,000').locator('xpath=..');
    await expect(rentBox, 'the rent field follows the money-field standard').toContainText('₹');
    await expect(rentBox).toContainText('/month');
    await expect(p.getByText('≈ ₹ 1.50 Lakh', { exact: true }), 'the amount is read back in words').toBeVisible();

    await deposit.fill('50,000');
    await expect(deposit).toHaveValue('50,000');
    await expect.poll(() => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}').terms, DRAFT), 'the draft keeps plain digits, not commas').toMatchObject({ rent: '30000', deposit: '50000', nrDeposit: '5000' });
    await expect(page.locator('div.flex.justify-between', { hasText: 'Deposit (refundable)' }).first()).toContainText('₹50,000');
  });

  test('the deposit is accounted for payment by payment, in the four modes the IGR portal takes', async ({ page }) => {
    await seedDraft(page, {
      step: 3, prop: PROP, tenantMode: 'fill',
      terms: { startDate: '', months: '11', rent: '30000', deposit: '100000', nrDeposit: '', increment: '5', lockin: '6' },
    });
    await gotoSettled(page, `${BASE}/services/rent-agreement`);
    await stillOn(page, 3);
    const pay = active(page).getByTestId('ra-deposit-payments');
    const labels = (row) => row.locator('label.lbl').allInnerTexts();

    await clickNext(page);
    await stillOn(page, 3);
    await expect(pay.getByText(/Add how the deposit was paid/)).toBeVisible();

    await pay.getByRole('button', { name: 'Add payment' }).click();
    const first = pay.getByTestId('ra-deposit-payment-0');
    await expect(first.getByText('Amount (₹)', { exact: true }).locator('xpath=..').locator('input'), 'the first payment starts at the whole deposit').toHaveValue('1,00,000');
    expect(await labels(first)).toEqual(['Payment mode', 'UPI Ref. No. / UTR No.', 'Amount (₹)', 'Date']);
    for (const [from, to, want] of [
      ['UPI', 'Internet Banking', ['Payment mode', 'Bank Name', 'Branch Name', 'Transfer Ref. No.', 'Amount (₹)', 'Date']],
      ['Internet Banking', 'Demand Draft (DD) / Cheque', ['Payment mode', 'Bank Name', 'Branch Name', 'DD / Cheque Date', 'DD / Cheque Number', 'Amount (₹)']],
      ['Demand Draft (DD) / Cheque', 'Cash', ['Payment mode', 'Date', 'Amount (₹)']],
    ]) {
      await choose(page, first, from, to);
      expect(await labels(first), to).toEqual(want);
    }
    await first.getByText('Amount (₹)', { exact: true }).locator('xpath=..').locator('input').fill('250000');
    await expect(first.getByText(/s\.269ST/), 'cash of ₹2 lakh or more is flagged on the row').toBeVisible();
    await first.getByText('Amount (₹)', { exact: true }).locator('xpath=..').locator('input').fill('40000');

    await clickNext(page);
    await stillOn(page, 3);
    await expect(first.getByText('Required.')).toBeVisible();
    await expect(pay.getByText('Payments add up to ₹40,000; they must equal the deposit of ₹1,00,000.')).toBeVisible();

    await pay.getByRole('button', { name: 'Add payment' }).click();
    const second = pay.getByTestId('ra-deposit-payment-1');
    await expect(second.getByText('Amount (₹)', { exact: true }).locator('xpath=..').locator('input'), 'a new payment starts at what is left').toHaveValue('60,000');
    await second.getByText('UPI Ref. No. / UTR No.', { exact: true }).locator('xpath=..').locator('input').fill('utr 6123-4567');
    await expect(second.getByText('UPI Ref. No. / UTR No.', { exact: true }).locator('xpath=..').locator('input'), 'a reference keeps letters and digits only').toHaveValue('UTR61234567');
    await expect(pay.getByText('Entered ₹1,00,000 of ₹1,00,000')).toBeVisible();

    await second.getByRole('button', { name: 'Remove payment' }).click();
    await expect(pay.getByTestId(/^ra-deposit-payment-/)).toHaveCount(1);
    await expect(pay.getByText('Entered ₹40,000 of ₹1,00,000')).toBeVisible();
  });

  test('a rent increase over a long term is taxed, and the owner says how often it applies', async ({ page }) => {
    await page.route('**/api/fees', (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{ deal: 'rent', brokerage: 0, platformFee: 1999, stampDuty: null, registration: null, notes: null }]),
    }));
    await seedDraft(page, {
      step: 3, prop: PROP, tenantMode: 'fill',
      terms: { startDate: '', months: '11', rent: '20000', deposit: '150000', nrDeposit: '', increment: '5', lockin: '6' },
    });
    await gotoSettled(page, `${BASE}/services/rent-agreement`);
    await stillOn(page, 3);
    const p = active(page);
    const stamp = page.locator('div.flex.justify-between', { hasText: 'Stamp Duty (0.25%)' }).first();
    const every = p.getByText('Rent increases every', { exact: true });

    await expect(stamp, 'IGR rounds ₹587.50 to the nearest rupee').toContainText('₹588.00');
    await expect(page.getByText('0.25% works out to ₹587.50; IGR rounds it to the nearest rupee.').filter({ visible: true })).toHaveCount(1);
    await expect(every, 'an eleven-month term never reaches an increase').toHaveCount(0);

    await choose(page, p, '11 Months', '22 Months');
    await expect(every).toBeVisible();
    await expect(stamp, 'a draft saved before the interval existed defaults to every 11 months').toContainText('₹1,203.00');

    await every.locator('xpath=..').locator('.dz-dropdown__trigger').click();
    await page.getByRole('option', { name: '12 Months', exact: true }).click();
    await expect(stamp, 'twelve-month steps tax ₹4,80,000, exactly ₹1,200').toContainText('₹1,200.00');
    await expect(page.locator('div.flex.justify-between', { hasText: 'Document Handling (DHC)' }).first()).toContainText('₹300');
  });

  test('the property step waits for the gram panchayat answer', async ({ page }) => {
    await gotoSettled(page, `${BASE}/services/rent-agreement`);
    await fillProperty(page, { next: false, gramPanchayat: null });
    const p = active(page);
    const answer = p.locator('[data-err="gramPanchayat"]');
    await expect(p.getByTestId('ra-gram-yes'), 'no answer is assumed').toHaveAttribute('aria-pressed', 'false');
    await expect(p.getByTestId('ra-gram-no')).toHaveAttribute('aria-pressed', 'false');

    await clickNext(page);
    await stillOn(page, 0);
    await expect(answer.getByText('Choose Yes or No.')).toBeVisible();

    await p.getByTestId('ra-gram-yes').click();
    await expect(answer.getByText('Choose Yes or No.')).toHaveCount(0);
    await expect(p.getByTestId('ra-gram-yes')).toHaveAttribute('aria-pressed', 'true');
    await clickNext(page, 1);
  });

  test('the registration fee follows the gram panchayat answer, not the locality', async ({ page }) => {
    await page.route('**/api/fees', (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{ deal: 'rent', brokerage: 0, platformFee: 1999, stampDuty: null, registration: null, notes: null }]),
    }));
    const terms = { startDate: '', months: '11', rent: '20000', deposit: '100000', nrDeposit: '', increment: '5', lockin: '6' };
    const fee = page.locator('div.flex.justify-between', { hasText: 'Registration Fee' }).first();

    await seedDraft(page, { step: 3, prop: { ...PROP, gramPanchayat: true }, tenantMode: 'fill', terms });
    await gotoSettled(page, `${BASE}/services/rent-agreement`);
    await stillOn(page, 3);
    await expect(fee).toContainText('₹500');
    await expect(active(page).getByText('Registration Area'), 'the area was answered on the Property step').toHaveCount(0);
    await expect(active(page).getByRole('button', { name: 'Municipal / Urban' }), 'there is no toggle to flip').toHaveCount(0);

    await seedDraft(page, { step: 3, prop: { ...PROP, locality: 'Hinjawadi' }, tenantMode: 'fill', terms, regArea: 'rural' });
    await reloadSettled(page);
    await stillOn(page, 3);
    await expect(fee, 'a stale saved choice is ignored').toContainText('₹1,000');
  });

  test('a paper that cannot be used says why on the spot, and a phone-camera original is compressed rather than dropped', async ({ page }) => {
    await gotoSettled(page, `${BASE}/services/rent-agreement`);
    await fillProperty(page);
    const p = active(page);
    const slot = p.locator('input[type="file"]').first();

    await slot.setInputFiles({ name: 'proof.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
    await expect(p.getByText(/proof\.gif can't be used: Use PDF, JPEG\/JPG, PNG or WebP only/)).toBeVisible();
    await expect(p.locator('.upload-box.has-file'), 'a refused file is not shown as accepted').toHaveCount(0);

    const b64 = await page.evaluate(() => {
      const edge = 1800;
      const c = document.createElement('canvas'); c.width = edge; c.height = edge;
      const ctx = c.getContext('2d'); const img = ctx.createImageData(edge, edge);
      for (let i = 0; i < img.data.length; i += 4) {
        const px = i / 4, n = (Math.random() * 8) | 0;
        img.data[i] = ((px % edge) * 255 / edge + n) | 0; img.data[i + 1] = (((px / edge) | 0) * 255 / edge + n) | 0; img.data[i + 2] = 160 + n; img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      return c.toDataURL('image/png').split(',')[1];
    });
    const photo = Buffer.from(b64, 'base64');
    expect(photo.length, 'the original is over the old 2 MB cut-off').toBeGreaterThan(2 * 1024 * 1024);

    await slot.setInputFiles({ name: 'proof-photo.png', mimeType: 'image/png', buffer: photo });
    await expect(p.getByText('proof-photo.jpg')).toBeVisible({ timeout: 20000 });
    await expect(p.getByText(/can't be used/)).toHaveCount(0);
    await expect(p.locator('.upload-box.has-file')).toHaveCount(1);
    await expect(p.getByRole('img', { name: 'Preview' })).toBeVisible();
  });

  test('the owner gives mother\'s name, gender and residential address, as the IGR party tab requires', async ({ page }) => {
    test.slow();
    await gotoSettled(page, `${BASE}/services/rent-agreement`);
    await fillProperty(page);
    await fillOwner(page, { next: false });
    const p = active(page);
    await p.getByPlaceholder('As per Aadhaar or PAN').first().fill('');
    await p.getByPlaceholder('411004').first().fill('0110');
    await p.getByPlaceholder('Flat, building, street, locality').first().fill('');

    await clickNext(page);
    await stillOn(page, 1);
    await expect(p.getByText("Enter the mother's name (up to 80 characters).")).toBeVisible();
    await expect(p.getByText('Enter a 6-digit pincode.')).toBeVisible();
    await expect(p.getByText('Enter the address.')).toBeVisible();

    await p.getByPlaceholder('As per Aadhaar or PAN').first().fill('Shaila Verma');
    await p.getByPlaceholder('411004').first().fill('560001');
    await p.getByPlaceholder('Flat, building, street, locality').first().fill('7 Residency Road, Bengaluru');
    await clickNext(page, 2);
    await expect.poll(async () => page.evaluate((k) => localStorage.getItem(k) || '', DRAFT), 'a licensor may live outside Maharashtra').toContain('560001');
  });

  test('the page never says 11 months avoids registration, and the wizard is residential-only: commercial premises, or a draft saved for a shop, go to the legal desk', async ({ page }) => {
    await gotoSettled(page, `${BASE}/services/rent-agreement`);
    await page.getByRole('button', { name: 'Why are agreements usually 11 months?' }).click();
    await expect(page.getByText(/It does not avoid registration in Maharashtra/)).toBeVisible();
    await page.getByRole('button', { name: 'Is registration mandatory in Maharashtra?' }).click();
    await expect(page.getByText(/Section 55 of the Maharashtra Rent Control Act, 1999/)).toBeVisible();
    await expect(page.getByText(/keeps registration simpler/)).toHaveCount(0);

    const p = active(page);
    await expect(p.getByRole('button', { name: 'Commercial', exact: true })).toHaveCount(0);
    await expect(p.getByRole('link', { name: /commercial agreement from our legal desk/ })).toHaveAttribute('href', '/services/property-legal');

    await p.locator('.dz-dropdown__trigger').filter({ hasText: 'Flat / Apartment' }).click();
    await expect(page.getByRole('option', { name: 'Shop' })).toHaveCount(0);
    await expect(page.getByRole('option', { name: 'Row House' })).toBeVisible();

    await seedDraft(page, { step: 0, prop: { ...PROP, propType: 'Shop' } });
    await gotoSettled(page, `${BASE}/services/rent-agreement`);
    await clickNext(page);
    await stillOn(page, 0);
    await expect(active(page).getByText(/Commercial premises need a commercial agreement/)).toBeVisible();
  });

  test('the flat must be in Maharashtra: a pincode outside it, or Goa\'s 403, is stopped on the property step', async ({ page }) => {
    await seedDraft(page, { step: 0, prop: { ...PROP, pincode: '560001' } });
    await gotoSettled(page, `${BASE}/services/rent-agreement`);
    const p = active(page);
    const state = p.getByText(/We draft Maharashtra agreements only/);

    await clickNext(page);
    await stillOn(page, 0);
    await expect(state).toBeVisible();

    await p.getByPlaceholder('411045').fill('403001');
    await clickNext(page);
    await stillOn(page, 0);
    await expect(state).toBeVisible();

    await p.getByPlaceholder('411045').fill('411045');
    await expect(state).toHaveCount(0);
  });

  test('co-owners sign too: each needs a PAN, and the primary signs as a co-owner or under a registered POA', async ({ page }) => {
    test.slow();
    await gotoSettled(page, `${BASE}/services/rent-agreement`);
    await fillProperty(page);
    await fillOwner(page, { next: false });
    const p = active(page);

    await p.getByRole('button', { name: 'Add co-owner' }).click();
    const co = p.getByTestId('co-owner-0');
    await expect(co.getByText('Co-owner 1')).toBeVisible();
    await expect(p.locator('.dz-dropdown__trigger').filter({ hasText: 'Co-owner' }).first(), 'the primary is no longer a sole owner').toBeVisible();

    await choose(page, p, 'Co-owner', 'Power of Attorney holder');
    await clickNext(page);
    await stillOn(page, 1);
    await expect(p.getByText('Required when signing under a Power of Attorney.').first()).toBeVisible();
    await expect(p.getByText(/Enter the POA registration date/).first()).toBeVisible();
    await expect(co.getByText("Enter the co-owner's full name as on the title deed.")).toBeVisible();
    await expect(co.getByText(DOC_REQUIRED), 'a co-owner uploads nothing: PAN is typed, Aadhaar is taken at the visit').toHaveCount(0);
    await expectNoRemovedPartyInputs(co);
    /* The POA itself is one more required paper for the owner who signs under it. */
    await expect(p.getByText('Registered Power of Attorney', { exact: true })).toBeVisible();

    await choose(page, p, 'Power of Attorney holder', 'Co-owner');
    await fillCoOwner(page, co);
    await expect(co.getByPlaceholder('e.g. 42'), 'a co-owner\'s age is derived from the date of birth, never typed').toHaveCount(0);
    await clickNext(page, 2);

    await expect.poll(async () => page.evaluate((k) => localStorage.getItem(k) || '', DRAFT)).toContain('Vikram Verma');
    const written = await page.evaluate((k) => localStorage.getItem(k) || '', DRAFT);
    expect(written).not.toContain('VWXYZ9876L');
  });

  test('an owner mobile that is not yours is refused on a flat you have not listed, until you are among the owners', async ({ page }) => {
    test.slow();
    await gotoSettled(page, `${BASE}/services/rent-agreement`);
    await fillProperty(page);
    await fillOwner(page, { next: false });
    const p = active(page);
    const mobile = p.getByPlaceholder('10-digit mobile').first();
    await mobile.fill(MOBILE.tenant);
    await clickNext(page);
    await stillOn(page, 1);
    await expect(p.getByText(/Only the owner fills this part/)).toBeVisible();

    await mobile.fill(MOBILE.owner);
    await clickNext(page, 2);
  });

  test('a restored draft names the PAN fields to re-enter without storing the numbers', async ({ page }) => {
    test.slow();
    await gotoSettled(page, `${BASE}/services/rent-agreement`);
    await fillProperty(page);
    const owner = active(page);
    await owner.getByPlaceholder('ABCDE1234F').fill('ABCDE1234F');
    await expect.poll(async () => page.evaluate((k) => {
      const saved = JSON.parse(localStorage.getItem(k) || '{}');
      return `${saved.step}:${(saved.identityReminders || []).map((f) => `${f.role}:${f.index}:${f.field}`).join('|')}`;
    }, DRAFT)).toBe('1:licensor:0:pan');
    const written = await page.evaluate((k) => localStorage.getItem(k) || '', DRAFT);
    expect(written).not.toContain('ABCDE1234F');

    await reloadSettled(page);
    await stillOn(page, 1);
    await expect(active(page).getByTestId('ra-identity-reminder')).toContainText('Re-enter: Licensor 1 PAN');
    await expect(active(page).getByTestId('ra-identity-reminder')).not.toContainText('Aadhaar');
    await expect(active(page).getByPlaceholder('ABCDE1234F')).toHaveValue('');

    await active(page).getByPlaceholder('ABCDE1234F').fill('ABCDE1234F');
    await expect(active(page).getByTestId('ra-identity-reminder')).toHaveCount(0);
  });
});

test.describe('Rent Agreement — IGR property particulars', () => {
  const IGR_PROP = { ...PROP, area: '850', areaUnit: 'sqft' };
  test.beforeEach(async ({ page }) => { await login(page); });

  async function pick(page, label, option) {
    await active(page).getByRole('button', { name: label, exact: true }).click();
    await page.getByRole('option', { name: option, exact: true }).click();
  }

  test('the taluka is required and persists to the draft', async ({ page }) => {
    await gotoSettled(page, `${BASE}/services/rent-agreement`);
    const p = active(page);
    await p.getByPlaceholder('e.g. B-1204').fill('B-1204');
    await fillBuilding(page);
    await pickLocality(page, 'Baner');
    await p.getByTestId('ra-gram-no').click();
    await p.getByPlaceholder('411045').fill('411045');
    await p.getByPlaceholder('e.g. 850').fill('850');
    await fillIgrProperty(page);

    await clickNext(page);
    await expect(p.getByText('Choose the Pune taluka.')).toBeVisible();

    await pick(page, 'Taluka', 'Haveli');

    await clickNext(page, 1);
    await expect.poll(() => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}').prop, DRAFT)).toMatchObject({ taluka: 'Haveli' });
  });

  test('the property step blocks Next until every IGR police-record field is filled, then keeps them', async ({ page }) => {
    await gotoSettled(page, `${BASE}/services/rent-agreement`);
    const p = active(page);
    await p.getByPlaceholder('e.g. B-1204').fill('B-1204');
    await fillBuilding(page);
    await pickLocality(page, 'Baner');
    await p.getByTestId('ra-gram-no').click();
    await pick(page, 'Taluka', 'Haveli');
    await p.getByPlaceholder('411045').fill('411045');
    await p.getByPlaceholder('e.g. 850').fill('850');

    await clickNext(page);
    await stillOn(page, 0);
    for (const err of ['Enter a nearby landmark.', 'Enter the police station of the area.', 'Enter the road vicinity.', 'Enter the road type.']) {
      await expect(p.getByText(err), err).toBeVisible();
    }

    for (const gone of ['Village / City', 'Road name', 'Construction type', 'Building age (years)', 'Zone', 'Property numbers']) {
      await expect(p.getByText(gone, { exact: true }), `${gone} is read from the Index II, not asked`).toHaveCount(0);
    }
    await expect(p.locator('datalist'), 'the police station is typed, with no suggestion list').toHaveCount(0);

    await fillIgrProperty(page);
    await clickNext(page, 1);
    await expect.poll(() => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}').prop, DRAFT)).toMatchObject({
      landmark: 'Near D-Mart', policeStation: 'Chaturshringi', roadVicinity: 'On main road', roadType: 'Tar road',
    });
  });

  test('the tenant work ID proof is required for a salaried occupation and not asked of a student', async ({ page }) => {
    test.slow();
    await gotoSettled(page, `${BASE}/services/rent-agreement`);
    await fillProperty(page);
    await fillOwner(page);
    await fillTenant(page, { docs: false, next: false });
    const t = active(page);
    const police = t.getByTestId('tenant-police-record-0');
    await t.getByPlaceholder('e.g. Software Engineer').fill('Software Engineer');
    await expect(police.getByLabel('Work ID proof', { exact: true })).toHaveCount(1);

    await clickNext(page);
    await stillOn(page, 2);
    await expect(police.getByText(DOC_REQUIRED)).toBeVisible();

    await t.getByPlaceholder('e.g. Software Engineer').fill('Student');
    await expect(police.getByLabel('Work ID proof', { exact: true })).toHaveCount(0);
    await uploadAll(t, 'tenant-doc');
    await clickNext(page, 3);
  });

  test('parking area is shown only when parking is part of the licence', async ({ page }) => {
    await seedDraft(page, { step: 3, prop: IGR_PROP, tenantMode: 'fill' });
    await gotoSettled(page, `${BASE}/services/rent-agreement`);
    const p = active(page);

    await expect(p.getByText('Parking area (optional)')).toHaveCount(0);
    await pick(page, 'Parking included', 'Car');
    await p.getByText('Parking area (optional)', { exact: true }).locator('xpath=..').locator('input').fill('120');
    await expect.poll(() => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}').terms, DRAFT)).toMatchObject({ parking: 'car', parkingArea: '120', parkingAreaUnit: 'sqft' });

    await pick(page, 'Parking included', 'None');
    await expect(p.getByText('Parking area (optional)')).toHaveCount(0);
    await expect.poll(() => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}').terms?.parkingArea, DRAFT)).toBe('');
  });
});

test.describe('Rent Agreement — IGR tenant police record', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('each tenant stores police details, workplace proof and family co-occupants for review', async ({ page }) => {
    test.slow();
    await gotoSettled(page, `${BASE}/services/rent-agreement`);
    await fillProperty(page);
    await fillOwner(page);
    await fillTenant(page, { docs: false, next: false });
    const tenant = active(page);
    const police = tenant.getByTestId('tenant-police-record-0');
    await police.getByPlaceholder('Company / office address').fill('');
    await police.getByPlaceholder('e.g. Employee ID, offer letter').fill('');

    await clickNext(page);
    await stillOn(page, 2);
    await expect(police.getByText(/Enter the workplace address/)).toBeVisible();
    await expect(police.getByText('Required.')).toBeVisible();

    await fillTenantPolice(page, { family: true, previous: true });
    await uploadAll(tenant, 'tenant-doc');
    await clickNext(page, 3);
    await fillTerms(page);

    const review = active(page);
    await expect(review.getByText('Tenant police record')).toBeVisible();
    await expect(review.getByText(/Draazy Labs, Baner/)).toBeVisible();
    await expect(review.getByText(/Sneha Nair/)).toBeVisible();
    await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{}').tenants?.[0]?.police, DRAFT))
      .toMatchObject({ previousAddressProofType: 'passport', previous: { village: 'Sadashiv Peth' }, workplaceAddress: 'Draazy Labs, Baner, Pune 411045', workIdProofType: 'Employee ID', occupants: [{ relation: 'spouse', fullName: 'Sneha Nair', mobile: '9876543210' }] });
  });

  test('passport address proof must be uploaded before leaving the tenant step', async ({ page }) => {
    test.slow();
    await gotoSettled(page, `${BASE}/services/rent-agreement`);
    await fillProperty(page);
    await fillOwner(page);
    await fillTenant(page, { next: false });
    const tenant = active(page);
    const police = tenant.getByTestId('tenant-police-record-0');

    await police.getByRole('button', { name: 'Address proof type', exact: true }).click();
    await page.getByRole('option', { name: 'Passport', exact: true }).click();
    await expect(police.getByLabel('Address Proof', { exact: true })).toHaveCount(1);

    await clickNext(page);
    await stillOn(page, 2);
    await expect(police.getByText(DOC_REQUIRED)).toBeVisible();

    await police.getByLabel('Address Proof', { exact: true }).setInputFiles({ name: 'tenant-address-proof.png', mimeType: 'image/png', buffer: PNG });
    await expect(police.getByText('tenant-address-proof.jpg')).toBeVisible();
    await clickNext(page, 3);
    await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{}').docRefs?.tenant?.['t0-5'], DRAFT))
      .toMatchObject({ fileName: 'tenant-address-proof.jpg', reattach: true });
  });
});
