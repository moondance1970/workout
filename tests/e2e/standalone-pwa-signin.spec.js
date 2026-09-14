import { test, expect } from '@playwright/test';

// Regression coverage for the iPhone home-screen-icon sign-in fix: Google Identity
// Services' popup flow calls window.open() under the hood, and window.open() from
// inside a standalone/installed PWA's WKWebView on iOS is a silent no-op - tapping
// "Sign In" does visibly nothing. The fix detects standalone display mode and uses a
// plain top-level OAuth redirect instead, which is just page navigation and works
// fine there. A real cross-origin redirect to accounts.google.com isn't practical to
// drive through Playwright, so these tests exercise the app's own redirect-decision
// and redirect-callback-parsing logic directly - exactly what's being regression
// tested here.

test.describe('Standalone PWA sign-in (redirect fallback)', () => {
  test('should report standalone mode when display-mode: standalone matches', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.workoutTracker, { timeout: 10000 });

    const result = await page.evaluate(() => {
      const originalMatchMedia = window.matchMedia;
      window.matchMedia = (query) => ({ matches: query === '(display-mode: standalone)' });
      try {
        return window.workoutTracker.isStandaloneDisplayMode();
      } finally {
        window.matchMedia = originalMatchMedia;
      }
    });

    expect(result).toBe(true);
  });

  test('should not report standalone mode in a normal browser tab', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.workoutTracker, { timeout: 10000 });

    const result = await page.evaluate(() => {
      const originalMatchMedia = window.matchMedia;
      window.matchMedia = () => ({ matches: false });
      try {
        return window.workoutTracker.isStandaloneDisplayMode();
      } finally {
        window.matchMedia = originalMatchMedia;
      }
    });

    expect(result).toBe(false);
  });

  test('should redirect instead of opening the GIS popup when in standalone mode', async ({ page }) => {
    await page.addInitScript(() => {
      window.google = {
        accounts: {
          oauth2: {
            initTokenClient: () => {
              window.__popupFlowWasUsed = true;
              return { requestAccessToken: () => {} };
            }
          },
          id: { initialize: () => {}, renderButton: () => {} }
        },
        client: { init: () => {}, load: () => Promise.resolve(), setToken: () => {} }
      };
    });
    await page.goto('/');
    await page.waitForFunction(() => !!window.workoutTracker, { timeout: 10000 });

    const result = await page.evaluate(async () => {
      window.workoutTracker.googleConfig = { CLIENT_ID: 'test-client-id' };
      window.__popupFlowWasUsed = false;

      let redirectedTo = null;
      window.workoutTracker.redirectToGoogleSignIn = (clientId, scopes) => {
        redirectedTo = { clientId, scopes };
      };

      const originalMatchMedia = window.matchMedia;
      window.matchMedia = (query) => ({ matches: query === '(display-mode: standalone)' });
      try {
        await window.workoutTracker.requestAccessToken();
      } finally {
        window.matchMedia = originalMatchMedia;
      }

      return { redirectedTo, popupFlowWasUsed: window.__popupFlowWasUsed };
    });

    expect(result.redirectedTo).toBeTruthy();
    expect(result.redirectedTo.clientId).toBe('test-client-id');
    expect(result.popupFlowWasUsed).toBe(false);
  });

  test('should still use the popup flow in a normal (non-standalone) tab', async ({ page }) => {
    // Block the real GIS script so it can't load in and overwrite window.google.accounts
    // out from under our mock - this env sometimes does have outbound network access to
    // accounts.google.com, and the real client would silently swallow the fake client_id
    // used below instead of exercising the mock this test is actually checking.
    await page.route('https://accounts.google.com/gsi/client', route => route.abort());
    await page.addInitScript(() => {
      window.google = {
        accounts: {
          oauth2: {
            initTokenClient: () => {
              window.__popupFlowWasUsed = true;
              return { requestAccessToken: () => {} };
            }
          },
          id: { initialize: () => {}, renderButton: () => {} }
        },
        client: { init: () => {}, load: () => Promise.resolve(), setToken: () => {} }
      };
    });
    await page.goto('/');
    await page.waitForFunction(() => !!window.workoutTracker, { timeout: 10000 });

    const result = await page.evaluate(async () => {
      window.workoutTracker.googleConfig = { CLIENT_ID: 'test-client-id' };
      window.__popupFlowWasUsed = false;

      let redirectCalled = false;
      window.workoutTracker.redirectToGoogleSignIn = () => { redirectCalled = true; };

      const originalMatchMedia = window.matchMedia;
      window.matchMedia = () => ({ matches: false });
      try {
        await window.workoutTracker.requestAccessToken();
      } finally {
        window.matchMedia = originalMatchMedia;
      }

      return { redirectCalled, popupFlowWasUsed: window.__popupFlowWasUsed };
    });

    expect(result.redirectCalled).toBe(false);
    expect(result.popupFlowWasUsed).toBe(true);
  });

  test('should parse an access token from the OAuth redirect hash and restore the prior URL', async ({ page }) => {
    const state = encodeURIComponent(JSON.stringify({ returnSearch: '?plan=p1&sheet=s1' }));
    await page.goto(`/#access_token=test-redirect-token&expires_in=3599&token_type=Bearer&state=${state}`);
    await page.waitForFunction(() => !!window.workoutTracker, { timeout: 10000 });

    const token = await page.evaluate(() => localStorage.getItem('googleAccessToken'));
    expect(token).toBe('test-redirect-token');

    // The hash should be stripped and the original query string restored
    const url = new URL(page.url());
    expect(url.hash).toBe('');
    expect(url.search).toBe('?plan=p1&sheet=s1');
  });

  test('should ignore an unrelated hash on load', async ({ page }) => {
    await page.goto('/#some-other-anchor');
    await page.waitForFunction(() => !!window.workoutTracker, { timeout: 10000 });

    const token = await page.evaluate(() => localStorage.getItem('googleAccessToken'));
    expect(token).toBeNull();

    const url = new URL(page.url());
    expect(url.hash).toBe('#some-other-anchor');
  });
});
