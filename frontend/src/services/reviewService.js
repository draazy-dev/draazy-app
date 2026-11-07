import { createProvider } from './config.js';
import { userMessage } from '../lib/userMessage.js';

const provider = createProvider('review');

export const listPropertyReviews = async (propertyId, opts) =>
  (await provider()).listPropertyReviews(propertyId, opts);

export const getPropertyReviewSummary = async (propertyId) =>
  (await provider()).getPropertyReviewSummary(propertyId);

export const createPropertyReview = async (propertyId, review) =>
  (await provider()).createPropertyReview(propertyId, review);

export const listEntityReviews = async (entityType, entityId, opts) =>
  (await provider()).listEntityReviews(entityType, entityId, opts);

export const getEntityReviewSummary = async (entityType, entityId, opts) =>
  (await provider()).getEntityReviewSummary(entityType, entityId, opts);

export const createEntityReview = async (entityType, entityId, review) =>
  (await provider()).createEntityReview(entityType, entityId, review);

export const updateReview = async (id, review) => (await provider()).updateReview(id, review);

export const deleteReview = async (id) => (await provider()).deleteReview(id);

export const reviewRefusal = (err, t) => {
  if (err?.code === 'already_reviewed') return t('common.alreadyReviewed');
  if (err?.code === 'review_not_eligible') return userMessage(err, '') || null;
  return null;
};

/** A separate route: a public one that could return rejected rows is one missed auth check from leaking them. */
export const listReviewsForModeration = async (opts) =>
  (await provider()).listReviewsForModeration(opts);

export const setReviewStatus = async (id, status, reason) =>
  (await provider()).setReviewStatus(id, status, reason);
