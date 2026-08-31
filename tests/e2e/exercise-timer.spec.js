import { test, expect } from '@playwright/test';

// Mocks Google APIs and signs the page in. Leaves the page on the Configuration tab.
async function signIn(page) {
  await page.addInitScript(() => {
    window.google = {
      accounts: {
        oauth2: { initTokenClient: () => ({ requestAccessToken: () => {} }) },
        id: { initialize: () => {}, renderButton: () => {} }
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
                sheets: [{ properties: { title: 'Exercises' } }],
                spreadsheetId: 'test-sheet-id'
              }
            })
          }
        }
      }
    };
  });

  await page.evaluate(() => {
    localStorage.setItem('googleAccessToken', 'test-token');
    localStorage.setItem('googleTokenExpiry', new Date(Date.now() + 3600000).toISOString());
    localStorage.setItem('userEmail', 'test@example.com');
    localStorage.setItem('staticSheetId', 'test-sheet-id');
  });

  page.on('dialog', async dialog => {
    await dialog.accept();
  });

  await page.click('button[data-tab="config"]');
  await page.waitForTimeout(100);
}

test.describe('Exercise Timer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should keep exercise timer duration fields hidden until the checkbox is checked', async ({ page }) => {
    await signIn(page);

    await page.click('#add-exercise-config');
    await page.waitForSelector('#add-exercise-name', { state: 'visible' });

    const fields = page.locator('#add-exercise-timer-fields');
    let display = await fields.evaluate(el => window.getComputedStyle(el).display);
    expect(display).toBe('none');

    await page.check('#add-exercise-timer-enabled');
    display = await fields.evaluate(el => window.getComputedStyle(el).display);
    expect(display).toBe('flex');

    // Defaults to 2:00
    await expect(page.locator('#add-extimer-minutes')).toHaveValue('2');
    await expect(page.locator('#add-extimer-seconds')).toHaveValue('0');
  });

  test('should save an exercise timer and show it in the config list', async ({ page }) => {
    await signIn(page);

    await page.click('#add-exercise-config');
    await page.waitForSelector('#add-exercise-name', { state: 'visible' });
    await page.fill('#add-exercise-name', 'Plank');
    await page.check('#add-exercise-timer-enabled');
    await page.fill('#add-extimer-minutes', '1');
    await page.fill('#add-extimer-seconds', '30');
    await page.click('#add-exercise-save-btn');
    await page.waitForTimeout(300);

    const row = page.locator('.exercise-config-row', { hasText: 'Plank' });
    await expect(row).toContainText('1:30');
  });

  test('should not set an exercise timer when the checkbox is left unchecked', async ({ page }) => {
    await signIn(page);

    await page.click('#add-exercise-config');
    await page.waitForSelector('#add-exercise-name', { state: 'visible' });
    await page.fill('#add-exercise-name', 'Bicep Curl');
    await page.click('#add-exercise-save-btn');
    await page.waitForTimeout(300);

    const row = page.locator('.exercise-config-row', { hasText: 'Bicep Curl' });
    // Exercise Timer column should show the "not set" placeholder
    const cells = row.locator('div');
    await expect(cells.nth(4)).toHaveText('-');
  });

  test('should show an Exercise Timer button on the tracking form when configured', async ({ page }) => {
    await signIn(page);

    await page.click('#add-exercise-config');
    await page.waitForSelector('#add-exercise-name', { state: 'visible' });
    await page.fill('#add-exercise-name', 'Plank');
    await page.check('#add-exercise-timer-enabled');
    await page.fill('#add-extimer-minutes', '1');
    await page.fill('#add-extimer-seconds', '30');
    await page.click('#add-exercise-save-btn');
    await page.waitForTimeout(300);

    await page.click('button[data-tab="track"]');
    await page.waitForTimeout(100);

    await page.selectOption('#exercise-name', 'Plank');
    await page.waitForTimeout(200);

    const timerBtn = page.locator('.exercise-timer-btn');
    await expect(timerBtn).toBeVisible();
    await expect(timerBtn).toContainText('1:30');
  });

  test('should start the exercise timer with its own title, separate from the rest timer', async ({ page }) => {
    await signIn(page);

    await page.click('#add-exercise-config');
    await page.waitForSelector('#add-exercise-name', { state: 'visible' });
    await page.fill('#add-exercise-name', 'Plank');
    await page.check('#add-exercise-timer-enabled');
    await page.fill('#add-extimer-minutes', '1');
    await page.fill('#add-extimer-seconds', '30');
    await page.click('#add-exercise-save-btn');
    await page.waitForTimeout(300);

    await page.click('button[data-tab="track"]');
    await page.waitForTimeout(100);
    await page.selectOption('#exercise-name', 'Plank');
    await page.waitForTimeout(200);

    await page.click('.exercise-timer-btn');
    await page.waitForTimeout(100);

    const modal = page.locator('#rest-timer-modal');
    const display = await modal.evaluate(el => window.getComputedStyle(el).display);
    expect(display).toBe('flex');

    await expect(page.locator('#rest-timer-title')).toHaveText('⏱️ Plank Timer');
    await expect(page.locator('#timer-seconds')).toHaveText('1:30');

    // Skipping resets the title back to the default rest timer label
    await page.click('#skip-timer-btn');
    await expect(page.locator('#rest-timer-title')).toHaveText('⏱️ Rest Timer');
  });

  test('should not show an Exercise Timer button for exercises without one configured', async ({ page }) => {
    await signIn(page);

    await page.click('#add-exercise-config');
    await page.waitForSelector('#add-exercise-name', { state: 'visible' });
    await page.fill('#add-exercise-name', 'Bicep Curl');
    await page.click('#add-exercise-save-btn');
    await page.waitForTimeout(300);

    await page.click('button[data-tab="track"]');
    await page.waitForTimeout(100);
    await page.selectOption('#exercise-name', 'Bicep Curl');
    await page.waitForTimeout(200);

    await expect(page.locator('.exercise-timer-btn')).toHaveCount(0);
  });
});
