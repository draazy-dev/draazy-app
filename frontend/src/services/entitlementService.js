import { createProvider } from './config.js';

const provider = createProvider('entitlement');

export async function getEntitlements() {
  return (await provider()).getEntitlements();
}
