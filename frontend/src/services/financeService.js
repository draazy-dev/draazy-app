import { createProvider } from './config.js';

const provider = createProvider('finance');

export const getFinanceOverview = async () => (await provider()).getFinanceOverview();

export const getFinanceSeries = async (months) => (await provider()).getFinanceSeries(months);

export const listFinanceTransactions = async (opts) =>
  (await provider()).listFinanceTransactions(opts);