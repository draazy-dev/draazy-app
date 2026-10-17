// Seeded pins ~230 m apart overlap at fit zoom, so a pointer click lands on whichever Google stacks
// on top; focus + Enter is not hit-tested and opens the marker that carries the label.
export async function pickMarker(page, label) {
  const marker = page.locator('gmp-advanced-marker', { has: page.locator('.price-marker', { hasText: label }) }).first();
  await marker.waitFor({ timeout: 20000 });
  await marker.focus();
  await marker.press('Enter');
}
