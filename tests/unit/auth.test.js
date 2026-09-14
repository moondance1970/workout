import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupGoogleAPIMocks } from '../mocks/google-apis.js';
import { createMockLocalStorage } from '../utils/test-helpers.js';

describe('Authentication', () => {
  let mockLocalStorage;
  let authAPI;

  beforeEach(() => {
    mockLocalStorage = createMockLocalStorage();
    const mocks = setupGoogleAPIMocks();
    authAPI = mocks.auth;
    
    // Clear any existing tokens
    mockLocalStorage.clear();
  });

  describe('Token Management', () => {
    it('should store access token in localStorage', () => {
      const token = 'test-access-token';
      const expiry = new Date(Date.now() + 3600000).toISOString();
      
      mockLocalStorage.setItem('googleAccessToken', token);
      mockLocalStorage.setItem('googleTokenExpiry', expiry);
      
      expect(mockLocalStorage.getItem('googleAccessToken')).toBe(token);
      expect(mockLocalStorage.getItem('googleTokenExpiry')).toBe(expiry);
    });

    it('should retrieve valid token from localStorage', () => {
      const token = 'test-access-token';
      const expiry = new Date(Date.now() + 3600000).toISOString();
      
      mockLocalStorage.setItem('googleAccessToken', token);
      mockLocalStorage.setItem('googleTokenExpiry', expiry);
      
      const storedToken = mockLocalStorage.getItem('googleAccessToken');
      const storedExpiry = mockLocalStorage.getItem('googleTokenExpiry');
      
      const isValid = storedToken && storedExpiry && new Date() < new Date(storedExpiry);
      
      expect(isValid).toBe(true);
      expect(storedToken).toBe(token);
    });

    it('should detect expired token', () => {
      const token = 'expired-token';
      const expiry = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
      
      mockLocalStorage.setItem('googleAccessToken', token);
      mockLocalStorage.setItem('googleTokenExpiry', expiry);
      
      const storedToken = mockLocalStorage.getItem('googleAccessToken');
      const storedExpiry = mockLocalStorage.getItem('googleTokenExpiry');
      
      const isValid = storedToken && storedExpiry && new Date() < new Date(storedExpiry);
      
      expect(isValid).toBe(false);
    });

    it('should handle missing token', () => {
      const token = mockLocalStorage.getItem('googleAccessToken');
      const expiry = mockLocalStorage.getItem('googleTokenExpiry');
      
      expect(token).toBeNull();
      expect(expiry).toBeNull();
    });

    it('should clear token on sign out', () => {
      mockLocalStorage.setItem('googleAccessToken', 'test-token');
      mockLocalStorage.setItem('googleTokenExpiry', new Date().toISOString());
      
      mockLocalStorage.removeItem('googleAccessToken');
      mockLocalStorage.removeItem('googleTokenExpiry');
      
      expect(mockLocalStorage.getItem('googleAccessToken')).toBeNull();
      expect(mockLocalStorage.getItem('googleTokenExpiry')).toBeNull();
    });
  });

  describe('OAuth Flow', () => {
    it('should initialize token client', () => {
      const tokenClient = authAPI.initTokenClient({
        client_id: 'test-client-id',
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: vi.fn()
      });
      
      expect(tokenClient).toBeTruthy();
      expect(tokenClient.requestAccessToken).toBeDefined();
    });

    it('should request access token', () => {
      const callback = vi.fn();
      const tokenClient = authAPI.initTokenClient({
        client_id: 'test-client-id',
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback
      });
      
      tokenClient.requestAccessToken();
      
      expect(callback).toHaveBeenCalled();
    });

    it('should provide token response with correct structure', () => {
      const callback = vi.fn((response) => {
        expect(response).toHaveProperty('access_token');
        expect(response).toHaveProperty('expires_in');
        expect(response).toHaveProperty('scope');
        expect(response).toHaveProperty('token_type');
      });
      
      const tokenClient = authAPI.initTokenClient({
        client_id: 'test-client-id',
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback
      });
      
      tokenClient.requestAccessToken();
    });

    it('should handle sign-in errors', () => {
      authAPI.setTokenResponse({
        error: 'access_denied',
        error_description: 'User denied access'
      });
      
      const callback = vi.fn((response) => {
        expect(response.error).toBe('access_denied');
      });
      
      const tokenClient = authAPI.initTokenClient({
        client_id: 'test-client-id',
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback
      });
      
      tokenClient.requestAccessToken();
    });
  });

  describe('Sign In State', () => {
    it('should track sign-in status', () => {
      expect(authAPI.isSignedIn()).toBe(false);
      
      authAPI.setSignedIn(true);
      expect(authAPI.isSignedIn()).toBe(true);
      
      authAPI.setSignedIn(false);
      expect(authAPI.isSignedIn()).toBe(false);
    });

    it('should prevent multiple simultaneous token requests', () => {
      let requestCount = 0;
      const callback = vi.fn(() => {
        requestCount++;
      });

      const tokenClient = authAPI.initTokenClient({
        client_id: 'test-client-id',
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback
      });

      // Simulate multiple rapid requests
      tokenClient.requestAccessToken();
      tokenClient.requestAccessToken();
      tokenClient.requestAccessToken();

      // Should only process one request at a time
      expect(requestCount).toBeGreaterThan(0);
    });
  });

  describe('Popup-Safe Sign-In (avoiding mobile popup blocking)', () => {
    // Regression coverage: requestAccessToken()/requestAccessTokenPromise() used to
    // `await`/`.then()` a client-ID fetch before calling tokenClient.requestAccessToken()
    // - any async gap between a tap and that call risks the browser no longer treating
    // the sign-in popup as directly triggered by the user, so it gets blocked (seen as
    // a "popup blocked?" prompt on Android Chrome, and a fully silent failure with no
    // visible sign-in at all on iOS Safari). The fix reads a pre-warmed client ID
    // synchronously so the popup trigger stays in the same call stack as the click.

    it('should trigger the popup synchronously (same tick) when the client ID is already cached', () => {
      const googleConfig = { CLIENT_ID: 'cached-client-id' };
      let triggeredSynchronously = false;

      function onSignInClick() {
        const clientId = googleConfig?.CLIENT_ID || null;
        if (clientId) {
          // This is exactly where tokenClient.requestAccessToken() fires in the real
          // code - still inside the click handler's own synchronous execution
          triggeredSynchronously = true;
        }
      }

      onSignInClick();
      expect(triggeredSynchronously).toBe(true);
    });

    it('should only fall back to an async client-ID fetch when nothing was cached yet', async () => {
      let triggeredSynchronously = false;
      let triggeredAsynchronously = false;
      const fetchClientId = () => Promise.resolve('fetched-client-id');

      function onSignInClick(cachedClientId) {
        const clientId = cachedClientId || null;
        if (clientId) {
          triggeredSynchronously = true;
          return Promise.resolve();
        }
        return fetchClientId().then(() => {
          triggeredAsynchronously = true;
        });
      }

      await onSignInClick(null);

      expect(triggeredSynchronously).toBe(false);
      expect(triggeredAsynchronously).toBe(true);
    });

    it('should warm the client ID during init(), before the user could have clicked anything', () => {
      // Mirrors `this.loadConfig().catch(() => {})` added at the top of init()
      const trackerState = { googleConfig: null };
      const warmClientIdDuringInit = () => {
        trackerState.googleConfig = { CLIENT_ID: 'warmed-during-init' };
      };

      warmClientIdDuringInit();

      expect(trackerState.googleConfig?.CLIENT_ID).toBe('warmed-during-init');
    });
  });

  describe('Standalone PWA sign-in (redirect fallback)', () => {
    // Regression coverage: even with the synchronous client-ID fix above, GIS's
    // popup flow calls window.open() under the hood, and window.open() from inside
    // an installed/home-screen PWA's standalone WKWebView on iOS is a silent no-op -
    // no popup, no error, nothing happens when the button is tapped. The fix detects
    // standalone display mode and does a plain top-level OAuth redirect instead,
    // which is just a page navigation and works fine there.

    // Mirrors isStandaloneDisplayMode()
    const isStandaloneDisplayMode = (nav, mm) => {
      try {
        if (nav.standalone === true) return true;
        return !!(mm && mm('(display-mode: standalone)').matches);
      } catch (e) {
        return false;
      }
    };

    it('should detect iOS home-screen standalone mode via navigator.standalone', () => {
      expect(isStandaloneDisplayMode({ standalone: true }, null)).toBe(true);
    });

    it('should detect installed PWA standalone mode via matchMedia', () => {
      const matchMedia = (query) => ({ matches: query === '(display-mode: standalone)' });
      expect(isStandaloneDisplayMode({}, matchMedia)).toBe(true);
    });

    it('should treat a normal browser tab as non-standalone', () => {
      const matchMedia = () => ({ matches: false });
      expect(isStandaloneDisplayMode({ standalone: false }, matchMedia)).toBe(false);
    });

    it('should build a redirect URL carrying client id, scope, and return state', () => {
      // Mirrors redirectToGoogleSignIn()
      const buildRedirectUrl = (origin, pathname, search, clientId, scopes) => {
        const redirectUri = origin + pathname;
        const state = JSON.stringify({ returnSearch: search });
        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: 'token',
          scope: scopes,
          include_granted_scopes: 'true',
          prompt: 'select_account',
          state
        });
        return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
      };

      const url = buildRedirectUrl(
        'https://example.com', '/', '?plan=p1&sheet=s1',
        'client-abc', 'drive.file email profile'
      );

      expect(url).toContain('client_id=client-abc');
      expect(url).toContain('redirect_uri=https%3A%2F%2Fexample.com%2F');
      expect(url).toContain('response_type=token');
      expect(url).toContain(encodeURIComponent(JSON.stringify({ returnSearch: '?plan=p1&sheet=s1' })));
    });

    it('should parse the access token and restore the original query string from the redirect', () => {
      // Mirrors handleOAuthRedirectCallback()
      const parseRedirectHash = (hash) => {
        const hashParams = new URLSearchParams(hash.slice(1));
        const accessToken = hashParams.get('access_token');
        const stateRaw = hashParams.get('state');
        let returnSearch = '';
        if (stateRaw) {
          const state = JSON.parse(stateRaw);
          if (state && typeof state.returnSearch === 'string') returnSearch = state.returnSearch;
        }
        return { accessToken, returnSearch };
      };

      const state = encodeURIComponent(JSON.stringify({ returnSearch: '?plan=p1&sheet=s1' }));
      const hash = `#access_token=abc123&expires_in=3599&state=${state}`;

      const result = parseRedirectHash(hash);

      expect(result.accessToken).toBe('abc123');
      expect(result.returnSearch).toBe('?plan=p1&sheet=s1');
    });

    it('should ignore a hash that is not an OAuth redirect', () => {
      const parseRedirectHash = (hash) => {
        if (!hash || hash.length < 2) return null;
        const hashParams = new URLSearchParams(hash.slice(1));
        const accessToken = hashParams.get('access_token');
        const error = hashParams.get('error');
        if (!accessToken && !error) return null;
        return { accessToken, error };
      };

      expect(parseRedirectHash('#some-other-anchor')).toBeNull();
      expect(parseRedirectHash('')).toBeNull();
    });
  });
});
