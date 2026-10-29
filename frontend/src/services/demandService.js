import { createProvider } from './config.js';

const provider = createProvider('demand');

export const recordSignal = async (signal) => {
  try {
    return await (await provider()).recordSignal(signal);
  } catch {
    return false;
  }
};

export const supplyGap = async (opts) => (await provider()).supplyGap(opts);
