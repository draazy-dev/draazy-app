import { createProvider } from './config.js';

const provider = createProvider('team');

export const listTeamMembers = async (...args) => (await provider()).listTeamMembers(...args);

export const listAssignees = async () => (await provider()).listAssignees();

export const saveTeamMember = async (...args) => (await provider()).saveTeamMember(...args);

export const setTeamMemberStatus = async (...args) => (await provider()).setTeamMemberStatus(...args);

export const resetTeamMemberTwoFactor = async (...args) => (await provider()).resetTeamMemberTwoFactor(...args);

export const reissueTeamMemberInvite = async (...args) => (await provider()).reissueTeamMemberInvite(...args);
