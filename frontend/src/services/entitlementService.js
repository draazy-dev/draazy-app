import { createProvider } from './config.js';

const provider = createProvider('entitlement');

export async function getEntitlements(opts) {
  return (await provider()).getEntitlements(opts);
}
