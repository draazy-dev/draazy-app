import { createProvider } from './config.js';

const provider = createProvider('report');

export const createReport = async (report) => (await provider()).createReport(report);

export const listReports = async (opts) => (await provider()).listReports(opts);

export const triageReport = async (id, decision) => (await provider()).triageReport(id, decision);
