/** Measured data only: rates are null when nothing was measured (render "—"), counts are real zeros,
 *  and an outage rejects rather than resolving empty. */
import { createProvider } from './config.js';

const provider = createProvider('analytics');

/** Every derived figure is null below the server's sample floor; render it as "no data". */
export const localityPricing = async () => (await provider()).localityPricing();
/** A section the caller lacks permission for is absent, never zero. */
export const adminDashboard = async () => (await provider()).adminDashboard();

export const adminBell = async () => (await provider()).adminBell();
/** `pendingCount` and `pendingBreachingCount` ignore `days`: a backlog is a present-tense fact. */
export const reviewSla = async (opts) => (await provider()).reviewSla(opts);

/** `series` is zero-filled so charts do not interpolate across no-data days. */
export const traffic = async (opts) => (await provider()).traffic(opts);

export const engagement = async (opts) => (await provider()).engagement(opts);

/** Each stage counts events in the week they happened, not one cohort followed through. */
export const funnel = async (opts) => (await provider()).funnel(opts);

/** Host replies are judged at 48h; locality supply vs demand is live now, not windowed. */
export const flatmates = async (opts) => (await provider()).flatmates(opts);

/** `dropOff[].sharePct` is a share of the exits shown, since the list is capped. */
export const surfers = async (opts) => (await provider()).surfers(opts);