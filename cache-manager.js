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
            
            // Only sync if we have authentication
            if (window.workoutTracker && window.workoutTracker.isSignedIn) {
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