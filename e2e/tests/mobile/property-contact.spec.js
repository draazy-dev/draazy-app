import { test, expect } from '../../fixtures/live.js';
import { trackErrors } from '../../helpers/console.js';
import { expectFloatingCard } from '../../helpers/floatCard.js';

/* With the keyboard up a 640px phone leaves ~300px, so the enquiry form must stay a bounded floating card.
   Desktop's centred dialog is asserted in desktop-noleak-guardrails.spec.js. */

const PROP = 'p5000'; // approved seed listing, same one contact-owner-gate.spec.js uses. Lower-case:
                      // the server matches the slug exactly, and `P5000` is a 404.

/** The contact gate is a different journey, covered by contact-owner-gate; only the cookie bar is
    seeded here, because it is bottom-anchored over the sticky CTA this spec measures. */
async function withConsent(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('dz_cookie_consent_v1', JSON.stringify({ necessary: true, functional: true, analytics: true, marketing: true, version: 1, ts: Date.now() }));
    } catch { /* storage unavailable — the cookie bar just stays up */ }
  });
}

/* The enquiry form only shows with `inAppMessaging` OFF (else Contact Owner opens /messages). The flag is a
   per-worker server row, so every test that needs the form sets it itself rather than relying on a neighbour. */

/** Opens the enquiry sheet the way a user does: the sticky CTA, not a direct URL. */
async function openContactSheet(page, flags) {
  await flags.disable('inAppMessaging');
  await page.goto(`/property/${PROP}`);
  const cta = page.locator('.dz-sticky-cta').getByRole('button', { name: /contact owner/i });
  await cta.waitFor({ timeout: 15000 });
  await cta.click();
  const panel = page.locator('.dz-modal');
  await panel.waitFor({ timeout: 10000 });
  /* The card enters with `dzFloatIn`; measuring synchronously catches it mid-animation, and every
     geometry assertion below then fails for a reason that has nothing to do with layout. */
  await page.evaluate(() => {
    const back = document.querySelector('.dz-modal-backdrop');
    if (!back) return undefined;
    return Promise.all(back.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {})));
  });
  return panel;
}

test.describe('Mobile property contact', () => {
  test('the sticky CTA stays in the viewport while the page scrolls', async ({ page, login, flags }) => {
    // The property page is one of the longest in the app; the whole point of the
    // sticky bar is that Contact never scrolls away from the thumb.
    await withConsent(page);
    await login.asBuyer();
    await page.goto(`/property/${PROP}`);
    const bar = page.locator('.dz-sticky-cta');
    await bar.waitFor({ timeout: 15000 });

    const viewportH = page.viewportSize().height;
    for (const y of [0, 1200, 4000]) {
      await page.evaluate((to) => window.scrollTo(0, to), y);
      await page.waitForTimeout(120);
      const box = await bar.boundingBox();
      expect(box, `sticky CTA present after scrolling to ${y}`).not.toBeNull();
      expect(box.y, `CTA still on screen at scrollY=${y}`).toBeLessThan(viewportH);
      expect(box.y + box.height, `CTA not pushed below the fold at scrollY=${y}`)
        .toBeGreaterThan(0);
    }
  });

  test('the enquiry overlay is a bounded floating card that keeps its submit, keyboard hint and close control reachable', async ({ page, login, flags }) => {
    const errors = trackErrors(page);
    await withConsent(page);
    await login.asBuyer();
    await openContactSheet(page, flags);

    await test.step('the enquiry overlay opens as a floating card, not a centred dialog', async () => {
      const box = await expectFloatingCard(page, page.locator('.dz-modal'));
      // The page must stay visible behind it, so it reads as a card over content rather than a takeover.
      expect(box.height, 'card is bounded, not full-screen').toBeLessThan(page.viewportSize().height);
    });

    await test.step('the card scrolls internally instead of growing past the viewport', async () => {
      // An unbounded panel pushes its own submit off-screen.
      const r = await page.evaluate(() => {
        const panel = document.querySelector('.dz-modal');
        return {
          overflowY: getComputedStyle(panel).overflowY,
          bottom: panel.getBoundingClientRect().bottom,
          viewportH: window.innerHeight,
        };
      });

      expect(['auto', 'scroll'], 'the panel owns its own scroll').toContain(r.overflowY);
      expect(r.bottom, 'the panel never extends past the viewport').toBeLessThanOrEqual(r.viewportH + 1);
    });

    await test.step('the message field asks the keyboard for a send key', async () => {
      // enterKeyHint is the difference between a generic "return" and a labelled action on the soft keyboard.
      await expect(page.locator('.dz-modal textarea')).toHaveAttribute('enterkeyhint', 'send');
    });

    await test.step('the close control clears the touch minimum', async () => {
      const box = await page.locator('.dz-modal-x').first().boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    });

    await test.step('the submit stays reachable once the message field has focus', async () => {
      // Playwright cannot raise a real soft keyboard, so the proxy is: focus the textarea, then assert
      // the send button is inside the panel's scrollport. Unreachable here means unreachable with 300px usable.
      const textarea = page.locator('.dz-modal textarea');
      await expect(textarea).toBeVisible();
      await textarea.click();
      await textarea.fill('Is this still available for viewing this weekend?');

      const send = page.locator('.dz-modal').getByRole('button', { name: /send enquiry/i });
      await send.scrollIntoViewIfNeeded();
      await expect(send).toBeInViewport();

      const box = await send.boundingBox();
      expect(box.height, 'the primary action clears the touch floor').toBeGreaterThanOrEqual(44);
    });

    expect(errors, 'opening the sheet does not log console errors').toEqual([]);
  });
  /* The owner card is `lg:` only, so on a phone this card is its sole surface. Absence is asserted after the
     card has shown the button and closed, so a zero count cannot be a not-fetched-yet reading. */
  test('the owner card lives in the sheet and nowhere else on the page', async ({ page, login, flags }) => {
    await withConsent(page);
    await login.asBuyer();

    const panel = await openContactSheet(page, flags);
    await expect(panel.getByRole('button', { name: /request number/i })).toBeVisible();
    await expect(panel.getByTestId('contacts-left'), 'the free-contact countdown comes with it').toBeVisible();
    await expect(panel.getByRole('link', { name: /profile/i })).toBeVisible();
    await expect(panel.getByRole('link', { name: /KYC done/i })).toBeVisible();

    await page.locator('.dz-modal-x').first().click();
    await expect(panel).toHaveCount(0);
    /* `:visible`, not a count: the sidebar card is `hidden lg:block`, so below `lg` it is still in
       the DOM and only `display: none`. A bare count would fail against a card nobody can see. */
    await expect(page.locator('.dz-owner-rail:visible'), 'no inline owner card on a phone').toHaveCount(0);
    await expect(page.locator('[data-testid="contacts-left"]:visible')).toHaveCount(0);
  });
});
