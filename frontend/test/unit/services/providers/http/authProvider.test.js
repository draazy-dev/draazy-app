import { describe, expect, it } from 'vitest';
import { setupFetch, status } from '../net.js';
import { readAccessToken, readUser } from '../../../../../src/lib/auth.js';
import { ApiError } from '../../../../../src/services/http.js';
import {
  exportMyData, getMe, login, logout, myErasureRequests, redeemStaffInvite, register, requestErasure,
  sendOtp, staffConfirm, staffEnrol, staffLogin, staffVerify, updateMe,
} from '../../../../../src/services/providers/http/authProvider.js';

describe('authProvider', () => {
  const net = setupFetch();

  it('sendOtp posts the mobile without auth, with the turnstile header when given', async () => {
    await sendOtp({ mobile: '9999999999', turnstileToken: 'ts' });
    expect(net.last()).toMatchObject({ path: '/auth/login', method: 'POST', body: { mobile: '9999999999' } });
    expect(net.last().headers['CF-Turnstile-Response']).toBe('ts');
    expect(net.last().headers.Authorization).toBeUndefined();
    await sendOtp({ mobile: '9999999999' });
    expect(net.last().headers['CF-Turnstile-Response']).toBeUndefined();
  });

  it('login stores tokens and the user and returns the user', async () => {
    net.reply({ accessToken: 'AT', user: { id: 'u1', name: 'Asha' } });
    const user = await login({ mobile: '9999999999', otp: '123456' });
    expect(net.last().body).toEqual({ mobile: '9999999999', otp: '123456', remember: true });
    expect(user).toEqual({ id: 'u1', name: 'Asha' });
    expect(readAccessToken()).toBe('AT');
    expect(readUser()).toEqual(user);
    expect(localStorage.getItem('draazyUser')).toContain('u1');
  });

  it('login with remember=false keeps the user in sessionStorage', async () => {
    net.reply({ accessToken: 'AT', user: { id: 'u2' } });
    await login({ mobile: '1', otp: '2', remember: false });
    expect(sessionStorage.getItem('draazyUser')).toContain('u2');
    expect(localStorage.getItem('draazyUser')).toBeNull();
  });

  it('register on a new account patches name and email', async () => {
    net.reply({ accessToken: 'AT', user: { id: 'u1', name: '' } });
    net.reply({ id: 'u1', name: 'Asha', email: 'a@x.in' });
    const res = await register({ name: 'Asha', email: 'a@x.in', mobile: '1', otp: '2' });
    expect(net.calls[1]).toMatchObject({ path: '/auth/me', method: 'PATCH', body: { name: 'Asha', email: 'a@x.in' } });
    expect(res).toEqual({ user: { id: 'u1', name: 'Asha', email: 'a@x.in' }, wasNew: true });
  });

  it('register skips the name for verified users and the patch when nothing to send', async () => {
    net.reply({ accessToken: 'AT', user: { id: 'u1', name: 'Old', verified: true } });
    const res = await register({ name: 'New', mobile: '1', otp: '2' });
    expect(net.calls).toHaveLength(1);
    expect(res).toEqual({ user: { id: 'u1', name: 'Old', verified: true }, wasNew: false });
  });

  it('register annotates a profile-update failure with the signed-in state', async () => {
    net.reply({ accessToken: 'AT', user: { id: 'u1', name: '', verified: true } });
    net.reply(status(422, { error: 'invalid', message: 'bad email' }));
    const err = await register({ email: 'bad', mobile: '1', otp: '2' }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.signedIn).toEqual({ wasNew: true, verified: true });
    expect(err.isValidation).toBe(true);
  });

  it('staff flows hit their endpoints without auth', async () => {
    await staffLogin({ email: 'e@x.in', password: 'pw' });
    expect(net.last()).toMatchObject({ path: '/auth/staff-login', body: { email: 'e@x.in', password: 'pw' } });
    await staffEnrol({ challenge: 'c' });
    expect(net.last()).toMatchObject({ path: '/auth/staff-login/enrol', body: { challenge: 'c' } });
    await redeemStaffInvite({ token: 't', password: 'p' });
    expect(net.last()).toMatchObject({ path: '/auth/staff-invite/redeem', body: { token: 't', password: 'p' } });
  });

  it('staffVerify opens a session', async () => {
    net.reply({ accessToken: 'ST', user: { id: 's1' } });
    expect(await staffVerify({ challenge: 'c', code: '1' })).toEqual({ id: 's1' });
    expect(net.last()).toMatchObject({ path: '/auth/staff-login/verify', body: { challenge: 'c', code: '1', remember: true } });
    expect(readAccessToken()).toBe('ST');
  });

  it('staffConfirm returns the user and recovery codes', async () => {
    net.reply({ accessToken: 'ST', user: { id: 's1' }, recoveryCodes: ['a', 'b'] });
    expect(await staffConfirm({ challenge: 'c', code: '1' })).toEqual({ user: { id: 's1' }, recoveryCodes: ['a', 'b'] });
    net.reply({ accessToken: 'ST', user: { id: 's1' } });
    expect((await staffConfirm({ challenge: 'c', code: '1' })).recoveryCodes).toEqual([]);
  });

  it('logout clears the session even when the server call fails', async () => {
    net.reply({ accessToken: 'AT', user: { id: 'u1' } });
    await login({ mobile: '1', otp: '2' });
    net.reply(status(500, { message: 'boom' }));
    expect(await logout()).toBeNull();
    expect(readAccessToken()).toBeNull();
    expect(readUser()).toBeNull();
  });

  it('getMe and updateMe persist the returned user', async () => {
    net.reply({ id: 'u1', name: 'A' });
    expect(await getMe()).toEqual({ id: 'u1', name: 'A' });
    expect(readUser()).toEqual({ id: 'u1', name: 'A' });
    net.reply({ id: 'u1', name: 'B' });
    await updateMe({ name: 'B' });
    expect(net.last()).toMatchObject({ path: '/auth/me', method: 'PATCH', body: { name: 'B' } });
    expect(readUser().name).toBe('B');
  });

  it('data export and erasure endpoints', async () => {
    await exportMyData();
    expect(net.last()).toMatchObject({ path: '/me/data-export', method: 'GET' });
    await requestErasure({ reason: 'why' });
    expect(net.last()).toMatchObject({ path: '/me/erasure', method: 'POST', body: { reason: 'why' } });
    await requestErasure();
    expect(net.last().body).toEqual({ reason: '' });
    net.reply({ content: [{ id: 1 }], totalElements: 1 });
    expect((await myErasureRequests()).items).toEqual([{ id: 1 }]);
  });
});
