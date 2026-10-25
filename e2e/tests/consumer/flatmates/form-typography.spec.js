import { test, expect } from '@playwright/test';
import { signedInAsNew } from '../../../helpers/liveAuth.js';
import { trackErrors } from '../../../helpers/console.js';
import { fillRoomDetails, fillRoomLocation, nextStep } from '../../../helpers/roomWizard.js';

const POST_BUTTON = /^Post(?: Property| property.*)?$/;

test.use({ viewport: { width: 440, height: 956 }, hasTouch: true, isMobile: true });

async function expectStandardType(page, elements, fontSize) {
  const fontFamily = await page.locator('body').evaluate((body) => getComputedStyle(body).fontFamily);
  for (const element of elements) {
    await expect(element).toHaveCSS('font-size', fontSize);
    await expect(element).toHaveCSS('font-family', fontFamily);
  }
}

async function expectPlaceholderSize(elements) {
  for (const element of elements) {
    expect(await element.evaluate((el) => getComputedStyle(el, '::placeholder').fontSize)).toBe('14px');
  }
}

test('flatmate post forms use the property-posting text scale', async ({ page }) => {
  test.slow();
  const errors = trackErrors(page);
  await signedInAsNew(page);

  await page.goto('/flatmates?post=1');
  const seeker = page.getByRole('dialog', { name: 'Post your flatmate request' }).locator('form');
  await expect(seeker).toBeVisible({ timeout: 20_000 });
  await seeker.getByTestId('seeker-more-details').locator('summary').click();
  await expectStandardType(page, [
    seeker.locator('label[for="fp-age"]'),
    seeker.locator('label[for="fp-occupation"]'),
    seeker.locator('label[for="fp-note"]'),
    seeker.getByRole('group', { name: 'I am a' }).getByRole('button', { name: 'Woman', exact: true }),
  ], '14px');
  await expectStandardType(page, [seeker.locator('p.text-xs').first()], '12px');
  await expectStandardType(page, [
    seeker.locator('#fp-age'),
    seeker.locator('#fp-occupation'),
    seeker.locator('input[data-err="title"]'),
    seeker.locator('#fp-note'),
  ], '16px');
  await expectPlaceholderSize([seeker.locator('input[data-err="title"]'), seeker.locator('#fp-note')]);
  const livingStyle = seeker.getByTestId('ls-inline');
  await expectStandardType(page, [
    livingStyle.getByTestId('ls-questions').locator('li').first().getByRole('button').first(),
  ], '14px');

  await page.goto('/flatmates');
  await expect(page.locator('button[data-tab="move-in"]')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: POST_BUTTON }).first().click();
  const chooser = page.getByRole('dialog', { name: /What do you want to post/ });
  await chooser.getByRole('button', { name: /^Flatmates/ }).click();
  await page.getByRole('dialog', { name: 'Flatmates' }).getByRole('button', { name: /Team up to rent a flat/ }).click();
  const group = page.getByRole('dialog', { name: 'Create a flatmate group' }).locator('form');
  await expect(group).toBeVisible();
  await expectStandardType(page, [
    group.locator('label[for="grp-title"]'),
    group.getByRole('group', { name: 'Open to' }).getByRole('button', { name: 'Anyone', exact: true }),
  ], '14px');
  await expectStandardType(page, [group.locator('#grp-title')], '16px');
  await expectPlaceholderSize([group.locator('#grp-title')]);
  await expectStandardType(page, [page.getByRole('dialog', { name: 'Create a flatmate group' }).locator('p.text-xs').first()], '12px');
  const preferenceCheckbox = group.locator('[data-testid="group-preferences"] input[type="checkbox"]').first();
  const preferenceLabel = preferenceCheckbox.locator('xpath=..');
  await expectStandardType(page, [preferenceLabel], '14px');
  await expect(preferenceLabel).toHaveCSS('align-items', 'flex-start');
  await expect(preferenceCheckbox).toHaveCSS('flex-shrink', '0');

  await page.goto('/list-property?flatmate=1');
  await expect(page.locator('.lp-meter')).toBeVisible({ timeout: 20_000 });
  await expectStandardType(page, [
    page.locator('.lp-step').getByText('Room type', { exact: false }).first(),
    page.locator('[data-err="roomType"] .radio-pill').first(),
  ], '14px');
  await fillRoomDetails(page);
  await nextStep(page);
  await fillRoomLocation(page, { society: `Type Scale ${Date.now().toString(36)}` });
  await nextStep(page);
  const rentInput = page.locator('input[data-err="rentShare"]');
  await expectStandardType(page, [rentInput], '16px');
  await expectPlaceholderSize([rentInput]);
  await rentInput.fill('14000');
  await expectStandardType(page, [page.locator('.lp-step p.text-xs').first()], '12px');

  expect(errors, `console errors: ${errors.join('\n')}`).toHaveLength(0);
});
