import { test, expect } from '@playwright/test';

// Regression coverage for a real bug report: a user opened a shared plan link while
// signed out, saw the "please sign in" alert, signed in successfully afterwards - but
// the plan never showed up anywhere. Root cause: the pending import was only ever
// held in memory (`this.pendingPlanImport`), and on mobile, backgrounding the browser
// tab (e.g. switching apps to send a screenshot) can get it silently discarded/
// reloaded by the OS before sign-in finishes, wiping that value with no error at all.
//
// The full "click Sign In and let the real success chain run" path isn't practical to
// drive deterministically here - it depends on real, unmocked gapi/network calls (see
// plan-import.spec.js's own comment on this same limitation). So, matching that file's
// established convention, the "does resuming actually call importPlanFromLink" part is
// tested by invoking resumePendingPlanImportIfAny() directly rather than through a live
// click - what's actually being regression-tested (recovery from a reload, and that
// resuming calls the right thing) is exercised either way.

async function withPendingImportBlockedGsi(page) {
  // Block the real GIS script - this sandbox has outbound network access to
  // accounts.google.com, and the real client loading in would override any mock.
  await page.route('https://accounts.google.com/gsi/client', route => route.abort());
}

test.describe('Pending plan import survives a reload before sign-in', () => {
  test('should persist the pending import to localStorage when the link is opened signed out', async ({ page }) => {
    await withPendingImportBlockedGsi(page);
    page.on('dialog', async dialog => { await dialog.accept(); });

    await page.goto('/?plan=plan_trainer_1&sheet=trainer-sheet-id');
    await page.waitForFunction(() => !!window.workoutTracker, { timeout: 10000 });
    await page.waitForTimeout(300);

    const saved = await page.evaluate(() => {
      const raw = localStorage.getItem('pendingPlanImport');
      return raw ? JSON.parse(raw) : null;
    });

    expect(saved).toBeTruthy();
    expect(saved.planId).toBe('plan_trainer_1');
    expect(saved.creatorSheetId).toBe('trainer-sheet-id');
  });

  test('should recover the pending import in memory after a reload that drops the ?plan= URL params entirely', async ({ page }) => {
    await withPendingImportBlockedGsi(page);
    page.on('dialog', async dialog => { await dialog.accept(); });

    // Open the shared link while signed out
    await page.goto('/?plan=plan_trainer_1&sheet=trainer-sheet-id');
    await page.waitForFunction(() => !!window.workoutTracker, { timeout: 10000 });
    await page.waitForTimeout(300);

    // Simulate the tab being discarded/reloaded by the OS and coming back to a plain
    // URL with no plan link at all - e.g. restored from a bookmark/history entry
    // instead of the original link. Before this fix, this wiped pendingPlanImport with
    // nothing left anywhere to recover it from.
    await page.goto('/');
    await page.waitForFunction(() => !!window.workoutTracker, { timeout: 10000 });
    await page.waitForTimeout(300);

    const recovered = await page.evaluate(() => window.workoutTracker.pendingPlanImport);
    expect(recovered).toEqual({ planId: 'plan_trainer_1', creatorSheetId: 'trainer-sheet-id' });
  });

  test('should call importPlanFromLink and clear storage when resuming a recovered pending import', async ({ page }) => {
    await withPendingImportBlockedGsi(page);
    page.on('dialog', async dialog => { await dialog.accept(); });

    await page.goto('/');
    await page.waitForFunction(() => !!window.workoutTracker, { timeout: 10000 });

    // Seed a pending import directly (as if recovered from a prior load) and stub out
    // the network-dependent part, then resume it exactly as the real success callback
    // would - this is the part of the fix that runs once sign-in actually succeeds
    const result = await page.evaluate(async () => {
      localStorage.setItem('pendingPlanImport', JSON.stringify({
        planId: 'plan_trainer_1',
        creatorSheetId: 'trainer-sheet-id',
        savedAt: Date.now()
      }));
      window.workoutTracker.pendingPlanImport = { planId: 'plan_trainer_1', creatorSheetId: 'trainer-sheet-id' };

      const calls = [];
      window.workoutTracker.importPlanFromLink = (planId, creatorSheetId) => {
        calls.push({ planId, creatorSheetId });
      };

      await window.workoutTracker.resumePendingPlanImportIfAny();

      return { calls, stillPending: localStorage.getItem('pendingPlanImport'), inMemory: window.workoutTracker.pendingPlanImport };
    });

    expect(result.calls).toEqual([{ planId: 'plan_trainer_1', creatorSheetId: 'trainer-sheet-id' }]);
    expect(result.stillPending).toBeNull();
    expect(result.inMemory).toBeNull();
  });

  test('should not resume an already-expired (>24h old) pending import', async ({ page }) => {
    await withPendingImportBlockedGsi(page);

    await page.goto('/');
    await page.waitForFunction(() => !!window.workoutTracker, { timeout: 10000 });
    await page.evaluate(() => {
      localStorage.setItem('pendingPlanImport', JSON.stringify({
        planId: 'plan_stale',
        creatorSheetId: 'stale-sheet',
        savedAt: Date.now() - 48 * 60 * 60 * 1000 // 2 days ago
      }));
    });

    await page.reload();
    await page.waitForFunction(() => !!window.workoutTracker, { timeout: 10000 });
    await page.waitForTimeout(300);

    // A stale entry should never even make it into memory on load
    const recovered = await page.evaluate(() => window.workoutTracker.pendingPlanImport);
    expect(recovered).toBeNull();

    // And it should have been cleaned up from storage, not left to linger
    const stillThere = await page.evaluate(() => localStorage.getItem('pendingPlanImport'));
    expect(stillThere).toBeNull();
  });
});
