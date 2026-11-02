import { createProvider } from './config.js';

const provider = createProvider('content');

export const listFaqs = async () => (await provider()).listFaqs();

export const submitHelpFeedback = async (verdict) => (await provider()).submitHelpFeedback(verdict);

export const listHelpFeedbackArticles = async (opts) => (await provider()).listHelpFeedbackArticles(opts);

export const listHelpFeedbackComments = async (opts) => (await provider()).listHelpFeedbackComments(opts);

export const staffHelpContent = async () => (await provider()).staffHelpContent();

export const staffHelpIndex = async () => (await provider()).staffHelpIndex();
