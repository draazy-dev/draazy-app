import { describe, expect, it } from 'vitest';
import { ID_KINDS, cleanAadhaar, cleanMobile, cleanPan, formatAadhaar, formatMobile } from '../../../src/lib/idFormat.js';

describe('aadhaar', () => {
  it('keeps 12 digits and groups them in fours', () => {
    expect(cleanAadhaar('1234-5678 9012 999')).toBe('123456789012');
    expect(formatAadhaar('123456789012')).toBe('1234 5678 9012');
    expect(formatAadhaar('12345')).toBe('1234 5');
    expect(formatAadhaar('1234')).toBe('1234');
    expect(formatAadhaar(null)).toBe('');
  });
});

describe('cleanPan', () => {
  it('enforces AAAAA9999A by position and uppercases', () => {
    expect(cleanPan('abcde1234f')).toBe('ABCDE1234F');
    expect(cleanPan('ab1cde12x34f')).toBe('ABCDE1234F');
    expect(cleanPan('abcde1234f999')).toBe('ABCDE1234F');
    expect(cleanPan('12abc')).toBe('ABC');
    expect(cleanPan(undefined)).toBe('');
  });
});

describe('mobile', () => {
  it('strips country code and trunk prefix', () => {
    expect(cleanMobile('+91 98765 43210')).toBe('9876543210');
    expect(cleanMobile('09876543210')).toBe('9876543210');
    expect(cleanMobile('98765432101234')).toBe('9876543210');
    expect(cleanMobile('abc')).toBe('');
  });

  it('formats as 5+5', () => {
    expect(formatMobile('9876543210')).toBe('98765 43210');
    expect(formatMobile('98765')).toBe('98765');
    expect(formatMobile('987654')).toBe('98765 4');
  });
});

describe('ID_KINDS', () => {
  it('wires cleaners and input hints per kind', () => {
    expect(ID_KINDS.aadhaar.format('123456789012')).toBe('1234 5678 9012');
    expect(ID_KINDS.pan.format('abcde1234f')).toBe('ABCDE1234F');
    expect(ID_KINDS.mobile.clean('+919876543210')).toBe('9876543210');
    expect(ID_KINDS.mobile).toMatchObject({ type: 'tel', autoComplete: 'tel-national' });
    expect(ID_KINDS.pan.autoCapitalize).toBe('characters');
  });
});
