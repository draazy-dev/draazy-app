import { createProvider } from './config.js';

const provider = createProvider('photoRequest');

export const requestPhotos = async (propertyIdOrSlug) => (await provider()).requestPhotos(propertyIdOrSlug);

export const myPhotoRequests = async (opts) => (await provider()).myPhotoRequests(opts);

export const decidePhotoRequest = async (reqId, decision) =>
  (await provider()).decidePhotoRequest(reqId, decision);
