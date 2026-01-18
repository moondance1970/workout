import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display sign-in button when not authenticated', async ({ page }) => {
    // Check for Google sign-in button container
    const signInContainer = page.locator('#google-signin-button-header');
    await expect(signInContainer).toBeVisible();
  });

  test('should show sync status as not connected initially', async ({ page }) => {
    const syncText = page.locator('#sync-text');
    await expect(syncText).toContainText('Not Connected');
  });

  test('should display app purpose section', async ({ page }) => {
    const purposeSection = page.locator('#app-purpose-section');
    await expect(purposeSection).toBeVisible();
    
    const purposeHeading = purposeSection.locator('h2');
    await expect(purposeHeading).toContainText('Application Purpose');
  });

  test('should show all navigation tabs', async ({ page }) => {
    const tabs = page.locator('.tab-btn');
    await expect(tabs).toHaveCount(5);
    
    await expect(page.locator('button[data-tab="track"]')).toBeVisible();
    await expect(page.locator('button[data-tab="history"]')).toBeVisible();
    await expect(page.locator('button[data-tab="config"]')).toBeVisible();
    await expect(page.locator('button[data-tab="plan"]')).toBeVisible();
    await expect(page.locator('button[data-tab="followers"]')).toBeVisible();
  });

  test('should navigate between tabs', async ({ page }) => {
    // Click history tab
    await page.click('button[data-tab="history"]');
    const historyTab = page.locator('#history-tab');
    await expect(historyTab).toHaveClass(/active/);
    
    // Click config tab
    await page.click('button[data-tab="config"]');
    const configTab = page.locator('#config-tab');
    await expect(configTab).toHaveClass(/active/);
    
    // Click plan tab
    await page.click('button[data-tab="plan"]');
    const planTab = page.locator('#plan-tab');
    await expect(planTab).toHaveClass(/active/);
    
    // Click track tab
    await page.click('button[data-tab="track"]');
    const trackTab = page.locator('#track-tab');
    await expect(trackTab).toHaveClass(/active/);
  });
});
