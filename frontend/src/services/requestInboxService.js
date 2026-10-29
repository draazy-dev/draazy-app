import { createProvider } from './config.js';

const provider = createProvider('requestInbox');

export const listRequests = async (box) => (await provider()).listRequests(box);

export const remindRequest = async (kind, id) => (await provider()).remindRequest(kind, id);

export const removeRequest = async (kind, id, box) => (await provider()).removeRequest(kind, id, box);
