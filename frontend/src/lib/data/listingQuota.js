import { getEntitlements } from '../../services/entitlementService.js';
import { REVISIT_MAX_AGE } from '../../services/http.js';
import { listingSlots } from '../../services/propertyService.js';

function standing(listings) {
  const allowance = Number.isFinite(listings?.allowance) ? listings.allowance : null;
  const used = Number(listings?.used) || 0;
  const passes = Object.fromEntries((listings?.passes || []).map((p) => [String(p.propertyId), p.expiresAt]));
  return { used, allowance, full: allowance != null && used >= allowance, passes };
}

export const loadListingQuota = () => getEntitlements({ maxAge: REVISIT_MAX_AGE }).then((e) => standing(e?.listings), () => standing(null));

export const loadWizardQuota = () => listingSlots().then(standing, () => standing(null));
