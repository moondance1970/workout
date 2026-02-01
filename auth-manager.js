// Background Authentication Manager for Workout Tracker
// Handles token refresh, background authentication, and persistent login

class AuthManager {
    constructor() {
        this.tokenRefreshBuffer = 5 * 60 * 1000; // 5 minutes before expiry
        this.refreshInProgress = false;
        this.refreshPromise = null;
        this.maxRetries = 3;
        this.retryDelay = 1000; // 1 second
        
        this.setupTokenRefreshTimer();
        this.setupVisibilityChangeHandler();
    }

    // Setup automatic token refresh
    setupTokenRefreshTimer() {
        // Check token every minute
        setInterval(() => {
            this.checkAndRefreshToken();
        }, 60 * 1000);
    }

    // Handle page visibility changes (user returns to tab)
    setupVisibilityChangeHandler() {
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                // Page became visible, check token immediately
                this.checkAndRefreshToken();
            }
        });
    }

    // Check if token needs refresh and refresh if necessary
    async checkAndRefreshToken() {
        if (this.refreshInProgress) {
            return this.refreshPromise;
        }

        const token = localStorage.getItem('googleAccessToken');
        const tokenExpiry = localStorage.getItem('googleTokenExpiry');

        if (!token || !tokenExpiry) {
            return false;
        }

        const expiryDate = new Date(tokenExpiry);
        const now = new Date();
        const timeUntilExpiry = expiryDate.getTime() - now.getTime();

        // Refresh if token expires within the buffer time
        if (timeUntilExpiry <= this.tokenRefreshBuffer) {
            console.log('Token needs refresh, time until expiry:', timeUntilExpiry / 1000, 'seconds');
            return await this.refreshToken();
        }

        return true;
    }

    // Refresh the access token
    async refreshToken() {
        if (this.refreshInProgress) {
            return this.refreshPromise;
        }

        this.refreshInProgress = true;
        this.refreshPromise = this._performTokenRefresh();

        try {
            const result = await this.refreshPromise;
            return result;
        } finally {
            this.refreshInProgress = false;
            this.refreshPromise = null;
        }
    }

    // Perform the actual token refresh
    async _performTokenRefresh() {
        const tracker = window.workoutTracker;
        if (!tracker) {
            console.warn('WorkoutTracker not available for token refresh');
            return false;
        }

        try {
            // Get client ID
            const clientId = await tracker.getClientId();
            if (!clientId) {
                console.error('Client ID not available for token refresh');
                return false;
            }

            // Use Google Identity Services to refresh token silently
            return new Promise((resolve) => {
                const tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: clientId,
                    scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
                    callback: (tokenResponse) => {
                        if (tokenResponse.access_token) {
                            // Store new token
                            const expiry = new Date(Date.now() + (tokenResponse.expires_in - 120) * 1000);
                            localStorage.setItem('googleAccessToken', tokenResponse.access_token);
                            localStorage.setItem('googleTokenExpiry', expiry.toISOString());
                            
                            // Update tracker
                            tracker.googleToken = tokenResponse.access_token;
                            tracker.isSignedIn = true;
                            
                            console.log('Token refreshed successfully');
                            resolve(true);
                        } else {
                            console.warn('Token refresh failed:', tokenResponse.error);
                            resolve(false);
                        }
                    },
                });

                // Request token silently (no user interaction)
                tokenClient.requestAccessToken({ prompt: '' });
            });
        } catch (error) {
            console.error('Error refreshing token:', error);
            return false;
        }
    }

    // Initialize background authentication
    async initializeBackgroundAuth() {
        const tracker = window.workoutTracker;
        if (!tracker) return false;

        // Check if we have stored credentials
        const token = localStorage.getItem('googleAccessToken');
        const tokenExpiry = localStorage.getItem('googleTokenExpiry');

        if (!token || !tokenExpiry) {
            return false;
        }

        // Check if token is still valid
        const expiryDate = new Date(tokenExpiry);
        const now = new Date();

        if (now >= expiryDate) {
            // Token expired, try to refresh
            console.log('Stored token expired, attempting refresh...');
            return await this.refreshToken();
        }

        // Token is valid, set up the tracker
        tracker.googleToken = token;
        tracker.isSignedIn = true;
        
        // Load user info in background
        this.loadUserInfoInBackground();
        
        return true;
    }

    // Load user info without blocking UI
    async loadUserInfoInBackground() {
        const tracker = window.workoutTracker;
        if (!tracker || !tracker.googleToken) return;

        try {
            await tracker.loadUserInfo();
            
            // Auto-connect to sheets in background
            if (tracker.userEmail) {
                await tracker.autoConnectSheet(tracker.userEmail);
                
                // Trigger background data loading
                this.loadDataInBackground();
            }
        } catch (error) {
            console.warn('Background user info loading failed:', error);
        }
    }

    // Load data in background without blocking UI
    async loadDataInBackground() {
        const tracker = window.workoutTracker;
        if (!tracker || !tracker.isSignedIn) return;

        try {
            // Use cache manager if available
            const cacheManager = window.cacheManager;
            
            // Load sessions
            const cachedSessions = cacheManager?.getCachedData('sessions');
            if (cachedSessions) {
                tracker.sessions = cachedSessions;
                tracker.currentSession = tracker.getTodaySession();
                tracker.renderTodayWorkout();
                tracker.renderHistory();
            }
            
            // Load exercises
            const cachedExercises = cacheManager?.getCachedData('exercises');
            if (cachedExercises) {
                tracker.exerciseList = cachedExercises;
                tracker.updateExerciseList(true);
            }
            
            // Load plans
            const cachedPlans = cacheManager?.getCachedData('plans');
            if (cachedPlans) {
                tracker.workoutPlans = cachedPlans;
                tracker.updatePlanDropdown();
            }
            
            // Mark data as loaded
            tracker.dataLoaded = true;
            tracker.updateSyncStatus();
            tracker.updateHeaderButtons();
            
            // Start background refresh
            if (cacheManager) {
                cacheManager.backgroundSync();
            }
        } catch (error) {
            console.warn('Background data loading failed:', error);
        }
    }

    // Handle authentication errors
    handleAuthError(error) {
        console.error('Authentication error:', error);
        
        // Clear invalid tokens
        localStorage.removeItem('googleAccessToken');
        localStorage.removeItem('googleTokenExpiry');
        
        const tracker = window.workoutTracker;
        if (tracker) {
            tracker.googleToken = null;
            tracker.isSignedIn = false;
            tracker.updateHeaderButtons();
        }
    }

    // Check if user is authenticated
    isAuthenticated() {
        const token = localStorage.getItem('googleAccessToken');
        const tokenExpiry = localStorage.getItem('googleTokenExpiry');
        
        if (!token || !tokenExpiry) return false;
        
        const expiryDate = new Date(tokenExpiry);
        const now = new Date();
        
        return now < expiryDate;
    }

    // Get time until token expires (in milliseconds)
    getTimeUntilExpiry() {
        const tokenExpiry = localStorage.getItem('googleTokenExpiry');
        if (!tokenExpiry) return 0;
        
        const expiryDate = new Date(tokenExpiry);
        const now = new Date();
        
        return Math.max(0, expiryDate.getTime() - now.getTime());
    }

    // Sign out and clear all auth data
    signOut() {
        // Revoke token if possible
        const token = localStorage.getItem('googleAccessToken');
        if (token && google?.accounts?.oauth2?.revoke) {
            google.accounts.oauth2.revoke(token);
        }
        
        // Clear stored auth data
        localStorage.removeItem('googleAccessToken');
        localStorage.removeItem('googleTokenExpiry');
        
        // Update tracker
        const tracker = window.workoutTracker;
        if (tracker) {
            tracker.googleToken = null;
            tracker.isSignedIn = false;
            tracker.userEmail = null;
            tracker.userName = null;
            tracker.updateHeaderButtons();
        }
        
        // Clear cache
        const cacheManager = window.cacheManager;
        if (cacheManager) {
            cacheManager.clearAllCache();
        }
    }

    // Get authentication status for UI
    getAuthStatus() {
        return {
            isAuthenticated: this.isAuthenticated(),
            timeUntilExpiry: this.getTimeUntilExpiry(),
            refreshInProgress: this.refreshInProgress
        };
    }
}

// Export for use in main app
window.AuthManager = AuthManager;