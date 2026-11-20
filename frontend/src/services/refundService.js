import { createProvider } from './config.js';

const provider = createProvider('refund');

export const listMyPayments = async () => (await provider()).listMyPayments();

export const requestRefund = async (id, opts) => (await provider()).requestRefund(id, opts);

export const listRefunds = async (params) => (await provider()).listRefunds(params);

export const approveRefund = async (id) => (await provider()).approveRefund(id);

export const rejectRefund = async (id, reason) => (await provider()).rejectRefund(id, reason);
