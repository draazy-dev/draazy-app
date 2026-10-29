import { createProvider } from './config.js';

const provider = createProvider('staffActivity');

export async function listStaffActivity(params) {
  return (await provider()).listStaffActivity(params);
}

export async function getStaffActivitySummary(params) {
  return (await provider()).getStaffActivitySummary(params);
}

export async function getTeamPerformance(days) {
  return (await provider()).getTeamPerformance(days);
}

export async function getMyWork(days) {
  return (await provider()).getMyWork(days);
}
