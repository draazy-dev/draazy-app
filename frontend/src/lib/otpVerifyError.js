import { PROVIDER_LOAD_FAILED, isDefinitelyOffline } from './seamErrors.js';
import { busyMessage } from './otpSendError.js';

const TERMINAL = {
  account_archived: { messageKey: 'auth.errAccountArchived', resendable: false },
  account_suspended: { messageKey: 'auth.errAccountSuspended', resendable: false },
  signups_closed: { messageKey: 'auth.errSignupsClosed', resendable: false },
  otp_attempts_exhausted: { messageKey: 'auth.errOtpExhausted', resendable: true },
  staff_sign_in_required: { messageKey: 'auth.errUseStaffSignIn', resendable: false },
};

export function classifyOtpVerifyError(err) {
  if (err?.code === PROVIDER_LOAD_FAILED) {
    return isDefinitelyOffline()
      ? { messageKey: 'connectivity.listUnreachable', terminal: false }
      : { messageKey: 'common.appStale', terminal: true, resendable: false };
  }

  if (Object.hasOwn(TERMINAL, err?.code)) {
    return { ...TERMINAL[err.code], terminal: true };
  }

  const left = err?.attemptsRemaining;
  if (typeof left === 'number') {
    return left > 0
      ? { messageKey: 'auth.errOtpAttemptsLeft', count: left, terminal: false }
      : { messageKey: 'auth.errOtpExhausted', terminal: true, resendable: true };
  }

  if (err?.status === 401) return { messageKey: 'auth.errOtpGone', terminal: true, resendable: true };
  if (err?.status === 429) return { ...busyMessage(err.retryAfterSeconds), terminal: false };
  if (err?.status === 403) return { messageKey: 'auth.errSignInBlocked', terminal: true, resendable: false };
  return { messageKey: err?.status ? 'common.somethingWentWrong' : 'connectivity.listUnreachable',
    terminal: false };
}
