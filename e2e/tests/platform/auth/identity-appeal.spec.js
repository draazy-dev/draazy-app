import { test, expect } from '../../../fixtures/live.js';

const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const NOTE = 'My PAN is valid; the photo was taken in poor light.';
const OPENED_AT = new Date(Date.now() - 3600000).toISOString();

const rejectedStatus = (appeal = null) => ({
  status: 'rejected',
  docType: 'pan',
  docLast4: '234F',
  rejectionReason: 'blurry',
  attemptsRemaining: 2,
  canRetry: true,
  canAppeal: !appeal,
  appeal,
});

const appealOf = (status, note = NOTE) => ({ id: 'ap-1', status, note, ticketId: 't-1', openedAt: OPENED_AT, decidedAt: null });

async function mockConsumerStatus(page, state) {
  await page.route('**/api/me/verification/identity', (route) => (
    route.request().method() === 'GET' ? route.fulfill({ json: state.status }) : route.continue()
  ));
}

test('a rejected check can be appealed from the status card, then shows the appeal status', async ({ page, login, flags }) => {
  await flags.enable('kycBadgeEnabled');
  await login.asNewOwner();
  await page.setViewportSize({ width: 390, height: 844 });
  const state = { status: rejectedStatus() };
  let appealBody = null;
  await mockConsumerStatus(page, state);
  await page.route('**/api/me/verification/identity/appeal', async (route) => {
    appealBody = JSON.parse(route.request().postData() || '{}');
    state.status = rejectedStatus(appealOf('open'));
    return route.fulfill({ status: 201, json: state.status.appeal });
  });

  await page.goto('/verify-identity');
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await page.getByTestId('verify-appeal-open').click();
  await expect(page.getByTestId('verify-appeal-send')).toBeDisabled();
  await page.getByTestId('verify-appeal-note').fill(NOTE);
  await page.getByTestId('verify-appeal-send').click();

  expect(appealBody).toEqual({ note: NOTE });
  await expect(page.getByTestId('verify-appeal-status')).toContainText('Under review');
  await expect(page.getByTestId('verify-appeal-open')).toHaveCount(0);
  await expect(page.getByTestId('verify-appeal-form')).toHaveCount(0);
});

test('an open appeal and an upheld one show their status and offer no second appeal', async ({ page, login, flags }) => {
  await flags.enable('kycBadgeEnabled');
  await login.asNewOwner();
  const state = { status: rejectedStatus(appealOf('open')) };
  await mockConsumerStatus(page, state);

  await page.goto('/verify-identity');
  await expect(page.getByTestId('verify-appeal-status')).toContainText('Under review');
  await expect(page.getByTestId('verify-appeal-open')).toHaveCount(0);

  state.status = rejectedStatus({ ...appealOf('upheld'), decidedAt: OPENED_AT });
  state.status.canAppeal = false;
  await page.reload();
  await expect(page.getByTestId('verify-appeal-status')).toContainText('The rejection stands');
  await expect(page.getByTestId('verify-appeal-open')).toHaveCount(0);
});

test('a refused appeal explains why instead of failing silently', async ({ page, login, flags }) => {
  await flags.enable('kycBadgeEnabled');
  await login.asNewOwner();
  await mockConsumerStatus(page, { status: rejectedStatus() });
  await page.route('**/api/me/verification/identity/appeal', (route) => route.fulfill({
    status: 409,
    json: { error: 'identity_appeal_open', message: 'An appeal is already open' },
  }));

  await page.goto('/verify-identity');
  await page.getByTestId('verify-appeal-open').click();
  await page.getByTestId('verify-appeal-note').fill(NOTE);
  await page.getByTestId('verify-appeal-send').click();

  await expect(page.getByRole('alert')).toContainText('already under review');
});

const kycCase = (appeal, appealCanDecide, appealCanReopen = appealCanDecide) => ({
  id: 'case-1',
  userId: 'subject-1',
  userName: 'Applicant 1',
  userMobile: '97XXXXX001',
  userRole: 'owner',
  status: 'rejected',
  docType: 'pan',
  claims: { number: '1234', name: 'Applicant 1', dob: '1990-01-01' },
  liveness: 'passed',
  submittedAt: new Date(Date.now() - 86400000).toISOString(),
  decidedAt: new Date(Date.now() - 3600000).toISOString(),
  rejectionReason: 'blurry',
  attemptCount: 1,
  images: { front: IMG, selfie: IMG },
  warnings: [],
  appeal,
  appealCanDecide,
  appealCanReopen,
});

async function mockAppealDesk(page, login, { canDecide = true, purged = false } = {}) {
  const state = { appeal: appealOf('open'), decisions: [], lists: [] };
  await login.asAdmin();
  await page.route('**/api/moderation/identity-reviews**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname.endsWith('/summary')) return route.fulfill({ json: { pending: 0, overdue: 0, mine: 0, qa: 0, decided: 1, appeals: 1 } });
    if (method === 'GET' && !/case-1/.test(url.pathname)) {
      state.lists.push(Object.fromEntries(url.searchParams));
      const row = { ...kycCase(null, false), appeal: true };
      return route.fulfill({ json: { content: [row], totalElements: 1, totalPages: 1, number: 0, size: 10 } });
    }
    const decision = url.pathname.match(/\/appeal\/(uphold|reopen)$/)?.[1];
    if (method === 'POST' && decision) {
      state.decisions.push(decision);
      state.appeal = { ...state.appeal, status: decision === 'uphold' ? 'upheld' : 'reopened', decidedAt: new Date().toISOString() };
      return route.fulfill({ json: state.appeal });
    }
    const reopened = state.appeal.status === 'reopened';
    const open = state.appeal.status === 'open';
    return route.fulfill({ json: { ...kycCase(state.appeal, canDecide && open, canDecide && open && !purged), status: reopened ? 'pending' : 'rejected' } });
  });
  return state;
}

test('the ops queue tags an appeal and a different reviewer can uphold it', async ({ page, login }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const desk = await mockAppealDesk(page, login);
  await page.goto('/ops/kyc-review');

  await expect(page.getByTestId('kyc-count-appeal')).toHaveText('1');
  await page.getByRole('tab', { name: /^Appeals/ }).click();
  await expect.poll(() => desk.lists.at(-1)?.status).toBe('appeal');
  await expect(page.getByTestId('kyc-appeal-tag')).toHaveText('Appeal');

  await page.getByTestId('kyc-row').click();
  const panel = page.getByTestId('kyc-appeal-panel');
  await expect(panel).toContainText(NOTE);
  await page.getByTestId('kyc-appeal-uphold').click();

  await expect.poll(() => desk.decisions).toEqual(['uphold']);
  await expect(panel).toContainText('upheld');
  await expect(page.getByTestId('kyc-appeal-uphold')).toHaveCount(0);
});

test('reopening an appeal sends the case back to review', async ({ page, login }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const desk = await mockAppealDesk(page, login);
  await page.goto('/ops/kyc-review?tab=appeal');

  await page.getByTestId('kyc-row').click();
  await page.getByTestId('kyc-appeal-reopen').click();

  await expect.poll(() => desk.decisions).toEqual(['reopen']);
  await expect(page.getByTestId('kyc-appeal-panel')).toContainText('reopened');
  await expect(page.getByTestId('kyc-appeal-reopen')).toHaveCount(0);
});

test('the reviewer who rejected the case sees who must decide instead of the buttons', async ({ page, login }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockAppealDesk(page, login, { canDecide: false });
  await page.goto('/ops/kyc-review?tab=appeal');

  await page.getByTestId('kyc-row').click();
  await expect(page.getByTestId('kyc-appeal-panel')).toContainText('A different reviewer');
  await expect(page.getByTestId('kyc-appeal-uphold')).toHaveCount(0);
  await expect(page.getByTestId('kyc-appeal-reopen')).toHaveCount(0);
});

test('a purged case offers Uphold only, with a note instead of Reopen', async ({ page, login }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockAppealDesk(page, login, { purged: true });
  await page.goto('/ops/kyc-review?tab=appeal');

  await page.getByTestId('kyc-row').click();
  await expect(page.getByTestId('kyc-appeal-uphold')).toBeVisible();
  await expect(page.getByTestId('kyc-appeal-reopen')).toHaveCount(0);
  await expect(page.getByTestId('kyc-appeal-purged')).toContainText('can only be upheld');
});
