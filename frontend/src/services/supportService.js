import { createProvider } from './config.js';

const provider = createProvider('support');

export const listTickets = async () => (await provider()).listTickets();

export const createTicket = async (ticket) => (await provider()).createTicket(ticket);

export const replyToTicket = async (id, text) => (await provider()).replyToTicket(id, text);

export const markTicketRead = async (id) => (await provider()).markTicketRead(id);

export const getSupportChat = async () => (await provider()).getSupportChat();

export const sendSupportChatMessage = async (text, about) => (await provider()).sendSupportChatMessage(text, about);

export const markSupportChatRead = async () => (await provider()).markSupportChatRead();

// Staff-only from here down.
export const listSupportChats = async (opts) => (await provider()).listSupportChats(opts);

export const supportChatCounts = async () => (await provider()).supportChatCounts();

export const getStaffSupportChat = async (userId) => (await provider()).getStaffSupportChat(userId);

export const replyToSupportChat = async (userId, text, about) => (await provider()).replyToSupportChat(userId, text, about);

export const assignSupportChat = async (userId, assigneeId) => (await provider()).assignSupportChat(userId, assigneeId);

export const resolveSupportChat = async (userId) => (await provider()).resolveSupportChat(userId);

export const markStaffSupportChatRead = async (userId) => (await provider()).markStaffSupportChatRead(userId);

export const locateSupportChat = async (about) => (await provider()).locateSupportChat(about);

export const createServiceTicketFromChat = async (userId, data) => (await provider()).createServiceTicketFromChat(userId, data);

export const openSupportChatStream = async (opts) => (await provider()).openSupportChatStream(opts);
