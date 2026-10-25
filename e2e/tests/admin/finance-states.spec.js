/* States of /admin/finance the live seed cannot reach, so the finance responses are patched; the component is real,
   only the payload is chosen. */
import { test, expect, ACTORS } from '../../fixtures/live.js';
import { signIn } from '../../helpers/liveAuth.js';

const OVERVIEW = /\/api\/admin\/finance(\?.*)?$/;
const SERIES = /\/api\/admin\/finance\/series(\?.*)?$/;
const LEDGER = /\/api\/admin\/finance\/transactions(\?.*)?$/;

const ZERO_MONTH = { collected: 0, refunded: 0, passThrough: 0, net: 0, payments: 0 };
const NO_ATTENTION = {
  refundRequests: 0, refundRequestAmount: 0, serviceRefunds: 0, serviceRefundAmount: 0, openDisputes: 0, openDisputeAmount: 0,
};

async function stage(page, pattern, json) {
  const seen = { hits: 0 };
  await page.route(pattern, async (route) => {
    if (route.request().resourceType() === 'document') return route.fallback();
    seen.hits += 1;
    return route.fulfill({ json });
  });
  return seen;
}

async function openFinance(page) {
  await page.goto('/admin/finance');
  await expect(page.getByRole('heading', { name: 'Finance' })).toBeVisible();
  await expect(page.getByTestId('finance-kpi').first()).toBeVisible();
}

const kpi = (page, label) => page.getByTestId('finance-kpi').filter({ hasText: label }).locator('.text-xl');

test.describe('finance console: staged states', () => {
  test('an empty book reads as zero everywhere, says no plans are active, and asks for no attention', async ({ page }) => {
    await signIn(page, ACTORS.admin, { screen: 'staff' });
    const overview = await stage(page, OVERVIEW, { mrr: 0, plans: [], month: ZERO_MONTH, attention: NO_ATTENTION });
    const series = await stage(page, SERIES, []);
    const ledger = await stage(page, LEDGER, { content: [], totalElements: 0, totalPages: 0, number: 0, size: 100 });

    await openFinance(page);
    for (const label of ['Net revenue', 'Collected', 'Refunded', 'MRR']) {
      await expect(kpi(page, label), label).toHaveText('₹0');
    }
    await expect(page.getByText('No active paid plans.')).toBeVisible();
    await expect(page.getByTestId('finance-attention')).toHaveCount(0);
    await expect(page.getByTestId('finance-window-net')).toHaveText('₹0 net over 12 months');
    await expect(page.locator('body')).not.toContainText(/NaN|Infinity/);
    await page.getByRole('tab', { name: /^Transactions/ }).click();
    await expect(page.getByText('No transactions match.')).toBeVisible();

    expect(overview.hits).toBeGreaterThan(0);
    expect(series.hits).toBeGreaterThan(0);
    expect(ledger.hits).toBeGreaterThan(0);
  });

  test('refunds, disputes and service refunds waiting on staff link to where they are decided', async ({ page }) => {
    await signIn(page, ACTORS.admin, { screen: 'staff' });
    await stage(page, OVERVIEW, {
      mrr: 0,
      plans: [],
      month: ZERO_MONTH,
      attention: {
        refundRequests: 2, refundRequestAmount: 1398, serviceRefunds: 1, serviceRefundAmount: 4001, openDisputes: 1, openDisputeAmount: 2499,
      },
    });

    await openFinance(page);
    const strip = page.getByTestId('finance-attention');
    await expect(strip.getByRole('link', { name: /2 refund requests to decide/ })).toHaveAttribute('href', '/admin/refunds');
    await expect(strip.getByRole('link', { name: /1 service refund to decide/ })).toHaveAttribute('href', '/admin/rent-agreement');
    await expect(strip.getByRole('link', { name: /1 open payment dispute/ })).toHaveAttribute('href', '/admin/refunds?tab=disputes');
    await expect(strip).toContainText('₹1,398');
    await expect(strip).toContainText('₹4,001');
    await expect(strip).toContainText('₹2,499');
  });

  test('a month whose refunds exceed its fees reads as a negative net, with the drop against last month', async ({ page }) => {
    await signIn(page, ACTORS.admin, { screen: 'staff' });
    await stage(page, OVERVIEW, {
      mrr: 199,
      plans: [{ name: 'Seeker Plus', audience: 'seeker', billingCycle: 'monthly', price: 199, active: 1, monthlyValue: 199, termDays: null }],
      month: { collected: 999, refunded: 2000, passThrough: 0, net: -1001, payments: 1 },
      attention: NO_ATTENTION,
    });
    await stage(page, SERIES, [
      { month: '2026-09-01', subscriptions: 1000, services: 0, refunds: 0 },
      { month: '2026-10-01', subscriptions: 999, services: 0, refunds: 2000 },
    ]);

    await openFinance(page);
    await expect(kpi(page, 'Net revenue')).toHaveText('−₹1,001');
    await expect(page.getByTestId('finance-kpi').filter({ hasText: 'Net revenue' })).toContainText('-200.1% MoM');
    await expect(page.getByTestId('finance-kpi').filter({ hasText: 'Collected' })).toContainText('1 payment this month');
    await expect(page.getByTestId('finance-kpi').filter({ hasText: 'MRR' })).toContainText('1 active paid plan');
    await expect(page.getByTestId('finance-month')).toContainText('−₹2,000');
    await expect(page.getByTestId('finance-window-net')).toHaveText('−₹1 net over 12 months');
  });
});

test.describe('finance console: failed reads', () => {
  test('a failed overview shows an error with Retry, not an endless spinner', async ({ page }) => {
    await signIn(page, ACTORS.admin, { screen: 'staff' });
    await page.route(OVERVIEW, async (route) => {
      if (route.request().resourceType() === 'document') return route.fallback();
      return route.fulfill({ status: 500, json: { error: 'internal_error', message: 'boom' } });
    });

    await page.goto('/admin/finance');
    await expect(page.getByRole('alert')).toContainText('Could not load the finance overview.');

    await page.unroute(OVERVIEW);
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByTestId('finance-kpi').first()).toBeVisible();
  });

  test('a failed monthly series says so on the chart and disables the revenue CSV, while the tiles still load', async ({ page }) => {
    await signIn(page, ACTORS.admin, { screen: 'staff' });
    await page.route(SERIES, async (route) => {
      if (route.request().resourceType() === 'document') return route.fallback();
      return route.fulfill({ status: 500, json: { error: 'internal_error', message: 'boom' } });
    });

    await openFinance(page);
    await expect(page.getByRole('alert')).toContainText('Could not load the monthly figures.');
    await expect(page.getByRole('button', { name: /Revenue CSV/ })).toBeDisabled();
  });

  test('a failed ledger read says so instead of "No transactions match."', async ({ page }) => {
    await signIn(page, ACTORS.admin, { screen: 'staff' });
    await page.route(LEDGER, async (route) => {
      if (route.request().resourceType() === 'document') return route.fallback();
      return route.fulfill({ status: 500, json: { error: 'internal_error', message: 'boom' } });
    });

    await openFinance(page);
    await page.getByRole('tab', { name: /^Transactions/ }).click();
    await expect(page.getByRole('alert')).toContainText('Could not load transactions.');
    await expect(page.getByText('No transactions match.')).toHaveCount(0);
  });
});