import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';

vi.mock('../../../../../src/services/identityReviewService.js', () => ({
  claimIdentityReview: vi.fn(),
  getIdentityReview: vi.fn(),
  releaseIdentityReview: vi.fn(),
}));

import { claimIdentityReview, getIdentityReview, releaseIdentityReview } from '../../../../../src/services/identityReviewService.js';
import useKycCase from '../../../../../src/pages/ops/kyc/useKycCase.js';

const pending = (over = {}) => ({ id: 'c1', status: 'pending', userId: 'subject', ...over });
const err = (code, status = 409) => Object.assign(new Error(code), { code, status });
const OPTS = { canWrite: true, userId: 'staff' };

let onChanged;
const mount = (openId = 'c1', opts = {}) => {
  const view = renderHook(({ id }) => useKycCase(id, { ...OPTS, onChanged, ...opts }), { initialProps: { id: openId } });
  return view;
};
const loaded = (view) => waitFor(() => expect(view.result.current.loading).toBe(false));

beforeEach(() => {
  onChanged = vi.fn();
  getIdentityReview.mockReset();
  claimIdentityReview.mockReset().mockResolvedValue({ claimedByMe: true });
  releaseIdentityReview.mockReset().mockResolvedValue({});
});
afterEach(cleanup);

describe('useKycCase loading', () => {
  it('stays empty without an open case', () => {
    const { result } = mount(null);
    expect(result.current).toMatchObject({ detail: null, loading: false, error: '', claimNotice: '' });
    expect(getIdentityReview).not.toHaveBeenCalled();
    act(() => { void result.current.refresh(); });
  });

  it('claims a pending case someone else raised', async () => {
    getIdentityReview.mockResolvedValue(pending());
    const view = mount();
    await loaded(view);
    expect(claimIdentityReview).toHaveBeenCalledWith('c1');
    expect(view.result.current.detail).toMatchObject({ id: 'c1', claimedByMe: true });
    view.unmount();
    await waitFor(() => expect(releaseIdentityReview).toHaveBeenCalledWith('c1'));
  });

  it('does not claim read-only, own, already claimed or decided cases', async () => {
    getIdentityReview.mockResolvedValue(pending());
    const readOnly = mount('c1', { canWrite: false });
    await loaded(readOnly);
    expect(readOnly.result.current.detail.id).toBe('c1');
    cleanup();
    getIdentityReview.mockResolvedValue(pending({ userId: 'staff' }));
    const own = mount();
    await loaded(own);
    cleanup();
    getIdentityReview.mockResolvedValue(pending({ status: 'verified' }));
    const done = mount();
    await loaded(done);
    cleanup();
    getIdentityReview.mockResolvedValue(pending({ claimedByName: 'Priya' }));
    const taken = mount();
    await loaded(taken);
    expect(taken.result.current.claimNotice).toBe('Being reviewed by Priya');
    expect(claimIdentityReview).not.toHaveBeenCalled();
  });

  it('releases a claim the reviewer already holds when closing', async () => {
    getIdentityReview.mockResolvedValue(pending({ claimedByMe: true }));
    const view = mount();
    await loaded(view);
    expect(claimIdentityReview).not.toHaveBeenCalled();
    view.rerender({ id: null });
    await waitFor(() => expect(releaseIdentityReview).toHaveBeenCalledWith('c1'));
    expect(view.result.current.detail).toBeNull();
  });

  it('shows the holder when the claim is taken meanwhile', async () => {
    getIdentityReview.mockResolvedValueOnce(pending()).mockResolvedValue(pending({ claimedByName: 'Priya' }));
    claimIdentityReview.mockRejectedValue(err('identity_case_claimed'));
    const view = mount();
    await loaded(view);
    expect(view.result.current.detail.claimedByName).toBe('Priya');
    expect(view.result.current.claimNotice).toBe('Being reviewed by Priya');
    expect(view.result.current.error).toBe('');
  });

  it('falls back to the loaded case when the claim fails for another reason', async () => {
    getIdentityReview.mockResolvedValue(pending());
    claimIdentityReview.mockRejectedValue(err('identity_case_claim_limit', 429));
    const view = mount();
    await loaded(view);
    expect(view.result.current.detail.id).toBe('c1');
    expect(view.result.current.error).toMatch(/already hold 3 cases/);
  });

  it('reports a load failure', async () => {
    getIdentityReview.mockRejectedValue(new Error('x'));
    const view = mount();
    await loaded(view);
    expect(view.result.current.error).toBe('Could not load this review.');
  });

  it('lets the reviewer claim on demand', async () => {
    getIdentityReview.mockResolvedValue(pending());
    claimIdentityReview.mockRejectedValueOnce(err('identity_case_claim_limit', 429));
    const view = mount();
    await loaded(view);
    claimIdentityReview.mockResolvedValue({ claimedByMe: true });
    act(() => view.result.current.claim());
    await waitFor(() => expect(view.result.current.detail?.claimedByMe).toBe(true));
  });
});

describe('useKycCase actions', () => {
  it('refreshes the case and claims it again when needed', async () => {
    getIdentityReview.mockResolvedValue(pending({ claimedByMe: true }));
    const view = mount();
    await loaded(view);
    getIdentityReview.mockResolvedValue(pending({ claimedByMe: true, images: ['fresh'] }));
    await act(async () => { await view.result.current.refresh(); });
    expect(view.result.current.detail.images).toEqual(['fresh']);
    getIdentityReview.mockResolvedValue(pending());
    await act(async () => { await view.result.current.refresh(); });
    expect(claimIdentityReview).toHaveBeenCalledTimes(1);
    expect(view.result.current.detail.claimedByMe).toBe(true);
    getIdentityReview.mockRejectedValue(new Error('x'));
    await act(async () => { await view.result.current.refresh(); });
    expect(view.result.current.error).toBe('Could not refresh image links.');
  });

  it('records a decision and notifies', async () => {
    getIdentityReview.mockResolvedValue(pending({ claimedByMe: true }));
    const view = mount();
    await loaded(view);
    const submit = vi.fn().mockResolvedValue({ id: 'c1', status: 'verified' });
    let out;
    await act(async () => { out = await view.result.current.decide(submit, 'fail'); });
    expect(out).toBeNull();
    expect(view.result.current.detail.status).toBe('verified');
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(view.result.current.deciding).toBe(false);
  });

  it('claims first when a decision needs it', async () => {
    getIdentityReview.mockResolvedValue(pending({ claimedByName: 'Priya' }));
    const view = mount();
    await loaded(view);
    const submit = vi.fn().mockResolvedValue({ id: 'c1', status: 'rejected' });
    claimIdentityReview.mockRejectedValueOnce(err('identity_case_claimed'));
    await act(async () => { await view.result.current.decide(submit, 'fail', { requireClaim: true }); });
    expect(submit).not.toHaveBeenCalled();
    claimIdentityReview.mockResolvedValue({ claimedByMe: true });
    await act(async () => { await view.result.current.decide(submit, 'fail', { requireClaim: true }); });
    expect(submit).toHaveBeenCalled();
  });

  it('returns the mismatch code without recording an error', async () => {
    getIdentityReview.mockResolvedValue(pending({ claimedByMe: true }));
    const view = mount();
    await loaded(view);
    let out;
    await act(async () => { out = await view.result.current.decide(() => Promise.reject(err('IDENTITY_NUMBER_MISMATCH', 422)), 'fail'); });
    expect(out).toBe('identity_number_mismatch');
    expect(view.result.current.error).toBe('');
  });

  it('reloads the case when a decision loses the claim', async () => {
    getIdentityReview.mockResolvedValue(pending({ claimedByMe: true }));
    const view = mount();
    await loaded(view);
    getIdentityReview.mockResolvedValue(pending({ claimedByName: 'Priya' }));
    await act(async () => { await view.result.current.decide(() => Promise.reject(err('identity_case_claimed')), 'Could not save'); });
    expect(view.result.current.detail.claimedByName).toBe('Priya');
    expect(view.result.current.claimNotice).toBe('Being reviewed by Priya');
    expect(onChanged).toHaveBeenCalled();
  });

  it('clears the case when it disappears after a 403', async () => {
    getIdentityReview.mockResolvedValue(pending({ claimedByMe: true }));
    const view = mount();
    await loaded(view);
    getIdentityReview.mockRejectedValue(new Error('gone'));
    await act(async () => { await view.result.current.decide(() => Promise.reject(err('forbidden', 403)), 'Could not save'); });
    expect(view.result.current.detail).toBeNull();
    expect(view.result.current.error).toBe('Could not save');
  });

  it('shows an ordinary decision error and ignores decisions without a case', async () => {
    getIdentityReview.mockResolvedValue(pending({ claimedByMe: true }));
    const view = mount();
    await loaded(view);
    await act(async () => { await view.result.current.decide(() => Promise.reject(new Error('x')), 'Could not save'); });
    expect(view.result.current.error).toBe('Could not save');
    cleanup();
    const empty = mount(null);
    let out = 'unset';
    await act(async () => { out = await empty.result.current.decide(vi.fn(), 'f'); });
    expect(out).toBeNull();
  });

  it('force-releases another reviewer\'s claim', async () => {
    getIdentityReview.mockResolvedValue(pending({ claimedByName: 'Priya' }));
    const view = mount();
    await loaded(view);
    getIdentityReview.mockResolvedValue(pending());
    await act(async () => { await view.result.current.forceRelease(); });
    expect(releaseIdentityReview).toHaveBeenCalledWith('c1', { force: true });
    expect(view.result.current.claimNotice).toBe('');
    expect(onChanged).toHaveBeenCalled();
    releaseIdentityReview.mockRejectedValueOnce(new Error('x'));
    await act(async () => { await view.result.current.forceRelease(); });
    expect(view.result.current.error).toBe('Could not release this claim.');
  });
});
