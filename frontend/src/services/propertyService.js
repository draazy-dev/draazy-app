import { createProvider } from './config.js';

const provider = createProvider('property');

export const listProperties = async (filters, sort) => (await provider()).listProperties(filters, sort);
export const getProperty = async (id, opts) => (await provider()).getProperty(id, opts);
export const featuredProperties = async (limit) => (await provider()).featuredProperties(limit);

export const trustStats = async () => (await provider()).trustStats();

export const propertyCounts = async () => (await provider()).propertyCounts();

export const ownerProfile = async (id) => (await provider()).ownerProfile(id);

export const ownerListings = async (id) => (await provider()).ownerListings(id);


export const getPropertiesByIds = async (ids) => (await provider()).getPropertiesByIds(ids);

export const listPropertiesByIds = async (ids) => (await provider()).listPropertiesByIds(ids);

export const compareProperties = async (ids) => (await provider()).compareProperties(ids);

export const searchIndex = async () => (await provider()).searchIndex();

export const propertyReels = async (query) => (await provider()).propertyReels(query);

export const similarProperties = async (query) => (await provider()).similarProperties(query);

export const searchListings = async (query, paging) => (await provider()).searchListings(query, paging);


export const searchForModeration = async (filters, sort, paging) =>
  (await provider()).searchForModeration(filters, sort, paging);
export const lookupForModeration = async (q, paging) => (await provider()).lookupForModeration(q, paging);

export const getModerationProperty = async (id) => (await provider()).getModerationProperty(id);

export const moderationSummary = async () => (await provider()).moderationSummary();

export const myListings = async (user, opts) => (await provider()).myListings(user, opts);

export const myListing = async (id, user) => (await provider()).myListing(id, user);
export const prefetchMyListing = async (id) => (await provider()).prefetchMyListing(id);
export const myListingCard = async (id) => (await provider()).myListingCard(id);

export const addListing = async (listing, opts) => (await provider()).addListing(listing, opts);

export const listingSlots = async () => (await provider()).listingSlots();

export const checkOwnDuplicate = async (fields) => (await provider()).checkOwnDuplicate(fields);

export const createListingOnBehalf = async (ownerMobile, ownerName, listing) =>
  (await provider()).createListingOnBehalf(ownerMobile, ownerName, listing);

export const ownerListingStanding = async (mobile) =>
  (await provider()).ownerListingStanding(mobile);

export const listDuplicateClusters = async () =>
  (await provider()).listDuplicateClusters();

export const mergeDuplicateCluster = async (keepId, dropIds) =>
  (await provider()).mergeDuplicateCluster(keepId, dropIds);

export const dismissDuplicateCluster = async (ids) =>
  (await provider()).dismissDuplicateCluster(ids);

export const setListingStatus = async (id, status, reason) => (await provider()).setListingStatus(id, status, reason);

export const flagListing = async (id, reason) => (await provider()).flagListing(id, reason);

export const clearFlag = async (id) => (await provider()).clearFlag(id);

export const updateListingFields = async (id, patch) => (await provider()).updateListingFields(id, patch);

export const takeListingDown = async (id, user) => (await provider()).takeListingDown(id, user);

export const pauseListing = async (id) => (await provider()).pauseListing(id);
export const resumeListing = async (id) => (await provider()).resumeListing(id);

export const updateListingAsModerator = async (id, patch) => (await provider()).updateListingAsModerator(id, patch);

export const removeListingPhoto = async (id, photo, reason) => (await provider()).removeListingPhoto(id, photo, reason);

export const archiveListing = async (id, reason) => (await provider()).archiveListing(id, reason);
export const restoreListing = async (id) => (await provider()).restoreListing(id);

export const confirmListingFresh = async (id) => (await provider()).confirmListingFresh(id);

export const recordClaimLinkOpened = async (id) => (await provider()).recordClaimLinkOpened(id);

export const confirmOwnerListing = async (id) => (await provider()).confirmOwnerListing(id);
