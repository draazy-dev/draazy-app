// @ts-check
import { test, expect } from '@playwright/test';
import { API, authHeaders, signedInAs, signedInAsNew, uniqueMobile, apiLogin } from '../../../helpers/liveAuth.js';
import { active, clickNext, fillOwner, fillPartyIgr, fillProperty, fillTenantPolice, fillTerms, inviteTenant, payAndSubmit, uploadAll } from '../../../helpers/rentAgreementWizard.js';
import { pickDate } from '../../../helpers/datePicker.helper.js';
import { gotoSettled } from '../../../helpers/settle.js';

const BASE = process.env.BASE_URL || 'http://localhost:5173';

test('an invited tenant who reopens their submitted invite finds their documents still filed, not asked for again', async ({ page, browser }) => {
  test.slow();
  const tenantMobile = uniqueMobile();
  await apiLogin(tenantMobile, { api: API });

  await signedInAsNew(page, { api: API });
  await gotoSettled(page, `${BASE}/services/rent-agreement`);
  await fillProperty(page);
  await fillOwner(page);
  await inviteTenant(page, tenantMobile);
  await fillTerms(page);
  await active(page).getByRole('checkbox').check();
  const created = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/service-requests\/co-fill$/.test(new URL(r.url()).pathname),
  );
  await payAndSubmit(page);
  const body = await (await created).json();
  const party = (body.parties || []).find((p) => p?.role === 'tenant');
  const inviteUrl = `${BASE}/services/rent-agreement?party=${encodeURIComponent(party.id)}&request=${encodeURIComponent(body.id)}`;

  const tenantCtx = await browser.newContext();
  try {
    const t = await tenantCtx.newPage();
    await signedInAs(t, tenantMobile);
    await gotoSettled(t, inviteUrl);
    await expect(t.getByText('Set up by the owner — view only')).toBeVisible();
    await clickNext(t, 1);
    await clickNext(t, 2);
    const step = active(t);
    await step.getByPlaceholder('As per PAN/Aadhaar').first().fill('Rahul Nair');
    await pickDate(t, '[data-err="t0dob"]', '1995-01-01');
    await fillPartyIgr(t, step, { address: false });
    await step.getByPlaceholder('ABCDE1234F').first().fill('PQRSX6789K');
    await fillTenantPolice(t);
    const police = step.getByTestId('tenant-police-record-0');
    await police.getByRole('button', { name: 'Address proof type', exact: true }).click();
    await t.getByRole('option', { name: 'Passport', exact: true }).click();
    await uploadAll(step, 'tenant-doc');
    await expect(step.getByText('Relation to Tenant 1'), 'the unused relation field is gone').toHaveCount(0);
    await clickNext(t, 3);
    await clickNext(t, 4);
    await active(t).getByRole('checkbox').check();
    const filled = t.waitForResponse((r) => r.request().method() === 'PUT' && /\/party-details$/.test(new URL(r.url()).pathname));
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    await t.route('**/party-details', async (route) => { await held; await route.continue(); }, { times: 1 });
    await active(t).getByRole('button', { name: /Generate Agreement & Proceed/ }).click();
    await expect(active(t).getByRole('button', { name: 'Submitting…' }), 'the owner already paid, so the tenant\'s submit is not a payment').toBeVisible();
    release();
    expect((await filled).status()).toBe(200);
    await expect.poll(async () => {
      const res = await fetch(`${API}/service-requests/${body.id}`, { headers: await authHeaders(tenantMobile) });
      return ((await res.json()).documents || []).filter((d) => d.category === 'tenant-0-addressproof').length;
    }, { message: 'the tenant address proof finished uploading', timeout: 30_000 }).toBe(1);

    await gotoSettled(t, inviteUrl);
    await expect(t.getByTestId('ra-view-note')).toBeVisible();
    await t.getByTestId('ra-view-edit').click();
    const again = active(t);
    await expect(again.getByText('tenant-doc-0.jpg'), 'the filed address proof is shown, ready to replace').toBeVisible();
    await expect(again.getByText('This document is required for registration.')).toHaveCount(0);
    await clickNext(t, 3);
  } finally {
    await tenantCtx.close();
  }
});
