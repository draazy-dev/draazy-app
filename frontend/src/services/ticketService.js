import { createProvider } from './config.js';

const provider = createProvider('ticket');

export const listTicketQueue = async (opts) => (await provider()).listTicketQueue(opts);

export const getTicketSummary = async (team) => (await provider()).getTicketSummary(team);

export const getTicket = async (id) => (await provider()).getTicket(id);

export const claimTicket = async (id, userId) => (await provider()).claimTicket(id, userId);

export const setTicketStatus = async (id, status) => (await provider()).setTicketStatus(id, status);

export const addTicketNote = async (id, text) => (await provider()).addTicketNote(id, text);

export const createTicket = async (data) => (await provider()).createTicket(data);

export const joinServiceWaitlist = async (data) => (await provider()).joinServiceWaitlist(data);
