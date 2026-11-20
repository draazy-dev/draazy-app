import { createProvider } from './config.js';

const provider = createProvider('note');

export const listNotes = async (entityType, entityId) =>
  (await provider()).listNotes(entityType, entityId);

export const addNote = async (entityType, entityId, text, action) =>
  (await provider()).addNote(entityType, entityId, text, action);
