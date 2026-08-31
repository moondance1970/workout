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

  test('should keep app purpose section in the DOM but permanently hidden', async ({ page }) => {
    // The app purpose section is retired (CSS-hidden unconditionally, see
    // styles.css '#app-purpose-section') but its markup is still present.
    const purposeSection = page.locator('#app-purpose-section');
    await expect(purposeSection).toHaveCount(1);

    const display = await purposeSection.evaluate(el => window.getComputedStyle(el).display);
    expect(display).toBe('none');

    const purposeHeading = purposeSection.locator('h2');
    await expect(purposeHeading).toContainText('Application Purpose');
  });

  test('should keep app purpose section hidden when not signed in', async ({ page }) => {
    // Ensure no sign-in state
    await page.evaluate(() => {
      localStorage.removeItem('googleAccessToken');
      localStorage.removeItem('googleTokenExpiry');
    });

    await page.reload();
    await page.waitForTimeout(200);

    const purposeSection = page.locator('#app-purpose-section');
    const display = await purposeSection.evaluate(el => window.getComputedStyle(el).display);
    expect(display).toBe('none');
  });

  test('should keep app purpose section hidden when signed in but not connected to sheet', async ({ page }) => {
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
    // Retired: always hidden now regardless of connection state
    const display = await purposeSection.evaluate(el => window.getComputedStyle(el).display);
    expect(display).toBe('none');
  });

  test('should keep app purpose section hidden when not fully connected', async ({ page }) => {
    // Test: Not signed in - section should stay hidden
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
    await page.waitForTimeout(300);

    const purposeSection = page.locator('#app-purpose-section');
    const display = await purposeSection.evaluate(el => window.getComputedStyle(el).display);
    expect(display).toBe('none');
  });

  test('should keep app purpose section hidden when signed in but no sheet connection', async ({ page }) => {
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
    // Retired: always hidden now regardless of connection state
    const display = await purposeSection.evaluate(el => window.getComputedStyle(el).display);
    expect(display).toBe('none');
  });

  test('should keep app purpose section hidden once fully connected (isSignedIn + sheetId + dataLoaded)', async ({ page }) => {
    // Mock Google APIs to simulate successful data loading
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
    
    const purposeSection = page.locator('#app-purpose-section');

    // Wait for the app to fully initialize and load data (best-effort - the
    // hidden assertion below holds either way, see comment below).
    try {
      await page.waitForFunction(() => {
        const syncTextEl = document.getElementById('sync-text');
        return syncTextEl && syncTextEl.textContent === 'Connected';
      }, { timeout: 5000 });
    } catch (e) {
      // If sync doesn't reach "Connected" (due to incomplete mocks), continue anyway.
    }
    
    // Retired: the section is unconditionally hidden now regardless of connection
    // state, so this holds whether or not sync actually reached "Connected" above.
    const display = await purposeSection.evaluate(el => window.getComputedStyle(el).display);
    expect(display).toBe('none');

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
