import { test, expect } from '@playwright/test';

// Coverage for the "fully offline mode" feature: a durable local store (separate
// from the existing TTL cache) plus a deliberate switch that lets startSession()/
// endSession() skip every network call entirely, with an automatic newest-wins
// reconnect sync and an auto-fallback for genuine connectivity loss even with the
// switch left off. See /home/oren/.claude/plans/starry-herding-blossom.md.

async function gotoAndWait(page) {
  await page.goto('/');
  await page.waitForFunction(() => !!window.workoutTracker, { timeout: 10000 });
}

test.describe('Offline-mode toggle visibility', () => {
  test('should be hidden before any sheet has ever been connected', async ({ page }) => {
    await gotoAndWait(page);
    const display = await page.evaluate(() =>
      getComputedStyle(document.getElementById('offline-mode-wrapper')).display
    );
    expect(display).toBe('none');
  });

  test('should appear once a static or sessions sheet ID has been resolved', async ({ page }) => {
    await gotoAndWait(page);
    const display = await page.evaluate(() => {
      window.workoutTracker.staticSheetId = 'fake-static-sheet';
      window.workoutTracker.updateHeaderButtons();
      return getComputedStyle(document.getElementById('offline-mode-wrapper')).display;
    });
    expect(display).toBe('inline-flex');
  });
});

test.describe('Toggling offline mode', () => {
  test('should refuse to enable while a session is active, and revert the checkbox', async ({ page }) => {
    await gotoAndWait(page);

    const result = await page.evaluate(async () => {
      window.workoutTracker.staticSheetId = 'fake-static-sheet';
      window.workoutTracker.updateHeaderButtons();
      window.workoutTracker.sessionActive = true;
      document.getElementById('offline-mode-toggle').checked = true;

      let alerted = false;
      window.alert = () => { alerted = true; };

      await window.workoutTracker.enableOfflineMode();

      return {
        alerted,
        offlineModeEnabled: window.workoutTracker.offlineModeEnabled,
        toggleChecked: document.getElementById('offline-mode-toggle').checked
      };
    });

    expect(result.alerted).toBe(true);
    expect(result.offlineModeEnabled).toBe(false);
    expect(result.toggleChecked).toBe(false);
  });

  test('should enable, persist, and seed the durable store from in-memory data on first use', async ({ page }) => {
    await gotoAndWait(page);

    const result = await page.evaluate(async () => {
      window.workoutTracker.staticSheetId = 'fake-static-sheet';
      window.workoutTracker.sessions = [{ date: '2026-11-16', exercises: [] }];
      window.workoutTracker.exerciseList = [{ name: 'Squats', isAerobic: false }];
      window.workoutTracker.workoutPlans = [];

      await window.workoutTracker.enableOfflineMode();

      return {
        offlineModeEnabled: window.workoutTracker.offlineModeEnabled,
        persisted: localStorage.getItem('offlineModeEnabled'),
        offlineSessions: window.cacheManager.getOfflineData('sessions').value,
        offlineExercises: window.cacheManager.getOfflineData('exercises').value
      };
    });

    expect(result.offlineModeEnabled).toBe(true);
    expect(result.persisted).toBe('true');
    expect(result.offlineSessions).toEqual([{ date: '2026-11-16', exercises: [] }]);
    expect(result.offlineExercises).toEqual([{ name: 'Squats', isAerobic: false }]);
  });

  test('should visibly highlight the toggle (checked + active class) when enabled, and clear it when disabled', async ({ page }) => {
    // Regression coverage for "isn't clear if you are or not" - the switch must be
    // unambiguous at a glance, not just technically checked under the hood.
    await gotoAndWait(page);

    const afterEnable = await page.evaluate(async () => {
      window.workoutTracker.staticSheetId = 'fake-static-sheet';
      await window.workoutTracker.enableOfflineMode();
      const wrapper = document.getElementById('offline-mode-wrapper');
      return {
        checked: document.getElementById('offline-mode-toggle').checked,
        hasActiveClass: wrapper.classList.contains('offline-mode-active')
      };
    });
    expect(afterEnable.checked).toBe(true);
    expect(afterEnable.hasActiveClass).toBe(true);

    const afterDisable = await page.evaluate(async () => {
      window.workoutTracker.getSessionsSheetId = () => null;
      window.workoutTracker.getStaticSheetId = () => null; // no sheets to reconcile against
      window.workoutTracker.initGoogleSheets = async () => {};
      window.workoutTracker.isSignedIn = true;
      window.workoutTracker.googleToken = 'fake-token';

      await window.workoutTracker.disableOfflineMode();
      const wrapper = document.getElementById('offline-mode-wrapper');
      return {
        checked: document.getElementById('offline-mode-toggle').checked,
        hasActiveClass: wrapper.classList.contains('offline-mode-active')
      };
    });
    expect(afterDisable.checked).toBe(false);
    expect(afterDisable.hasActiveClass).toBe(false);
  });
});

test.describe('startSession() in offline mode - the actual bug this fixes', () => {
  test('should never call requestAccessTokenPromise/initGoogleSheets/syncFromSheet', async ({ page }) => {
    await gotoAndWait(page);

    const result = await page.evaluate(async () => {
      // Seed durable data and enable offline mode
      window.cacheManager.setOfflineData('sessions', [{ date: '2026-11-16', exercises: [] }], { touchLocal: true, touchSynced: true });
      window.cacheManager.setOfflineData('exercises', [{ name: 'Squats', isAerobic: false }], { touchLocal: true, touchSynced: true });
      window.cacheManager.setOfflineData('plans', [], { touchLocal: true, touchSynced: true });
      window.workoutTracker.offlineModeEnabled = true;

      // Today, calling startSession() while signed out always hits
      // requestAccessTokenPromise() first - stub these to prove the offline branch
      // never reaches them
      let requestAccessTokenCalled = false;
      let initGoogleSheetsCalled = false;
      let syncFromSheetCalled = false;
      window.workoutTracker.requestAccessTokenPromise = async () => { requestAccessTokenCalled = true; return false; };
      window.workoutTracker.initGoogleSheets = async () => { initGoogleSheetsCalled = true; };
      window.workoutTracker.syncFromSheet = async () => { syncFromSheetCalled = true; };

      await window.workoutTracker.startSession();

      return {
        requestAccessTokenCalled,
        initGoogleSheetsCalled,
        syncFromSheetCalled,
        sessionActive: window.workoutTracker.sessionActive,
        exerciseListLen: window.workoutTracker.exerciseList.length
      };
    });

    expect(result.requestAccessTokenCalled).toBe(false);
    expect(result.initGoogleSheetsCalled).toBe(false);
    expect(result.syncFromSheetCalled).toBe(false);
    expect(result.sessionActive).toBe(true);
    expect(result.exerciseListLen).toBe(1);
  });

  test('should also take the offline path when the switch is off but navigator reports no connectivity (auto-fallback)', async ({ page }) => {
    await gotoAndWait(page);

    const result = await page.evaluate(async () => {
      window.cacheManager.setOfflineData('sessions', [], { touchLocal: true, touchSynced: true });
      window.cacheManager.setOfflineData('exercises', [{ name: 'Lunges', isAerobic: false }], { touchLocal: true, touchSynced: true });
      window.cacheManager.setOfflineData('plans', [], { touchLocal: true, touchSynced: true });

      // Switch left OFF, but the browser itself reports no connectivity. Dispatch a
      // real 'offline' event rather than poking a flag directly - window.cacheManager
      // (global) and window.workoutTracker.cacheManager are two separate CacheManager
      // instances (a pre-existing quirk, unrelated to this feature), each with their
      // own online/offline listener, so only a real event reliably updates the one
      // isEffectivelyOffline() actually reads.
      window.workoutTracker.offlineModeEnabled = false;
      window.dispatchEvent(new Event('offline'));

      let requestAccessTokenCalled = false;
      window.workoutTracker.requestAccessTokenPromise = async () => { requestAccessTokenCalled = true; return false; };

      await window.workoutTracker.startSession();

      return {
        requestAccessTokenCalled,
        sessionActive: window.workoutTracker.sessionActive,
        exerciseListLen: window.workoutTracker.exerciseList.length
      };
    });

    expect(result.requestAccessTokenCalled).toBe(false);
    expect(result.sessionActive).toBe(true);
    expect(result.exerciseListLen).toBe(1);
  });
});

test.describe('reconcileOnReconnect() - the real method, not just the unit-test shadow', () => {
  // getSheetModifiedTime()/syncToSheet()/etc. all need real gapi, which isn't
  // mockable in this suite's e2e layer (see plan-import.spec.js's own note on this
  // limitation) - so these stub just those leaf calls and drive reconcileOnReconnect()
  // itself for real, confirming its push/pull/no-op wiring actually works end to end.

  test('should push when only local changed since the last sync', async ({ page }) => {
    await gotoAndWait(page);

    const result = await page.evaluate(async () => {
      window.cacheManager.setOfflineData('sessions', [{ date: '2026-11-16', exercises: [] }], { touchLocal: true, touchSynced: true });
      // A later local edit, after the sync above
      await new Promise(r => setTimeout(r, 5));
      window.cacheManager.setOfflineData('sessions', [{ date: '2026-11-16', exercises: [{ name: 'Squats' }] }], { touchLocal: true, touchSynced: false });

      window.workoutTracker.getSessionsSheetId = () => 'fake-sessions-sheet';
      window.workoutTracker.getStaticSheetId = () => null;
      window.workoutTracker.initGoogleSheets = async () => {};
      // Remote hasn't changed since the (now-stale) lastSyncedAt
      window.workoutTracker.getSheetModifiedTime = async () => 0;

      let pushed = false;
      let pulled = false;
      window.workoutTracker.syncToSheet = async () => { pushed = true; };
      window.workoutTracker.loadSessionsFromSheet = async () => { pulled = true; return []; };

      await window.workoutTracker.reconcileOnReconnect();
      return { pushed, pulled };
    });

    expect(result.pushed).toBe(true);
    expect(result.pulled).toBe(false);
  });

  test('should pull when only the remote sheet changed since the last sync', async ({ page }) => {
    await gotoAndWait(page);

    const result = await page.evaluate(async () => {
      window.cacheManager.setOfflineData('sessions', [{ date: '2026-11-16', exercises: [] }], { touchLocal: true, touchSynced: true });

      window.workoutTracker.getSessionsSheetId = () => 'fake-sessions-sheet';
      window.workoutTracker.getStaticSheetId = () => null;
      window.workoutTracker.initGoogleSheets = async () => {};
      // Remote modifiedTime far in the future - definitely changed since lastSyncedAt
      window.workoutTracker.getSheetModifiedTime = async () => Date.now() + 1_000_000;

      const pulledSessions = [{
        date: '2026-11-17',
        exercises: [{ name: 'Pulled from sheet', weights: [40], reps: [10], sets: 1, difficulty: 'medium', notes: '' }]
      }];
      let pushed = false;
      window.workoutTracker.syncToSheet = async () => { pushed = true; };
      window.workoutTracker.loadSessionsFromSheet = async () => pulledSessions;

      await window.workoutTracker.reconcileOnReconnect();

      return {
        pushed,
        sessions: window.workoutTracker.sessions,
        offlineRecord: window.cacheManager.getOfflineData('sessions')
      };
    });

    expect(result.pushed).toBe(false);
    expect(result.sessions).toEqual([{
      date: '2026-11-17',
      exercises: [{ name: 'Pulled from sheet', weights: [40], reps: [10], sets: 1, difficulty: 'medium', notes: '' }]
    }]);
    // Pulling should mark it as reconciled (touchSynced:true) going forward
    expect(result.offlineRecord.lastLocalModifiedAt).toBe(result.offlineRecord.lastSyncedAt);
  });

  test('should no-op when neither side changed since the last sync', async ({ page }) => {
    await gotoAndWait(page);

    const result = await page.evaluate(async () => {
      window.cacheManager.setOfflineData('sessions', [{ date: '2026-11-16', exercises: [] }], { touchLocal: true, touchSynced: true });

      window.workoutTracker.getSessionsSheetId = () => 'fake-sessions-sheet';
      window.workoutTracker.getStaticSheetId = () => null;
      window.workoutTracker.initGoogleSheets = async () => {};
      window.workoutTracker.getSheetModifiedTime = async () => 0; // Older than lastSyncedAt

      let pushed = false;
      let pulled = false;
      window.workoutTracker.syncToSheet = async () => { pushed = true; };
      window.workoutTracker.loadSessionsFromSheet = async () => { pulled = true; return []; };

      await window.workoutTracker.reconcileOnReconnect();
      return { pushed, pulled };
    });

    expect(result.pushed).toBe(false);
    expect(result.pulled).toBe(false);
  });
});

test.describe('endSession() in offline mode', () => {
  test('should write back to the durable store and leave it dirty for a later reconcile', async ({ page }) => {
    await gotoAndWait(page);

    const result = await page.evaluate(async () => {
      window.cacheManager.setOfflineData('sessions', [], { touchLocal: true, touchSynced: true });
      window.cacheManager.setOfflineData('exercises', [], { touchLocal: true, touchSynced: true });
      window.cacheManager.setOfflineData('plans', [], { touchLocal: true, touchSynced: true });
      window.workoutTracker.offlineModeEnabled = true;
      window.workoutTracker.sessionActive = true;
      window.workoutTracker.sessions = [{ date: '2026-11-16', exercises: [{ name: 'Squats' }] }];

      let syncToSheetCalled = false;
      window.workoutTracker.syncToSheet = async () => { syncToSheetCalled = true; };

      await window.workoutTracker.endSession();

      const offlineSessions = window.cacheManager.getOfflineData('sessions');
      return {
        syncToSheetCalled,
        sessionActive: window.workoutTracker.sessionActive,
        value: offlineSessions.value,
        dirty: offlineSessions.lastLocalModifiedAt > (offlineSessions.lastSyncedAt ?? 0)
      };
    });

    expect(result.syncToSheetCalled).toBe(false);
    expect(result.sessionActive).toBe(false);
    expect(result.value).toEqual([{ date: '2026-11-16', exercises: [{ name: 'Squats' }] }]);
    expect(result.dirty).toBe(true);
  });
});
