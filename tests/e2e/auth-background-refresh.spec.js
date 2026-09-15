import { test, expect } from '@playwright/test';

// Regression coverage for the "Not Connected never changes, no login prompt" bug:
// AuthManager.initializeBackgroundAuth() used to `await` a silent, no-gesture
// popup-based token refresh whenever the stored token had already expired (the
// normal case on almost any return visit). Browsers block that popup, Google
// Identity Services then never calls back, and the awaited promise hung forever -
// wedging the app's entire init() (which awaits initializeBackgroundAuth()) on "Not
// Connected" with no working Sign In button, on every single load. These tests
// reproduce exactly that starting condition - an expired token plus a mocked GIS
// client whose callback is never invoked, simulating a blocked popup - against the
// real running app, and confirm it boots normally instead of hanging.

async function withExpiredTokenAndBlockedPopup(page) {
  // getClientId() needs to actually resolve to something for _performTokenRefresh()
  // to ever reach google.accounts.oauth2.initTokenClient() at all - without this,
  // the test server's missing /api/config 404s, getClientId() resolves null, and the
  // refresh bails out before the popup-blocking scenario this test is about is ever
  // exercised.
  await page.route('**/api/config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ CLIENT_ID: 'test-client-id', API_KEY: 'test-api-key' })
  }));
  // Block the real GIS script too - this sandbox does have outbound network access
  // to accounts.google.com, and the real client loading in would silently overwrite
  // our mock's google.accounts.oauth2 before the automatic startup refresh runs.
  await page.route('https://accounts.google.com/gsi/client', route => route.abort());

  await page.addInitScript(() => {
    window.google = {
      accounts: {
        oauth2: {
          // Simulates a blocked popup: requestAccessToken() never invokes callback
          initTokenClient: (config) => ({ requestAccessToken: () => {} }),
        },
        id: { initialize: () => {}, renderButton: () => {} }
      },
      client: { init: () => {}, load: () => Promise.resolve(), setToken: () => {} }
    };
  });

  await page.goto('/');
  await page.evaluate(() => {
    // A token that expired a day ago - exactly the state in the reported bug
    localStorage.setItem('googleAccessToken', 'stale-expired-token');
    localStorage.setItem('googleTokenExpiry', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    localStorage.setItem('userEmail', 'me@example.com');
  });

  await page.reload();
}

test.describe('Background auth on startup with an expired token', () => {
  test('should finish booting (not hang) when the stored token is expired and the silent refresh popup is blocked', async ({ page }) => {
    await withExpiredTokenAndBlockedPopup(page);
    await page.waitForFunction(() => !!window.workoutTracker, { timeout: 10000 });

    // setupTabs() - which is what wires up tab-button click handling - only runs in
    // init() *after* the line that used to hang forever (awaiting
    // initializeBackgroundAuth()). isSignedIn/the DOM's default markup would look
    // "finished" even while genuinely hung, since they're already false/present
    // before init() ever runs, so this needs an assertion that only comes true once
    // init() has actually gotten past that point: does clicking a tab actually work.
    await page.click('[data-tab="history"]');
    await expect(page.locator('#history-tab')).toHaveClass(/active/, { timeout: 10000 });

    const signInButton = page.locator('#google-signin-button-header');
    await expect(signInButton).toBeVisible();

    const syncText = page.locator('#sync-text');
    await expect(syncText).toContainText('Not Connected');
  });

  test('should clear the stale expired token from localStorage instead of retrying against it forever', async ({ page }) => {
    await withExpiredTokenAndBlockedPopup(page);

    await page.waitForFunction(() => !!window.workoutTracker, { timeout: 10000 });
    await page.waitForFunction(
      () => window.workoutTracker.isSignedIn === false,
      { timeout: 10000 }
    );

    const token = await page.evaluate(() => localStorage.getItem('googleAccessToken'));
    expect(token).toBeNull();
  });

  test('should still allow a fresh sign-in click after booting with an expired token', async ({ page }) => {
    await withExpiredTokenAndBlockedPopup(page);

    await page.waitForFunction(() => !!window.workoutTracker, { timeout: 10000 });
    await page.waitForFunction(
      () => window.workoutTracker.isSignedIn === false,
      { timeout: 10000 }
    );

    // Swap in a working popup mock (as if the earlier blocked one no longer applies
    // once there's a real click) and confirm requestAccessToken() still runs cleanly
    const requestAccessTokenIsCallable = await page.evaluate(async () => {
      window.google.accounts.oauth2.initTokenClient = (config) => ({
        requestAccessToken: () => {
          window.__realClickFlowRan = true;
        }
      });
      window.workoutTracker.googleConfig = { CLIENT_ID: 'fresh-client-id' };
      await window.workoutTracker.requestAccessToken();
      return window.__realClickFlowRan === true;
    });

    expect(requestAccessTokenIsCallable).toBe(true);
  });
});
