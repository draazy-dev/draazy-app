import { beforeEach, describe, expect, it } from 'vitest';
import {
  NO_CONTACT_GATE, digits, fmtPhone, isFullMobile, isOwnerViewer, maskPhone, myMobile,
} from '../../../src/lib/contact.js';

const DOT = '\u2022';

beforeEach(() => localStorage.clear());

describe('digits and validation', () => {
  it('strips non-digits and tolerates empty input', () => {
    expect(digits('+91 98765-43210')).toBe('919876543210');
    expect(digits(null)).toBe('');
    expect(digits(undefined)).toBe('');
    expect(digits(9876543210)).toBe('9876543210');
  });

  it('accepts exactly ten digits as a full mobile', () => {
    expect(isFullMobile('98765 43210')).toBe(true);
    expect(isFullMobile('987654321')).toBe(false);
    expect(isFullMobile('+91 9876543210')).toBe(false);
  });
});

describe('formatting', () => {
  it('masks all but the first two and last two digits', () => {
    expect(maskPhone('9876543210')).toBe(`+91 98${DOT.repeat(3)} ${DOT.repeat(3)}10`);
    expect(maskPhone('12')).toBe(`+91 ${DOT.repeat(5)} ${DOT.repeat(5)}`);
    expect(maskPhone('')).toBe(`+91 ${DOT.repeat(5)} ${DOT.repeat(5)}`);
  });

  it('groups a ten-digit mobile as 5+5', () => {
    expect(fmtPhone('9876543210')).toBe('+91 98765 43210');
    expect(fmtPhone('98765')).toBe('+91 98765');
  });
});

describe('viewer identity', () => {
  it('reads the signed-in mobile', () => {
    expect(myMobile()).toBe('');
    localStorage.setItem('draazyUser', JSON.stringify({ mobile: '98765 43210' }));
    expect(myMobile()).toBe('9876543210');
  });

  it('survives corrupt stored users', () => {
    localStorage.setItem('draazyUser', '{not json');
    expect(myMobile()).toBe('');
    localStorage.setItem('draazyUser', 'null');
    expect(myMobile()).toBe('');
  });

  it('recognises the owner only on a full-number match', () => {
    localStorage.setItem('draazyUser', JSON.stringify({ mobile: '9876543210' }));
    expect(isOwnerViewer('98765 43210')).toBe(true);
    expect(isOwnerViewer('9876543211')).toBe(false);
    expect(isOwnerViewer('987654')).toBe(false);
    localStorage.setItem('draazyUser', JSON.stringify({ mobile: '12345' }));
    expect(isOwnerViewer('12345')).toBe(false);
  });
});

describe('NO_CONTACT_GATE', () => {
  it('is frozen and permissive', () => {
    expect(Object.isFrozen(NO_CONTACT_GATE)).toBe(true);
    expect(NO_CONTACT_GATE).toEqual({ status: 'none', verifiedContactOnly: false, verificationRequired: false, ownerHidesNumber: false });
  });
});
