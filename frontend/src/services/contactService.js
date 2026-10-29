import { createProvider } from './config.js';

const provider = createProvider('contact');

export const contactStatus = async (propertyId) => (await provider()).contactStatus(propertyId);

export const requestContact = async (propertyId, message) => (await provider()).requestContact(propertyId, message);

export const myContactRequests = async (opts) => (await provider()).myContactRequests(opts);

export const respondToContactRequest = async (reqId, status) =>
  (await provider()).respondToContactRequest(reqId, status);
