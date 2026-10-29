import { createProvider } from './config.js';

const provider = createProvider('conversation');

export const listConversations = async () => (await provider()).listConversations();

export const getConversation = async (id) => (await provider()).getConversation(id);

export const startConversation = async (input) => (await provider()).startConversation(input);

export const replyToConversation = async (id, body) => (await provider()).replyToConversation(id, body);
export const sendConversationPhoto = async (id, body) => (await provider()).sendConversationPhoto(id, body);
export const updateConversationState = async (id, state) => (await provider()).updateConversationState(id, state);
export const deleteMessageForMe = async (id, messageId) => (await provider()).deleteMessageForMe(id, messageId);
export const setConversationBlocked = async (id, blocked) => (await provider()).setConversationBlocked(id, blocked);
export const sendTyping = async (id) => (await provider()).sendTyping(id);
export const openMessageStream = async (opts) => (await provider()).openMessageStream(opts);

export const openGroupConversation = async (groupId) => (await provider()).openGroupConversation(groupId);

export const openFlatmateRequestConversation = async (requestId) => (await provider()).openFlatmateRequestConversation(requestId);

export const openLeadRequestConversation = async (kind, requestId) => (await provider()).openLeadRequestConversation(kind, requestId);

export const markConversationRead = async (id) => (await provider()).markConversationRead(id);

export const unreadCount = async () => (await provider()).unreadCount();

export const queuePendingChat = async (property, options) => (await provider()).queuePendingChat(property, options);

export const dropPendingChat = async (...keys) => (await provider()).dropPendingChat(...keys);

export const drainPendingChats = async () => (await provider()).drainPendingChats();
export const clearConversationDeviceState = async () => (await provider()).clearConversationDeviceState?.();
