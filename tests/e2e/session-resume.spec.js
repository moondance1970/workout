import { test, expect } from '@playwright/test';

// Regression coverage for a real bug report: logged 2 exercises, closed the app
// mid-session, reopened it - the "Start Session" button reappeared instead of
// resuming, even though the session itself (today's logged exercises) was still
// right there. Root cause: sessionActive was in-memory only, reset to false on
// every fresh load regardless of whether a session was genuinely still active.

async function gotoAndWait(page) {
  await page.goto('/');
  await page.waitForFunction(() => !!window.workoutTracker, { timeout: 10000 });
}

test.describe('Resuming an active session across a reload', () => {
  test('should show "End Session" (not "Start Session") on reload when a session was left active today', async ({ page }) => {
    await gotoAndWait(page);

    // Simulate: offline mode, a session was started (2 exercises logged), then the
    // app was closed mid-session - sessionActive persisted as true for today
    await page.evaluate(() => {
      window.workoutTracker.staticSheetId = 'fake-static-sheet';
      window.cacheManager.setOfflineData('sessions', [{
        date: new Date().toISOString().split('T')[0],
        exercises: [{ name: 'Squats', weights: [40], reps: [10], sets: 1 }, { name: 'Lunges', weights: [20], reps: [12], sets: 1 }]
      }], { touchLocal: true, touchSynced: true });
      window.cacheManager.setOfflineData('exercises', [], { touchLocal: true, touchSynced: true });
      window.cacheManager.setOfflineData('plans', [], { touchLocal: true, touchSynced: true });

      localStorage.setItem('offlineModeEnabled', 'true');
      localStorage.setItem('sessionActive', 'true');
      localStorage.setItem('sessionActiveDate', new Date().toISOString().split('T')[0]);
    });

    // Reload - this is the "closed and reopened the app" moment
    await page.reload();
    await page.waitForFunction(() => !!window.workoutTracker, { timeout: 10000 });
    await page.waitForTimeout(300);

    const state = await page.evaluate(() => ({
      sessionActive: window.workoutTracker.sessionActive,
      sessionBtnText: document.getElementById('session-btn').textContent,
      startSessionBtnText: document.getElementById('start-session-btn').textContent,
      saveWorkoutDisplay: getComputedStyle(document.getElementById('save-workout')).display,
      exerciseCount: window.workoutTracker.currentSession.exercises.length
    }));

    expect(state.sessionActive).toBe(true);
    expect(state.sessionBtnText).toContain('End Session');
    expect(state.startSessionBtnText).toContain('End Session');
    expect(state.saveWorkoutDisplay).not.toBe('none');
    expect(state.exerciseCount).toBe(2); // the 2 logged exercises are still there
  });

  test('should NOT resume a stale active flag left over from a previous day', async ({ page }) => {
    await gotoAndWait(page);

    await page.evaluate(() => {
      window.workoutTracker.staticSheetId = 'fake-static-sheet';
      window.cacheManager.setOfflineData('sessions', [], { touchLocal: true, touchSynced: true });
      window.cacheManager.setOfflineData('exercises', [], { touchLocal: true, touchSynced: true });
      window.cacheManager.setOfflineData('plans', [], { touchLocal: true, touchSynced: true });

      localStorage.setItem('offlineModeEnabled', 'true');
      localStorage.setItem('sessionActive', 'true');
      localStorage.setItem('sessionActiveDate', '2020-01-01'); // long-ago stale date
    });

    await page.reload();
    await page.waitForFunction(() => !!window.workoutTracker, { timeout: 10000 });
    await page.waitForTimeout(300);

    const state = await page.evaluate(() => ({
      sessionActive: window.workoutTracker.sessionActive,
      persistedSessionActive: localStorage.getItem('sessionActive')
    }));

    expect(state.sessionActive).toBe(false);
    expect(state.persistedSessionActive).toBe('false'); // cleaned up, not left dangling
  });

  test('should not rotate the plan again when resuming (only when actually starting)', async ({ page }) => {
    await gotoAndWait(page);

    await page.evaluate(() => {
      window.workoutTracker.staticSheetId = 'fake-static-sheet';
      const plans = [
        { id: 'plan_a', name: 'Plan A', exerciseSlots: [] },
        { id: 'plan_b', name: 'Plan B', exerciseSlots: [] }
      ];
      window.cacheManager.setOfflineData('sessions', [], { touchLocal: true, touchSynced: true });
      window.cacheManager.setOfflineData('exercises', [], { touchLocal: true, touchSynced: true });
      window.cacheManager.setOfflineData('plans', plans, { touchLocal: true, touchSynced: true });

      localStorage.setItem('offlineModeEnabled', 'true');
      localStorage.setItem('sessionActive', 'true');
      localStorage.setItem('sessionActiveDate', new Date().toISOString().split('T')[0]);
      localStorage.setItem('currentPlanIndex', '0'); // Plan A was active when the session started
    });

    await page.reload();
    await page.waitForFunction(() => !!window.workoutTracker, { timeout: 10000 });
    await page.waitForTimeout(300);

    const activePlanId = await page.evaluate(() => window.workoutTracker.activePlanId);
    expect(activePlanId).toBe('plan_a'); // still Plan A, not rotated to Plan B
  });
});
