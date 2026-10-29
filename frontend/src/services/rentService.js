import { createProvider } from './config.js';

const provider = createProvider('rent');

export const myTenancies = async () => (await provider()).myTenancies();

export const confirmTenancy = async (id) => (await provider()).confirmTenancy(id);
export const declineTenancy = async (id) => (await provider()).declineTenancy(id);

export const listTenancyDeclarations = async (propId) => (await provider()).listTenancyDeclarations(propId);
export const declareTenancy = async (propId, body) => (await provider()).declareTenancy(propId, body);
export const confirmTenancyDeclaration = async (id) => (await provider()).confirmTenancyDeclaration(id);
export const revokeTenancyDeclaration = async (id) => (await provider()).revokeTenancyDeclaration(id);

export const myTenantProfile = async () => (await provider()).myTenantProfile();
export const saveTenantProfile = async (profile) => (await provider()).saveTenantProfile(profile);

export const tenantsVerified = async (mobiles) => (await provider()).tenantsVerified(mobiles);

export const myRentals = async () => (await provider()).myRentals();
export const addRental = async (rental) => (await provider()).addRental(rental);
export const updateRental = async (rentalId, patch) => (await provider()).updateRental(rentalId, patch);
export const deleteRental = async (rentalId) => (await provider()).deleteRental(rentalId);

export const listTransactions = async (propId, page, size) => (await provider()).listTransactions(propId, page, size);
export const addTransaction = async (propId, txn) => (await provider()).addTransaction(propId, txn);
export const updateTransaction = async (propId, txnId, patch) => (await provider()).updateTransaction(propId, txnId, patch);
export const deleteTransaction = async (propId, txnId) => (await provider()).deleteTransaction(propId, txnId);

export const getBasis = async (propId) => (await provider()).getBasis(propId);
export const setBasis = async (propId, basis) => (await provider()).setBasis(propId, basis);

export const financeSummary = async (propId, period) => (await provider()).financeSummary(propId, period);
export const cashflow = async (propId) => (await provider()).cashflow(propId);
export const dues = async (propId) => (await provider()).dues(propId);

export const myRentAgreements = async () => (await provider()).myRentAgreements();
export const rentAgreementRenewal = async (id) => (await provider()).rentAgreementRenewal(id);
