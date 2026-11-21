import { describe, expect, it } from 'vitest';
import { DEFAULT_IDENTITY_DOCUMENT, IDENTITY_DOCUMENTS, REJECTION_COPY, getIdentityDocument } from '../../../../src/lib/identity-verification/documents.js';

describe('identity documents', () => {
  it('lists Aadhaar, PAN, driving licence and passport with their back-side need', () => {
    expect(Object.fromEntries(IDENTITY_DOCUMENTS.map((d) => [d.key, d.needsBack]))).toEqual({
      aadhaar: true, pan: false, driving_licence: true, passport: false,
    });
  });

  it('looks up by key and falls back to Aadhaar', () => {
    expect(getIdentityDocument('pan').key).toBe('pan');
    expect(getIdentityDocument('nope')).toBe(DEFAULT_IDENTITY_DOCUMENT);
    expect(getIdentityDocument()).toBe(IDENTITY_DOCUMENTS[0]);
  });

  it('maps every rejection reason to its own copy key', () => {
    expect(Object.entries(REJECTION_COPY).every(([k, v]) => k === v)).toBe(true);
    expect(Object.keys(REJECTION_COPY)).toContain('not_holder');
  });
});
