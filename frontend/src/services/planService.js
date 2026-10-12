/** The plan catalogue and checkout. A purchase is granted by the payment webhook, never by `subscribe` resolving. */
import { createProvider } from './config.js';

const provider = createProvider('plan');

/** Public: the pricing page must render for the signed-out visitors it exists to convert. */
export const listPlans = async () => (await provider()).listPlans();

/** `attemptId` makes one checkout attempt idempotent; `propertyId` binds a listing pass to its listing. */
export const subscribe = async (slug, paymentMethod, opts) => (await provider()).subscribe(slug, paymentMethod, opts);