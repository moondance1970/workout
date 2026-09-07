import { test, expect } from '@playwright/test';

// Signs the page in and waits for the app to finish booting. The cross-account
// fetch-plan-from-a-trainer's-sheet step itself isn't practical to drive through a
// real browser here (it needs the live Google API client, which none of this suite's
// e2e tests mock - see plan-sharing.test.js for that layer's coverage instead). This
// exercises the import preview modal directly via the running app instance, which is
// exactly what's being regression-tested: does it close, and does it avoid duplicates.
async function signInAndWaitForApp(page) {
  await page.addInitScript(() => {
    window.google = {
      accounts: {
        oauth2: { initTokenClient: () => ({ requestAccessToken: () => {} }) },
        id: { initialize: () => {}, renderButton: () => {} }
      },
      client: { init: () => {}, load: () => Promise.resolve(), setToken: () => {} }
    };
  });

  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('googleAccessToken', 'test-token');
    localStorage.setItem('googleTokenExpiry', new Date(Date.now() + 3600000).toISOString());
    localStorage.setItem('userEmail', 'me@example.com');
    localStorage.setItem('staticSheetId', 'my-sheet-id');
  });

  page.on('dialog', async dialog => { await dialog.accept(); });

  await page.reload();
  await page.waitForFunction(() => !!window.workoutTracker, { timeout: 10000 });
}

function samplePlan(id = 'plan_trainer_1') {
  return {
    id,
    name: 'Leg Day',
    exerciseSlots: [{ slotNumber: 1, exerciseName: 'Squats' }],
    createdAt: new Date().toISOString(),
    createdBy: 'trainer@example.com',
    creatorSheetId: 'trainer-sheet-id'
  };
}

test.describe('Plan Import Preview Modal', () => {
  test.beforeEach(async ({ page }) => {
    await signInAndWaitForApp(page);
  });

  test('should close the modal after clicking Import', async ({ page }) => {
    await page.evaluate((plan) => {
      window.workoutTracker.showPlanImportPreview(plan, plan.creatorSheetId);
    }, samplePlan());

    await page.waitForSelector('#preview-import-btn', { state: 'visible' });
    await page.click('#preview-import-btn');

    await expect(page.locator('#preview-import-btn')).toHaveCount(0, { timeout: 10000 });
  });

  test('should disable the buttons immediately on click, before the async import finishes', async ({ page }) => {
    await page.evaluate((plan) => {
      window.workoutTracker.showPlanImportPreview(plan, plan.creatorSheetId);
    }, samplePlan());

    await page.waitForSelector('#preview-import-btn', { state: 'visible' });
    const importBtn = page.locator('#preview-import-btn');
    await importBtn.click();

    // Right after the click, the button should already be disabled (or the modal
    // already gone) - not still sitting there fully clickable
    const stillClickable = await page.evaluate(() => {
      const btn = document.getElementById('preview-import-btn');
      return !!btn && !btn.disabled;
    });
    expect(stillClickable).toBe(false);
  });

  test('should only import the plan once, even when Import is clicked twice in a row', async ({ page }) => {
    const plan = samplePlan('plan_trainer_dup');
    await page.evaluate((plan) => {
      window.workoutTracker.showPlanImportPreview(plan, plan.creatorSheetId);
    }, plan);

    await page.waitForSelector('#preview-import-btn', { state: 'visible' });

    // Fire two clicks back-to-back on the same element, before either has a chance
    // to disable it or remove the modal
    await page.evaluate(() => {
      const btn = document.getElementById('preview-import-btn');
      btn.click();
      btn.click();
    });

    await expect(page.locator('#preview-import-btn')).toHaveCount(0, { timeout: 10000 });

    const planCount = await page.evaluate(() =>
      window.workoutTracker.workoutPlans.filter(p => p.name === 'Leg Day').length
    );
    expect(planCount).toBe(1);
  });

  test('should not import a second copy on a later call for the same plan+creator', async ({ page }) => {
    const plan = samplePlan('plan_trainer_revisit');

    // First "visit": import it
    await page.evaluate((plan) => {
      window.workoutTracker.showPlanImportPreview(plan, plan.creatorSheetId);
    }, plan);
    await page.waitForSelector('#preview-import-btn', { state: 'visible' });
    await page.click('#preview-import-btn');
    await expect(page.locator('#preview-import-btn')).toHaveCount(0, { timeout: 10000 });

    // Second "visit": same plan, same trainer sheet, fetched fresh (simulating
    // opening the same shared link again)
    await page.evaluate((plan) => {
      window.workoutTracker.importPlanFromLink(plan.id, plan.creatorSheetId);
    }, plan);
    await page.waitForTimeout(500);

    // No preview modal should reappear for an already-imported plan
    await expect(page.locator('#preview-import-btn')).toHaveCount(0);

    const planCount = await page.evaluate(() =>
      window.workoutTracker.workoutPlans.filter(p => p.name === 'Leg Day').length
    );
    expect(planCount).toBe(1);
  });

  test('should close the modal and record a rejection when Cancel is clicked', async ({ page }) => {
    await page.evaluate((plan) => {
      window.workoutTracker.showPlanImportPreview(plan, plan.creatorSheetId);
    }, samplePlan('plan_trainer_cancel'));

    await page.waitForSelector('#preview-cancel-btn', { state: 'visible' });
    await page.click('#preview-cancel-btn');

    await expect(page.locator('#preview-cancel-btn')).toHaveCount(0, { timeout: 10000 });

    const planCount = await page.evaluate(() =>
      window.workoutTracker.workoutPlans.filter(p => p.name === 'Leg Day').length
    );
    expect(planCount).toBe(0);
  });
});
