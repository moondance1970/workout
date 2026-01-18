import { test, expect } from '@playwright/test';

test.describe('UI Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should switch between tabs', async ({ page }) => {
    // Start on track tab
    const trackTab = page.locator('#track-tab');
    await expect(trackTab).toHaveClass(/active/);
    
    // Switch to history
    await page.click('button[data-tab="history"]');
    const historyTab = page.locator('#history-tab');
    await expect(historyTab).toHaveClass(/active/);
    await expect(trackTab).not.toHaveClass(/active/);
    
    // Switch to config
    await page.click('button[data-tab="config"]');
    const configTab = page.locator('#config-tab');
    await expect(configTab).toHaveClass(/active/);
    await expect(historyTab).not.toHaveClass(/active/);
    
    // Switch to plan
    await page.click('button[data-tab="plan"]');
    const planTab = page.locator('#plan-tab');
    await expect(planTab).toHaveClass(/active/);
    await expect(configTab).not.toHaveClass(/active/);
  });

  test('should update active tab button style', async ({ page }) => {
    const trackBtn = page.locator('button[data-tab="track"]');
    await expect(trackBtn).toHaveClass(/active/);
    
    await page.click('button[data-tab="history"]');
    const historyBtn = page.locator('button[data-tab="history"]');
    await expect(historyBtn).toHaveClass(/active/);
    await expect(trackBtn).not.toHaveClass(/active/);
  });

  test('should display exercise filter in history tab', async ({ page }) => {
    await page.click('button[data-tab="history"]');
    
    const exerciseFilter = page.locator('#exercise-filter');
    await expect(exerciseFilter).toBeVisible();
  });

  test('should display time filter in history tab', async ({ page }) => {
    await page.click('button[data-tab="history"]');
    
    const timeFilter = page.locator('#time-filter');
    await expect(timeFilter).toBeVisible();
  });

  test('should display chart container in history tab', async ({ page }) => {
    await page.click('button[data-tab="history"]');
    
    const chartContainer = page.locator('.chart-container');
    await expect(chartContainer).toBeVisible();
    
    const chart = page.locator('#progress-chart');
    await expect(chart).toBeVisible();
  });

  test('should display default timer configuration', async ({ page }) => {
    await page.click('button[data-tab="config"]');
    
    const timerMinutes = page.locator('#timer-minutes');
    const timerSeconds = page.locator('#default-timer-seconds');
    const saveTimerBtn = page.locator('#save-default-timer');
    
    await expect(timerMinutes).toBeVisible();
    await expect(timerSeconds).toBeVisible();
    await expect(saveTimerBtn).toBeVisible();
  });

  test('should display exercise configuration section', async ({ page }) => {
    await page.click('button[data-tab="config"]');
    
    const exerciseConfigList = page.locator('#exercise-config-list');
    const addExerciseBtn = page.locator('#add-exercise-config');
    
    await expect(exerciseConfigList).toBeVisible();
    await expect(addExerciseBtn).toBeVisible();
  });

  test('should show victory modal structure', async ({ page }) => {
    const victoryModal = page.locator('#victory-modal');
    // Check that element exists in DOM (count > 0)
    await expect(victoryModal).toHaveCount(1);
    
    // Should be hidden initially
    const display = await victoryModal.evaluate(el => window.getComputedStyle(el).display);
    expect(display).toBe('none');
  });

  test('should display welcome message container', async ({ page }) => {
    const welcomeMessage = page.locator('#welcome-message');
    // Check that element exists in DOM (count > 0)
    await expect(welcomeMessage).toHaveCount(1);
    
    // Should be hidden initially
    const display = await welcomeMessage.evaluate(el => window.getComputedStyle(el).display);
    expect(display).toBe('none');
  });

  test('should show plan mode indicator container', async ({ page }) => {
    const planModeIndicator = page.locator('#plan-mode-indicator');
    // Check that element exists in DOM (count > 0)
    await expect(planModeIndicator).toHaveCount(1);
    
    // Should be hidden initially
    const display = await planModeIndicator.evaluate(el => window.getComputedStyle(el).display);
    expect(display).toBe('none');
  });
});
