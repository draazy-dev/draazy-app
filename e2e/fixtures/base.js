// Specs import { test, expect } from here, not '@playwright/test', to get the consoleErrors and login fixtures
// and the settle() request tracker.

import { test as base, expect } from '@playwright/test';
import { trackErrors } from '../helpers/console.js';
import { tracker } from '../helpers/settle.js';
import * as auth from '../helpers/auth.js';

export const test = base.extend({
  // Installed before the first navigation so settle() also waits on requests already in flight.
  page: async ({ page }, use) => {
    tracker(page);
    await use(page);
  },
  consoleErrors: async ({ page }, use) => {
    const errors = trackErrors(page);
    await use(errors);
  },
  login: async ({ page }, use) => {
    await use({
      asBuyer: (over, opts) => auth.loginAsBuyer(page, over, opts),
      asOwner: (over, opts) => auth.loginAsOwner(page, over, opts),
      asTenant: (over, opts) => auth.loginAsTenant(page, over, opts),
      asAdmin: () => auth.loginAsAdmin(page),
      asStaff: (team) => auth.loginAsStaff(page, team),
      asManager: (label) => auth.loginAsManager(page, label),
    });
  },
});

export { expect };
