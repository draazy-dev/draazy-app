import { createProvider } from './config.js';

const provider = createProvider('propertyReview');

export async function getOwnershipVerification(propertyId) {
  return (await provider()).getOwnershipVerification(propertyId);
}

export async function listOwnershipDocuments(propertyId) {
  return (await provider()).listOwnershipDocuments(propertyId);
}

export async function getOwnershipDocumentUrl(propertyId, docId) {
  return (await provider()).getOwnershipDocumentUrl(propertyId, docId);
}

export async function recordOwnershipEvidence(propertyId, evidence) {
  return (await provider()).recordOwnershipEvidence(propertyId, evidence);
}

export async function verifyOwnership(propertyId) {
  return (await provider()).verifyOwnership(propertyId);
}

export async function revokeOwnershipVerification(propertyId, reason) {
  return (await provider()).revokeOwnershipVerification(propertyId, reason);
}

export async function requestOwnershipVerification(propertyId) {
  return (await provider()).requestOwnershipVerification(propertyId);
}

export async function declineOwnershipVerification(propertyId, reason) {
  return (await provider()).declineOwnershipVerification(propertyId, reason);
}

export async function getPropertyReview(propertyId) {
  return (await provider()).getPropertyReview(propertyId);
}

export async function startPropertyReview(propertyId, options) {
  return (await provider()).startPropertyReview(propertyId, options);
}

export async function beginPropertyReview(propertyId) {
  return (await provider()).beginPropertyReview(propertyId);
}

export async function markPropertyReviewRead(propertyId) {
  return (await provider()).markPropertyReviewRead(propertyId);
}

export async function setPropertyReviewChecklistItem(propertyId, item, pass) {
  return (await provider()).setPropertyReviewChecklistItem(propertyId, item, pass);
}

export async function recordPropertyReraCheck(propertyId, result) {
  return (await provider()).recordPropertyReraCheck(propertyId, result);
}

export async function decidePropertyReview(propertyId, decision, options) {
  return (await provider()).decidePropertyReview(propertyId, decision, options);
}

export async function listMyPropertyReviews(params) {
  return (await provider()).listMyPropertyReviews(params);
}
