import { createProvider } from './config.js';

const provider = createProvider('auth');

export const sendOtp = async (data) => (await provider()).sendOtp(data);

export const login = async (data) => (await provider()).login(data);

export const register = async (data) => (await provider()).register(data);

export const staffLogin = async (data) => (await provider()).staffLogin(data);
export const staffVerify = async (data) => (await provider()).staffVerify(data);
export const staffEnrol = async (data) => (await provider()).staffEnrol(data);
export const staffConfirm = async (data) => (await provider()).staffConfirm(data);
export const redeemStaffInvite = async (data) => (await provider()).redeemStaffInvite(data);
export const logout = async () => (await provider()).logout();
export const getMe = async () => (await provider()).getMe();
export const updateMe = async (patch) => (await provider()).updateMe(patch);
export const exportMyData = async () => (await provider()).exportMyData();

export const requestErasure = async (data) => (await provider()).requestErasure(data);

export const myErasureRequests = async () => (await provider()).myErasureRequests();
