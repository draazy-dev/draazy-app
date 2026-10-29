import { PROVIDER_LOAD_FAILED, isDefinitelyOffline } from './seamErrors.js';

export function busyMessage(seconds) {
  if (!(seconds > 0)) return { messageKey: 'auth.errOtpBusy' };
  return seconds < 60
    ? { messageKey: 'auth.errOtpBusySeconds', count: Math.ceil(seconds) }
    : { messageKey: 'auth.errOtpBusyMinutes', count: Math.ceil(seconds / 60) };
}

export function classifyOtpSendError(err) {
  if (err?.code === PROVIDER_LOAD_FAILED) {
    return { messageKey: isDefinitelyOffline() ? 'connectivity.listUnreachable' : 'common.appStale' };
  }
  if (err?.code === 'signups_closed') return { messageKey: 'auth.errSignupsClosed' };
  if (err?.code === 'account_archived') return { messageKey: 'auth.errAccountArchived' };
  if (err?.code === 'owner_consent_self') return { messageKey: 'auth.errOwnerConsentSelf' };
  if (err?.status === 429) return busyMessage(err.retryAfterSeconds);
  if (err?.status === 403) return { messageKey: 'auth.errSignInBlocked' };
  if (!err?.status) return { messageKey: 'connectivity.listUnreachable' };
  return { messageKey: err.status >= 500 ? 'auth.errOtpSendFailed' : 'common.somethingWentWrong' };
}
