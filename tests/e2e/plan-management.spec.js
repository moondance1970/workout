import { test, expect } from '@playwright/test';

test.describe('Plan Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    
    // Navigate to plan tab
    await page.click('button[data-tab="plan"]');
  });

  test('should display plan creation form', async ({ page }) => {
    const planName = page.locator('#plan-name');
    const planSlotsCount = page.locator('#plan-slots-count');
    const generateSlotsBtn = page.locator('#generate-slots-btn');
    
    await expect(planName).toBeVisible();
    await expect(planSlotsCount).toBeVisible();
    await expect(generateSlotsBtn).toBeVisible();
  });

  test('should allow entering plan name', async ({ page }) => {
    const planName = page.locator('#plan-name');
    await planName.fill('Chest Day');
    
    await expect(planName).toHaveValue('Chest Day');
  });

  test('should allow setting number of exercise slots', async ({ page }) => {
    const planSlotsCount = page.locator('#plan-slots-count');
    await planSlotsCount.fill('5');
    
    await expect(planSlotsCount).toHaveValue('5');
  });

  test('should display plan list container', async ({ page }) => {
    const plansList = page.locator('#plans-list');
    await expect(plansList).toBeVisible();
  });

  test('should show plan indicator when hidden', async ({ page }) => {
    const planIndicator = page.locator('#plan-indicator');
    // Check that element exists in DOM (count > 0)
    await expect(planIndicator).toHaveCount(1);
    
    // Should be hidden initially
    const display = await planIndicator.evaluate(el => window.getComputedStyle(el).display);
    expect(display).toBe('none');
  });

  test('should display plan exercise slots container', async ({ page }) => {
    const planExerciseSlots = page.locator('#plan-exercise-slots');
    // Check that element exists in DOM
    await expect(planExerciseSlots).toHaveCount(1);
  });

  test('should show save and cancel buttons when slots are generated', async ({ page }) => {
    // Generate slots first
    const planSlotsCount = page.locator('#plan-slots-count');
    await planSlotsCount.fill('3');
    await page.click('#generate-slots-btn');
    
    // Wait for slots to be generated
    await page.waitForTimeout(100);
    
    const savePlanBtn = page.locator('#save-plan-btn');
    const cancelPlanBtn = page.locator('#cancel-plan-btn');
    
    // Buttons should be visible after generating slots
    await expect(savePlanBtn).toBeVisible();
    await expect(cancelPlanBtn).toBeVisible();
  });

  test('should include rest timer in shared plan text and save plan correctly', async ({ page, context }) => {
    test.setTimeout(60000); // Increase timeout for this complex test
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
          setToken: () => {},
          sheets: {
            spreadsheets: {
              values: {
                get: () => Promise.resolve({ result: { values: [] } }),
                update: () => Promise.resolve({ result: { updatedCells: 1 } }),
                batchUpdate: () => Promise.resolve({ result: { updatedSpreadsheet: {} } })
              },
              get: () => Promise.resolve({ 
                result: { 
                  sheets: [{ properties: { title: 'Plans' } }],
                  spreadsheetId: 'test-sheet-id'
                } 
              })
            }
          },
          drive: {
            permissions: {
              create: () => Promise.resolve({ result: { id: 'perm-123' } })
            }
          }
        }
      };
    });

    // Set up signed in state
    await page.evaluate(() => {
      localStorage.setItem('googleAccessToken', 'test-token');
      localStorage.setItem('googleTokenExpiry', new Date(Date.now() + 3600000).toISOString());
      localStorage.setItem('userEmail', 'test@example.com');
      localStorage.setItem('staticSheetId', 'test-sheet-id');
    });

    // Set up clipboard content tracking
    await page.evaluate(() => {
      window.__testClipboardContent = '';
      const originalWrite = navigator.clipboard.writeText;
      navigator.clipboard.writeText = async function(text) {
        window.__testClipboardContent = text;
        return originalWrite.call(this, text);
      };
    });

    // Handle dialogs
    page.on('dialog', async dialog => {
      if (dialog.type() === 'confirm') {
        await dialog.accept();
      }
    });

    // Navigate to config tab to add an exercise
    await page.click('button[data-tab="config"]');
    await page.waitForTimeout(100);

    // Add an exercise with a rest timer
    const addExerciseBtn = page.locator('#add-exercise-config');
    await expect(addExerciseBtn).toBeVisible();
    await addExerciseBtn.click();
    
    // Wait for modal to appear
    await page.waitForSelector('#add-exercise-name', { state: 'visible' });
    
    // Fill in exercise details
    await page.fill('#add-exercise-name', 'Bench Press');
    
    // Set rest timer to 2:30 (2 minutes 30 seconds)
    await page.fill('#add-timer-minutes', '2');
    await page.fill('#add-timer-seconds', '30');
    
    // Save the exercise - handle potential alerts
    page.on('dialog', async dialog => {
      if (dialog.type() === 'alert') {
        await dialog.accept();
      }
    });
    
    await page.click('#add-exercise-save-btn');
    // Wait for modal to close or for the button to disappear
    try {
      await page.waitForSelector('#add-exercise-save-btn', { state: 'hidden', timeout: 3000 });
    } catch (e) {
      // Modal might have closed differently, continue anyway
    }
    await page.waitForTimeout(300);

    // Navigate to plan tab
    await page.click('button[data-tab="plan"]');
    await page.waitForTimeout(200);

    // Create a plan
    await page.fill('#plan-name', 'Test Plan with Timer');
    await page.fill('#plan-slots-count', '1');
    await page.click('#generate-slots-btn');
    await page.waitForTimeout(300);

    // Select the exercise in the first slot
    const exerciseSelect = page.locator('#plan-exercise-slots select').first();
    await exerciseSelect.selectOption('Bench Press');
    await page.waitForTimeout(200);

    // Save the plan
    await page.click('#save-plan-btn');
    await page.waitForTimeout(500);

    // Now edit the exercise to change the rest timer
    await page.click('button[data-tab="config"]');
    await page.waitForTimeout(200);

    // Find and click edit button for the exercise
    const editButtons = page.locator('.edit-exercise-config');
    const editCount = await editButtons.count();
    expect(editCount).toBeGreaterThan(0);
    
    await editButtons.first().click();
    await page.waitForTimeout(200);

    // Change rest timer to 3:45 (3 minutes 45 seconds)
    await page.fill('#edit-timer-minutes', '3');
    await page.fill('#edit-timer-seconds', '45');
    
    // Save the exercise
    await page.click('#edit-exercise-save-btn');
    await page.waitForTimeout(300);

    // Navigate back to plan tab
    await page.click('button[data-tab="plan"]');
    await page.waitForTimeout(300);

    // Verify the plan was saved correctly by checking if it appears in the plans list
    const plansList = page.locator('#plans-list');
    await expect(plansList).toBeVisible();
    
    // The plan name should be visible in the list
    const planNameInList = page.locator('text=Test Plan with Timer');
    await expect(planNameInList).toBeVisible();

    // Find the share button for the plan
    const shareButton = page.locator('.share-plan-btn').first();
    await expect(shareButton).toBeVisible();
    
    // Click share button
    await shareButton.click();
    await page.waitForTimeout(300);

    // Wait for share dialog
    const shareDialog = page.locator('text=Share Workout Plan');
    await expect(shareDialog).toBeVisible({ timeout: 5000 });
    
    // Click continue to generate share text
    const continueBtn = page.locator('#share-continue-btn');
    await expect(continueBtn).toBeVisible();
    
    // Set up a promise to capture clipboard content
    const clipboardPromise = page.waitForFunction(() => window.__testClipboardContent !== '', { timeout: 5000 }).catch(() => null);
    
    await continueBtn.click();
    
    // Wait for clipboard content or check if alert appeared
    await clipboardPromise;
    await page.waitForTimeout(500);

    // Get clipboard content
    const clipboardContent = await page.evaluate(() => window.__testClipboardContent || '');
    
    // Verify the text includes the rest timer
    expect(clipboardContent).toContain('Test Plan with Timer');
    expect(clipboardContent).toContain('Bench Press');
    expect(clipboardContent).toContain('Rest Timer: 3:45'); // Updated timer value (3:45, not 2:30)
    
    // Verify the plan link is included
    expect(clipboardContent).toContain('http');
    expect(clipboardContent).toContain('test-sheet-id');
  });
});
