// @ts-check
import { test, expect } from '@playwright/test';
import { API, authHeaders, signedInAs, signedInAsNew, uniqueMobile, apiLogin } from '../../../helpers/liveAuth.js';
import { active, clickNext, fillOwner, fillProperty, fillTenantPolice, fillTerms, fillWitnesses, inviteTenant, uploadAll } from '../../../helpers/rentAgreementWizard.js';
import { pickDate } from '../../../helpers/datePicker.helper.js';

const BASE = process.env.BASE_URL || 'http://localhost:5173';

test('an invited tenant who reopens their submitted invite finds their documents still filed, not asked for again', async ({ page, browser }) => {
  test.slow();
  const tenantMobile = uniqueMobile();
  await apiLogin(tenantMobile, { api: API });

  await signedInAsNew(page, { api: API });
  await page.goto(`${BASE}/services/rent-agreement`, { waitUntil: 'networkidle' });
  await fillProperty(page);
  await fillOwner(page);
  await inviteTenant(page, tenantMobile);
  await fillTerms(page);
  await fillWitnesses(page);
  await active(page).getByRole('checkbox').check();
  const created = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/service-requests\/co-fill$/.test(new URL(r.url()).pathname),
  );
  await active(page).getByRole('button', { name: /Generate Agreement & Proceed/ }).click();
  const body = await (await created).json();
  const party = (body.parties || []).find((p) => p?.role === 'tenant');
  const inviteUrl = `${BASE}/services/rent-agreement?party=${encodeURIComponent(party.id)}&request=${encodeURIComponent(body.id)}`;

  const tenantCtx = await browser.newContext();
  try {
    const t = await tenantCtx.newPage();
    await signedInAs(t, tenantMobile);
    await t.goto(inviteUrl, { waitUntil: 'networkidle' });
    await expect(t.getByText('Set up by the owner — view only')).toBeVisible();
    await clickNext(t, 1);
    await clickNext(t, 2);
    const step = active(t);
    await step.getByPlaceholder('As per PAN/Aadhaar').first().fill('Rahul Nair');
    await pickDate(t, '[data-err="t0dob"]', '1995-01-01');
    await step.getByPlaceholder('ABCDE1234F').first().fill('PQRSX6789K');
    await fillTenantPolice(t);
    const police = step.getByTestId('tenant-police-record-0');
    await police.getByRole('button', { name: 'Address proof type', exact: true }).click();
    await t.getByRole('option', { name: 'Passport', exact: true }).click();
    await uploadAll(step, 'tenant-doc');
    await expect(step.getByText('Relation to Tenant 1'), 'the unused relation field is gone').toHaveCount(0);
    await clickNext(t, 3);
    await clickNext(t, 4);
    await clickNext(t, 5);
    await active(t).getByRole('checkbox').check();
    const filled = t.waitForResponse((r) => r.request().method() === 'PUT' && /\/party-details$/.test(new URL(r.url()).pathname));
    await active(t).getByRole('button', { name: /Generate Agreement & Proceed/ }).click();
    expect((await filled).status()).toBe(200);
    await expect.poll(async () => {
      const res = await fetch(`${API}/service-requests/${body.id}`, { headers: await authHeaders(tenantMobile) });
      return ((await res.json()).documents || []).filter((d) => String(d.category).startsWith('tenant-0-')).length;
    }, { message: 'the tenant address proof finished uploading', timeout: 30_000 }).toBe(1);

    await t.goto(inviteUrl, { waitUntil: 'networkidle' });
    await expect(t.getByText('Set up by the owner — view only')).toBeVisible();
    await clickNext(t, 1);
    await clickNext(t, 2);
    const again = active(t);
    await expect(again.getByText('tenant-doc-0.jpg'), 'the filed address proof is shown, ready to replace').toBeVisible();
    await expect(again.getByText('This document is required for registration.')).toHaveCount(0);
    await clickNext(t, 3);
  } finally {
    await tenantCtx.close();
  }
});
