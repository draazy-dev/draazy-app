import { afterEach, describe, expect, it, vi } from 'vitest';
import { busyMessage, classifyOtpSendError } from '../../../src/lib/otpSendError.js';
import { PROVIDER_LOAD_FAILED } from '../../../src/lib/seamErrors.js';
import { isImeComposing } from '../../../src/lib/isImeComposing.js';
import { GENERAL, contextKey, contextMeta, parseContextKey, supportLink } from '../../../src/lib/supportLink.js';

afterEach(() => vi.restoreAllMocks());

describe('busyMessage', () => {
  it('uses the generic key without a positive wait', () => {
    expect(busyMessage(undefined)).toEqual({ messageKey: 'auth.errOtpBusy' });
    expect(busyMessage(0)).toEqual({ messageKey: 'auth.errOtpBusy' });
    expect(busyMessage(-5)).toEqual({ messageKey: 'auth.errOtpBusy' });
  });

  it('rounds up to seconds below a minute and minutes after', () => {
    expect(busyMessage(0.2)).toEqual({ messageKey: 'auth.errOtpBusySeconds', count: 1 });
    expect(busyMessage(59)).toEqual({ messageKey: 'auth.errOtpBusySeconds', count: 59 });
    expect(busyMessage(60)).toEqual({ messageKey: 'auth.errOtpBusyMinutes', count: 1 });
    expect(busyMessage(61)).toEqual({ messageKey: 'auth.errOtpBusyMinutes', count: 2 });
  });
});

describe('classifyOtpSendError', () => {
  it('distinguishes a stale shell from being offline', () => {
    const err = { code: PROVIDER_LOAD_FAILED };
    expect(classifyOtpSendError(err)).toEqual({ messageKey: 'common.appStale' });
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(classifyOtpSendError(err)).toEqual({ messageKey: 'connectivity.listUnreachable' });
  });

  it.each([
    ['signups_closed', 'auth.errSignupsClosed'],
    ['account_archived', 'auth.errAccountArchived'],
    ['owner_consent_self', 'auth.errOwnerConsentSelf'],
    ['bot_check_failed', 'auth.errBotCheckFailed'],
  ])('maps code %s', (code, messageKey) => {
    expect(classifyOtpSendError({ code, status: 400 })).toEqual({ messageKey });
  });

  it('maps statuses', () => {
    expect(classifyOtpSendError({ status: 429, retryAfterSeconds: 90 })).toEqual({ messageKey: 'auth.errOtpBusyMinutes', count: 2 });
    expect(classifyOtpSendError({ status: 403 })).toEqual({ messageKey: 'auth.errSignInBlocked' });
    expect(classifyOtpSendError({ status: 503 })).toEqual({ messageKey: 'auth.errOtpSendFailed' });
    expect(classifyOtpSendError({ status: 400 })).toEqual({ messageKey: 'common.somethingWentWrong' });
  });

  it('treats errors without a status as connectivity problems', () => {
    expect(classifyOtpSendError(new Error('x'))).toEqual({ messageKey: 'connectivity.listUnreachable' });
    expect(classifyOtpSendError(null)).toEqual({ messageKey: 'connectivity.listUnreachable' });
  });
});

describe('isImeComposing', () => {
  it('detects composition via isComposing, the native event or keyCode 229', () => {
    expect(isImeComposing({ isComposing: true })).toBe(true);
    expect(isImeComposing({ nativeEvent: { isComposing: true } })).toBe(true);
    expect(isImeComposing({ keyCode: 229 })).toBe(true);
    expect(isImeComposing({ nativeEvent: { isComposing: false }, keyCode: 13 })).toBe(false);
    expect(isImeComposing({})).toBe(false);
  });
});

describe('supportLink', () => {
  it('builds a scoped link or the general one', () => {
    expect(supportLink('property', 'abc 1')).toBe('/messages?support=property%3Aabc%201');
    expect(supportLink(GENERAL, 'x')).toBe('/messages?support=general');
    expect(supportLink(undefined)).toBe('/messages?support=general');
  });

  it('exposes metadata with a general fallback', () => {
    expect(contextMeta('invoice')).toMatchObject({ group: 'Payment' });
    expect(contextMeta('property').card).toBe('property');
    expect(contextMeta('nope')).toBe(contextMeta(GENERAL));
  });

  it('derives the context key', () => {
    expect(contextKey({ type: 'request', id: 7 })).toBe('request:7');
    expect(contextKey({ type: 'request' })).toBe('general');
    expect(contextKey({ type: 'general', id: 1 })).toBe('general');
    expect(contextKey(null)).toBe('general');
  });

  it('parses keys, lowercasing ids except for invoices', () => {
    expect(parseContextKey('property:ABC')).toEqual({ type: 'property', id: 'abc' });
    expect(parseContextKey('invoice:INV-9')).toEqual({ type: 'invoice', id: 'INV-9' });
    expect(parseContextKey('flatmate_room:a:b')).toEqual({ type: 'flatmate_room', id: 'a:b' });
  });

  it('sends legacy, malformed or unknown keys to general', () => {
    expect(parseContextKey('')).toBeNull();
    expect(parseContextKey(null)).toBeNull();
    expect(parseContextKey('ticket:12')).toEqual({ type: 'general', id: null });
    expect(parseContextKey('property:')).toEqual({ type: 'general', id: null });
    expect(parseContextKey(':x')).toEqual({ type: 'general', id: null });
    expect(parseContextKey('plain')).toEqual({ type: 'general', id: null });
  });
});
