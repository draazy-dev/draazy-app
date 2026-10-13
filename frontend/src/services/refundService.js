/** Eligibility, status and the decision are server-owned; the client only asks and mirrors. */
import { createProvider } from './config.js';

const provider = createProvider('refund');

/** The caller's payments, newest first, each with its refund eligibility. */
export const listMyPayments = async () => (await provider()).listMyPayments();

/** Resolves with the updated payment (`refund_pending`). A 422 `refund_not_eligible` carries a `reason` code. */
export const requestRefund = async (id, opts) => (await provider()).requestRefund(id, opts);

export const listRefunds = async (params) => (await provider()).listRefunds(params);

export const approveRefund = async (id) => (await provider()).approveRefund(id);

/** A reason is required; the server answers 422 without one. */
export const rejectRefund = async (id, reason) => (await provider()).rejectRefund(id, reason);
