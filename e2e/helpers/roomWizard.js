import { expect } from '@playwright/test';
import { uploadedListingPhotos } from './liveAuth.js';
import { pickDate } from './datePicker.helper.js';
import { istInDays } from './availability.js';
import { pickFloors } from './listingForm.helper.js';
import { fillSociety } from './places.js';
import { pickLocality } from './locality.js';
import { uploadPublishablePhotos } from './listingPhotos.helper.js';

// What POST /flatmates/rooms asks of a new room beyond bhk, roomType, rent, deposit and place.
// Spread it first so a spec's own values win.
export async function roomBasics(auth, { photos = 3 } = {}) {
  return {
    homeTypeLabel: 'Flat', attachedBath: 'attached', furnishing: 'semi', flatNumber: 'A-101',
    noticePeriodDays: 30, lockInMonths: 0,
    details: { bathrooms: 2, floor: '3', totalFloors: 10 },
    photos: await uploadedListingPhotos(auth, photos),
  };
}

export const nextStep = (page) => page.getByRole('button', { name: /Next Step/i }).click();

const pill = (page, field, label) => page.locator(`[data-err="${field}"]`).getByRole('button', { name: label, exact: true });

export async function fillRoomDetails(page, {
  homeType, bhk = '2 BHK', bathrooms = '2', roomType = 'Single (1 person)', washroom = 'Attached (private)',
  floor = '3', totalFloors = '10', floorsInHouse = 'G+1',
} = {}) {
  if (homeType) await pill(page, 'homeTypeLabel', homeType).click();
  await pill(page, 'bhk', bhk).click();
  await pill(page, 'bathrooms', bathrooms).click();
  if (await page.locator('[data-err="floorsInHouse"]').count()) await pill(page, 'floorsInHouse', floorsInHouse).click();
  else await pickFloors(page, { floor, totalFloors });
  await pill(page, 'roomType', roomType).click();
  await pill(page, 'attachedBath', washroom).click();
}

export async function fillRoomLocation(page, { society, locality = 'Baner', flatNumber = 'A-101' }) {
  await pickLocality(page, locality);
  await fillSociety(page, society);
  await page.locator('[data-err="flatNumber"] input').fill(flatNumber);
}

export async function fillRoomPrice(page, {
  rent = '13500', deposit = '27000', availableFrom = istInDays(30), notice = '30', lockIn = '0',
  host = 'tenant', ownerMobile = '9876501234',
} = {}) {
  await page.locator('input[data-err="rentShare"]').fill(rent);
  await page.locator('input[data-err="deposit"]').fill(deposit);
  await pickDate(page, '[data-err="availableFrom"]', availableFrom);
  await page.getByRole('spinbutton', { name: 'Notice period (days)' }).fill(notice);
  await page.getByRole('spinbutton', { name: 'Minimum stay (months)' }).fill(lockIn);
  if (host === 'owner') {
    await page.getByRole('button', { name: 'Owner', exact: true }).click();
  } else {
    await page.getByLabel('The owner knows and agrees to sharing').check();
    await page.getByLabel("Owner's mobile").fill(ownerMobile);
  }
}

export async function uploadRoomPhotos(page, opts) {
  await expect(page.locator('[data-err="photos"]')).toBeVisible();
  await uploadPublishablePhotos(page, opts);
}
