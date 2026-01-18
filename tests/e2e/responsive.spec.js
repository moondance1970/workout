import { test, expect } from '@playwright/test';

test.describe('Responsive Design', () => {
  test('should display correctly on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE size
    await page.goto('/');
    
    const container = page.locator('.container');
    await expect(container).toBeVisible();
    
    // Check that tabs are visible
    const tabs = page.locator('.tab-btn');
    await expect(tabs.first()).toBeVisible();
  });

  test('should display correctly on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 }); // iPad size
    await page.goto('/');
    
    const container = page.locator('.container');
    await expect(container).toBeVisible();
  });

  test('should display correctly on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 }); // Desktop size
    await page.goto('/');
    
    const container = page.locator('.container');
    await expect(container).toBeVisible();
  });

  test('should maintain layout on small screens', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 }); // Small mobile
    await page.goto('/');
    
    // Check that main elements are still accessible
    const header = page.locator('header');
    await expect(header).toBeVisible();
    
    const trackTab = page.locator('#track-tab');
    await expect(trackTab).toBeVisible();
  });

  test('should handle tab navigation on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    // Navigate through tabs
    await page.click('button[data-tab="history"]');
    const historyTab = page.locator('#history-tab');
    await expect(historyTab).toHaveClass(/active/);
    
    await page.click('button[data-tab="config"]');
    const configTab = page.locator('#config-tab');
    await expect(configTab).toHaveClass(/active/);
  });

  test('should display form elements correctly on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    const exerciseName = page.locator('#exercise-name');
    const sets = page.locator('#sets');
    
    await expect(exerciseName).toBeVisible();
    await expect(sets).toBeVisible();
  });
});
