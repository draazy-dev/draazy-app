import { createProvider } from './config.js';

const provider = createProvider('fees');

export const listFees = async () => (await provider()).listFees();

export const getDealFees = async (deal) => {
  const rows = await listFees();
  return (Array.isArray(rows) ? rows : []).find((f) => f.deal === deal) || null;
};
