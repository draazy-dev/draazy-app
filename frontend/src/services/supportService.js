import { createProvider } from './config.js';

const provider = createProvider('support');

export const listTickets = async () => (await provider()).listTickets();

export const getTicket = async (id) => (await provider()).getTicket(id);

// Not `listTickets` with a wider scope, which would be a PII export. Staff-only: never call from a consumer surface.
export const listSupportQueue = async (opts) => (await provider()).listSupportQueue(opts);

export const createTicket = async (ticket) => (await provider()).createTicket(ticket);

export const replyToTicket = async (id, text) => (await provider()).replyToTicket(id, text);

export const markTicketRead = async (id) => (await provider()).markTicketRead(id);

export const closeTicket = async (id) => (await provider()).closeTicket(id);
