import { createProvider } from './config.js';

const provider = createProvider('analytics');

export const localityPricing = async () => (await provider()).localityPricing();
export const adminDashboard = async () => (await provider()).adminDashboard();

export const adminBell = async () => (await provider()).adminBell();
export const reviewSla = async (opts) => (await provider()).reviewSla(opts);

export const traffic = async (opts) => (await provider()).traffic(opts);

export const engagement = async (opts) => (await provider()).engagement(opts);

export const funnel = async (opts) => (await provider()).funnel(opts);

export const flatmates = async (opts) => (await provider()).flatmates(opts);

export const surfers = async (opts) => (await provider()).surfers(opts);