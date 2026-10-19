import { test, expect, ACTORS } from '../../../fixtures/live.js';
import {
  API,
  E2E_OTP,
  authHeaders,
  completeProfileIfAsked,
  seedConsent,
  signedInAs,
  signedInAsNew,
  uniqueMobile,
} from '../../../helpers/liveAuth.js';
// A slug no locality row will ever match and no other spec will ever write, so the count for it is this test's alone.
const uniqueLocality = () => `zzalert-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

async function api(method, path, headers, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function demandRow(slug) {
  const res = await api('GET', '/admin/supply-gap', await authHeaders(ACTORS.admin));
  expect(res.status, 'reading the supply-gap report').toBe(200);
  return res.body.find((r) => r.localitySlug === slug) || null;
}
/** This account's saved searches, straight off the server — never off the screen. */
const savedSearchesOf = async (headers) => {
  const res = await api('GET', '/me/saved-searches', headers);
  expect(res.status, 'reading /me/saved-searches').toBe(200);
  return res.body;
};

async function openEmptySearch(page, slug) {
  await page.goto(`/listings?deal=rent&ptype=flat&loc=${slug}`);
  const card = page.getByText('Nothing here yet? Get there first.');
  await expect(card, 'the empty-state alert card never rendered').toBeVisible();
  return page.getByRole('button', { name: /Create alert/i });
}

test.describe('Property alerts (live)', () => {
  test('an anonymous alert submit records the demand signal before routing to sign-in (D85)', async ({ page }) => {
    const slug = uniqueLocality();

    expect(await demandRow(slug), 'the slug was already known to the report').toBeNull();

    const createBtn = await openEmptySearch(page, slug);
    await expect(page.getByText(/notify you in the app when new matches are listed/i)).toBeVisible();
    await createBtn.click();

    await page.waitForURL(/\/signin\?reason=alerts/);
    // Polled, because nothing awaits `recordSignal` — the component fires it and calls `navigate()` on the next line.
    await expect.poll(
      async () => (await demandRow(slug))?.alerts ?? 0,
      { message: 'the anonymous submit never reached POST /demand-signals' },
    ).toBe(1);

    const row = await demandRow(slug);
    expect(row.views, 'a submit is not a view').toBe(0);
    expect(row.supply, 'nowhere Draazy covers should have listings').toBe(0);
  });

  test('a signed-in alert submit writes a real saved search and confirms with a link to manage it', async ({ page }) => {
    const slug = uniqueLocality();
    const mobile = await signedInAsNew(page);
    const headers = await authHeaders(mobile);
    // Positive anchor for the absence below: a brand-new account genuinely starts with none, so the
    // count after the submit is unambiguous.
    expect(await savedSearchesOf(headers), 'a new account should hold no alerts').toEqual([]);

    await test.step('the dashboard exposes the Alerts surface', async () => {
      await page.goto('/dashboard');
      await expect(page.getByRole('button', { name: 'Alerts', exact: true }).first()).toBeVisible();
    });

    const createBtn = await openEmptySearch(page, slug);
    await expect(page.getByText(/notify you in the app when new matches are listed/i)).toBeVisible();
    await createBtn.click();

    await expect(page.getByText(/first in line/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /Manage my alerts/i })).toBeVisible();

    const saved = await savedSearchesOf(headers);
    expect(saved, 'the confirmation was shown but nothing was stored').toHaveLength(1);
    const [alert] = saved;
    expect(alert.kind).toBe('listings');
    expect(alert.channel).toBe('push');
    // Filters are free-form; missing facets would otherwise disappear silently.
    expect(alert.alertFrequency).toBe('daily');
    expect(alert.filters?.deal).toBe('rent');
    expect(alert.filters?.localities).toContain(slug);
    expect(alert.filters?.types).toContain('flat');
  });

  test('a signed-out alert intent returns with a nonce and waits for one more tap', async ({ page }) => {
    const slug = uniqueLocality();
    const mobile = uniqueMobile();
    const headers = await authHeaders(mobile);
    await seedConsent(page);

    const createBtn = await openEmptySearch(page, slug);
    await createBtn.click();
    await page.waitForURL(/\/signin\?reason=alerts/);
    const next = new URL(page.url()).searchParams.get('next');
    expect(next).toContain('alertNonce=');
    expect(next).not.toContain('alertIntent');

    await page.locator('#signin-mobile').fill(mobile);
    await page.getByRole('button', { name: /send otp|continue/i }).click();
    const boxes = page.locator('#root input[inputmode="numeric"]:not(#signin-mobile)');
    await expect(boxes.first()).toBeVisible();
    await boxes.first().click();
    for (const digit of E2E_OTP) await page.keyboard.type(digit);
    const verify = page.getByRole('button', { name: /verify|sign in|log in|continue/i });
    if (await verify.count()) await verify.first().click();
    await completeProfileIfAsked(page, { away: /\/signin/ });

    await expect(page.getByText(/Create alert for/i)).toBeVisible();
    expect(await savedSearchesOf(headers), 'the return intent should not create until confirmed').toEqual([]);
    await page.getByRole('button', { name: /Create alert/i }).click();

    await expect(page.getByText(/first in line/i)).toBeVisible();
    const saved = await savedSearchesOf(headers);
    expect(saved).toHaveLength(1);
    expect(saved[0].channel).toBe('push');
    expect(saved[0].filters?.localities).toContain(slug);
  });

  test('the cadence picker round-trips through the server, including off and back on (D84)', async ({ page }) => {
    const mobile = uniqueMobile();
    const headers = await authHeaders(mobile);
    const label = `Zztest cadence ${Date.now()}`;

    const created = await api('POST', '/me/saved-searches', headers, {
      kind: 'listings',
      name: label,
      query: 'Pune',
      // The label goes *inside* `filters` because that is where the http provider looks
      // (`row.label || filters.label`); a listings alert has no top-level label column.
      filters: { label, deal: 'rent', localities: ['baner'], bhk: ['2'] },
      alertFrequency: 'daily',
      channel: 'whatsapp',
    });
    expect(created.status, 'creating the alert under test').toBe(201);
    const { id } = created.body;
    // Read the cadence off the record, not off the control. Everything below is a claim about
    // stored state; the control is optimistic and will happily show a value the server refused.
    const stored = async () => (await savedSearchesOf(headers)).find((s) => s.id === id)?.alertFrequency;

    await signedInAs(page, mobile);
    await page.goto('/dashboard#alerts');

    await expect(page.getByText(label), 'the alert never appeared in the dashboard list').toBeVisible();
    const freq = page.getByRole('button', { name: /Alert frequency for/ }).first();
    // A row created with `daily` must read `daily`, not an empty picker: a row that predates the column
    // has no stored cadence at all.
    await expect(freq).toHaveText(/Daily/);
    const pick = async (option) => {
      await freq.click();
      await page.getByRole('option', { name: new RegExp(`^${option}`) }).click();
    };

    for (const [cadence, option] of [['instant', 'Instant'], ['weekly', 'Weekly']]) {
      await pick(option);
      await expect.poll(stored, { message: `the server never stored ${cadence}` }).toBe(cadence);

      await pick('Paused');
      await expect.poll(stored, { message: 'the server never stored off' }).toBe('off');
    }
    // Back to a real cadence so the delete below is removing a live alert rather than a muted one.
    await pick('Daily');
    await expect.poll(stored).toBe('daily');

    await page.getByRole('button', { name: /Delete alert/i }).click();
    await page.getByTestId('confirm-modal-ok').click();
    await expect(page.getByText('No alerts yet')).toBeVisible();
    // `remove` is optimistic too: the empty state above appears before the DELETE is issued and
    // stays if it fails, so the row is only gone once the server says so.
    await expect.poll(
      async () => (await savedSearchesOf(headers)).length,
      { message: 'the row vanished from the screen but not from the server' },
    ).toBe(0);
  });

  test('the listings bell opens a pre-filled pop-up and saves the criteria picked there', async ({ page }) => {
    const mobile = await signedInAsNew(page);
    const headers = await authHeaders(mobile);

    await page.goto('/listings?deal=buy&loc=baner&bhks=3');
    await page.getByRole('button', { name: 'Alert me', exact: true }).filter({ visible: true }).click();

    const dialog = page.getByRole('dialog', { name: 'Create an alert' });
    await expect(dialog.getByTestId('alert-setup-label')).toContainText('3 BHK');
    await expect(dialog.getByTestId('alert-setup-label')).toContainText('Baner');
    await expect(dialog.getByRole('button', { name: '3 BHK' })).toHaveAttribute('aria-pressed', 'true');
    expect(await savedSearchesOf(headers), 'opening the pop-up must not save anything').toEqual([]);

    await dialog.getByRole('button', { name: '2 BHK' }).click();
    await dialog.getByRole('radio', { name: 'Weekly' }).click();
    await dialog.getByRole('button', { name: 'Create alert', exact: true }).click();
    await expect(dialog).toBeHidden();

    await expect.poll(async () => (await savedSearchesOf(headers)).length).toBe(1);
    const [saved] = await savedSearchesOf(headers);
    expect(saved.alertFrequency).toBe('weekly');
    expect(saved.filters?.deal).toBe('buy');
    expect(saved.filters?.localities).toEqual(['baner']);
    expect([...saved.filters.bhk].sort()).toEqual(['2', '3']);
  });

  test('a facet the chosen type has no use for is neither shown nor saved', async ({ page }) => {
    const mobile = await signedInAsNew(page);
    const headers = await authHeaders(mobile);

    await page.goto('/listings?deal=buy&ptype=plot&bhks=2&furn=semi&amen=lift');
    await page.getByRole('button', { name: 'Alert me', exact: true }).filter({ visible: true }).click();

    const dialog = page.getByRole('dialog', { name: 'Create an alert' });
    await expect(dialog.getByTestId('alert-setup-label')).not.toContainText('BHK');
    await expect(dialog.getByRole('button', { name: '2 BHK' })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Create alert', exact: true }).click();
    await expect(dialog).toBeHidden();

    await expect.poll(async () => (await savedSearchesOf(headers)).length).toBe(1);
    const [{ filters }] = await savedSearchesOf(headers);
    expect(filters.types).toEqual(['plot']);
    expect(filters.bhk ?? []).toEqual([]);
    expect(filters.furnishing ?? []).toEqual([]);
    expect(filters.amenities ?? []).toEqual([]);
  });

  test('editing an alert from the dashboard updates it in place', async ({ page }) => {
    const mobile = uniqueMobile();
    const headers = await authHeaders(mobile);
    const label = `Zztest edit ${Date.now()}`;
    const created = await api('POST', '/me/saved-searches', headers, {
      kind: 'listings',
      name: label,
      query: label,
      filters: { deal: 'rent', localities: ['baner'], bhk: ['2'], pets: true },
      alertFrequency: 'off',
    });
    expect(created.status, 'creating the alert under test').toBe(201);

    await signedInAs(page, mobile);
    await page.goto('/dashboard#alerts');
    const row = page.getByTestId('dashboard-alert-row').filter({ hasText: label });
    await expect(row.getByRole('link', { name: /View matches/ })).toHaveAttribute('href', /loc=baner.*bhks=2|bhks=2.*loc=baner/);

    await row.getByRole('button', { name: 'Edit', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit alert' });
    await expect(dialog.getByRole('button', { name: '2 BHK' })).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByRole('radio', { name: 'Paused' })).toHaveAttribute('aria-checked', 'true');
    await dialog.getByRole('button', { name: '3 BHK' }).click();
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toBeHidden();

    await expect.poll(async () => {
      const rows = await savedSearchesOf(headers);
      return rows.length === 1 && rows[0].id === created.body.id ? [...rows[0].filters.bhk].sort() : null;
    }, { message: 'the edit did not update the alert in place' }).toEqual(['2', '3']);
    const [saved] = await savedSearchesOf(headers);
    expect(saved.alertFrequency, 'a paused alert stays paused through an edit').toBe('off');
    expect(saved.filters.pets, 'a facet the form has no control for survives the edit').toBe(true);

    await page.getByTestId('dashboard-alert-row').getByRole('button', { name: 'Edit', exact: true }).click();
    await dialog.getByRole('radio', { name: 'Weekly' }).click();
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('dashboard-alert-row')).toHaveCount(1);
    await expect.poll(async () => (await savedSearchesOf(headers)).map((r) => [r.id, r.alertFrequency]))
      .toEqual([[created.body.id, 'weekly']]);
  });
});
