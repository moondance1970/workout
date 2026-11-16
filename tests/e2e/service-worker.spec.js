import { test, expect } from '@playwright/test';

// Coverage for the app-shell Service Worker (service-worker.js): the page itself
// must open with zero connectivity, not just its data. Note: browserContext.
// setOffline() turned out NOT to be a reliable way to test this in this Playwright/
// Chromium combination - it fails the top-level navigation before the service worker
// gets a chance to intercept it (confirmed separately: the exact same scenario
// genuinely works when verified by other means). Blocking every request via
// page.route(...).abort() instead exercises the real cache-first fetch handler and is
// what actually proves the behavior.

async function waitForServiceWorkerActive(page) {
  for (let i = 0; i < 30; i++) {
    const active = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return !!reg?.active;
    });
    if (active) return true;
    await page.waitForTimeout(300);
  }
  return false;
}

test.describe('App-shell Service Worker', () => {
  test('should register and activate, caching the app shell files', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.workoutTracker, { timeout: 10000 });

    const activated = await waitForServiceWorkerActive(page);
    expect(activated).toBe(true);

    const cached = await page.evaluate(async () => {
      const names = await caches.keys();
      const allPaths = [];
      for (const name of names) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        allPaths.push(...keys.map(k => new URL(k.url).pathname));
      }
      return allPaths;
    });

    for (const expected of ['/index.html', '/app.js', '/styles.css', '/cache-manager.js', '/auth-manager.js', '/manifest.json']) {
      expect(cached).toContain(expected);
    }
  });

  test('should still open the app when every network request is blocked', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.workoutTracker, { timeout: 10000 });
    await waitForServiceWorkerActive(page);

    // Simulate zero connectivity at the request level - this is what actually
    // exercises the service worker's cache-first fetch handler (see note above)
    await page.route('**/*', route => route.abort('internetdisconnected'));

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 10000 });

    const h1 = await page.evaluate(() => document.querySelector('h1')?.textContent);
    expect(h1).toContain('Workout Tracker');

    const trackerBooted = await page.evaluate(() => new Promise((resolve) => {
      let tries = 0;
      const check = () => {
        if (window.workoutTracker || tries > 20) resolve(!!window.workoutTracker);
        else { tries++; setTimeout(check, 200); }
      };
      check();
    }));
    expect(trackerBooted).toBe(true);
  });

  test('should not intercept cross-origin requests (Google scripts, Chart.js)', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.workoutTracker, { timeout: 10000 });
    await waitForServiceWorkerActive(page);

    const cached = await page.evaluate(async () => {
      const names = await caches.keys();
      const allUrls = [];
      for (const name of names) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        allUrls.push(...keys.map(k => k.url));
      }
      return allUrls;
    });

    const crossOriginCached = cached.filter(url => !url.startsWith(new URL(page.url()).origin));
    expect(crossOriginCached).toEqual([]);
  });
});
