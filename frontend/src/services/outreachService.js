import { createProvider } from './config.js';

const provider = createProvider('outreach');

export async function listOutreachTemplates(channel = 'whatsapp') {
  return (await provider()).listOutreachTemplates(channel);
}

export async function chaseOwner(propertyId, templateId) {
  return (await provider()).chaseOwner(propertyId, templateId);
}

export async function listOwnerOutreach(propertyId) {
  return (await provider()).listOwnerOutreach(propertyId);
}

export async function markOutreachSent(propertyId, messageId) {
  return (await provider()).markOutreachSent(propertyId, messageId);
}
