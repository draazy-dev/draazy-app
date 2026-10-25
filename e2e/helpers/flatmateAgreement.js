import { expect } from '@playwright/test';
import { API, fileIdentityCaseAs, uniqueMobile } from './liveAuth.js';

const AGREEMENT_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const AGREEMENT_PNG = Buffer.from(AGREEMENT_PNG_BASE64, 'base64');

const authorizationOf = (auth) => {
  const raw = typeof auth === 'string' ? auth : auth?.authorization ?? auth?.Authorization ?? '';
  return /^Bearer\s/i.test(raw) ? raw : `Bearer ${raw}`;
};

export async function uploadAgreementDocument(auth, { api = API } = {}) {
  const form = new FormData();
  form.set('category', 'Rent agreement');
  form.set('file', new Blob([AGREEMENT_PNG], { type: 'image/png' }), 'agreement.png');
  const res = await fetch(`${api}/me/documents/personal`, {
    method: 'POST',
    headers: { authorization: authorizationOf(auth) },
    body: form,
  });
  const text = await res.text();
  expect(res.status, text).toBe(201);
  return JSON.parse(text);
}

export async function tenantRoomAgreement(auth, opts = {}) {
  await fileIdentityCaseAs(authorizationOf(auth), { api: opts.api ?? API, allowExisting: true });
  const doc = opts.document ?? (await uploadAgreementDocument(auth, opts));
  return {
    agreementDeclared: true,
    agreementDoc: {
      id: doc.id,
      name: doc.fileName || 'agreement.png',
      size: doc.sizeBytes || AGREEMENT_PNG.length,
      mime: doc.mimeType || 'image/png',
      dataUrl: `data:image/png;base64,${AGREEMENT_PNG_BASE64}`,
    },
    ownerConsent: true,
    ownerConsentMobile: opts.ownerConsentMobile ?? uniqueMobile(),
  };
}

const isoDaysFromNow = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

/** Both dates, so one body approves a rent agreement or a light bill alike. */
export const badgeChecks = () => ({
  nameMatches: true, addressMatches: true, validTill: isoDaysFromNow(200), issuedOn: isoDaysFromNow(-10),
});
