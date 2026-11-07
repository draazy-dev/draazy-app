import { createProvider } from './config.js';

const provider = createProvider('settings');

export const getSettings = async () => (await provider()).getSettings();

export const getAdminFlags = async () => (await provider()).getAdminFlags();

export const updateSettings = async (patch) => (await provider()).updateSettings(patch);

export const getAppFlags = async () => (await provider()).getAppFlags();

export const getMovePack = async () => (await provider()).getMovePack();

export const getGeo = async () => (await provider()).getGeo();

export const PRICING_DEFAULTS = Object.freeze({
  listingPass: 999,
  listingPassBuy: 1999,
  contactPack: 199,
  contactPackBuy: 399,
  rentAgreementPlatform: 499,
  referral: Object.freeze({
    seekerBonusContacts: 5, ownerFeaturedDays: 14, agreementDiscountPercent: 50,
    featuredDays: 7, qualifyPerMonth: 10, qualifyPerYear: 50, holdDays: 7, clawbackDays: 30, signupWindowHours: 24,
  }),
  refunds: Object.freeze({
    packRefundDays: 7, passGuaranteeDays: 7, passGuaranteeMaxEnquiries: 0, passGuaranteeEveryMonths: 12, contactReplyDays: 7,
  }),
});

export const getPricing = async () => (await provider()).getPricing();

export const GRIEVANCE_OFFICER_DEFAULT = Object.freeze({ name: '', email: 'support@draazy.com' });

export const getGrievanceOfficer = async () => (await provider()).getGrievanceOfficer();

export const getListingPolicy = async () => (await provider()).getListingPolicy();
