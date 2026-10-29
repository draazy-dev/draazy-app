import { createProvider } from './config.js';

const provider = createProvider('deal');

export const getDeal = async (propId) => (await provider()).getDeal(propId);

export const dealStatusForBuyer = async (property) => (await provider()).dealStatusForBuyer(property);

export const reserveDeal = async (propId) => (await provider()).reserveDeal(propId);

export const closeDeal = async (propId, body) => (await provider()).closeDeal(propId, body);

export const reopenDeal = async (propId, availableOn) => (await provider()).reopenDeal(propId, availableOn);

export const listParties = async (propId) => (await provider()).listParties(propId);

export const submitOffer = async (req) => (await provider()).submitOffer(req);

export const respondOffer = async (id, action, counterAmount, opts) =>
  (await provider()).respondOffer(id, action, counterAmount, opts);

export const myOffers = async () => (await provider()).myOffers();
export const offersOnMine = async () => (await provider()).offersOnMine();

export const requestFinalization = async (propId, body) => (await provider()).requestFinalization(propId, body);

export const finalizationStatus = async (propId) => (await provider()).finalizationStatus(propId);

export const cancelFinalization = async (propId) => (await provider()).cancelFinalization(propId);

export const myFinalizationRequests = async () => (await provider()).myFinalizationRequests();

export const acceptFinalization = async (reqId) => (await provider()).acceptFinalization(reqId);
export const declineFinalization = async (reqId) => (await provider()).declineFinalization(reqId);
