/** Feeds the quota line and the pass prompts only, never the gate, so it fails open. */
import { getEntitlements } from '../../services/entitlementService.js';
import { listingSlots } from '../../services/propertyService.js';

/** `{ used, allowance, full, passes }`: `used` counts live listings no pass covers; an unknown `allowance` is `null`.
 * `passes` maps a property id to the ISO instant its pass expires. */
function standing(listings) {
  const allowance = Number.isFinite(listings?.allowance) ? listings.allowance : null;
  const used = Number(listings?.used) || 0;
  const passes = Object.fromEntries((listings?.passes || []).map((p) => [String(p.propertyId), p.expiresAt]));
  return { used, allowance, full: allowance != null && used >= allowance, passes };
}

/** For a screen the dashboard aggregate already primed `/me/entitlements` for. */
export const loadListingQuota = () => getEntitlements().then((e) => standing(e?.listings), () => standing(null));

/** The two numbers alone, for the wizard, which has no entitlements read to share. */
export const loadWizardQuota = () => listingSlots().then(standing, () => standing(null));
