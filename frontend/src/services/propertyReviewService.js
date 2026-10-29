import { createProvider } from './config.js';
import { isInternal, readUser } from '../lib/auth.js';

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

export async function addPropertyReviewMessage(propertyId, body, clarificationRequested) {
  return (await provider()).addPropertyReviewMessage(propertyId, body, clarificationRequested);
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

export function unreadFrom(caseFile) {
  const theirs = isInternal(readUser()) ? 'owner' : 'ops';
  const messages = Array.isArray(caseFile?.messages) ? caseFile.messages : [];
  return messages.filter((m) => m.from === theirs && !m.read).length;
}
