import { createProvider } from './config.js';

const provider = createProvider('saved');

export const listSaved = async (opts) => (await provider()).listSaved(opts);

export const listSavedKeys = async () => (await provider()).listSavedKeys();

export const saveProperty = async (propertyId) => (await provider()).saveProperty(propertyId);

export const unsaveProperty = async (propertyId) => (await provider()).unsaveProperty(propertyId);
