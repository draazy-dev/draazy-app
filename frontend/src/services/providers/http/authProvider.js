import { get, patch, persistTokens, post, unwrapPage } from '../../http.js';
import { logoutUser, sessionRemembered, writeUser } from '../../../lib/auth.js';

export const sendOtp = ({ mobile, turnstileToken }) => post(
  '/auth/login',
  { mobile },
  { auth: false, headers: turnstileToken ? { 'CF-Turnstile-Response': turnstileToken } : undefined },
);

export async function login({ mobile, otp, remember = true }) {
  const data = await post('/auth/login', { mobile, otp, remember }, { auth: false });
  return openSession(data, remember);
}

export async function register({ name, email, mobile, otp, remember = true }) {
  const user = await login({ mobile, otp, remember });
  const wasNew = !user?.name?.trim();
  const profile = {};
  if (name && !user?.verified) profile.name = name;
  if (email) profile.email = email;
  if (!Object.keys(profile).length) return { user, wasNew };
  try {
    return { user: await updateMe(profile), wasNew };
  } catch (err) {
    err.signedIn = { wasNew, verified: Boolean(user?.verified) };
    throw err;
  }
}

export const staffLogin = ({ email, password }) => post('/auth/staff-login', { email, password }, { auth: false });

export async function staffVerify({ challenge, code, remember = true }) {
  const data = await post('/auth/staff-login/verify', { challenge, code, remember }, { auth: false });
  return openSession(data, remember);
}

export const staffEnrol = ({ challenge }) => post('/auth/staff-login/enrol', { challenge }, { auth: false });

export async function staffConfirm({ challenge, code, remember = true }) {
  const data = await post('/auth/staff-login/enrol/confirm', { challenge, code, remember }, { auth: false });
  return { user: openSession(data, remember), recoveryCodes: data.recoveryCodes || [] };
}

export const redeemStaffInvite = ({ token, password }) =>
  post('/auth/staff-invite/redeem', { token, password }, { auth: false });

export async function logout() {
  try {
    await post('/auth/logout');
  } catch {
  }
  logoutUser();
  return null;
}

export async function getMe() {
  const user = await get('/auth/me');
  writeUser(user, sessionRemembered());
  return user;
}

export async function updateMe(body) {
  const user = await patch('/auth/me', body);
  writeUser(user, sessionRemembered());
  return user;
}

export async function exportMyData() {
  return get('/me/data-export');
}

export async function requestErasure({ reason } = {}) {
  return post('/me/erasure', { reason: reason || '' });
}

export async function myErasureRequests() {
  return unwrapPage(await get('/me/erasure'));
}

function openSession(data, remember) {
  persistTokens(data, remember);
  writeUser(data.user, remember);
  return data.user;
}
