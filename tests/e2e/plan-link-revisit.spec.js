import { test, expect } from '@playwright/test';

// Regression coverage: reopening an already-imported plan's shared link - e.g. it's
// bookmarked, or just reused as the regular way back into the app - used to
// unconditionally re-activate that plan on *every* single visit via
// importPlanFromLink()/showPlanImportPreview()'s "already imported" branches, silently
// overriding a manual switch to a different plan. The fix (activatePlanIfNoneActive())
// only auto-activates when nothing else is currently active, so a deliberate choice
// sticks across repeat visits of the same link.

async function setup(page) {
  await page.goto('/');
  await page.waitForFunction(() => !!window.workoutTracker, { timeout: 10000 });
  await page.evaluate(() => {
    localStorage.setItem('googleAccessToken', 'test-token');
    localStorage.setItem('googleTokenExpiry', new Date(Date.now() + 3600000).toISOString());
    localStorage.setItem('userEmail', 'me@example.com');
    localStorage.setItem('staticSheetId', 'my-sheet-id');
  });
  await page.reload();
  await page.waitForFunction(() => !!window.workoutTracker, { timeout: 10000 });
}

function seedPlans() {
  return [
    { id: 'plan_own', name: 'My Own Plan', exerciseSlots: [{ slotNumber: 1, exerciseName: 'Squats' }] },
    {
      id: 'plan_local_shared', name: 'Leg Day', exerciseSlots: [{ slotNumber: 1, exerciseName: 'Lunges' }],
      sourcePlanId: 'plan_trainer_1', sourceCreatorSheetId: 'trainer-sheet-id'
    }
  ];
}

test.describe('Revisiting an already-imported plan link', () => {
  test('should activate it on first visit when nothing else is active', async ({ page }) => {
    await setup(page);

    const activePlanId = await page.evaluate(async (plans) => {
      window.workoutTracker.workoutPlans = plans;
      window.workoutTracker.activePlanId = null;
      window.workoutTracker.loadReceivedPlans = async () => ([
        { planId: 'plan_trainer_1', creatorSheetId: 'trainer-sheet-id', status: 'imported' }
      ]);

      await window.workoutTracker.importPlanFromLink('plan_trainer_1', 'trainer-sheet-id');
      return window.workoutTracker.activePlanId;
    }, seedPlans());

    expect(activePlanId).toBe('plan_local_shared');
  });

  test('should NOT override a manually-selected different plan on a repeat visit', async ({ page }) => {
    await setup(page);

    const activePlanId = await page.evaluate(async (plans) => {
      window.workoutTracker.workoutPlans = plans;
      // User manually switched to their own plan since importing the shared one
      window.workoutTracker.activatePlan('plan_own');
      window.workoutTracker.loadReceivedPlans = async () => ([
        { planId: 'plan_trainer_1', creatorSheetId: 'trainer-sheet-id', status: 'imported' }
      ]);

      // Reopen the same shared link again (e.g. bookmarked, reused as entry point)
      await window.workoutTracker.importPlanFromLink('plan_trainer_1', 'trainer-sheet-id');
      return window.workoutTracker.activePlanId;
    }, seedPlans());

    expect(activePlanId).toBe('plan_own'); // unchanged, not silently switched back
  });

  test('should still re-activate it if the user has no active plan at all', async ({ page }) => {
    await setup(page);

    const activePlanId = await page.evaluate(async (plans) => {
      window.workoutTracker.workoutPlans = plans;
      window.workoutTracker.activePlanId = null;
      window.workoutTracker.loadReceivedPlans = async () => ([
        { planId: 'plan_trainer_1', creatorSheetId: 'trainer-sheet-id', status: 'imported' }
      ]);

      await window.workoutTracker.importPlanFromLink('plan_trainer_1', 'trainer-sheet-id');
      return window.workoutTracker.activePlanId;
    }, seedPlans());

    expect(activePlanId).toBe('plan_local_shared');
  });
});
