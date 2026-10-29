import { createProvider } from './config.js';

const provider = createProvider('audit');

export async function listAuditLog(params) {
  return (await provider()).listAuditLog(params);
}
