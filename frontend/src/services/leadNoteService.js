// Private to the caller: nobody else, not even staff, sees a lead note.
// Keys are minted client-side (`requestMeta.leadKey`).
import { createProvider } from './config.js';

const provider = createProvider('leadNote');

// Unpaged: the requests panel indexes the whole set by `leadKey`; the server caps it on write.
export const myLeadNotes = async () => (await provider()).myLeadNotes();

// Takes the whole annotation, not a patch, so callers merge first; resolves to null when an empty one deletes the row.
export const saveLeadNote = async (leadKey, annotation) => (await provider()).saveLeadNote(leadKey, annotation);
