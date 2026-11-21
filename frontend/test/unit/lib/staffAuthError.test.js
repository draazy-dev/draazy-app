import { afterEach, describe, expect, it, vi } from 'vitest';
import { staffAuthError } from '../../../src/lib/staffAuthError.js';
import { PROVIDER_LOAD_FAILED } from '../../../src/lib/seamErrors.js';

const OFFLINE = "Can't reach Draazy. Check your internet connection and try again.";

afterEach(() => vi.restoreAllMocks());

describe('staffAuthError', () => {
  it('explains a stale shell, or offline when disconnected', () => {
    expect(staffAuthError({ code: PROVIDER_LOAD_FAILED }, 'password')).toBe('Draazy was updated. Reload the page to continue.');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(staffAuthError({ code: PROVIDER_LOAD_FAILED }, 'password')).toBe(OFFLINE);
  });

  it('reports offline when the error has no HTTP status', () => {
    expect(staffAuthError(new Error('fetch failed'), 'password')).toBe(OFFLINE);
    expect(staffAuthError(null, 'password')).toBe(OFFLINE);
  });

  it('explains an expired sign-in', () => {
    expect(staffAuthError({ status: 401, code: 'staff_sign_in_expired' }, 'totp')).toBe('Your sign-in timed out. Enter your email and password again.');
  });

  it('rate limits with seconds or minutes', () => {
    expect(staffAuthError({ status: 429 }, 'password')).toBe('Too many tries. Wait a minute and try again.');
    expect(staffAuthError({ status: 429, retryAfterSeconds: 0 }, 'password')).toBe('Too many tries. Wait a minute and try again.');
    expect(staffAuthError({ status: 429, retryAfterSeconds: 1 }, 'password')).toBe('Too many tries. Wait 1 second and try again.');
    expect(staffAuthError({ status: 429, retryAfterSeconds: 30.2 }, 'password')).toBe('Too many tries. Wait 31 seconds and try again.');
    expect(staffAuthError({ status: 429, retryAfterSeconds: 120 }, 'password')).toBe('Too many tries. Wait 2 minutes and try again.');
  });

  it.each([
    ['password', 'Wrong email or password. Check both and try again.'],
    ['totp', "That code didn't work. Enter the code your authenticator app shows now, or a recovery code."],
    ['enrol', "That code didn't work. Make sure you scanned this QR code, then enter the code your app shows now."],
    ['invite', 'This invite code is invalid or has expired. Ask an admin to send you a new one.'],
  ])('401 on %s step', (step, text) => {
    expect(staffAuthError({ status: 401 }, step)).toBe(text);
  });

  it('prefers a server-written message for forbidden and conflict responses', () => {
    expect(staffAuthError({ status: 403, code: 'staff_disabled', message: 'Account disabled by admin' }, 'password')).toBe('Account disabled by admin');
    expect(staffAuthError({ status: 409, code: 'conflict', message: 'conflict' }, 'password')).toBe("This account can't sign in right now. Contact an admin.");
    expect(staffAuthError({ status: 403, message: 'Forbidden' }, 'password')).toBe("This account can't sign in right now. Contact an admin.");
  });

  it('describes invalid input per step', () => {
    expect(staffAuthError({ status: 400 }, 'password')).toBe('Enter a valid work email and your password.');
    expect(staffAuthError({ status: 422 }, 'totp')).toBe('Enter the 6-digit code from your authenticator app.');
    expect(staffAuthError({ status: 400 }, 'invite')).toBe('Paste the full invite code and use a password of 12 to 72 characters.');
  });

  it('falls back for server errors', () => {
    expect(staffAuthError({ status: 500 }, 'password')).toBe('Something went wrong on our side. Try again in a minute.');
  });
});
