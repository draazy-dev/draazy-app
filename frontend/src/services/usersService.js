import { createProvider } from './config.js';

const provider = createProvider('users');

export const listUsers = async (...args) => (await provider()).listUsers(...args);

export const getUserTimeline = async (...args) => (await provider()).getUserTimeline(...args);

export const setUserBadge = async (...args) => (await provider()).setUserBadge(...args);

export const setUserStatus = async (...args) => (await provider()).setUserStatus(...args);

export const setUserFlag = async (...args) => (await provider()).setUserFlag(...args);
