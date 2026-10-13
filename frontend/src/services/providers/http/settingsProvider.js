import { get, put } from '../../http.js';
import { bootstrapSection } from './bootstrap.js';
import { GRIEVANCE_OFFICER_DEFAULT, PRICING_DEFAULTS } from '../../settingsService.js';
import { DEFAULT_MAX_PHOTOS, MAX_PHOTOS_CEILING } from '../../../lib/uploads/policy.js';

/** The `ETag` of the last document read or written, sent back as `If-Match` so a stale save answers 412. */
let settingsEtag = null;

let settingsRead = null;

/** The whole configuration document; concurrent callers share one read, which withStatus would otherwise bypass. */
export function getSettings() {
  settingsRead ??= get('/admin/settings', undefined, { withStatus: true })
    .then(({ data: doc, etag }) => {
      settingsEtag = etag;
      return doc && typeof doc === 'object' ? doc : {};
    })
    .finally(() => { settingsRead = null; });
  return settingsRead;
}

/** Only the console module switches (`adminFlags`) - the shell reads this, not the whole document. */
export async function getAdminFlags() {
  const flags = await get('/admin/settings/flags');
  return flags && typeof flags === 'object' ? flags : {};
}

/** Deep-merge `patch` into the stored document; resolves with the document **as saved**. */
export async function updateSettings(patch) {
  const { data: doc, etag } = await put('/admin/settings', patch, {
    withStatus: true,
    headers: settingsEtag ? { 'If-Match': settingsEtag } : undefined,
  });
  settingsEtag = etag;
  window.dispatchEvent(new CustomEvent('draazy-settings-change'));
  return doc && typeof doc === 'object' ? doc : {};
}

/** Not a stub and not a missing feature: migration V61 deleted `settings.customRoles`, and `PUT /admin/settings`
 * answers **422** for the key rather than storing it — sending it here would fail the write. */
export async function getCustomRoles() {
  return [];
}

/* App flags affect anonymous visitors, so they publish outside admin-only settings. */
export async function getAppFlags() {
  const flags = await bootstrapSection('flags');
  return flags && typeof flags === 'object' ? flags : {};
}

export async function getMovePack() {
  const cfg = await bootstrapSection('movePack');
  if (!cfg || typeof cfg !== 'object') return { enabled: false, items: {} };
  return {
    enabled: cfg.enabled === true,
    items: cfg.items && typeof cfg.items === 'object' ? cfg.items : {},
  };
}

export async function getGeo() {
  const geo = await bootstrapSection('geo');
  return geo && typeof geo === 'object' ? geo : {};
}

export async function getPricing() {
  const raw = await bootstrapSection('pricing');
  if (!raw || typeof raw !== 'object') return { ...PRICING_DEFAULTS };
  const out = { ...PRICING_DEFAULTS };
  for (const key of Object.keys(PRICING_DEFAULTS)) {
    if (Number.isFinite(raw[key])) out[key] = raw[key];
  }
  out.referral = { ...PRICING_DEFAULTS.referral };
  for (const key of Object.keys(PRICING_DEFAULTS.referral)) {
    if (Number.isFinite(raw.referral?.[key])) out.referral[key] = raw.referral[key];
  }
  out.refunds = { ...PRICING_DEFAULTS.refunds };
  for (const key of Object.keys(PRICING_DEFAULTS.refunds)) {
    if (Number.isFinite(raw.refunds?.[key])) out.refunds[key] = raw.refunds[key];
  }
  return out;
}

export async function getGrievanceOfficer() {
  const officer = (await bootstrapSection('legal'))?.grievanceOfficer;
  const text = (v) => (typeof v === 'string' ? v.trim() : '');
  return { name: text(officer?.name), email: text(officer?.email) || GRIEVANCE_OFFICER_DEFAULT.email };
}

/** The `listingPolicy` section of `GET /bootstrap` (`common/settings/ListingPolicyController.java`). */
export async function getListingPolicy() {
  const raw = await bootstrapSection('listingPolicy');
  const n = raw?.maxPhotos;
  return { maxPhotos: Number.isInteger(n) && n > 0 && n <= MAX_PHOTOS_CEILING ? n : DEFAULT_MAX_PHOTOS };
}
