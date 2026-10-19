/** The plan catalogue and checkout. A purchase is granted by the payment webhook, never by `subscribe` resolving. */
import { createProvider } from './config.js';

const provider = createProvider('plan');

/** Public: the pricing page must render for the signed-out visitors it exists to convert. */
export const listPlans = async () => (await provider()).listPlans();

export const subscribe = async (slug, paymentMethod, opts) => (await provider()).subscribe(slug, paymentMethod, opts);
export const cancelPending = async () => (await provider()).cancelPending();
export const orderStatus = async (orderId) => (await provider()).orderStatus(orderId);