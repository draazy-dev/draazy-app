import { test, expect } from '@playwright/test';
import { API, apiLogin, uniqueMobile } from '../../../helpers/liveAuth.js';
import { flatmateCleanup } from '../../../helpers/flatmateCleanup.js';
import { tenantRoomAgreement } from '../../../helpers/flatmateAgreement.js';
import { liveListing, verifyOwnership } from '../../../helpers/referral.js';

const auth = (token) => ({ 'content-type': 'application/json', authorization: `Bearer ${token}` });
const AGREEMENT_EVIDENCE = {
  agreement: true,
  agreementDoc: {},
};

async function newHost() {
  const mobile = uniqueMobile();
  const { accessToken } = await apiLogin(mobile, { name: 'Asha K' });
  return { mobile, accessToken };
}

const groupBody = (over = {}) => ({
  title: `Tier Group ${Number(uniqueMobile()).toString(36)}`,
  locality: 'Baner',
  rent: 25000,
  deposit: 50000,
  seats: 2,
  seatsOpen: 1,
  policy: 'any',
  role: 'tenant',
  ...over,
});

const track = flatmateCleanup(test);

async function createGroup(token, over = {}) {
  const res = await fetch(`${API}/flatmates/groups`, {
    method: 'POST',
    headers: auth(token),
    body: JSON.stringify(groupBody(over.agreementDoc
      ? { ...over, agreementDoc: (await tenantRoomAgreement(token)).agreementDoc }
      : over)),
  });
  const body = await res.json();
  if (res.status === 201) track('groups', body.id, token);
  return { status: res.status, body };
}

const setSeats = (token, id, seatsOpen) =>
  fetch(`${API}/flatmates/groups/${id}/seats`, {
    method: 'PATCH',
    headers: auth(token),
    body: JSON.stringify({ seatsOpen }),
  });

test.describe('Flatmate host eligibility tiers', () => {
  test('a tier is earned from role, agreement and ownership — never claimed in the payload', async () => {
    test.slow();

    await test.step('an identity-only post carries the identity tier, not a blank one', async () => {
      const host = await newHost();

      const { status, body: group } = await createGroup(host.accessToken, {
        title: 'Identity Only Group', role: 'tenant',
      });

      expect(status).toBe(201);
      // Present and named. An absent tier would render as an unbadged card that looks the same as
      // a bug, so the floor value is the contract.
      expect(group.verificationTier).toBe('identity');
      expect(group.agreementDeclared).toBe(false);
    });

    await test.step('declaring a rent agreement earns the tenant tier', async () => {
      const host = await newHost();

      const { status, body: group } = await createGroup(host.accessToken, {
        role: 'tenant', ...AGREEMENT_EVIDENCE,
      });

      expect(status).toBe(201);
      expect(group.verificationTier).toBe('tenant');
      expect(group.agreementDeclared).toBe(true);
    });

    await test.step('a tier cannot be claimed in the payload', async () => {
      const host = await newHost();

      const { body: group } = await createGroup(host.accessToken, {
        verificationTier: 'owner', role: 'tenant',
      });

      expect(group.verificationTier).toBe('identity');
    });
  });

  test('a team cannot be hosted as owner, even by the verified owner of the flat', async () => {
    const ownerMobile = uniqueMobile();
    const { accessToken: ownerToken } = await apiLogin(ownerMobile, { name: 'Asha K' });
    const approved = await liveListing(ownerMobile);
    await verifyOwnership(ownerMobile, approved);
    const stranger = await newHost();

    for (const token of [ownerToken, stranger.accessToken]) {
      const { status, body } = await createGroup(token, { role: 'owner', propertyId: approved.id, locality: 'Baner' });
      expect(status).toBe(409);
      expect(body.error).toBe('owner_lists_rooms');
    }
  });

  test('the tier survives seat changes', async ({ page }) => {
    const host = await newHost();
    const { body: group } = await createGroup(host.accessToken, {
      title: 'Immutable Tier Test', locality: 'Kothrud', rent: 28000, seats: 2, seatsOpen: 1,
    });
    const initialTier = group.verificationTier;

    const closed = await setSeats(host.accessToken, group.id, 0);
    expect(closed.status).toBe(200);
    expect((await closed.json()).verificationTier).toBe(initialTier);

    const reopened = await setSeats(host.accessToken, group.id, 1);
    expect(reopened.status).toBe(200);
    expect((await reopened.json()).verificationTier).toBe(initialTier);
  });
});
