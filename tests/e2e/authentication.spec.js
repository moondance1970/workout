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

  test('should show app purpose section when not signed in', async ({ page }) => {
    // Ensure no sign-in state
    await page.evaluate(() => {
      localStorage.removeItem('googleAccessToken');
      localStorage.removeItem('googleTokenExpiry');
    });
    
    await page.reload();
    await page.waitForTimeout(200);
    
    const purposeSection = page.locator('#app-purpose-section');
    await expect(purposeSection).toBeVisible();
    
    const display = await purposeSection.evaluate(el => window.getComputedStyle(el).display);
    expect(display).toBe('block');
  });

  test('should show app purpose section when signed in but not connected to sheet', async ({ page }) => {
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
                get: () => Promise.resolve({ result: { values: [] } })
              }
            }
          }
        }
      };
    });

    // Set signed in state but no sheet connection
    await page.evaluate(() => {
      localStorage.setItem('googleAccessToken', 'test-token');
      localStorage.setItem('googleTokenExpiry', new Date(Date.now() + 3600000).toISOString());
      localStorage.removeItem('sheetId');
      localStorage.removeItem('staticSheetId');
      localStorage.removeItem('sessionsSheetId');
    });
    
    await page.reload();
    await page.waitForTimeout(500);
    
    const purposeSection = page.locator('#app-purpose-section');
    // Should still be visible because not fully connected (no sheetId)
    await expect(purposeSection).toBeVisible();
    
    const display = await purposeSection.evaluate(el => window.getComputedStyle(el).display);
    expect(display).toBe('block');
  });

  test('should show app purpose section when not fully connected', async ({ page }) => {
    // Test: Not signed in - section should be visible
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
    await page.waitForTimeout(300);
    
    const purposeSection = page.locator('#app-purpose-section');
    await expect(purposeSection).toBeVisible();
    
    const display = await purposeSection.evaluate(el => window.getComputedStyle(el).display);
    expect(display).toBe('block');
  });

  test('should show app purpose section when signed in but no sheet connection', async ({ page }) => {
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
          setToken: () => {}
        }
      };
    });

    // Set signed in state but no sheetId
    await page.evaluate(() => {
      localStorage.setItem('googleAccessToken', 'test-token');
      localStorage.setItem('googleTokenExpiry', new Date(Date.now() + 3600000).toISOString());
      localStorage.removeItem('sheetId');
      localStorage.removeItem('staticSheetId');
      localStorage.removeItem('sessionsSheetId');
    });
    
    await page.reload();
    await page.waitForTimeout(500);
    
    const purposeSection = page.locator('#app-purpose-section');
    // Should be visible because not fully connected (missing sheetId)
    await expect(purposeSection).toBeVisible();
    
    const display = await purposeSection.evaluate(el => window.getComputedStyle(el).display);
    expect(display).toBe('block');
  });

  test('should verify app purpose section visibility matches connection status', async ({ page }) => {
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
                get: () => Promise.resolve({ result: { values: [] } })
              },
              get: () => Promise.resolve({ 
                result: { 
                  sheets: [{ properties: { title: 'Sessions' } }],
                  spreadsheetId: 'test-sheet-id'
                } 
              })
            }
          }
        }
      };
    });

    // Set up signed in with sheetId
    await page.evaluate(() => {
      localStorage.setItem('googleAccessToken', 'test-token');
      localStorage.setItem('googleTokenExpiry', new Date(Date.now() + 3600000).toISOString());
      localStorage.setItem('sheetId', 'test-sheet-id');
      localStorage.setItem('staticSheetId', 'test-static-sheet-id');
      localStorage.setItem('sessionsSheetId', 'test-sessions-sheet-id');
      localStorage.setItem('userEmail', 'test@example.com');
    });
    
    await page.reload();
    await page.waitForTimeout(500);
    
    const purposeSection = page.locator('#app-purpose-section');
    const syncText = page.locator('#sync-text');
    
    // Wait a bit for app to initialize
    await page.waitForTimeout(300);
    
    // Check sync status - it should indicate connection state
    const syncStatus = await syncText.textContent();
    
    // The purpose section visibility should correlate with connection status
    // If sync shows "Connected", purpose should be hidden (fully connected)
    // If sync shows "Loading..." or "Not Connected", purpose should be visible
    const display = await purposeSection.evaluate(el => window.getComputedStyle(el).display);
    
    if (syncStatus === 'Connected') {
      // When fully connected, section should be hidden
      expect(display).toBe('none');
    } else {
      // When not fully connected, section should be visible
      expect(display).toBe('block');
    }
    
    // Verify the element exists in DOM
    await expect(purposeSection).toHaveCount(1);
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
