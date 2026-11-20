// Live coverage for the finance console and the three reads behind it.
import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { API, authHeaders, signIn } from '../helpers/liveAuth.js';
import { ACTORS } from '../fixtures/live.js';
import { trackErrors } from '../helpers/console.js';
import { sql } from '../helpers/monetisation.js';

// Mirrors fmtINR in frontend/src/lib/format.js, lakh and crore abbreviations included.
function inr(n) {
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2).replace(/\.00$/, '')} Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2).replace(/\.00$/, '')} L`;
  return `${sign}₹${abs.toLocaleString('en-IN')}`;
}

const OVERVIEW = /\/api\/admin\/finance(\?.*)?$/;
const txRows = (page) => page.getByTestId('queue-row');
const kpi = (page, label) => page.getByTestId('finance-kpi').filter({ hasText: label }).locator('.text-xl');

/** Stands in for the gateway webhooks, which e2e cannot sign: one paid rent agreement and part of it refunded. */
function seedAgreementWithRefund() {
  const tag = randomUUID().slice(0, 8);
  const invoice = `E2E-FIN-INV-${tag}`;
  const note = `E2E-FIN-CN-${tag}`;
  const buyer = `(select id from users where mobile = '${ACTORS.buyer}')`;
  sql('insert into invoices (number, user_id, source_type, source_id, amount, taxable_amount, issued_at)'
    + ` values ('${invoice}', ${buyer}, 'service_request', gen_random_uuid(), 5000, 999, now())`);
  sql('insert into credit_notes (number, user_id, source_type, source_id, amount, taxable_amount, invoice_no)'
    + ` values ('${note}', ${buyer}, 'service_request_refund', gen_random_uuid(), 1000, 0, '${invoice}')`);
  return { invoice, note, party: sql(`select name from users where mobile = '${ACTORS.buyer}'`) };
}

async function gotoFinance(page) {
  const overview = page.waitForResponse((r) => OVERVIEW.test(r.url()) && r.request().resourceType() !== 'document');
  await page.goto('/admin/finance');
  await expect(page.getByRole('heading', { name: 'Finance' })).toBeVisible();
  return (await overview).json();
}

async function gotoLedger(page) {
  await page.goto('/admin/finance?tab=transactions');
  await expect(page.getByRole('tab', { name: /^Transactions/ })).toHaveAttribute('aria-selected', 'true');
  await expect(txRows(page).first()).toBeVisible();
}

async function pickSelectOption(page, ariaLabel, optionText) {
  await page.locator(`[aria-label="${ariaLabel}"]`).click();
  const option = page.locator('.dz-dropdown__option', { hasText: optionText }).first();
  await expect(option).toBeVisible();
  await option.click();
  await expect(page.locator('.dz-dropdown__option')).toHaveCount(0);
}

test.describe('admin finance API', () => {
  test('invoices and credit notes are the money: the month reconciles, the series agrees and the ledger lists both', async ({ request }) => {
    const { invoice, note } = seedAgreementWithRefund();
    const headers = await authHeaders(ACTORS.admin, { request });
    const [overview, series] = await Promise.all([
      request.get(`${API}/admin/finance`, { headers }).then((r) => r.json()),
      request.get(`${API}/admin/finance/series?months=1`, { headers }).then((r) => r.json()),
    ]);

    const { month } = overview;
    expect(month.collected).toBeGreaterThanOrEqual(5000);
    expect(month.refunded).toBeGreaterThanOrEqual(1000);
    expect(month.collected - month.refunded - month.passThrough, 'the breakdown reconciles').toBe(month.net);
    const [point] = series;
    expect(point.subscriptions + point.services - point.refunds, 'chart and tiles describe one month').toBe(month.net);
    for (const gone of ['revenue', 'refunds', 'breakdown', 'refundsMeasured', 'serviceOrdersCounted', 'users', 'payingUsers', 'monthRevenue']) {
      expect(overview[gone], `${gone} belonged to the subscriptions-only model`).toBeUndefined();
    }
    for (const field of ['refundRequests', 'serviceRefunds', 'openDisputes']) {
      expect(typeof overview.attention[field]).toBe('number');
    }

    for (const [number, kind, amount, fee] of [[invoice, 'service', 5000, 999], [note, 'refund', -1000, 0]]) {
      const page = await request.get(`${API}/admin/finance/transactions`, { headers, params: { q: number } }).then((r) => r.json());
      expect(page.totalElements, number).toBe(1);
      expect(page.content[0]).toMatchObject({ number, kind, amount, fee });
    }
  });
});

test.describe('finance console UI behaviour', () => {
  test('the console renders what the API returned: tiles, month breakdown, ledger, filters, search, exports, chart and the drawer', async ({ page }) => {
    test.slow();
    const { invoice, note, party } = seedAgreementWithRefund();
    await signIn(page, ACTORS.admin, { screen: 'staff' });

    await test.step('the tiles and the month breakdown equal the overview the page fetched, as formatted', async () => {
      const errors = trackErrors(page);
      const overview = await gotoFinance(page);
      await expect(kpi(page, 'Net revenue')).toHaveText(inr(overview.month.net));
      await expect(kpi(page, 'Collected')).toHaveText(inr(overview.month.collected));
      await expect(kpi(page, 'Refunded')).toHaveText(inr(overview.month.refunded));
      await expect(kpi(page, 'MRR')).toHaveText(inr(overview.mrr));
      const breakdown = page.getByTestId('finance-month');
      await expect(breakdown).toContainText('Pass-through');
      await expect(breakdown).toContainText('Stamp duty and registration');
      await expect(page.locator('body')).not.toContainText(/NaN|Infinity|Not measured/);
      expect(errors).toHaveLength(0);
    });

    await test.step('the chart window selector redraws cleanly and the header exports a revenue CSV', async () => {
      const errors = trackErrors(page);
      await gotoFinance(page);
      const chart = page.locator('.dz-card', { has: page.getByText('Revenue by month') }).locator('canvas');
      await expect(chart).toBeVisible();
      const before = await chart.evaluate((canvas) => canvas.toDataURL());
      await pickSelectOption(page, 'Revenue window', '6 months');
      await expect(page.getByTestId('finance-window-net')).toContainText('over 6 months');
      await expect.poll(() => chart.evaluate((canvas) => canvas.toDataURL())).not.toBe(before);
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: /Revenue CSV/i }).click();
      expect((await download).suggestedFilename()).toBe('draazy-revenue.csv');
      expect(errors).toHaveLength(0);
    });

    await test.step('the ledger lists the invoice and its credit note, findable by number', async () => {
      await gotoLedger(page);
      const types = (await page.getByRole('group', { name: 'Type' }).getByRole('button').allTextContents()).map((s) => s.trim());
      expect(types).toEqual(['All', 'Subscriptions', 'Services', 'Refunds']);

      await page.getByPlaceholder('Search name or number…').fill(invoice);
      await expect(txRows(page)).toHaveCount(1);
      await expect(txRows(page).first()).toContainText(party);
      await expect(txRows(page).first()).toContainText('Service');
      await expect(txRows(page).first()).toContainText('Fee ₹999');

      await page.getByPlaceholder('Search name or number…').fill(note);
      await expect(txRows(page)).toHaveCount(1);
      await expect(txRows(page).first()).toContainText('Refund');
      await expect(txRows(page).first()).toContainText('−₹1,000');
    });

    await test.step('the type filter is sent to the server, and an unmatchable search shows the empty state', async () => {
      await gotoLedger(page);
      const filtered = page.waitForRequest((r) => /\/admin\/finance\/transactions\?.*kind=refund/.test(r.url()));
      await page.getByRole('group', { name: 'Type' }).getByRole('button', { name: 'Refunds' }).click();
      await filtered;
      await page.getByPlaceholder('Search name or number…').fill('zzzz-no-such-party-zzzz');
      await expect(page.getByText('No transactions match.')).toBeVisible();
      await expect(txRows(page)).toHaveCount(0);
    });

    await test.step('opening a document shows every field and closes on Escape; the ledger exports a CSV', async () => {
      await gotoLedger(page);
      await page.getByPlaceholder('Search name or number…').fill(invoice);
      await expect(txRows(page)).toHaveCount(1);
      await txRows(page).first().getByRole('button', { name: `Open ${invoice}` }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toContainText(invoice);
      for (const [label, value] of [['Paid', '₹5,000'], ['Draazy fee', '₹999'], ['Pass-through', '₹4,001'], ['Type', 'Service']]) {
        await expect(dialog.locator('div').filter({ has: page.getByText(label, { exact: true }) }).last()).toContainText(value);
      }
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);

      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export CSV' }).click();
      expect((await download).suggestedFilename()).toBe('draazy-transactions.csv');
    });

    await test.step('a ledger longer than one page says so on screen', async () => {
      await gotoLedger(page);
      await expect(page.getByTestId('ledger-window')).toHaveCount(0);
      await page.route('**/admin/finance/transactions*', async (route) => {
        const res = await route.fetch();
        const body = await res.json();
        await route.fulfill({ response: res, json: { ...body, totalElements: (body.content?.length ?? 0) + 250 } });
      });
      await page.goto('/admin/finance?tab=transactions');
      await expect(page.getByTestId('ledger-window')).toContainText(/of [\d,]+ matching documents/);
    });
  });
});