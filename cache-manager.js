// Enhanced Cache Manager for Workout Tracker
// Provides comprehensive local caching with background sync capabilities

class CacheManager {
    constructor() {
        this.cachePrefix = 'workout_tracker_';
        this.cacheVersion = '1.0';
        this.syncQueue = [];
        this.isOnline = navigator.onLine;
        this.backgroundSyncEnabled = true;
        this.lastSyncTime = null;
        this.syncInProgress = false;
        
        // Cache expiry times (in milliseconds)
        this.cacheExpiry = {
            sessions: 5 * 60 * 1000,      // 5 minutes
            exercises: 30 * 60 * 1000,    // 30 minutes
            plans: 30 * 60 * 1000,        // 30 minutes
            config: 60 * 60 * 1000,       // 1 hour
            userInfo: 60 * 60 * 1000      // 1 hour
        };
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Monitor online/offline status
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.processSyncQueue();
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
        });
        
        // Periodic background sync
        setInterval(() => {
            if (this.isOnline && this.backgroundSyncEnabled && !this.syncInProgress) {
                this.backgroundSync();
            }
        }, 2 * 60 * 1000); // Every 2 minutes
    }

    // Generate cache key with version
    getCacheKey(type, identifier = '') {
        return `${this.cachePrefix}${this.cacheVersion}_${type}${identifier ? '_' + identifier : ''}`;
    }

    // Get cached data with expiry check
    getCachedData(type, identifier = '') {
        try {
            const key = this.getCacheKey(type, identifier);
            const cached = localStorage.getItem(key);
            
            if (!cached) return null;
            
            const data = JSON.parse(cached);
            const now = Date.now();
            
            // Check if cache is expired
            if (data.timestamp && (now - data.timestamp) > this.cacheExpiry[type]) {
                this.removeCachedData(type, identifier);
                return null;
            }
            
            return data.value;
        } catch (error) {
            console.warn('Error reading cache:', error);
            return null;
        }
    }

    // Store data in cache with timestamp
    setCachedData(type, data, identifier = '') {
        try {
            const key = this.getCacheKey(type, identifier);
            const cacheData = {
                value: data,
                timestamp: Date.now(),
                version: this.cacheVersion
            };
            
            localStorage.setItem(key, JSON.stringify(cacheData));
            return true;
        } catch (error) {
            console.warn('Error writing to cache:', error);
            // Handle quota exceeded
            if (error.name === 'QuotaExceededError') {
                this.clearOldCache();
                // Try again after clearing
                try {
                    localStorage.setItem(key, JSON.stringify(cacheData));
                    return true;
                } catch (retryError) {
                    console.error('Cache write failed even after cleanup:', retryError);
                }
            }
            return false;
        }
    }

    // Remove specific cached data
    removeCachedData(type, identifier = '') {
        try {
            const key = this.getCacheKey(type, identifier);
            localStorage.removeItem(key);
        } catch (error) {
            console.warn('Error removing cache:', error);
        }
    }

    // Clear all cache for this app
    clearAllCache() {
        try {
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith(this.cachePrefix)) {
                    localStorage.removeItem(key);
                }
            });
        } catch (error) {
            console.warn('Error clearing cache:', error);
        }
    }

    // Clear old/expired cache entries
    clearOldCache() {
        try {
            const keys = Object.keys(localStorage);
            const now = Date.now();

            keys.forEach(key => {
                if (key.startsWith(this.cachePrefix)) {
                    // The durable offline store (see getOfflineKey()/setOfflineData()
                    // below) deliberately has no `timestamp` field and no matching
                    // `cacheExpiry` entry - it's meant to never expire. Without this
                    // skip, this TTL sweep would treat every record in it as corrupted
                    // (`!data.timestamp`) and silently delete it, wiping out offline
                    // mode's whole reason for existing the next time this runs.
                    if (key.includes('_offline_')) return;

                    try {
                        const data = JSON.parse(localStorage.getItem(key));

                        // Remove if expired or old version
                        if (!data.timestamp ||
                            data.version !== this.cacheVersion ||
                            (now - data.timestamp) > Math.max(...Object.values(this.cacheExpiry))) {
                            localStorage.removeItem(key);
                        }
                    } catch (parseError) {
                        // Remove corrupted cache entries
                        localStorage.removeItem(key);
                    }
                }
            });
        } catch (error) {
            console.warn('Error clearing old cache:', error);
        }
    }

    // --- Durable offline store ---
    // A second, independent namespace from the TTL cache above (getCachedData/
    // setCachedData): no expiry, ever, and it tracks sync metadata per dataset so the
    // app can tell "did I change this locally since I last synced?" and "did the
    // sheet change since I last synced?" once a connection comes back. The existing
    // TTL cache can't be repurposed for this - several places (backgroundSync(),
    // refreshCacheFromServer()) key their own "is this stale" logic off that 5-30
    // minute expiry, and changing its semantics here would be a correctness risk to
    // code unrelated to offline mode.
    getOfflineKey(type) {
        return `${this.cachePrefix}offline_${type}`;
    }

    // Returns { value, lastLocalModifiedAt, lastSyncedAt, version } or null. Never
    // expires - unlike getCachedData(), there is no staleness check here at all.
    getOfflineData(type) {
        try {
            const raw = localStorage.getItem(this.getOfflineKey(type));
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (error) {
            console.warn('Error reading offline store:', error);
            return null;
        }
    }

    // touchLocal: this write represents a real local change (a user edit while
    // offline, or simply a fresh pull from Sheets being recorded as the new local
    // value). touchSynced: this write also counts as "now reconciled with remote" -
    // true for a pull (the value just came from Sheets, so it matches by definition),
    // false for a plain local edit, which should look dirty until it's actually
    // pushed back.
    // Builds the record for setOfflineData(). When this write marks local as dirty
    // (touchLocal but not touchSynced), lastLocalModifiedAt is forced to be strictly
    // later than the existing lastSyncedAt even if Date.now() ties with it (millisecond
    // resolution makes that a real possibility right after an enable-offline-mode seed
    // or any other back-to-back write) - otherwise reconcileOnReconnect()'s `>` dirty
    // check would wrongly treat a genuinely-changed dataset as clean.
    buildOfflineRecord(type, value, { touchLocal, touchSynced }) {
        const existing = this.getOfflineData(type) || {};
        const now = Date.now();
        let lastLocalModifiedAt = touchLocal ? now : (existing.lastLocalModifiedAt ?? null);
        const lastSyncedAt = touchSynced ? now : (existing.lastSyncedAt ?? null);
        if (touchLocal && !touchSynced && lastSyncedAt != null && lastLocalModifiedAt <= lastSyncedAt) {
            lastLocalModifiedAt = lastSyncedAt + 1;
        }
        return { value, version: this.cacheVersion, lastLocalModifiedAt, lastSyncedAt };
    }

    setOfflineData(type, value, { touchLocal = true, touchSynced = false } = {}) {
        try {
            const record = this.buildOfflineRecord(type, value, { touchLocal, touchSynced });
            localStorage.setItem(this.getOfflineKey(type), JSON.stringify(record));
            return true;
        } catch (error) {
            console.warn('Error writing offline store:', error);
            if (error.name === 'QuotaExceededError') {
                this.clearOldCache();
                try {
                    const record = this.buildOfflineRecord(type, value, { touchLocal, touchSynced });
                    localStorage.setItem(this.getOfflineKey(type), JSON.stringify(record));
                    return true;
                } catch (retryError) {
                    console.error('Offline store write failed even after cleanup:', retryError);
                }
            }
            return false;
        }
    }

    // Call right after a push (local -> remote) succeeds, when the value itself
    // hasn't changed - just advances the "last reconciled with remote" checkpoint.
    markOfflineSynced(type) {
        try {
            const existing = this.getOfflineData(type);
            if (!existing) return;
            existing.lastSyncedAt = Date.now();
            localStorage.setItem(this.getOfflineKey(type), JSON.stringify(existing));
        } catch (error) {
            console.warn('Error marking offline data synced:', error);
        }
    }

    // Explicit wipe of just the durable offline store (not the TTL cache, not auth).
    // Deliberately not wired to sign-out - offline data is meant to survive that.
    clearOfflineStore() {
        try {
            ['sessions', 'exercises', 'plans'].forEach(type => {
                localStorage.removeItem(this.getOfflineKey(type));
            });
        } catch (error) {
            console.warn('Error clearing offline store:', error);
        }
    }

    // Add item to sync queue for background processing
    addToSyncQueue(operation) {
        this.syncQueue.push({
            ...operation,
            timestamp: Date.now(),
            retries: 0
        });
        
        // Try immediate sync if online
        if (this.isOnline && !this.syncInProgress) {
            this.processSyncQueue();
        }
    }

    // Process pending sync operations
    async processSyncQueue() {
        if (this.syncInProgress || !this.isOnline || this.syncQueue.length === 0) {
            return;
        }

        this.syncInProgress = true;
        
        try {
            const operations = [...this.syncQueue];
            this.syncQueue = [];
            
            for (const operation of operations) {
                try {
                    await this.executeOperation(operation);
                } catch (error) {
                    console.warn('Sync operation failed:', error);
                    
                    // Retry logic
                    if (operation.retries < 3) {
                        operation.retries++;
                        this.syncQueue.push(operation);
                    } else {
                        console.error('Operation failed after 3 retries:', operation);
                    }
                }
            }
        } finally {
            this.syncInProgress = false;
        }
    }

    // Execute a sync operation
    async executeOperation(operation) {
        switch (operation.type) {
            case 'saveSession':
                return await this.syncSaveSession(operation.data);
            case 'saveExercise':
                return await this.syncSaveExercise(operation.data);
            case 'savePlan':
                return await this.syncSavePlan(operation.data);
            default:
                console.warn('Unknown operation type:', operation.type);
        }
    }

    // Background sync - refresh cache from server
    async backgroundSync() {
        if (!this.isOnline || this.syncInProgress) return;
        
        try {
            this.syncInProgress = true;
            
            // Only sync if we have authentication, and never while a workout session is
            // active - during a session the phone is the source of truth, so pulling from
            // Google Sheets in the background could clobber local, not-yet-synced changes.
            if (window.workoutTracker && window.workoutTracker.isSignedIn && !window.workoutTracker.sessionActive) {
                await this.refreshCacheFromServer();
                this.lastSyncTime = Date.now();
            }
        } catch (error) {
            console.warn('Background sync failed:', error);
        } finally {
            this.syncInProgress = false;
        }
    }

    // Refresh cache from server
    async refreshCacheFromServer() {
        const tracker = window.workoutTracker;
        if (!tracker || !tracker.isSignedIn) return;

        try {
            // Refresh sessions if cache is stale
            const cachedSessions = this.getCachedData('sessions');
            if (!cachedSessions) {
                const sessions = await tracker.loadSessionsFromSheet();
                if (sessions) {
                    this.setCachedData('sessions', sessions);
                }
            }

            // Refresh exercises if cache is stale
            const cachedExercises = this.getCachedData('exercises');
            if (!cachedExercises) {
                const exercises = await tracker.loadExerciseListFromSheet();
                if (exercises) {
                    this.setCachedData('exercises', exercises);
                }
            }

            // Refresh plans if cache is stale
            const cachedPlans = this.getCachedData('plans');
            if (!cachedPlans) {
                const plans = await tracker.loadWorkoutPlansFromSheet();
                if (plans) {
                    this.setCachedData('plans', plans);
                }
            }
        } catch (error) {
            console.warn('Error refreshing cache from server:', error);
        }
    }

    // Get cache status for UI display
    getCacheStatus() {
        const status = {
            isOnline: this.isOnline,
            lastSyncTime: this.lastSyncTime,
            pendingOperations: this.syncQueue.length,
            cacheSize: this.getCacheSize()
        };
        
        return status;
    }

    // Calculate approximate cache size
    getCacheSize() {
        try {
            let totalSize = 0;
            const keys = Object.keys(localStorage);
            
            keys.forEach(key => {
                if (key.startsWith(this.cachePrefix)) {
                    totalSize += localStorage.getItem(key).length;
                }
            });
            
            return Math.round(totalSize / 1024); // Return size in KB
        } catch (error) {
            return 0;
        }
    }

    // Sync operations for different data types
    async syncSaveSession(sessionData) {
        const tracker = window.workoutTracker;
        if (tracker && tracker.isSignedIn) {
            // Implementation would call the actual save method
            // This is a placeholder for the sync operation
            console.log('Syncing session data:', sessionData);
        }
    }

    async syncSaveExercise(exerciseData) {
        const tracker = window.workoutTracker;
        if (tracker && tracker.isSignedIn) {
            console.log('Syncing exercise data:', exerciseData);
        }
    }

    async syncSavePlan(planData) {
        const tracker = window.workoutTracker;
        if (tracker && tracker.isSignedIn) {
            console.log('Syncing plan data:', planData);
        }
    }
}

// Export for use in main app
window.CacheManager = CacheManager;