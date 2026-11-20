import { createProvider } from './config.js';

const provider = createProvider('lead');

export const listLeads = async (params) => (await provider()).listLeads(params);

export const getLead = async (id) => (await provider()).getLead(id);

export const addLead = async (body) => (await provider()).addLead(body);

export const claimLead = async (id) => (await provider()).claimLead(id);

export const releaseLead = async (id) => (await provider()).releaseLead(id);

export const assignLead = async (id, staffId) => (await provider()).assignLead(id, staffId);

export const listLeadAssignees = async () => (await provider()).listLeadAssignees();

export const logLeadContact = async (id, body) => (await provider()).logLeadContact(id, body);

export const changeLeadStage = async (id, body) => (await provider()).changeLeadStage(id, body);

export const setLeadInterests = async (id, interests) => (await provider()).setLeadInterests(id, interests);

export const setLeadProfile = async (id, profile) => (await provider()).setLeadProfile(id, profile);

export const addLeadNote = async (id, text) => (await provider()).addLeadNote(id, text);

export const listConvertible = async (id) => (await provider()).listConvertible(id);

export const convertLead = async (id, serviceRequestId) => (await provider()).convertLead(id, serviceRequestId);

export const creditConversion = async (conversionId, creditedTo) => (await provider()).creditConversion(conversionId, creditedTo);

export const getLeadPerformance = async (days) => (await provider()).getLeadPerformance(days);
