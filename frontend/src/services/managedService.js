import { createProvider } from './config.js';

const provider = createProvider('managed');

export const listManaged = async () => (await provider()).listManaged();

export const getManaged = async (id) => (await provider()).getManaged(id);

export const registerManaged = async (data) => (await provider()).registerManaged(data);

export const updateManaged = async (id, changes) => (await provider()).updateManaged(id, changes);

export const deleteManaged = async (id) => (await provider()).deleteManaged(id);

export const stopRentTracking = async (id) => (await provider()).stopRentTracking(id);

export const publishManaged = async (id, known) => (await provider()).publishManaged(id, known);

export const ensureManagedForListing = async (listing) =>
  (await provider()).ensureManagedForListing(listing);

export const listRentReceipts = async (propertyId, months = 6) =>
  (await provider()).listRentReceipts(propertyId, months);

export const recordRentReceipt = async (propertyId, rentMonth) =>
  (await provider()).recordRentReceipt(propertyId, rentMonth);

export const listTrackedRent = async () => (await provider()).listTrackedRent();
