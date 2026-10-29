import { createProvider } from './config.js';

const provider = createProvider('visit');

export const listVisits = async (opts) => (await provider()).listVisits(opts);

export const myVisitRequests = async () => (await provider()).myVisitRequests();

export const scheduleVisit = async (req) => (await provider()).scheduleVisit(req);

export const updateVisitStatus = async (id, status) => (await provider()).updateVisitStatus(id, status);

export const rescheduleVisit = async (id, when) => (await provider()).rescheduleVisit(id, when);
