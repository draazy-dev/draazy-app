// @ts-check
import { test, expect } from '@playwright/test';
import { API, signedInAsNew } from '../../../helpers/liveAuth.js';
import { isolatedPin, pickGoogleSociety } from '../../../helpers/places.js';
import { pickGoogleLocality } from '../../../helpers/locality.js';
import { SOCIETY_PLACEHOLDER, active } from '../../../helpers/rentAgreementWizard.js';

const BASE = process.env.BASE_URL || 'http://localhost:5173';

test('picking the society fills the locality and pincode it knows, and a later locality pick still corrects it', async ({ page }) => {
  await signedInAsNew(page, { api: API });
  await page.goto(`${BASE}/services/rent-agreement`, { waitUntil: 'networkidle' });
  const p = active(page);
  const locality = p.locator('[data-err="locality"]');

  await pickGoogleSociety(page, `Zztest RA Towers ${Date.now().toString(36)}`, {
    input: p.getByPlaceholder(SOCIETY_PLACEHOLDER), ...isolatedPin(), locality: 'Wakad', pincode: '411057', street: 'Datta Mandir Road',
  });
  await expect(locality.locator('.dz-dropdown__value')).toContainText('Wakad', { timeout: 15000 });
  await expect(p.getByPlaceholder('411045')).toHaveValue('411057');
  await expect(p.getByPlaceholder('e.g. Baner Road', { exact: true }), 'the road is read from the Index II, not asked').toHaveCount(0);
  await expect(p.getByPlaceholder('e.g. Baner, Pune', { exact: true }), 'the village or city is read from the Index II, not asked').toHaveCount(0);

  await pickGoogleLocality(page, 'Pashan', { field: locality, lat: 18.538, lng: 73.789 });
  await expect(locality.locator('.dz-dropdown__value')).toContainText('Pashan');
});
