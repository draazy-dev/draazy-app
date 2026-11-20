import { createProvider } from './config.js';

const provider = createProvider('verification');

export const getAadhaarStatus = async () => (await provider()).getAadhaarStatus();

export const getIdentityChallenge = async () => (await provider()).getIdentityChallenge();

export const submitIdentityVerification = async (details) => (await provider()).submitIdentityVerification(details);

export const disputeIdentityVerification = async (details) => (await provider()).disputeIdentityVerification(details);

export const appealIdentityVerification = async (details) => (await provider()).appealIdentityVerification(details);

export const withdrawIdentityVerification = async () => (await provider()).withdrawIdentityVerification();

