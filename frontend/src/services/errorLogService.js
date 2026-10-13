/** Admin error log: crashes from the API, jobs and browsers (`audit:read`, administrators only). */
import { createProvider } from './config.js';

const provider = createProvider('errorLog');

export async function listErrorLog(params) {
  return (await provider()).listErrorLog(params);
}

export async function getErrorLogEntry(id) {
  return (await provider()).getErrorLogEntry(id);
}

export async function resolveErrorLogEntry(id) {
  return (await provider()).resolveErrorLogEntry(id);
}
