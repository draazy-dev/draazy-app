import { createProvider } from './config.js';

const provider = createProvider('adminContent');

const SERVER_OWNED = ['id', 'type', 'archived', 'createdAt'];

const writable = (body) => {
  const out = { ...(body || {}) };
  SERVER_OWNED.forEach((k) => { delete out[k]; });
  return out;
};

export const listContent = async (type, opts) => (await provider()).listContent(type, opts);

export const createContent = async (type, body) => (await provider()).createContent(type, writable(body));

export const updateContent = async (type, id, body) => (await provider()).updateContent(type, id, writable(body));

export const archiveContent = async (type, id) => (await provider()).archiveContent(type, id);

export const restoreContent = async (type, id) => (await provider()).restoreContent(type, id);
