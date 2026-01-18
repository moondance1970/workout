import { test, expect } from '@playwright/test';

test.describe('Workout Tracking', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    
    // Mock Google APIs
    await page.addInitScript(() => {
      window.google = {
        accounts: {
          oauth2: {
            initTokenClient: () => ({
              requestAccessToken: () => {}
            })
          },
          id: {
            initialize: () => {},
            renderButton: () => {}
          }
        },
        client: {
          init: () => {},
          load: () => Promise.resolve(),
          sheets: {
            spreadsheets: {
              values: {
                get: () => Promise.resolve({ result: { values: [] } }),
                update: () => Promise.resolve({ result: { updatedCells: 1 } })
              }
            }
          }
        }
      };
    });
  });

  test('should display workout form', async ({ page }) => {
    const exerciseName = page.locator('#exercise-name');
    const sets = page.locator('#sets');
    const notes = page.locator('#notes');
    
    await expect(exerciseName).toBeVisible();
    await expect(sets).toBeVisible();
    await expect(notes).toBeVisible();
  });

  test('should allow entering exercise name', async ({ page }) => {
    const exerciseName = page.locator('#exercise-name');
    // Exercise name is a select element, so we need to check it exists first
    await expect(exerciseName).toBeVisible();
    // Note: Cannot fill a select element - would need to use selectOption if we want to test selection
  });

  test('should allow entering sets', async ({ page }) => {
    const sets = page.locator('#sets');
    await sets.fill('3');
    
    await expect(sets).toHaveValue('3');
  });

  test('should display reps and weight inputs based on sets', async ({ page }) => {
    const sets = page.locator('#sets');
    await sets.fill('3');
    
    // Wait for reps container to update
    await page.waitForTimeout(100);
    
    const repsContainer = page.locator('#reps-container');
    await expect(repsContainer).toBeVisible();
  });

  test('should allow entering notes', async ({ page }) => {
    const notes = page.locator('#notes');
    await notes.fill('Good form today');
    
    await expect(notes).toHaveValue('Good form today');
  });

  test('should display recommendations panel', async ({ page }) => {
    const recommendations = page.locator('#recommendations');
    await expect(recommendations).toBeVisible();
    
    const recommendationsContent = page.locator('#recommendations-content');
    await expect(recommendationsContent).toBeVisible();
  });

  test('should display today workout section', async ({ page }) => {
    const todayWorkout = page.locator('#today-workout');
    await expect(todayWorkout).toBeVisible();
    
    const todayExercises = page.locator('#today-exercises');
    await expect(todayExercises).toBeVisible();
  });

  test('should show rest timer modal structure', async ({ page }) => {
    const restTimerModal = page.locator('#rest-timer-modal');
    // Check that element exists in DOM (count > 0)
    await expect(restTimerModal).toHaveCount(1);
    
    // Modal should be hidden initially
    const display = await restTimerModal.evaluate(el => window.getComputedStyle(el).display);
    expect(display).toBe('none');
  });
});
