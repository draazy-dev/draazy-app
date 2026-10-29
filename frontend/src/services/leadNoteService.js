import { createProvider } from './config.js';

const provider = createProvider('leadNote');

export const myLeadNotes = async () => (await provider()).myLeadNotes();

export const saveLeadNote = async (leadKey, annotation) => (await provider()).saveLeadNote(leadKey, annotation);
