import { createProvider } from './config.js';

const provider = createProvider('plan');

export const listPlans = async () => (await provider()).listPlans();

export const subscribe = async (slug, paymentMethod, opts) => (await provider()).subscribe(slug, paymentMethod, opts);
export const cancelPending = async () => (await provider()).cancelPending();
export const orderStatus = async (orderId) => (await provider()).orderStatus(orderId);