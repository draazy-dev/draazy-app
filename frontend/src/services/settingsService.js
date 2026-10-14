/** Includes `geo`, which the server stores like other settings though the contract omits it. */
import { createProvider } from './config.js';

const provider = createProvider('settings');

export const getSettings = async () => (await provider()).getSettings();

export const getAdminFlags = async () => (await provider()).getAdminFlags();

export const updateSettings = async (patch) => (await provider()).updateSettings(patch);

/** The console's navigation gate is the atoms the server returns on `/auth/me`. */
export const getAppFlags = async () => (await provider()).getAppFlags();

/** Not part of `getAppFlags()`: the `flags` section is map-of-boolean, so it cannot carry a price list. */
export const getMovePack = async () => (await provider()).getMovePack();

/** The `geo` section of `GET /bootstrap`: the block gates what a *logged-out visitor* sees. */
export const getGeo = async () => (await provider()).getGeo();

/** What a healthy install charges, and the answer when the server cannot be reached. */
export const PRICING_DEFAULTS = Object.freeze({
  listingPass: 999,
  contactPack: 199,
  rentAgreementPlatform: 499,
  referral: Object.freeze({
    contactBonus: 15, seekerBonusContacts: 5, ownerFeaturedDays: 14, ownerRewardAgreements: 1,
    featuredDays: 7, qualifyPerMonth: 10, qualifyPerYear: 50, holdDays: 7, clawbackDays: 30, signupWindowHours: 24,
  }),
  refunds: Object.freeze({
    packRefundDays: 7, passGuaranteeDays: 7, passGuaranteeMaxEnquiries: 0, passGuaranteeEveryMonths: 12, contactReplyDays: 7,
  }),
});

/** The `pricing` section of `GET /bootstrap`. */
export const getPricing = async () => (await provider()).getPricing();

/** Named on the Refund Policy; `email` falls back to support until an admin sets an officer. */
export const GRIEVANCE_OFFICER_DEFAULT = Object.freeze({ name: '', email: 'support@draazy.com' });

/** The `legal` section of `GET /bootstrap`. */
export const getGrievanceOfficer = async () => (await provider()).getGrievanceOfficer();

export const getListingPolicy = async () => (await provider()).getListingPolicy();
