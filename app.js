// Workout Tracker Application with Google Sheets Integration
// Try to import local config (for local development)
let GOOGLE_CONFIG = null;
(async () => {
    try {
        const configModule = await import('./config.js');
        GOOGLE_CONFIG = configModule.GOOGLE_CONFIG;
    } catch (e) {
        // config.js not available (e.g., in production), will fetch from API
        console.log('Local config not found, will use API endpoint');
    }
})();

class WorkoutTracker {
    constructor() {
        this.sessions = []; // Will be loaded asynchronously
        this.currentSession = { date: new Date().toISOString().split('T')[0], exercises: [] };
        this.chart = null;
        this.googleToken = null;
        this.sheetId = this.getSheetId();
        this.isSignedIn = false;
        this.googleConfig = null; // Will be set from GOOGLE_CONFIG or API
        this.exerciseList = []; // Will be loaded asynchronously - array of objects: {name, timerDuration?, youtubeLink?, isAerobic}
        this.defaultTimer = 60; // Default rest timer in seconds (1 minute)
        this.userEmail = null; // Store user email for per-user sheet ID
        this.sessionActive = false; // Track if a session is currently active
        this.restTimer = null; // Timer interval ID
        this.restTimerSeconds = 0; // Current timer seconds
        this.restTimerDuration = 60; // Default rest time in seconds (1 minute)
        this.tokenRequestInProgress = false; // Prevent multiple simultaneous token requests
        this.workoutPlans = []; // Array of workout plans: {id, name, exerciseSlots: [{slotNumber, exerciseName}], createdAt, createdBy, creatorSheetId}
        this.currentPlanIndex = -1; // Index of current active plan (-1 means no plan active)
        this.activePlanId = null; // ID of currently active plan
        this.duplicateSheetsToDelete = []; // Store duplicate sheets that can be deleted after user confirms
        this.staticSheetId = null; // Sheet ID for static/shared data (Plans, Exercises, Config)
        this.sessionsSheetId = null; // Sheet ID for private data (workout sessions)
        this.init();
    }

    async init() {
        this.setupEventListeners();
        
        // Check if signed in before loading data
        const token = localStorage.getItem('googleAccessToken');
        const tokenExpiry = localStorage.getItem('googleTokenExpiry');
        if (token && tokenExpiry && new Date() < new Date(tokenExpiry)) {
            this.googleToken = token;
            this.isSignedIn = true;
        }
        
        // Show sign-in button immediately if not signed in
        this.updateHeaderButtons();
        
        // Check for plan import from URL parameter
        const urlParams = new URLSearchParams(window.location.search);
        const planParam = urlParams.get('plan');
        const creatorSheetId = urlParams.get('sheet');
        
        // Only load data if signed in - keep empty until login
        if (this.isSignedIn) {
            // Load user info and auto-connect to sheet if already signed in
            await this.loadUserInfo();
            
            // Load default timer first
            await this.loadDefaultTimer();
            
            // Load sessions (will try Google Sheets first if signed in)
            this.sessions = await this.loadSessions();
            this.currentSession = this.getTodaySession();
            
            // Load exercise list (will try Google Sheets if signed in)
            this.exerciseList = await this.loadExerciseList();
            this.updateExerciseList(true); // Skip save during initial load - just reading
            
            // Load workout plans
            this.workoutPlans = await this.loadWorkoutPlans();
            
            // Check if plan import is requested
            if (planParam && creatorSheetId) {
                await this.importPlanFromLink(planParam, creatorSheetId);
            } else if (planParam) {
                // Plan ID only - try to find in own plans
                const plan = this.workoutPlans.find(p => p.id === planParam);
                if (plan) {
                    this.activatePlan(plan.id);
                }
            }
            
            // Load current plan index from localStorage
            const savedPlanIndex = localStorage.getItem('currentPlanIndex');
            if (savedPlanIndex !== null && this.workoutPlans.length > 0) {
                this.currentPlanIndex = parseInt(savedPlanIndex, 10);
                if (this.currentPlanIndex >= 0 && this.currentPlanIndex < this.workoutPlans.length) {
                    this.activePlanId = this.workoutPlans[this.currentPlanIndex].id;
                }
            }
        } else {
            // Keep empty until login
            this.sessions = [];
            this.currentSession = { date: new Date().toISOString().split('T')[0], exercises: [] };
            this.exerciseList = [];
            this.workoutPlans = [];
            this.updateExerciseList(true); // Skip save - no data to save
            
            // If plan parameter exists but not signed in, show message
            if (planParam) {
                alert('Please sign in with Google to import this workout plan. After signing in, a new workout sheet will be automatically created for you.');
            }
        }
        
        this.updateRepsInputs();
        this.renderTodayWorkout();
        this.renderHistory();
        this.setupTabs(); // Setup tabs first so they work immediately
        this.updateSyncStatus();
        this.updateSessionButton(); // Initialize session button state
        this.updatePlanIndicator(); // Update plan indicator in main screen
        this.updatePlanDropdown(); // Update plan dropdown
        
        // Settings removed - all data is cloud-based
        
        // Initialize Google Auth after a delay to ensure scripts are loaded
        setTimeout(() => this.initGoogleAuth(), 100);
    }

    async initGoogleAuth() {
        // Check if Google API is loaded
        if (typeof google === 'undefined' || !google.accounts) {
            console.warn('Google Identity Services not loaded yet');
            // Retry after a short delay
            setTimeout(() => this.initGoogleAuth(), 500);
            return;
        }

        // Check if credentials are configured
        const clientId = await this.getClientId();
        if (!clientId || clientId.includes('YOUR_CLIENT_ID')) {
            const buttonContainer = document.getElementById('google-signin-button');
            if (buttonContainer) {
                buttonContainer.innerHTML = 
                    '<p style="color: #999; font-size: 14px; padding: 10px;">⚠️ Please configure Google OAuth Client ID (see README.md for setup instructions)</p>';
            }
            return;
        }

        // Check if already signed in
        const token = localStorage.getItem('googleAccessToken');
        const tokenExpiry = localStorage.getItem('googleTokenExpiry');
        if (token && tokenExpiry && new Date() < new Date(tokenExpiry)) {
            this.googleToken = token;
            this.isSignedIn = true;
            // Load user info (which will auto-connect to sheet, create if needed, sync, and render)
            // This already handles loading sessions, exercises, and rendering
            await this.loadUserInfo();
            this.initGoogleSheets();
            this.updateSyncStatus();
            
            // Ensure UI is up to date (loadUserInfo/autoConnectSheet should have already done this)
            // But do a final check to make sure data is loaded
            if (!this.sessions || this.sessions.length === 0) {
                console.log('No sessions after autoConnect, attempting to load...');
                this.sessions = await this.loadSessions();
                this.currentSession = this.getTodaySession();
                this.renderTodayWorkout();
                this.renderHistory();
            }
            
            if (!this.exerciseList || this.exerciseList.length === 0) {
                console.log('No exercises after autoConnect, attempting to load...');
                this.exerciseList = await this.loadExerciseList();
                this.updateExerciseList();
            }
            
            // Update header buttons (show session, hide login)
            this.updateHeaderButtons();
        } else {
            // Not signed in - update header buttons
            this.updateHeaderButtons();
            
            // Also update settings message
            const settingsButtonContainer = document.getElementById('google-signin-button');
            if (settingsButtonContainer) {
                settingsButtonContainer.innerHTML = '<p class="settings-desc">Sign in with Google in the header to start a session</p>';
            }
        }
    }

    async loadConfig() {
        // First try to use the imported local config (for development)
        if (GOOGLE_CONFIG) {
            this.googleConfig = GOOGLE_CONFIG;
            return this.googleConfig;
        }

        // If we already loaded from API, use cached version
        if (this.googleConfig) {
            return this.googleConfig;
        }

        // Otherwise, fetch from serverless function (Vercel deployment)
        try {
            const response = await fetch('/api/config');
            if (response.ok) {
                this.googleConfig = await response.json();
                // Check if CLIENT_ID is actually set (not empty string)
                if (this.googleConfig && this.googleConfig.CLIENT_ID) {
                    return this.googleConfig;
                } else {
                    console.error('Config loaded but CLIENT_ID is empty. Check Vercel environment variables: GOOGLE_CLIENT_ID and GOOGLE_API_KEY');
                }
            } else {
                console.error('Config API returned error:', response.status, response.statusText);
            }
        } catch (error) {
            console.error('Error loading config from API:', error);
        }

        return null;
    }

    async getClientId() {
        // Load config (from local or API)
        const config = await this.loadConfig();
        const clientId = config?.CLIENT_ID || null;
        // Check if clientId is not just an empty string
        if (clientId && clientId.trim() !== '') {
            return clientId;
        }
        return null;
    }

    async getApiKey() {
        // Load config (from local or API)
        const config = await this.loadConfig();
        return config?.API_KEY || null;
    }

    async requestAccessToken() {
        // Prevent multiple simultaneous token requests
        if (this.tokenRequestInProgress) {
            console.log('Token request already in progress, skipping...');
            return;
        }

        // Check if we have a valid token first
        const existingToken = localStorage.getItem('googleAccessToken');
        const tokenExpiry = localStorage.getItem('googleTokenExpiry');
        if (existingToken && tokenExpiry && new Date() < new Date(tokenExpiry)) {
            // Token is still valid, use it
            this.googleToken = existingToken;
            this.isSignedIn = true;
            this.updateHeaderButtons();
            await this.loadUserInfo();
            this.initGoogleSheets();
            this.updateSyncStatus();
            return;
        }

        // Request OAuth2 token with proper scopes
        const clientId = await this.getClientId();
        if (!clientId) {
            alert('Google OAuth Client ID not configured.\n\nPlease check your Vercel project settings:\n1. Go to Vercel Dashboard > Your Project > Settings > Environment Variables\n2. Make sure GOOGLE_CLIENT_ID and GOOGLE_API_KEY are set\n3. Redeploy the application after setting the variables');
            return;
        }

        this.tokenRequestInProgress = true;

        const scopes = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';
        
        // Use Google Identity Services token client
        const tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: scopes,
            callback: (tokenResponse) => {
                this.tokenRequestInProgress = false;
                
                if (tokenResponse.access_token) {
                    this.googleToken = tokenResponse.access_token;
                    // Store token with expiry (subtract 2 minutes for safety, less conservative)
                    const expiry = new Date(Date.now() + (tokenResponse.expires_in - 120) * 1000);
                    localStorage.setItem('googleAccessToken', this.googleToken);
                    localStorage.setItem('googleTokenExpiry', expiry.toISOString());
                    this.isSignedIn = true;
                    
                    // Update header buttons
                    this.updateHeaderButtons();
                    
                    // Load user info (which will auto-connect to sheet, create if needed, and sync)
                    this.loadUserInfo().then(async () => {
                        this.updateSyncStatus();
                        await this.initGoogleSheets();
                        
                        // Reload sessions from Google Sheets (source of truth)
                        this.sessions = await this.loadSessions();
                        this.currentSession = this.getTodaySession();
                        this.renderTodayWorkout();
                        this.renderHistory(); // Refresh history display
                        
                        // Ensure exercise list is loaded (loadUserInfo should have done this, but ensure it)
                        const exercises = await this.loadExerciseList();
                        this.exerciseList = exercises;
                        this.updateExerciseList();
                    });
                } else if (tokenResponse.error) {
                    console.error('Sign-in error:', tokenResponse.error);
                    if (tokenResponse.error !== 'popup_closed_by_user') {
                        alert('Sign-in error: ' + tokenResponse.error);
                    }
                }
            },
        });
        
        // Request token - only show consent if user hasn't authorized before
        // Google Identity Services will automatically reuse existing consent
        tokenClient.requestAccessToken();
    }

    requestAccessTokenPromise() {
        return new Promise((resolve) => {
            // Prevent multiple simultaneous token requests
            if (this.tokenRequestInProgress) {
                console.log('Token request already in progress, waiting...');
                // Wait a bit and check if token becomes available
                setTimeout(() => {
                    const existingToken = localStorage.getItem('googleAccessToken');
                    const tokenExpiry = localStorage.getItem('googleTokenExpiry');
                    if (existingToken && tokenExpiry && new Date() < new Date(tokenExpiry)) {
                        this.googleToken = existingToken;
                        this.isSignedIn = true;
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                }, 1000);
                return;
            }

            // Check if we have a valid token first
            const existingToken = localStorage.getItem('googleAccessToken');
            const tokenExpiry = localStorage.getItem('googleTokenExpiry');
            if (existingToken && tokenExpiry && new Date() < new Date(tokenExpiry)) {
                // Token is still valid, use it
                this.googleToken = existingToken;
                this.isSignedIn = true;
                resolve(true);
                return;
            }

            // Request OAuth2 token with proper scopes
            this.getClientId().then(clientId => {
                if (!clientId) {
                    alert('Google OAuth Client ID not configured.\n\nPlease check your Vercel project settings:\n1. Go to Vercel Dashboard > Your Project > Settings > Environment Variables\n2. Make sure GOOGLE_CLIENT_ID and GOOGLE_API_KEY are set\n3. Redeploy the application after setting the variables');
                    resolve(false);
                    return;
                }

                this.tokenRequestInProgress = true;

                const scopes = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';
                
                // Use Google Identity Services token client
                const tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: clientId,
                    scope: scopes,
                    callback: (tokenResponse) => {
                        this.tokenRequestInProgress = false;
                        
                        if (tokenResponse.access_token) {
                            this.googleToken = tokenResponse.access_token;
                            // Store token with expiry (subtract 2 minutes for safety, less conservative)
                            const expiry = new Date(Date.now() + (tokenResponse.expires_in - 120) * 1000);
                            localStorage.setItem('googleAccessToken', this.googleToken);
                            localStorage.setItem('googleTokenExpiry', expiry.toISOString());
                            this.isSignedIn = true;
                            
                            // Update header buttons (show session, hide login)
                            this.updateHeaderButtons();
                            
                            // Load user info (which will auto-connect to sheet, create if needed, and sync)
                            this.loadUserInfo().then(async () => {
                                this.updateSyncStatus();
                                await this.initGoogleSheets();
                                
                                // Reload sessions from Google Sheets (source of truth)
                                this.sessions = await this.loadSessions();
                                this.currentSession = this.getTodaySession();
                                this.renderTodayWorkout();
                                this.renderHistory(); // Refresh history display
                                
                                // Ensure exercise list is loaded (loadUserInfo should have done this, but ensure it)
                                const exercises = await this.loadExerciseList();
                                this.exerciseList = exercises;
                                this.updateExerciseList();
                            });
                            
                            resolve(true);
                        } else if (tokenResponse.error) {
                            if (tokenResponse.error !== 'popup_closed_by_user') {
                                console.error('Sign-in error:', tokenResponse.error);
                            }
                            resolve(false);
                        }
                    },
                });
                
                // Request token - only show consent if user hasn't authorized before
                // Google Identity Services will automatically reuse existing consent
                tokenClient.requestAccessToken();
            }).catch(() => {
                this.tokenRequestInProgress = false;
                resolve(false);
            });
        });
    }

    async loadUserInfo() {
        if (!this.googleToken) return;
        try {
            const response = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${this.googleToken}`);
            if (response.ok) {
                const data = await response.json();
                if (data.name || data.email) {
                    // User info display removed (settings tab removed)
                    
                    // Store user email for sheet ID lookup
                    if (data.email) {
                        this.userEmail = data.email;
                        // Automatically load and connect to their sheet
                        await this.autoConnectSheet(data.email);
                    }
                }
            }
        } catch (error) {
            console.error('Error loading user info:', error);
        }
    }

    async autoConnectSheet(userEmail) {
        // Check for both new sheet IDs first
        let staticSheetId = this.getStaticSheetIdForUser(userEmail);
        let sessionsSheetId = this.getSessionsSheetIdForUser(userEmail);
        
        // If both new sheet IDs exist, migration is already complete - skip migration check
        if (staticSheetId && sessionsSheetId) {
            console.log('Both sheet IDs found, migration already completed');
        } else {
            // Check if we need to migrate (old sheetId exists but new ones don't)
            const userSheetIds = JSON.parse(localStorage.getItem('userSheetIds') || '{}');
            const userData = userSheetIds[userEmail];
            let oldSheetId = null;
            
            // Only consider it an old sheet ID if it's stored as a string (old format)
            // and not as part of the new object format
            if (userData && typeof userData === 'string') {
                oldSheetId = userData;
            } else {
                // Also check the general localStorage for backward compatibility
                const generalSheetId = localStorage.getItem('sheetId');
                if (generalSheetId) {
                    oldSheetId = generalSheetId;
                }
            }
            
            if (oldSheetId && (!staticSheetId || !sessionsSheetId)) {
                // Verify this is actually an old sheet (not already migrated)
                // Check if the sheet name contains "Config" or "Sessions" - if so, it's already migrated
                try {
                    await this.initGoogleSheets();
                    if (gapi.client) {
                        gapi.client.setToken({ access_token: this.googleToken });
                    }
                    
                    const sheetInfo = await gapi.client.sheets.spreadsheets.get({
                        spreadsheetId: oldSheetId
                    });
                    const sheetName = sheetInfo.result?.properties?.title || '';
                    
                    // If sheet name contains "Config" or "Sessions", it's already a new format sheet
                    // Don't migrate, just clear old reference and try to find the matching sheets
                    if (sheetName.includes('Config') || sheetName.includes('Sessions')) {
                        console.log('Sheet appears to be already migrated, clearing old reference and searching for matching sheets');
                        // Clear old reference
                        if (userData && typeof userData === 'string') {
                            delete userSheetIds[userEmail];
                            localStorage.setItem('userSheetIds', JSON.stringify(userSheetIds));
                        }
                        localStorage.removeItem('sheetId');
                        // Don't return - continue to search for both sheets below
                    } else if (!sheetName.includes('OLD') && !sheetName.includes('Migrated')) {
                        // This is an old sheet (not already migrated), perform migration
                        console.log('Old sheet format detected, starting migration...');
                        
                        // Perform migration
                        const { staticSheetId: newStaticId, sessionsSheetId: newSessionsId } = await this.migrateToTwoSheets(oldSheetId);
                        staticSheetId = newStaticId;
                        sessionsSheetId = newSessionsId;
                        this.staticSheetId = staticSheetId;
                        this.sessionsSheetId = sessionsSheetId;
                        
                        // Clear old sheetId completely from all storage locations
                        if (userData && typeof userData === 'string') {
                            delete userSheetIds[userEmail];
                            localStorage.setItem('userSheetIds', JSON.stringify(userSheetIds));
                        }
                        localStorage.removeItem('sheetId');
                        
                        // Complete connection with new sheets
                        await this.completeSheetConnection(sessionsSheetId);
                        return;
                    } else {
                        // Sheet is marked as OLD/Migrated, clear reference and continue
                        console.log('Old migrated sheet found, clearing reference');
                        if (userData && typeof userData === 'string') {
                            delete userSheetIds[userEmail];
                            localStorage.setItem('userSheetIds', JSON.stringify(userSheetIds));
                        }
                        localStorage.removeItem('sheetId');
                    }
                } catch (error) {
                    console.error('Migration check failed:', error);
                    // If we can't verify, don't attempt migration - just continue
                }
            }
        }
        
        // Validate both sheet IDs if they exist
        if (staticSheetId) {
            try {
                await this.initGoogleSheets();
                if (gapi.client) {
                    gapi.client.setToken({ access_token: this.googleToken });
                }
                await gapi.client.sheets.spreadsheets.get({
                    spreadsheetId: staticSheetId
                });
                console.log('Static sheet ID is valid:', staticSheetId);
                this.staticSheetId = staticSheetId;
            } catch (error) {
                console.warn('Static sheet ID is invalid:', error);
                staticSheetId = null;
                this.saveStaticSheetIdForUser(userEmail, null);
            }
        }
        
        if (sessionsSheetId) {
            try {
                await this.initGoogleSheets();
                if (gapi.client) {
                    gapi.client.setToken({ access_token: this.googleToken });
                }
                await gapi.client.sheets.spreadsheets.get({
                    spreadsheetId: sessionsSheetId
                });
                console.log('Sessions sheet ID is valid:', sessionsSheetId);
                this.sessionsSheetId = sessionsSheetId;
            } catch (error) {
                console.warn('Sessions sheet ID is invalid:', error);
                sessionsSheetId = null;
                this.saveSessionsSheetIdForUser(userEmail, null);
            }
        }
        
        // If either sheet is missing, search for them or create new ones
        if (!staticSheetId || !sessionsSheetId) {
            try {
                // Search for both sheets by name
                const staticSheetName = 'Workout Tracker - Config';
                const sessionsSheetName = 'Workout Tracker - Sessions';
                
                let foundStaticSheet = null;
                let foundSessionsSheet = null;
                
                if (!staticSheetId) {
                    // Search for sheets that start with "Workout Tracker - Config"
                    const staticSheets = await this.findSheetByName(staticSheetName);
                    // Filter to only sheets that start with the exact base name (exclude OLD/Migrated)
                    const validStaticSheets = staticSheets.filter(sheet => 
                        sheet.name.startsWith('Workout Tracker - Config') && 
                        !sheet.name.includes('OLD') && 
                        !sheet.name.includes('Migrated')
                    );
                    // Results are already sorted by modifiedTime desc from the API
                    if (validStaticSheets.length > 0) {
                        foundStaticSheet = validStaticSheets[0];
                        staticSheetId = foundStaticSheet.id;
                        this.saveStaticSheetIdForUser(userEmail, staticSheetId);
                        this.staticSheetId = staticSheetId;
                        console.log('Found static sheet:', staticSheetId, 'Name:', foundStaticSheet.name);
                    }
                }
                
                if (!sessionsSheetId) {
                    // Search for sheets that start with "Workout Tracker - Sessions"
                    const sessionsSheets = await this.findSheetByName(sessionsSheetName);
                    // Filter to only sheets that start with the exact base name (exclude OLD/Migrated)
                    const validSessionsSheets = sessionsSheets.filter(sheet => 
                        sheet.name.startsWith('Workout Tracker - Sessions') && 
                        !sheet.name.includes('OLD') && 
                        !sheet.name.includes('Migrated')
                    );
                    // Results are already sorted by modifiedTime desc from the API
                    if (validSessionsSheets.length > 0) {
                        foundSessionsSheet = validSessionsSheets[0];
                        sessionsSheetId = foundSessionsSheet.id;
                        this.saveSessionsSheetIdForUser(userEmail, sessionsSheetId);
                        this.sessionsSheetId = sessionsSheetId;
                        console.log('Found sessions sheet:', sessionsSheetId, 'Name:', foundSessionsSheet.name);
                    }
                }
                
                // If either sheet is still missing, create both
                if (!staticSheetId || !sessionsSheetId) {
                    console.log('Creating both sheets...');
                    const { staticSheetId: newStaticId, sessionsSheetId: newSessionsId } = await this.createBothSheets();
                    if (!staticSheetId) {
                        staticSheetId = newStaticId;
                        this.staticSheetId = staticSheetId;
                    }
                    if (!sessionsSheetId) {
                        sessionsSheetId = newSessionsId;
                        this.sessionsSheetId = sessionsSheetId;
                    }
                    
                    const sheetStatus = document.getElementById('sheet-status');
                    if (sheetStatus) {
                        sheetStatus.innerHTML = '<p style="color: green;">✓ Created and connected to your sheets</p>';
                    }
                }
            } catch (error) {
                console.error('Error searching/creating sheets:', error);
                // If search fails, try creating both sheets as fallback
                try {
                    console.log('Creating both sheets as fallback...');
                    const { staticSheetId: newStaticId, sessionsSheetId: newSessionsId } = await this.createBothSheets();
                    staticSheetId = newStaticId;
                    sessionsSheetId = newSessionsId;
                    this.staticSheetId = staticSheetId;
                    this.sessionsSheetId = sessionsSheetId;
                } catch (createError) {
                    console.error('Failed to create sheets as fallback:', createError);
                    const sheetStatus = document.getElementById('sheet-status');
                    if (sheetStatus) {
                        sheetStatus.innerHTML = '<p style="color: red;">Error creating sheets. Please try again.</p>';
                    }
                    return;
                }
            }
        }
        
        // Complete connection with sessions sheet (for backward compatibility)
        if (sessionsSheetId) {
            await this.completeSheetConnection(sessionsSheetId);
            
            // Update status if not already set
            const sheetStatus = document.getElementById('sheet-status');
            if (sheetStatus && !sheetStatus.innerHTML.includes('Connected') && !sheetStatus.innerHTML.includes('Created')) {
                sheetStatus.innerHTML = '<p style="color: green;">✓ Connected to your sheets</p>';
            }
        }
    }

    async createNewSheet(sheetName = 'Workout Tracker', makeUnique = false, sheetType = 'sessions') {
        try {
            await this.initGoogleSheets();
            
            // CRITICAL: Ensure token is set before creating sheet
            if (gapi.client) {
                gapi.client.setToken({ access_token: this.googleToken });
                console.log('Token set for createNewSheet');
            } else {
                throw new Error('gapi.client not available');
            }
            
            // If makeUnique is true and we can't search for existing sheets, add timestamp to avoid duplicates
            let finalSheetName = sheetName;
            if (makeUnique) {
                const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
                finalSheetName = `${sheetName} (${timestamp})`;
            }
            
            let sheets = [];
            let headers = [];
            
            if (sheetType === 'static') {
                // Static sheet: Plans, Exercises, Config tabs
                sheets = [
                    {
                        properties: {
                            title: 'Plans',
                            gridProperties: {
                                rowCount: 1000,
                                columnCount: 6
                            }
                        }
                    },
                    {
                        properties: {
                            title: 'Exercises',
                            gridProperties: {
                                rowCount: 1000,
                                columnCount: 4
                            }
                        }
                    },
                    {
                        properties: {
                            title: 'Config',
                            gridProperties: {
                                rowCount: 100,
                                columnCount: 1
                            }
                        }
                    }
                ];
            } else {
                // Sessions sheet: Only Sheet1 for workout sessions
                sheets = [
                    {
                        properties: {
                            title: 'Sheet1',
                            gridProperties: {
                                rowCount: 1000,
                                columnCount: 7
                            }
                        }
                    }
                ];
            }
            
            // Create a new spreadsheet with the provided name
            const response = await gapi.client.sheets.spreadsheets.create({
                properties: {
                    title: finalSheetName
                },
                sheets: sheets
            });
            
            const spreadsheetId = response.result.spreadsheetId;
            
            // Ensure token is still set for update operations
            if (gapi.client) {
                gapi.client.setToken({ access_token: this.googleToken });
            }
            
            if (sheetType === 'static') {
                // Set up headers for Plans tab
                await gapi.client.sheets.spreadsheets.values.update({
                    spreadsheetId: spreadsheetId,
                    range: 'Plans!A1:F1',
                    valueInputOption: 'RAW',
                    resource: {
                        values: [['ID', 'Name', 'ExerciseSlots', 'CreatedAt', 'CreatedBy', 'CreatorSheetId']]
                    }
                });
                
                // Set up headers for Exercises tab
                await gapi.client.sheets.spreadsheets.values.update({
                    spreadsheetId: spreadsheetId,
                    range: 'Exercises!A1:D1',
                    valueInputOption: 'RAW',
                    resource: {
                        values: [['Name', 'Timer', 'YouTube', 'Aerobic']]
                    }
                });
                
                // Config tab doesn't need headers, just data in A1
            } else {
                // Set up headers for Sheet1 (sessions)
                await gapi.client.sheets.spreadsheets.values.update({
                    spreadsheetId: spreadsheetId,
                    range: 'Sheet1!A1:G1',
                    valueInputOption: 'RAW',
                    resource: {
                        values: [['Date', 'Exercise', 'Set', 'Reps', 'Weight (kg)', 'Difficulty', 'Notes']]
                    }
                });
            }
            
            return spreadsheetId;
        } catch (error) {
            console.error('Error creating new sheet:', error);
            throw error;
        }
    }

    async createBothSheets() {
        try {
            // Create static sheet with exact name (no date)
            const staticSheetName = 'Workout Tracker - Config';
            const staticSheetId = await this.createNewSheet(staticSheetName, false, 'static');
            console.log('Created static sheet:', staticSheetId);
            
            // Create sessions sheet with exact name (no date)
            const sessionsSheetName = 'Workout Tracker - Sessions';
            const sessionsSheetId = await this.createNewSheet(sessionsSheetName, false, 'sessions');
            console.log('Created sessions sheet:', sessionsSheetId);
            
            // Save both sheet IDs
            if (this.userEmail) {
                this.saveStaticSheetIdForUser(this.userEmail, staticSheetId);
                this.saveSessionsSheetIdForUser(this.userEmail, sessionsSheetId);
            } else {
                localStorage.setItem('staticSheetId', staticSheetId);
                localStorage.setItem('sessionsSheetId', sessionsSheetId);
            }
            
            this.staticSheetId = staticSheetId;
            this.sessionsSheetId = sessionsSheetId;
            
            return { staticSheetId, sessionsSheetId };
        } catch (error) {
            console.error('Error creating both sheets:', error);
            throw error;
        }
    }

    async migrateToTwoSheets(oldSheetId) {
        try {
            console.log('Starting migration from single sheet to two sheets...');
            await this.initGoogleSheets();
            
            if (gapi.client) {
                gapi.client.setToken({ access_token: this.googleToken });
            }
            
            // Read all tabs from old sheet
            const oldSheetResponse = await gapi.client.sheets.spreadsheets.get({
                spreadsheetId: oldSheetId
            });
            const oldSheets = oldSheetResponse.result.sheets || [];
            const oldSheetNames = oldSheets.map(s => s.properties.title);
            
            console.log('Old sheet tabs:', oldSheetNames);
            
            // Create new sheets
            const { staticSheetId, sessionsSheetId } = await this.createBothSheets();
            console.log('Created new sheets - Static:', staticSheetId, 'Sessions:', sessionsSheetId);
            
            // Copy Plans tab if it exists
            if (oldSheetNames.includes('Plans')) {
                try {
                    const plansData = await gapi.client.sheets.spreadsheets.values.get({
                        spreadsheetId: oldSheetId,
                        range: 'Plans!A2:F1000'
                    });
                    if (plansData.result.values && plansData.result.values.length > 0) {
                        await gapi.client.sheets.spreadsheets.values.update({
                            spreadsheetId: staticSheetId,
                            range: 'Plans!A2',
                            valueInputOption: 'RAW',
                            resource: { values: plansData.result.values }
                        });
                        console.log('Copied Plans tab');
                    }
                } catch (e) {
                    console.warn('Error copying Plans tab:', e);
                }
            }
            
            // Copy Exercises tab if it exists
            if (oldSheetNames.includes('Exercises')) {
                try {
                    const exercisesData = await gapi.client.sheets.spreadsheets.values.get({
                        spreadsheetId: oldSheetId,
                        range: 'Exercises!A2:D1000'
                    });
                    if (exercisesData.result.values && exercisesData.result.values.length > 0) {
                        await gapi.client.sheets.spreadsheets.values.update({
                            spreadsheetId: staticSheetId,
                            range: 'Exercises!A2',
                            valueInputOption: 'RAW',
                            resource: { values: exercisesData.result.values }
                        });
                        console.log('Copied Exercises tab');
                    }
                } catch (e) {
                    console.warn('Error copying Exercises tab:', e);
                }
            }
            
            // Copy Config tab if it exists
            if (oldSheetNames.includes('Config')) {
                try {
                    const configData = await gapi.client.sheets.spreadsheets.values.get({
                        spreadsheetId: oldSheetId,
                        range: 'Config!A1:A100'
                    });
                    if (configData.result.values && configData.result.values.length > 0) {
                        await gapi.client.sheets.spreadsheets.values.update({
                            spreadsheetId: staticSheetId,
                            range: 'Config!A1',
                            valueInputOption: 'RAW',
                            resource: { values: configData.result.values }
                        });
                        console.log('Copied Config tab');
                    }
                } catch (e) {
                    console.warn('Error copying Config tab:', e);
                }
            }
            
            // Copy Sheet1 (sessions) to new sessions sheet
            if (oldSheetNames.includes('Sheet1')) {
                try {
                    const sessionsData = await gapi.client.sheets.spreadsheets.values.get({
                        spreadsheetId: oldSheetId,
                        range: 'Sheet1!A2:G10000'
                    });
                    if (sessionsData.result.values && sessionsData.result.values.length > 0) {
                        await gapi.client.sheets.spreadsheets.values.update({
                            spreadsheetId: sessionsSheetId,
                            range: 'Sheet1!A2',
                            valueInputOption: 'RAW',
                            resource: { values: sessionsData.result.values }
                        });
                        console.log('Copied Sheet1 (sessions)');
                    }
                } catch (e) {
                    console.warn('Error copying Sheet1:', e);
                }
            }
            
            // Optionally rename old sheet to archive it
            try {
                const oldSheetName = oldSheetResponse.result.properties.title;
                await gapi.client.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: oldSheetId,
                    resource: {
                        requests: [{
                            updateSpreadsheetProperties: {
                                properties: {
                                    title: `${oldSheetName} - OLD (Migrated)`
                                },
                                fields: 'title'
                            }
                        }]
                    }
                });
                console.log('Archived old sheet');
            } catch (e) {
                console.warn('Error archiving old sheet:', e);
            }
            
            // Save both new sheet IDs
            if (this.userEmail) {
                this.saveStaticSheetIdForUser(this.userEmail, staticSheetId);
                this.saveSessionsSheetIdForUser(this.userEmail, sessionsSheetId);
            } else {
                localStorage.setItem('staticSheetId', staticSheetId);
                localStorage.setItem('sessionsSheetId', sessionsSheetId);
            }
            
            this.staticSheetId = staticSheetId;
            this.sessionsSheetId = sessionsSheetId;
            
            console.log('Migration completed successfully');
            alert('✅ Migration completed! Your data has been split into two sheets:\n' +
                  '• "Workout Tracker - Config" (for plans and exercises - safe to share)\n' +
                  '• "Workout Tracker - Sessions" (for your workout data - private)\n\n' +
                  'Your old sheet has been archived.');
            
            return { staticSheetId, sessionsSheetId };
        } catch (error) {
            console.error('Error during migration:', error);
            alert('❌ Migration failed. Please try again or contact support.');
            throw error;
        }
    }

    updateHeaderButtons() {
        const headerButtonContainer = document.getElementById('google-signin-button-header');
        const sessionBtn = document.getElementById('session-btn');
        
        if (!this.isSignedIn) {
            // Show login button in header, hide session button
            if (headerButtonContainer) {
                headerButtonContainer.innerHTML = '';
                const signInBtn = document.createElement('button');
                signInBtn.className = 'btn-primary';
                signInBtn.style.cssText = 'width: auto; padding: 10px 20px; margin: 0;';
                signInBtn.textContent = '🔐 Sign in with Google';
                signInBtn.onclick = () => this.requestAccessToken();
                headerButtonContainer.appendChild(signInBtn);
            }
            if (sessionBtn) {
                sessionBtn.style.display = 'none';
            }
        } else {
            // Hide login button, show session button
            if (headerButtonContainer) {
                headerButtonContainer.innerHTML = '';
            }
            if (sessionBtn) {
                sessionBtn.style.display = 'block';
            }
        }
    }

    updatePlanDropdown() {
        const planDropdown = document.getElementById('select-plan-dropdown');
        const startSessionBtn = document.getElementById('start-session-btn');
        
        if (!planDropdown) return;
        
        // Only show in Track Workout tab
        const trackTab = document.getElementById('track-tab');
        if (!trackTab || !trackTab.classList.contains('active')) {
            planDropdown.style.display = 'none';
            if (startSessionBtn) startSessionBtn.style.display = 'none';
            return;
        }
        
        // Only show if signed in
        if (!this.isSignedIn) {
            planDropdown.style.display = 'none';
            if (startSessionBtn) startSessionBtn.style.display = 'none';
            return;
        }
        
        // Clear existing options except the first one
        planDropdown.innerHTML = '<option value="">Select Plan...</option>';
        
        // Add plans if they exist
        if (this.workoutPlans && this.workoutPlans.length > 0) {
            this.workoutPlans.forEach(plan => {
                const option = document.createElement('option');
                option.value = plan.id;
                option.textContent = plan.name;
                if (this.activePlanId === plan.id) {
                    option.selected = true;
                }
                planDropdown.appendChild(option);
            });
            planDropdown.style.display = 'block';
        } else {
            planDropdown.style.display = 'none';
        }
        
        // Show start session button if signed in
        if (startSessionBtn) {
            startSessionBtn.style.display = 'block';
        }
    }

    signOut() {
        google.accounts.id.disableAutoSelect();
        if (this.googleToken) {
            google.accounts.oauth2.revoke(this.googleToken);
        }
        this.googleToken = null;
        this.isSignedIn = false;
        this.sheetId = null;
        this.userEmail = null;
        localStorage.removeItem('googleAccessToken');
        localStorage.removeItem('googleTokenExpiry');
        localStorage.removeItem('sheetId');
        
        // Clear user-specific sheet IDs
        if (this.userEmail) {
            this.saveSheetIdForUser(this.userEmail, null);
        }
        
        // Update UI (settings removed - all cloud-based)
        this.updateSyncStatus();
        this.updateHeaderButtons(); // Update header buttons
        
        // Clear data - keep empty until login
        this.sessions = [];
        this.currentSession = { date: new Date().toISOString().split('T')[0], exercises: [] };
        this.exerciseList = [];
        this.updateExerciseList();
        this.renderTodayWorkout();
        this.renderHistory();
    }

    async ensureValidToken() {
        // Check if token exists and is valid
        const token = localStorage.getItem('googleAccessToken');
        const tokenExpiry = localStorage.getItem('googleTokenExpiry');
        
        if (token && tokenExpiry) {
            const expiryDate = new Date(tokenExpiry);
            const now = new Date();
            const timeUntilExpiry = expiryDate.getTime() - now.getTime();
            
            // If token is expired or will expire in less than 1 minute, refresh it
            if (timeUntilExpiry < 60000) {
                console.log('Token expired or near expiry, refreshing...');
                // Token is expired or about to expire, request a new one
                await this.requestAccessTokenPromise();
            } else {
                // Token is still valid
                this.googleToken = token;
                this.isSignedIn = true;
            }
        } else if (!this.googleToken) {
            // No token at all, need to request one
            console.log('No token found, requesting new token...');
            await this.requestAccessTokenPromise();
        }
    }

    async initGoogleSheets() {
        // Ensure we have a valid token before initializing
        await this.ensureValidToken();
        
        if (!this.googleToken || !gapi) {
            console.warn('Cannot init Google Sheets: token or gapi missing', {
                hasToken: !!this.googleToken,
                hasGapi: !!gapi
            });
            return;
        }
        
        try {
            // Load the client library if not already loaded
            if (!gapi.client) {
                await new Promise((resolve) => {
                    gapi.load('client', resolve);
                });
            }
            
            const apiKey = await this.getApiKey();
            if (!apiKey) {
                console.error('Google API Key not configured');
                return;
            }
            
            // Only initialize if not already initialized
            if (!gapi.client.sheets) {
                await gapi.client.init({
                    apiKey: apiKey,
                    discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
                });
            }
            
            // Always set the token before making API calls (in case it changed or expired)
            // This is critical - the token must be set for every API call
            gapi.client.setToken({ access_token: this.googleToken });
            console.log('Google Sheets API initialized with token');
        } catch (error) {
            console.error('Error initializing Google Sheets:', error);
            throw error; // Re-throw so callers can handle it
        }
    }

    async initGoogleDrive() {
        if (!this.googleToken || !gapi) {
            console.warn('Cannot init Google Drive: token or gapi missing', {
                hasToken: !!this.googleToken,
                hasGapi: !!gapi
            });
            return;
        }
        
        try {
            // Load the client library if not already loaded
            if (!gapi.client) {
                await new Promise((resolve) => {
                    gapi.load('client', resolve);
                });
            }
            
            const apiKey = await this.getApiKey();
            if (!apiKey) {
                console.error('Google API Key not configured');
                return;
            }
            
            // If Sheets API is already initialized, we can add Drive API to the same client
            // Otherwise, initialize both together
            if (!gapi.client.drive) {
                if (gapi.client.sheets) {
                    // Sheets already initialized, add Drive API
                    try {
                        await gapi.client.load('drive', 'v3');
                    } catch (loadError) {
                        console.warn('Failed to load Drive API separately, re-initializing with both APIs:', loadError);
                        // If loading fails, re-initialize with both APIs
                        await gapi.client.init({
                            apiKey: apiKey,
                            discoveryDocs: [
                                'https://sheets.googleapis.com/$discovery/rest?version=v4',
                                'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
                            ],
                        });
                    }
                } else {
                    // Initialize both APIs together
                    await gapi.client.init({
                        apiKey: apiKey,
                        discoveryDocs: [
                            'https://sheets.googleapis.com/$discovery/rest?version=v4',
                            'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
                        ],
                    });
                }
            }
            
            // Always set the token before making API calls (in case it changed or expired)
            // This is critical - the token must be set for every API call
            gapi.client.setToken({ access_token: this.googleToken });
            console.log('Google Drive API initialized with token');
        } catch (error) {
            console.error('Error initializing Google Drive:', error);
            throw error; // Re-throw so callers can handle it
        }
    }

    setupEventListeners() {
        document.getElementById('save-workout').addEventListener('click', () => this.saveExercise());
        document.getElementById('sets').addEventListener('input', () => this.updateRepsInputs());
        document.getElementById('exercise-filter').addEventListener('change', () => this.renderHistory());
        document.getElementById('time-filter').addEventListener('change', () => this.renderHistory());
        // Settings tab removed - all data is cloud-based
        // Settings tab removed - all data is cloud-based
        document.getElementById('session-btn').addEventListener('click', () => this.handleSessionButton());
        
        // Start session button in track tab
        const startSessionBtn = document.getElementById('start-session-btn');
        if (startSessionBtn) {
            startSessionBtn.addEventListener('click', async () => {
                if (this.sessionActive) {
                    await this.endSession();
                } else {
                    await this.startSession();
                }
            });
        }
        
        // Plan dropdown change handler
        const planDropdown = document.getElementById('select-plan-dropdown');
        if (planDropdown) {
            planDropdown.addEventListener('change', async (e) => {
                const selectedPlanId = e.target.value.trim();
                if (selectedPlanId) {
                    // Activate the selected plan
                    this.activatePlan(selectedPlanId);
                    // Update exercise list to show only plan exercises
                    this.updateExerciseList();
                } else {
                    // Clear plan if "Select Plan..." is chosen
                    this.clearActivePlan();
                    this.updateExerciseList();
                }
            });
        }
        
        const skipTimerBtn = document.getElementById('skip-timer-btn');
        if (skipTimerBtn) {
            skipTimerBtn.addEventListener('click', () => this.stopRestTimer());
        }
        
        // Exercise name select change handler
        document.getElementById('exercise-name').addEventListener('change', (e) => {
            const selectedExercise = e.target.value.trim();
            
            // Clear timer completely when a new exercise is selected
            if (selectedExercise && selectedExercise !== '') {
                this.stopRestTimer();
            }
            
            // Don't hide the input field immediately - let it linger
            // Only hide if a value is actually selected (not empty)
            if (selectedExercise && selectedExercise !== '') {
                const newInput = document.getElementById('exercise-name-new');
                // Only hide if the new input is empty
                if (!newInput.value.trim()) {
                    newInput.style.display = 'none';
                    newInput.value = '';
                }
                
                // Update reps/duration inputs based on exercise type
                this.updateRepsInputs();
                
                // Show last time and recommendations for selected exercise
                this.showExercisePreview(selectedExercise);
            } else {
                // Clear recommendations if no exercise selected
                const container = document.getElementById('recommendations-content');
                container.innerHTML = '<p class="no-data">Select an exercise to see your last session and recommendations</p>';
                // Reset to default reps/weight inputs
                this.updateRepsInputs();
            }
        });

        // Add exercise button
        document.getElementById('add-exercise-btn').addEventListener('click', () => this.showAddExercise());
        
        // Add exercise on Enter key in new exercise input
        document.getElementById('exercise-name-new').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addNewExercise();
            }
        });

        // Show add exercise input when select is focused and empty
        document.getElementById('exercise-name').addEventListener('focus', () => {
            const select = document.getElementById('exercise-name');
            const newInput = document.getElementById('exercise-name-new');
            if (!select.value) {
                newInput.style.display = 'block';
            }
        });

        // Keep input visible when typing in it
        document.getElementById('exercise-name-new').addEventListener('input', () => {
            document.getElementById('exercise-name-new').style.display = 'block';
        });
        
    }

    setupTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const tab = btn.dataset.tab;
                if (!tab) {
                    console.error('Tab button missing data-tab attribute');
                    return;
                }
                
                const tabElement = document.getElementById(`${tab}-tab`);
                if (!tabElement) {
                    console.error(`Tab element not found: ${tab}-tab`);
                    return;
                }
                
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                tabElement.classList.add('active');
                
                if (tab === 'history') {
                    // Reload from Google Sheets when history tab is opened (to ensure latest data)
                    (async () => {
                        if (this.isSignedIn && this.sheetId) {
                            try {
                                console.log('Reloading sessions for history tab...');
                                const sessions = await this.loadSessions();
                                console.log('Sessions loaded:', sessions?.length || 0);
                                this.sessions = sessions || [];
                                this.currentSession = this.getTodaySession();
                                
                                // Also reload exercise list to ensure it's up to date
                                const exercises = await this.loadExerciseList();
                                if (exercises && exercises.length > 0) {
                                    this.exerciseList = exercises;
                                    this.updateExerciseList(true); // Skip save - just reading
                                }
                                
                                this.renderHistory();
                            } catch (error) {
                                console.error('Error reloading sessions for history tab:', error);
                                // Still render with whatever we have
                                this.renderHistory();
                            }
                        } else {
                            this.renderHistory();
                        }
                    })();
                } else if (tab === 'config') {
                    // Render configuration tab
                    this.renderConfigurationTab();
                } else if (tab === 'plan') {
                    // Render plan mode tab
                    this.renderPlanModeTab();
                } else if (tab === 'track') {
                    // Update plan dropdown and session button when track tab is opened
                    this.updatePlanDropdown();
                    this.updateSessionButtonInTrackTab();
                }
            });
        });
        
        // Setup configuration tab event handlers
        this.setupConfigurationHandlers();
        
        // Setup plan mode tab event handlers
        this.setupPlanHandlers();
    }

    setupConfigurationHandlers() {
        // Save default timer button
        const saveDefaultTimerBtn = document.getElementById('save-default-timer');
        if (saveDefaultTimerBtn) {
            saveDefaultTimerBtn.addEventListener('click', () => this.saveDefaultTimer());
        }
        
        // Add exercise configuration button
        const addExerciseConfigBtn = document.getElementById('add-exercise-config');
        if (addExerciseConfigBtn) {
            addExerciseConfigBtn.addEventListener('click', () => this.addExerciseConfiguration());
        }
    }

    async renderConfigurationTab() {
        // Load default timer from Google Sheets if available
        await this.loadDefaultTimer();
        
        // Set default timer input
        const defaultTimerInput = document.getElementById('default-timer');
        if (defaultTimerInput) {
            defaultTimerInput.value = this.formatRestTimer(this.defaultTimer);
        }
        
        // Render exercise configuration list
        this.renderExerciseConfigList();
    }

    renderExerciseConfigList() {
        const container = document.getElementById('exercise-config-list');
        if (!container) return;
        
        // Normalize exercise list
        const normalizedList = this.normalizeExerciseList(this.exerciseList);
        
        if (normalizedList.length === 0) {
            container.innerHTML = '<p class="no-data">No exercises configured. Add exercises in the Track Workout tab or below.</p>';
            return;
        }
        
        let html = '<div class="exercise-config-table">';
        html += '<div class="exercise-config-header">';
        html += '<div>Exercise Name</div>';
        html += '<div>Rest Timer (M:S)</div>';
        html += '<div>YouTube Link</div>';
        html += '<div>Aerobic</div>';
        html += '<div>Actions</div>';
        html += '</div>';
        
        normalizedList.forEach((exercise, index) => {
            const timerStr = exercise.timerDuration ? this.formatRestTimer(exercise.timerDuration) : '';
            const youtubeLink = exercise.youtubeLink || '';
            const isAerobic = exercise.isAerobic ? '✓' : '';
            
            html += `<div class="exercise-config-row" data-index="${index}">`;
            html += `<div>${exercise.name}</div>`;
            html += `<div>${timerStr}</div>`;
            html += `<div>${youtubeLink ? `<a href="${youtubeLink}" target="_blank">Link</a>` : '-'}</div>`;
            html += `<div>${isAerobic}</div>`;
            html += `<div><button class="btn-secondary edit-exercise-config" data-index="${index}" style="padding: 5px 10px; font-size: 12px; margin-right: 5px;">Edit</button><button class="btn-danger delete-exercise-config" data-index="${index}" style="padding: 5px 10px; font-size: 12px;">Delete</button></div>`;
            html += `</div>`;
        });
        
        html += '</div>';
        container.innerHTML = html;
        
        // Add event listeners for edit/delete buttons
        container.querySelectorAll('.edit-exercise-config').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                this.editExerciseConfiguration(index);
            });
        });
        
        container.querySelectorAll('.delete-exercise-config').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                this.deleteExerciseConfiguration(index);
            });
        });
    }

    async saveDefaultTimer() {
        const defaultTimerInput = document.getElementById('default-timer');
        if (!defaultTimerInput) return;
        
        const timerStr = defaultTimerInput.value.trim();
        const parsed = this.parseRestTimer(timerStr);
        
        if (parsed === null) {
            alert('Please enter a valid timer duration in M:S format (e.g., 1:30)');
            return;
        }
        
        this.defaultTimer = parsed;
        this.restTimerDuration = parsed; // Also update current rest timer duration
        
        // Save to Google Sheets
        if (this.isSignedIn && this.sheetId) {
            try {
                await this.saveDefaultTimerToSheet();
                alert('Default timer saved successfully!');
            } catch (error) {
                console.error('Error saving default timer:', error);
                alert('Error saving default timer. Please try again.');
            }
        } else {
            alert('Please sign in to save configuration.');
        }
    }

    async loadDefaultTimer() {
        const staticSheetId = this.getStaticSheetId();
        if (!this.isSignedIn || !staticSheetId) return;
        
        try {
            await this.initGoogleSheets();
            const response = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: staticSheetId,
                range: 'Config!A1'
            });
            
            if (response.result.values && response.result.values.length > 0 && response.result.values[0].length > 0) {
                const timerStr = String(response.result.values[0][0]).trim();
                const parsed = this.parseRestTimer(timerStr);
                if (parsed !== null) {
                    this.defaultTimer = parsed;
                    this.restTimerDuration = parsed;
                }
            }
        } catch (error) {
            // Config sheet might not exist yet, that's okay
            console.log('Config sheet not found or error loading default timer:', error.message);
        }
    }

    async saveDefaultTimerToSheet() {
        const staticSheetId = this.getStaticSheetId();
        if (!this.isSignedIn || !staticSheetId) return;
        
        try {
            await this.initGoogleSheets();
            
            // Try to get Config sheet, create if it doesn't exist
            try {
                const response = await gapi.client.sheets.spreadsheets.get({
                    spreadsheetId: staticSheetId
                });
                const sheets = response.result.sheets || [];
                const configSheet = sheets.find(s => s.properties.title === 'Config');
                
                if (!configSheet) {
                    // Create Config sheet
                    await gapi.client.sheets.spreadsheets.batchUpdate({
                        spreadsheetId: staticSheetId,
                        resource: {
                            requests: [{
                                addSheet: {
                                    properties: {
                                        title: 'Config',
                                        gridProperties: {
                                            rowCount: 10,
                                            columnCount: 1
                                        }
                                    }
                                }
                            }]
                        }
                    });
                }
            } catch (error) {
                console.error('Error checking/creating Config sheet:', error);
            }
            
            // Save default timer
            const timerStr = this.formatRestTimer(this.defaultTimer);
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: staticSheetId,
                range: 'Config!A1',
                valueInputOption: 'RAW',
                resource: { values: [[timerStr]] }
            });
        } catch (error) {
            console.error('Error saving default timer to sheet:', error);
            throw error;
        }
    }

    addExerciseConfiguration() {
        const nameInput = document.getElementById('new-exercise-name');
        const timerInput = document.getElementById('new-exercise-timer');
        const youtubeInput = document.getElementById('new-exercise-youtube');
        const aerobicCheckbox = document.getElementById('new-exercise-aerobic');
        
        if (!nameInput || !timerInput || !youtubeInput || !aerobicCheckbox) return;
        
        const name = nameInput.value.trim();
        if (!name) {
            alert('Please enter an exercise name');
            return;
        }
        
        // Check if exercise already exists
        if (this.exerciseListIncludes(name)) {
            alert('Exercise already exists. Please edit the existing exercise instead.');
            return;
        }
        
        const timerStr = timerInput.value.trim();
        const timerDuration = timerStr ? (this.parseRestTimer(timerStr) || this.defaultTimer) : this.defaultTimer;
        const youtubeLink = youtubeInput.value.trim();
        const isAerobic = aerobicCheckbox.checked;
        
        // Add to exercise list
        this.exerciseList.push({
            name: name,
            timerDuration: timerDuration,
            youtubeLink: youtubeLink,
            isAerobic: isAerobic
        });
        
        // Save to Google Sheets
        this.saveExerciseList();
        this.updateExerciseList();
        
        // Clear form
        nameInput.value = '';
        timerInput.value = '';
        youtubeInput.value = '';
        aerobicCheckbox.checked = false;
        
        // Re-render list
        this.renderExerciseConfigList();
        
        alert('Exercise added successfully!');
    }

    editExerciseConfiguration(index) {
        const normalizedList = this.normalizeExerciseList(this.exerciseList);
        if (index < 0 || index >= normalizedList.length) return;
        
        const exercise = normalizedList[index];
        
        // Populate form with exercise data
        const nameInput = document.getElementById('new-exercise-name');
        const timerInput = document.getElementById('new-exercise-timer');
        const youtubeInput = document.getElementById('new-exercise-youtube');
        const aerobicCheckbox = document.getElementById('new-exercise-aerobic');
        const addBtn = document.getElementById('add-exercise-config');
        
        if (!nameInput || !timerInput || !youtubeInput || !aerobicCheckbox || !addBtn) return;
        
        nameInput.value = exercise.name;
        timerInput.value = exercise.timerDuration ? this.formatRestTimer(exercise.timerDuration) : '';
        youtubeInput.value = exercise.youtubeLink || '';
        aerobicCheckbox.checked = exercise.isAerobic || false;
        
        // Change button to "Update"
        addBtn.textContent = 'Update Exercise';
        addBtn.dataset.editIndex = index;
        
        // Scroll to form
        nameInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        nameInput.focus();
        
        // Update button handler temporarily
        addBtn.onclick = () => {
            this.updateExerciseConfiguration(index);
        };
    }

    updateExerciseConfiguration(index) {
        const normalizedList = this.normalizeExerciseList(this.exerciseList);
        if (index < 0 || index >= normalizedList.length) return;
        
        const nameInput = document.getElementById('new-exercise-name');
        const timerInput = document.getElementById('new-exercise-timer');
        const youtubeInput = document.getElementById('new-exercise-youtube');
        const aerobicCheckbox = document.getElementById('new-exercise-aerobic');
        const addBtn = document.getElementById('add-exercise-config');
        
        if (!nameInput || !timerInput || !youtubeInput || !aerobicCheckbox || !addBtn) return;
        
        const name = nameInput.value.trim();
        if (!name) {
            alert('Please enter an exercise name');
            return;
        }
        
        const timerStr = timerInput.value.trim();
        const timerDuration = timerStr ? (this.parseRestTimer(timerStr) || this.defaultTimer) : this.defaultTimer;
        const youtubeLink = youtubeInput.value.trim();
        const isAerobic = aerobicCheckbox.checked;
        
        // Update exercise in list
        this.exerciseList[index] = {
            name: name,
            timerDuration: timerDuration,
            youtubeLink: youtubeLink,
            isAerobic: isAerobic
        };
        
        // Save to Google Sheets
        this.saveExerciseList();
        this.updateExerciseList();
        
        // Clear form and reset button
        nameInput.value = '';
        timerInput.value = '';
        youtubeInput.value = '';
        aerobicCheckbox.checked = false;
        addBtn.textContent = 'Add Exercise';
        delete addBtn.dataset.editIndex;
        addBtn.onclick = () => this.addExerciseConfiguration();
        
        // Re-render list
        this.renderExerciseConfigList();
        
        alert('Exercise updated successfully!');
    }

    deleteExerciseConfiguration(index) {
        const normalizedList = this.normalizeExerciseList(this.exerciseList);
        if (index < 0 || index >= normalizedList.length) return;
        
        const exercise = normalizedList[index];
        
        if (!confirm(`Are you sure you want to delete "${exercise.name}"? This will not delete workout history, only the exercise configuration.`)) {
            return;
        }
        
        // Remove from list
        this.exerciseList.splice(index, 1);
        
        // Save to Google Sheets
        this.saveExerciseList();
        this.updateExerciseList();
        
        // Re-render list
        this.renderExerciseConfigList();
        
        alert('Exercise deleted successfully!');
    }

    setupPlanHandlers() {
        const generateSlotsBtn = document.getElementById('generate-slots-btn');
        const savePlanBtn = document.getElementById('save-plan-btn');
        const cancelPlanBtn = document.getElementById('cancel-plan-btn');
        const clearPlanBtn = document.getElementById('clear-plan-btn');
        
        if (generateSlotsBtn) {
            generateSlotsBtn.addEventListener('click', () => this.generatePlanSlots());
        }
        
        if (savePlanBtn) {
            savePlanBtn.addEventListener('click', () => this.saveWorkoutPlan());
        }
        
        if (cancelPlanBtn) {
            cancelPlanBtn.addEventListener('click', () => this.cancelPlanForm());
        }
        
        if (clearPlanBtn) {
            clearPlanBtn.addEventListener('click', () => this.clearActivePlan());
        }
    }

    async renderPlanModeTab() {
        const container = document.getElementById('plans-list');
        if (!container) return;
        
        if (this.workoutPlans.length === 0) {
            container.innerHTML = '<p class="no-data">No workout plans created yet. Create your first plan below.</p>';
        } else {
            let html = '<div class="plans-grid">';
            this.workoutPlans.forEach((plan, index) => {
                const exerciseCount = plan.exerciseSlots ? plan.exerciseSlots.length : 0;
                const isActive = this.activePlanId === plan.id;
                html += `
                    <div class="plan-card ${isActive ? 'active' : ''}">
                        <h4>${plan.name}</h4>
                        <p class="plan-meta">${exerciseCount} exercise${exerciseCount !== 1 ? 's' : ''}</p>
                        ${isActive ? '<p class="plan-status">✓ Active</p>' : ''}
                        <div class="plan-actions">
                            <button class="btn-secondary edit-plan-btn" data-index="${index}" style="padding: 5px 10px; font-size: 12px; margin-right: 5px;">Edit</button>
                            <button class="btn-secondary share-plan-btn" data-plan-id="${plan.id}" data-sheet-id="${plan.creatorSheetId || this.getStaticSheetId()}" style="padding: 5px 10px; font-size: 12px; margin-right: 5px;">Share</button>
                            <button class="btn-danger delete-plan-btn" data-index="${index}" style="padding: 5px 10px; font-size: 12px;">Delete</button>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
            container.innerHTML = html;
            
            // Add event listeners
            container.querySelectorAll('.edit-plan-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const index = parseInt(e.target.dataset.index);
                    this.editWorkoutPlan(index);
                });
            });
            
            container.querySelectorAll('.share-plan-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const planId = e.target.dataset.planId;
                    const sheetId = e.target.dataset.sheetId;
                    this.sharePlan(planId, sheetId);
                });
            });
            
            container.querySelectorAll('.delete-plan-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const index = parseInt(e.target.dataset.index);
                    this.deleteWorkoutPlan(index);
                });
            });
        }
    }

    generatePlanSlots() {
        const slotsCount = parseInt(document.getElementById('plan-slots-count').value) || 5;
        if (slotsCount < 1 || slotsCount > 20) {
            alert('Please enter a number between 1 and 20');
            return;
        }
        
        const container = document.getElementById('plan-exercise-slots');
        if (!container) return;
        
        container.innerHTML = '';
        
        // Get available exercises
        const normalizedList = this.normalizeExerciseList(this.exerciseList);
        const exerciseNames = normalizedList.map(ex => ex.name).sort();
        
        for (let i = 1; i <= slotsCount; i++) {
            const group = document.createElement('div');
            group.className = 'form-group';
            const select = document.createElement('select');
            select.className = 'plan-exercise-slot';
            select.dataset.slot = i;
            
            // Add empty option
            const emptyOption = document.createElement('option');
            emptyOption.value = '';
            emptyOption.textContent = '-- Select Exercise --';
            select.appendChild(emptyOption);
            
            // Add exercise options (will be filtered by updatePlanSlotOptions)
            exerciseNames.forEach(name => {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                select.appendChild(option);
            });
            
            // Add change event listener to update other dropdowns
            select.addEventListener('change', () => this.updatePlanSlotOptions());
            
            group.innerHTML = `<label>Exercise Slot ${i}</label>`;
            group.appendChild(select);
            container.appendChild(group);
        }
        
        // Initial update to filter options
        this.updatePlanSlotOptions();
        
        document.getElementById('save-plan-btn').style.display = 'inline-block';
        document.getElementById('cancel-plan-btn').style.display = 'inline-block';
    }

    updatePlanSlotOptions() {
        // Get all selected exercises from all slots
        const slotSelects = document.querySelectorAll('.plan-exercise-slot');
        const selectedExercises = new Set();
        
        slotSelects.forEach(select => {
            const selectedValue = select.value.trim();
            if (selectedValue) {
                selectedExercises.add(selectedValue);
            }
        });
        
        // Update each dropdown to exclude already-selected exercises
        slotSelects.forEach(select => {
            const currentSelection = select.value.trim();
            const slotNumber = parseInt(select.dataset.slot);
            
            // Clear all options except the empty one
            const emptyOption = select.querySelector('option[value=""]');
            select.innerHTML = '';
            if (emptyOption) {
                select.appendChild(emptyOption);
            } else {
                const newEmptyOption = document.createElement('option');
                newEmptyOption.value = '';
                newEmptyOption.textContent = '-- Select Exercise --';
                select.appendChild(newEmptyOption);
            }
            
            // Get available exercises
            const normalizedList = this.normalizeExerciseList(this.exerciseList);
            const exerciseNames = normalizedList.map(ex => ex.name).sort();
            
            // Add exercises that aren't selected in other slots
            exerciseNames.forEach(name => {
                // Include current selection for this slot, exclude others
                if (name === currentSelection || !selectedExercises.has(name)) {
                    const option = document.createElement('option');
                    option.value = name;
                    option.textContent = name;
                    if (name === currentSelection) {
                        option.selected = true;
                    }
                    select.appendChild(option);
                }
            });
        });
    }

    async saveWorkoutPlan() {
        const planName = document.getElementById('plan-name').value.trim();
        if (!planName) {
            alert('Please enter a plan name');
            return;
        }
        
        const slotSelects = document.querySelectorAll('.plan-exercise-slot');
        const exerciseSlots = [];
        
        slotSelects.forEach((select, index) => {
            const exerciseName = select.value.trim();
            if (exerciseName) {
                exerciseSlots.push({
                    slotNumber: index + 1,
                    exerciseName: exerciseName
                });
            }
        });
        
        if (exerciseSlots.length === 0) {
            alert('Please select at least one exercise for the plan');
            return;
        }
        
        const editingIndex = document.getElementById('save-plan-btn').dataset.editIndex;
        
        if (editingIndex !== undefined) {
            // Update existing plan
            const index = parseInt(editingIndex);
            this.workoutPlans[index] = {
                ...this.workoutPlans[index],
                name: planName,
                exerciseSlots: exerciseSlots
            };
        } else {
            // Create new plan
            const planId = `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            this.workoutPlans.push({
                id: planId,
                name: planName,
                exerciseSlots: exerciseSlots,
                createdAt: new Date().toISOString(),
                createdBy: this.userEmail || '',
                creatorSheetId: this.getStaticSheetId()
            });
        }
        
        // Save to Google Sheets
        await this.saveWorkoutPlans();
        
        // Update plan dropdown
        this.updatePlanDropdown();
        
        // Re-render
        this.renderPlanModeTab();
        this.cancelPlanForm();
        
        alert('Plan saved successfully!');
    }

    editWorkoutPlan(index) {
        if (index < 0 || index >= this.workoutPlans.length) return;
        
        const plan = this.workoutPlans[index];
        
        document.getElementById('plan-name').value = plan.name;
        document.getElementById('plan-slots-count').value = plan.exerciseSlots.length;
        
        // Generate slots
        this.generatePlanSlots();
        
        // Populate with existing exercises
        setTimeout(() => {
            plan.exerciseSlots.forEach(slot => {
                const select = document.querySelector(`.plan-exercise-slot[data-slot="${slot.slotNumber}"]`);
                if (select) {
                    select.value = slot.exerciseName;
                }
            });
            // Update options to reflect selected exercises
            this.updatePlanSlotOptions();
        }, 100);
        
        document.getElementById('save-plan-btn').dataset.editIndex = index;
        document.getElementById('plan-form-title').textContent = 'Edit Plan';
    }

    async deleteWorkoutPlan(index) {
        if (index < 0 || index >= this.workoutPlans.length) return;
        
        const plan = this.workoutPlans[index];
        
        if (!confirm(`Are you sure you want to delete "${plan.name}"?`)) {
            return;
        }
        
        // If this was the active plan, clear it
        if (this.activePlanId === plan.id) {
            this.clearActivePlan();
        }
        
        // Remove from list
        this.workoutPlans.splice(index, 1);
        
        // Save to Google Sheets
        await this.saveWorkoutPlans();
        
        // Update plan dropdown
        this.updatePlanDropdown();
        
        // Re-render
        this.renderPlanModeTab();
        
        alert('Plan deleted successfully!');
    }

    cancelPlanForm() {
        document.getElementById('plan-name').value = '';
        document.getElementById('plan-slots-count').value = '5';
        document.getElementById('plan-exercise-slots').innerHTML = '';
        document.getElementById('save-plan-btn').style.display = 'none';
        document.getElementById('cancel-plan-btn').style.display = 'none';
        delete document.getElementById('save-plan-btn').dataset.editIndex;
        document.getElementById('plan-form-title').textContent = 'Create New Plan';
    }

    getCurrentPlan() {
        if (this.currentPlanIndex >= 0 && this.currentPlanIndex < this.workoutPlans.length) {
            return this.workoutPlans[this.currentPlanIndex];
        }
        return null;
    }

    getNextPlan() {
        if (this.workoutPlans.length === 0) return null;
        
        // Increment plan index
        this.currentPlanIndex = (this.currentPlanIndex + 1) % this.workoutPlans.length;
        localStorage.setItem('currentPlanIndex', this.currentPlanIndex.toString());
        
        return this.workoutPlans[this.currentPlanIndex];
    }

    activatePlan(planId) {
        const planIndex = this.workoutPlans.findIndex(p => p.id === planId);
        if (planIndex >= 0) {
            this.currentPlanIndex = planIndex;
            this.activePlanId = planId;
            localStorage.setItem('currentPlanIndex', planIndex.toString());
            this.updateExerciseList();
            this.updatePlanIndicator();
            this.updatePlanDropdown(); // Update dropdown to show selected plan
            return true;
        }
        return false;
    }

    clearActivePlan() {
        this.currentPlanIndex = -1;
        this.activePlanId = null;
        localStorage.removeItem('currentPlanIndex');
        this.updateExerciseList();
        this.updatePlanIndicator();
        this.updatePlanDropdown(); // Update dropdown to clear selection
    }

    filterExercisesByPlan() {
        if (!this.activePlanId) return null;
        
        const plan = this.workoutPlans.find(p => p.id === this.activePlanId);
        if (!plan || !plan.exerciseSlots) return null;
        
        const planExerciseNames = new Set(plan.exerciseSlots.map(slot => slot.exerciseName));
        return this.exerciseList.filter(ex => {
            const name = typeof ex === 'object' ? ex.name : ex;
            return planExerciseNames.has(name);
        });
    }

    updatePlanIndicator() {
        const indicator = document.getElementById('plan-mode-indicator');
        const activePlanName = document.getElementById('active-plan-name');
        const planIndicator = document.getElementById('plan-indicator');
        const currentPlanName = document.getElementById('current-plan-name');
        
        if (this.activePlanId) {
            const plan = this.workoutPlans.find(p => p.id === this.activePlanId);
            if (plan) {
                const remainingExercises = plan.exerciseSlots ? plan.exerciseSlots.length : 0;
                const planText = `${plan.name} (${remainingExercises} remaining)`;
                
                if (indicator) {
                    indicator.style.display = 'block';
                    if (activePlanName) activePlanName.textContent = planText;
                }
                if (planIndicator) {
                    planIndicator.style.display = 'block';
                    if (currentPlanName) currentPlanName.textContent = planText;
                }
            }
        } else {
            if (indicator) indicator.style.display = 'none';
            if (planIndicator) planIndicator.style.display = 'none';
        }
    }

    generatePlanLink(planId, creatorSheetId) {
        const baseUrl = window.location.origin + window.location.pathname;
        return `${baseUrl}?plan=${planId}&sheet=${creatorSheetId}`;
    }

    async sharePlan(planId, creatorSheetId) {
        const plan = this.workoutPlans.find(p => p.id === planId);
        if (!plan) {
            alert('Plan not found');
            return;
        }
        
        // Use static sheet ID (safe to share - only contains Plans, Exercises, Config)
        const staticSheetId = creatorSheetId || this.getStaticSheetId();
        if (!staticSheetId) {
            alert('Static sheet not found. Please ensure your sheets are set up correctly.');
            return;
        }
        
        // Show warning about sharing
        const warningMessage = `⚠️ SHARING NOTICE\n\n` +
            `When you share this plan, your "Workout Tracker - Config" sheet will be shared (read-only). This sheet contains:\n\n` +
            `• Plans tab - workout plans\n` +
            `• Exercises tab - exercise configurations (rest timers, YouTube links, etc.)\n` +
            `• Config tab - default settings\n\n` +
            `Your personal workout data ("Workout Tracker - Sessions" sheet) will NOT be shared and remains completely private.\n\n` +
            `The sheet will be shared as "Anyone with the link can view" (read-only).\n\n` +
            `Do you want to continue?`;
        
        if (!confirm(warningMessage)) {
            return;
        }
        
        // Ask for recipient email (optional)
        const recipientEmail = prompt('Enter recipient email address (optional - leave empty to share with anyone who has the link):');
        
        try {
            // Share the static sheet automatically
            await this.shareSheetForPlan(staticSheetId, recipientEmail);
        } catch (error) {
            console.error('Error sharing sheet:', error);
            const continueAnyway = confirm('Failed to automatically share the sheet. You can manually share it in Google Sheets.\n\nDo you want to continue generating the plan link anyway?');
            if (!continueAnyway) {
                return;
            }
        }
        
        // Get exercise configurations for the plan
        const planLink = this.generatePlanLink(planId, staticSheetId);
        const normalizedList = this.normalizeExerciseList(this.exerciseList);
        
        let emailBody = `Subject: Workout Plan: ${plan.name}\n\n`;
        emailBody += `Hi!\n\n`;
        emailBody += `Here's a workout plan shared with you:\n\n`;
        emailBody += `Plan: ${plan.name}\n\n`;
        emailBody += `Exercises:\n`;
        
        plan.exerciseSlots.forEach((slot, index) => {
            const exercise = normalizedList.find(ex => ex.name === slot.exerciseName);
            emailBody += `${index + 1}. ${slot.exerciseName}\n`;
            if (exercise) {
                if (exercise.timerDuration) {
                    emailBody += `   - Rest Timer: ${this.formatRestTimer(exercise.timerDuration)}\n`;
                }
                if (exercise.youtubeLink) {
                    emailBody += `   - YouTube: ${exercise.youtubeLink}\n`;
                }
                emailBody += `   - Type: ${exercise.isAerobic ? 'Aerobic' : 'Strength'}\n`;
            }
            emailBody += `\n`;
        });
        
        emailBody += `Click this link to import the plan into your workout tracker:\n`;
        emailBody += `${planLink}\n\n`;
        emailBody += `When you click the link, you'll be asked to sign in with Google. After signing in, a new workout sheet will be automatically created for you with this plan and all exercises configured (rest timers, YouTube links, etc.).\n\n`;
        emailBody += `Note: Only the "Workout Tracker - Config" sheet is shared (Plans, Exercises, Config tabs). Your personal workout data remains completely private.\n\n`;
        emailBody += `Happy training!`;
        
        // Try to copy to clipboard
        if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
                await navigator.clipboard.writeText(emailBody);
                alert('Plan details copied to clipboard! You can paste it into your email client.');
            } catch (e) {
                // Fallback to mailto
                window.location.href = `mailto:?body=${encodeURIComponent(emailBody)}`;
            }
        } else {
            // Fallback to mailto
            window.location.href = `mailto:?body=${encodeURIComponent(emailBody)}`;
        }
    }

    async fetchPlanFromCreator(planId, creatorSheetId) {
        try {
            await this.initGoogleSheets();
            
            if (gapi.client) {
                gapi.client.setToken({ access_token: this.googleToken });
            }
            
            // Try to read from creator's sheet
            const response = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: creatorSheetId,
                range: 'Plans!A2:F1000'
            });
            
            const rows = response.result.values || [];
            for (const row of rows) {
                if (row[0]?.trim() === planId) {
                    const plan = {
                        id: row[0].trim(),
                        name: row[1]?.trim() || '',
                        exerciseSlots: [],
                        createdAt: row[3]?.trim() || new Date().toISOString(),
                        createdBy: row[4]?.trim() || '',
                        creatorSheetId: creatorSheetId
                    };
                    
                    if (row[2]) {
                        try {
                            plan.exerciseSlots = JSON.parse(row[2]);
                        } catch (e) {
                            console.warn('Error parsing exercise slots:', e);
                        }
                    }
                    
                    return plan;
                }
            }
        } catch (error) {
            console.error('Error fetching plan from creator:', error);
        }
        return null;
    }

    async shareSheetForPlan(sheetId, recipientEmail = null) {
        try {
            await this.initGoogleDrive();
            
            if (!gapi.client || !gapi.client.drive) {
                throw new Error('Google Drive API not initialized');
            }
            
            // Ensure token is set
            gapi.client.setToken({ access_token: this.googleToken });
            
            if (recipientEmail && recipientEmail.trim() !== '') {
                // Share with specific email (viewer permission)
                await gapi.client.drive.permissions.create({
                    fileId: sheetId,
                    resource: {
                        role: 'reader',
                        type: 'user',
                        emailAddress: recipientEmail.trim()
                    },
                    fields: 'id'
                });
                console.log(`Sheet shared with ${recipientEmail}`);
            } else {
                // Share publicly (anyone with link can view)
                await gapi.client.drive.permissions.create({
                    fileId: sheetId,
                    resource: {
                        role: 'reader',
                        type: 'anyone'
                    },
                    fields: 'id'
                });
                console.log('Sheet shared publicly (anyone with link can view)');
            }
        } catch (error) {
            console.error('Error sharing sheet:', error);
            throw error;
        }
    }

    async copyExerciseConfigToRecipient(exerciseName, config) {
        // Check if exercise exists in recipient's Exercises sheet
        const normalizedList = this.normalizeExerciseList(this.exerciseList);
        const existingExercise = normalizedList.find(ex => ex.name === exerciseName);
        
        if (existingExercise) {
            // Update existing exercise
            const index = this.exerciseList.findIndex(ex => {
                const name = typeof ex === 'object' ? ex.name : ex;
                return name === exerciseName;
            });
            if (index >= 0) {
                this.exerciseList[index] = {
                    name: exerciseName,
                    timerDuration: config.timerDuration || this.defaultTimer,
                    youtubeLink: config.youtubeLink || '',
                    isAerobic: config.isAerobic || false
                };
            }
        } else {
            // Add new exercise
            this.exerciseList.push({
                name: exerciseName,
                timerDuration: config.timerDuration || this.defaultTimer,
                youtubeLink: config.youtubeLink || '',
                isAerobic: config.isAerobic || false
            });
        }
        
        // Save to sheet
        await this.saveExerciseList();
        this.updateExerciseList();
    }

    async importPlanFromLink(planId, creatorSheetId) {
        const staticSheetId = this.getStaticSheetId();
        if (!this.isSignedIn || !staticSheetId) {
            alert('Please sign in with Google to import this workout plan.');
            return;
        }
        
        try {
            // Fetch plan from creator's sheet
            const plan = await this.fetchPlanFromCreator(planId, creatorSheetId);
            if (!plan) {
                alert('Plan not found. It may have been deleted or the link is invalid.');
                return;
            }
            
            // Get exercise configurations from creator's sheet
            const normalizedList = this.normalizeExerciseList(this.exerciseList);
            
            // For each exercise in the plan, copy its configuration
            for (const slot of plan.exerciseSlots) {
                // Fetch exercise config from creator's Exercises sheet
                try {
                    const exerciseResponse = await gapi.client.sheets.spreadsheets.values.get({
                        spreadsheetId: creatorSheetId,
                        range: 'Exercises!A2:D1000'
                    });
                    
                    const exerciseRows = exerciseResponse.result.values || [];
                    for (const row of exerciseRows) {
                        if (row[0]?.trim() === slot.exerciseName) {
                            const config = {
                                timerDuration: this.defaultTimer,
                                youtubeLink: '',
                                isAerobic: false
                            };
                            
                            if (row[1]) {
                                const parsed = this.parseRestTimer(String(row[1]).trim());
                                if (parsed !== null) {
                                    config.timerDuration = parsed;
                                }
                            }
                            
                            if (row[2]) {
                                config.youtubeLink = String(row[2]).trim();
                            }
                            
                            if (row[3]) {
                                const aerobicStr = String(row[3]).trim().toLowerCase();
                                config.isAerobic = aerobicStr === 'true' || aerobicStr === '1' || aerobicStr === 'yes';
                            }
                            
                            await this.copyExerciseConfigToRecipient(slot.exerciseName, config);
                            break;
                        }
                    }
                } catch (error) {
                    console.warn(`Error fetching config for ${slot.exerciseName}:`, error);
                    // Add exercise with default config if we can't fetch
                    await this.copyExerciseConfigToRecipient(slot.exerciseName, {
                        timerDuration: this.defaultTimer,
                        youtubeLink: '',
                        isAerobic: false
                    });
                }
            }
            
            // Add plan to recipient's Plans sheet
            plan.id = `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            plan.creatorSheetId = staticSheetId;
            plan.createdBy = this.userEmail || '';
            this.workoutPlans.push(plan);
            await this.saveWorkoutPlans();
            
            // Activate the plan
            this.activatePlan(plan.id);
            
            // Clear URL parameters
            window.history.replaceState({}, document.title, window.location.pathname);
            
            alert('Plan imported successfully! Your sheet has been set up with all exercises configured.');
        } catch (error) {
            console.error('Error importing plan:', error);
            alert('Error importing plan. Please try again.');
        }
    }

    updateRepsInputs() {
        const container = document.getElementById('reps-container');
        container.innerHTML = '';
        
        // Check if selected exercise is aerobic
        const select = document.getElementById('exercise-name');
        const exerciseName = select ? select.value.trim() : '';
        const exercise = exerciseName ? this.getExerciseByName(exerciseName) : null;
        const isAerobic = exercise && exercise.isAerobic;
        
        // Get the label element to update it
        const labelElement = container.parentElement.querySelector('label');
        if (labelElement) {
            if (isAerobic) {
                labelElement.textContent = 'Duration (H:M:S)';
                labelElement.querySelector('small')?.remove();
            } else {
                labelElement.innerHTML = 'Reps and Weight for Each Set <small style="color: #999; font-weight: normal;">(can be different)</small>';
            }
        }
        
        if (isAerobic) {
            // Show duration input for aerobic exercises
            const group = document.createElement('div');
            group.className = 'rep-input-group';
            group.innerHTML = `
                <label>Duration:</label>
                <input type="text" id="exercise-duration" class="exercise-duration-input" placeholder="0:30:00" pattern="[0-9]+:[0-5][0-9]:[0-5][0-9]|[0-9]+:[0-5][0-9]" style="flex: 1;">
                <small class="help-text" style="display: block; margin-top: 5px; color: #999;">Format: H:M:S or M:S (e.g., 0:30:00 for 30 minutes)</small>
            `;
            container.appendChild(group);
            
            // Hide sets input for aerobic exercises
            const setsInput = document.getElementById('sets');
            if (setsInput && setsInput.parentElement) {
                setsInput.parentElement.style.display = 'none';
            }
        } else {
            // Show normal reps/weight inputs
            const sets = parseInt(document.getElementById('sets').value) || 3;
            
            // Show sets input for non-aerobic exercises
            const setsInput = document.getElementById('sets');
            if (setsInput && setsInput.parentElement) {
                setsInput.parentElement.style.display = 'block';
            }
            
            for (let i = 1; i <= sets; i++) {
                const group = document.createElement('div');
                group.className = 'rep-input-group';
                group.innerHTML = `
                    <label>Set ${i}:</label>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <input type="number" class="rep-input" data-set="${i}" placeholder="Reps" min="0" value="0" style="width: 80px;">
                        <span>×</span>
                        <input type="number" class="weight-input" data-set="${i}" placeholder="Weight (kg)" min="0" step="0.5" value="0" style="width: 100px;">
                    </div>
                `;
                container.appendChild(group);
            }
        }
    }

    getTodaySession() {
        const today = new Date().toISOString().split('T')[0];
        return this.sessions.find(s => s.date === today) || { date: today, exercises: [] };
    }

    showAddExercise() {
        const newInput = document.getElementById('exercise-name-new');
        const select = document.getElementById('exercise-name');
        
        if (newInput.style.display === 'none') {
            newInput.style.display = 'block';
            newInput.focus();
        } else {
            this.addNewExercise();
        }
    }

    addNewExercise() {
        const newInput = document.getElementById('exercise-name-new');
        const exerciseName = newInput.value.trim();
        
        if (!exerciseName) {
            alert('Please enter an exercise name');
            return;
        }

        // Add to exercise list if not already there
        if (!this.exerciseListIncludes(exerciseName)) {
            this.exerciseList.push({
                name: exerciseName,
                timerDuration: this.defaultTimer,
                youtubeLink: '',
                isAerobic: false
            });
            // Don't sort - keep in sheet order
            this.saveExerciseList(); // Async, but fire-and-forget
            this.updateExerciseList();
        }

        // Set the select to the new exercise
        document.getElementById('exercise-name').value = exerciseName;
        newInput.style.display = 'none';
        newInput.value = '';
    }

    async saveExercise() {
        const select = document.getElementById('exercise-name');
        const newInput = document.getElementById('exercise-name-new');
        let exerciseName = select.value.trim();
        
        // If new exercise input is visible and has value, use that instead
        const newInputValue = newInput.value.trim();
        if (newInputValue && (newInput.style.display === 'block' || newInput.offsetParent !== null)) {
            exerciseName = newInputValue;
            // Add it to the list (at the end, preserving order)
            if (!this.exerciseListIncludes(exerciseName)) {
                this.exerciseList.push({
                    name: exerciseName,
                    timerDuration: this.defaultTimer,
                    youtubeLink: '',
                    isAerobic: false
                });
                // Don't sort - keep in sheet order
                this.saveExerciseList(); // Async, but fire-and-forget
            }
            select.value = exerciseName;
            newInput.style.display = 'none';
            newInput.value = '';
            this.updateExerciseList();
        }

        const difficulty = 'medium'; // Default difficulty (field removed from UI)
        const notes = document.getElementById('notes').value.trim();

        if (!exerciseName) {
            alert('Please select or enter an exercise name');
            return;
        }

        // Check if exercise is aerobic
        const exerciseConfig = this.getExerciseByName(exerciseName);
        const isAerobic = exerciseConfig && exerciseConfig.isAerobic;

        let exercise;
        if (isAerobic) {
            // Handle aerobic exercise - get duration
            const durationInput = document.getElementById('exercise-duration');
            const durationStr = durationInput ? durationInput.value.trim() : '';
            const durationSeconds = durationStr ? this.parseExerciseDuration(durationStr) : null;
            
            if (!durationSeconds && durationSeconds !== 0) {
                alert('Please enter a valid duration (H:M:S or M:S format)');
                return;
            }

            exercise = {
                name: exerciseName,
                duration: durationSeconds, // Duration in seconds
                isAerobic: true,
                difficulty: difficulty,
                notes: notes,
                timestamp: new Date().toISOString()
            };
        } else {
            // Handle non-aerobic exercise - get reps and weights
            const sets = parseInt(document.getElementById('sets').value) || 3;
            const reps = [];
            const weights = [];
            document.querySelectorAll('.rep-input').forEach(input => {
                reps.push(parseInt(input.value) || 0);
            });
            document.querySelectorAll('.weight-input').forEach(input => {
                weights.push(parseFloat(input.value) || 0);
            });

            exercise = {
                name: exerciseName,
                weights: weights, // Array of weights, one per set
                sets: sets,
                reps: reps,
                difficulty: difficulty,
                notes: notes,
                timestamp: new Date().toISOString()
            };
        }

        // Add to today's session
        if (!this.currentSession.exercises) {
            this.currentSession.exercises = [];
        }
        this.currentSession.exercises.push(exercise);

        // Update or create today's session
        const today = new Date().toISOString().split('T')[0];
        const sessionIndex = this.sessions.findIndex(s => s.date === today);
        if (sessionIndex >= 0) {
            this.sessions[sessionIndex] = this.currentSession;
        } else {
            this.sessions.push(this.currentSession);
        }

        // Add exercise to list if not already there (at the end, preserving order)
        if (!this.exerciseListIncludes(exerciseName)) {
            this.exerciseList.push({
                name: exerciseName,
                timerDuration: this.defaultTimer,
                youtubeLink: '',
                isAerobic: false
            });
            // Don't sort - keep in sheet order
            this.saveExerciseList();
        }

        // Remove exercise from list after saving (keep it removed during this session)
        const exerciseIndex = this.exerciseList.findIndex(ex => {
            const name = typeof ex === 'object' ? ex.name : ex;
            return name === exerciseName;
        });
        if (exerciseIndex > -1) {
            this.exerciseList.splice(exerciseIndex, 1);
        }

        // If in plan mode, remove exercise from plan's exercise slots
        if (this.activePlanId) {
            const plan = this.workoutPlans.find(p => p.id === this.activePlanId);
            if (plan && plan.exerciseSlots) {
                const initialLength = plan.exerciseSlots.length;
                plan.exerciseSlots = plan.exerciseSlots.filter(slot => slot.exerciseName !== exerciseName);
                
                // If we removed a slot, save the updated plan
                if (plan.exerciseSlots.length < initialLength) {
                    await this.saveWorkoutPlans();
                    // Update the plan indicator to show remaining exercises
                    this.updatePlanIndicator();
                    // Re-render plan mode tab if it's currently visible
                    const planTab = document.getElementById('plan-tab');
                    if (planTab && planTab.classList.contains('active')) {
                        this.renderPlanModeTab();
                    }
                }
            }
        }

        // Save to localStorage first (for offline backup)
        this.saveSessions();
        this.updateExerciseList();
        this.renderTodayWorkout();
        this.showRecommendations(exercise);
        
        // Clear form (wrap in try-catch to prevent errors from stopping timer)
        try {
            this.clearForm();
        } catch (error) {
            console.error('Error clearing form:', error);
        }
        
        // Start rest timer after saving exercise (always try to start, even if form clearing failed)
        try {
            this.startRestTimer();
        } catch (error) {
            console.error('Error starting rest timer:', error);
        }

        // Immediately sync to Google Sheets (sheet is source of truth)
        if (this.isSignedIn && this.sheetId) {
            try {
                await this.syncToSheet(true); // Silent sync - await to ensure it completes
            } catch (error) {
                console.error('Error syncing exercise to sheet:', error);
                // Show a subtle notification that sync failed but data is saved locally
                const statusEl = document.getElementById('sync-status');
                if (statusEl) {
                    const indicator = document.getElementById('sync-indicator');
                    const text = document.getElementById('sync-text');
                    if (indicator) indicator.textContent = '🟡';
                    if (text) text.textContent = 'Sync Failed';
                    // Reset after 3 seconds
                    setTimeout(() => this.updateSyncStatus(), 3000);
                }
            }
        }
    }

    clearForm() {
        document.getElementById('exercise-name').value = '';
        document.getElementById('exercise-name-new').value = '';
        document.getElementById('exercise-name-new').style.display = 'none';
        this.clearFormFields();
        document.getElementById('exercise-name').focus();
    }

    showExercisePreview(exerciseName) {
        // Get all exercises with this name
        const allExercises = [];
        this.sessions.forEach(session => {
            if (session.exercises) {
                session.exercises.forEach(ex => {
                    if (ex.name.toLowerCase() === exerciseName.toLowerCase()) {
                        allExercises.push({ ...ex, date: session.date });
                    }
                });
            }
        });

        const container = document.getElementById('recommendations-content');
        
        if (allExercises.length === 0) {
            container.innerHTML = `<div class="recommendation-item">
                <h4>${exerciseName}</h4>
                <p class="no-data">No previous sessions found for this exercise</p>
            </div>`;
            // Clear form fields if no previous data
            this.clearFormFields();
            return;
        }

        // Sort by date (most recent first)
        const sorted = allExercises.sort((a, b) => new Date(b.date) - new Date(a.date));
        const lastExercise = sorted[0];
        
        // Populate form fields with last exercise values
        this.populateFormFromLastExercise(lastExercise);
        
        // Format the date
        const lastDate = new Date(lastExercise.date);
        const dateStr = lastDate.toLocaleDateString('en-US', { 
            weekday: 'short', 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
        
        // Calculate days ago
        const daysAgo = Math.floor((new Date() - lastDate) / (1000 * 60 * 60 * 24));
        const daysAgoText = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo} days ago`;

        let detailsStr = '';
        if (lastExercise.isAerobic && lastExercise.duration !== undefined) {
            // Show duration for aerobic exercises
            detailsStr = `Duration: ${this.formatExerciseDuration(lastExercise.duration)}`;
        } else {
            // Show reps/weights for non-aerobic exercises
            const lastWeights = lastExercise.weights || (lastExercise.weight ? Array(lastExercise.reps.length).fill(lastExercise.weight) : []);
            detailsStr = lastWeights.map((w, i) => `${lastExercise.reps[i] || 0} reps × ${w || 0}kg`).join(', ');
        }
        
        let html = `
            <div class="recommendation-item">
                <h4>${exerciseName}</h4>
                <p class="current"><strong>Last time:</strong> ${dateStr} (${daysAgoText})</p>
                <p class="current">${detailsStr} | ${this.formatDifficulty(lastExercise.difficulty)}</p>
        `;

        // Get recommendations if we have 2+ sessions
        const recommendations = this.getRecommendations(exerciseName);
        if (recommendations) {
            const suggestion = recommendations.suggestion;
            if (suggestion.action === 'increase') {
                html += `<p class="suggestion">💚 Recommendation: ${suggestion.text}</p>`;
            } else if (suggestion.action === 'decrease') {
                html += `<p class="suggestion">🔴 Recommendation: ${suggestion.text}</p>`;
            } else {
                html += `<p class="suggestion">💙 Recommendation: ${suggestion.text}</p>`;
            }
        } else {
            html += `<p class="suggestion">💙 Complete one more session to get recommendations</p>`;
        }

        html += '</div>';
        container.innerHTML = html;
    }

    populateFormFromLastExercise(lastExercise) {
        // Check if exercise is aerobic
        if (lastExercise.isAerobic && lastExercise.duration !== undefined) {
            // Handle aerobic exercise - populate duration
            this.updateRepsInputs(); // This will show duration input for aerobic exercises
            const durationInput = document.getElementById('exercise-duration');
            if (durationInput) {
                durationInput.value = this.formatExerciseDuration(lastExercise.duration);
            }
        } else {
            // Handle non-aerobic exercise - populate reps and weights
            // Debug logging
            console.log('populateFormFromLastExercise called with:', {
                name: lastExercise.name,
                sets: lastExercise.sets,
                setsType: typeof lastExercise.sets,
                isArray: Array.isArray(lastExercise.sets),
                reps: lastExercise.reps,
                repsLength: lastExercise.reps?.length,
                weights: lastExercise.weights,
                weightsLength: lastExercise.weights?.length
            });
            
            // Ensure sets is a number, not an array
            let numSets = 3;
            if (Array.isArray(lastExercise.sets)) {
                numSets = lastExercise.sets.length;
                console.log('Sets is array, length:', numSets);
            } else if (typeof lastExercise.sets === 'number') {
                numSets = lastExercise.sets;
                console.log('Sets is number:', numSets);
                // Cap at reasonable maximum
                if (numSets > 20) {
                    console.warn('Sets value too high:', numSets, 'capping at reps length or 20');
                    numSets = lastExercise.reps?.length || Math.min(numSets, 20);
                }
            } else if (lastExercise.reps && Array.isArray(lastExercise.reps)) {
                numSets = lastExercise.reps.length;
                console.log('Using reps length as sets:', numSets);
            }
            
            console.log('Final numSets:', numSets);
            
            // Set sets (this will trigger updateRepsInputs)
            document.getElementById('sets').value = numSets;
            
            // Update reps inputs first (creates the right number of inputs)
            this.updateRepsInputs();
            
            // Then populate each rep input and weight input
            const repInputs = document.querySelectorAll('.rep-input');
            const weightInputs = document.querySelectorAll('.weight-input');
            const weights = lastExercise.weights || (lastExercise.weight ? Array(lastExercise.reps.length).fill(lastExercise.weight) : []);
            
            if (lastExercise.reps && lastExercise.reps.length > 0) {
                lastExercise.reps.forEach((rep, index) => {
                    if (repInputs[index]) {
                        repInputs[index].value = rep || 0;
                    }
                    if (weightInputs[index]) {
                        weightInputs[index].value = weights[index] || 0;
                    }
                });
            }
        }
        
        // Keep notes clear - don't prefill them
        document.getElementById('notes').value = '';
    }

    clearFormFields() {
        // Clear sets and notes (these always exist)
        const setsEl = document.getElementById('sets');
        if (setsEl) setsEl.value = '3';
        
        const notesEl = document.getElementById('notes');
        if (notesEl) notesEl.value = '';
        
        // Clear all dynamic rep and weight inputs
        const repInputs = document.querySelectorAll('.rep-input');
        const weightInputs = document.querySelectorAll('.weight-input');
        repInputs.forEach(input => input.value = '');
        weightInputs.forEach(input => input.value = '');
        
        // Clear duration input if it exists (for aerobic exercises)
        const durationEl = document.getElementById('duration');
        if (durationEl) durationEl.value = '';
        
        // Update reps inputs to reset the form
        this.updateRepsInputs();
    }

    showRecommendations(currentExercise) {
        const recommendations = this.getRecommendations(currentExercise.name);
        const container = document.getElementById('recommendations-content');
        
        if (!recommendations) {
            container.innerHTML = '<p class="no-data">Complete 2+ sessions to see recommendations</p>';
            return;
        }

        const lastTwo = recommendations.lastTwo;
        const suggestion = recommendations.suggestion;
        const completedTwice = recommendations.completedTwice;

        // Determine exercise name color based on completedTwice status
        const exerciseNameColor = completedTwice ? '#4caf50' : '#f44336';

        // Format current exercise weight/reps (only show weight if > 0)
        const currentWeights = currentExercise.weights || (currentExercise.weight ? Array(currentExercise.reps.length).fill(currentExercise.weight) : []);
        const currentReps = currentExercise.reps || [];
        const currentSetStrings = [];
        for (let i = 0; i < Math.max(currentReps.length, currentWeights.length); i++) {
            const rep = currentReps[i] || 0;
            const weight = currentWeights[i] || 0;
            if (weight > 0) {
                currentSetStrings.push(`${rep}×${weight}kg`);
            } else if (rep > 0) {
                currentSetStrings.push(`${rep} reps`);
            }
        }
        const currentStr = currentSetStrings.length > 0 
            ? currentSetStrings.join(' + ')
            : (currentReps.length > 0 ? currentReps.join(' + ') + ' reps' : '');
        
        let html = `
            <div class="recommendation-item ${suggestion.action}">
                <h4 style="color: ${exerciseNameColor};">${currentExercise.name}</h4>
                <p class="current">Current: ${currentStr} (${this.formatDifficulty(currentExercise.difficulty)})</p>
        `;

        if (lastTwo.length === 2) {
            const lastTwoStr = lastTwo.map(e => {
                const weights = e.weights || (e.weight ? Array(e.reps.length).fill(e.weight) : []);
                const reps = e.reps || [];
                const setStrings = [];
                for (let i = 0; i < Math.max(reps.length, weights.length); i++) {
                    const rep = reps[i] || 0;
                    const weight = weights[i] || 0;
                    if (weight > 0) {
                        setStrings.push(`${rep}×${weight}kg`);
                    } else if (rep > 0) {
                        setStrings.push(`${rep} reps`);
                    }
                }
                const formatted = setStrings.length > 0 
                    ? setStrings.join(' + ')
                    : (reps.length > 0 ? reps.join(' + ') + ' reps' : '');
                return `${formatted} (${this.formatDifficulty(e.difficulty)})`;
            }).join(' | ');
            html += `<p class="current">Last 2 sessions: ${lastTwoStr}</p>`;
        }

        // Show improvement recommendation if completed twice successfully
        if (completedTwice && suggestion.action === 'increase') {
            html += `<p class="suggestion" style="color: #4caf50; font-weight: 600;">💚 Recommendation: ${suggestion.text}</p>`;
        } else if (suggestion.action === 'increase') {
            html += `<p class="suggestion">💚 Recommendation: ${suggestion.text}</p>`;
        } else if (suggestion.action === 'decrease') {
            html += `<p class="suggestion">🔴 Recommendation: ${suggestion.text}</p>`;
        } else {
            html += `<p class="suggestion">💙 Keep current: ${suggestion.text}</p>`;
        }

        html += '</div>';
        container.innerHTML = html;
    }

    getRecommendations(exerciseName) {
        const allExercises = [];
        this.sessions.forEach(session => {
            if (session.exercises) {
                session.exercises.forEach(ex => {
                    if (ex.name.toLowerCase() === exerciseName.toLowerCase()) {
                        allExercises.push({ ...ex, date: session.date });
                    }
                });
            }
        });

        if (allExercises.length < 2) {
            return null;
        }

        const sorted = allExercises.sort((a, b) => new Date(b.date) - new Date(a.date));
        const lastTwo = sorted.slice(0, 2);

        // Check if exercise was completed twice with identical parameters
        const first = lastTwo[0];
        const second = lastTwo[1];
        const firstWeights = first.weights || (first.weight ? Array(first.reps.length).fill(first.weight) : []);
        const secondWeights = second.weights || (second.weight ? Array(second.reps.length).fill(second.weight) : []);
        const completedTwice = 
            firstWeights.length === secondWeights.length &&
            firstWeights.every((w, i) => w === secondWeights[i]) &&
            first.sets === second.sets &&
            first.reps.length === second.reps.length &&
            first.reps.every((rep, index) => rep === second.reps[index]);

        const difficulties = lastTwo.map(e => e.difficulty);
        const bothEasy = difficulties.every(d => d === 'easy' || d === 'very-easy');
        const bothVeryHard = difficulties.every(d => d === 'very-hard');

        const latest = lastTwo[0];
        let suggestion = {
            action: 'maintain',
            text: 'Maintain current weight and reps'
        };

        // Get average weight for recommendations
        const latestWeights = latest.weights || (latest.weight ? Array(latest.reps.length).fill(latest.weight) : []);
        const avgWeight = latestWeights.length > 0 ? latestWeights.reduce((a, b) => a + b, 0) / latestWeights.length : (latest.weight || 0);
        
        // If completed twice with same parameters, suggest improvement
        if (completedTwice) {
            const avgReps = latest.reps.reduce((a, b) => a + b, 0) / latest.reps.length;
            if (avgReps >= 10) {
                suggestion = {
                    action: 'increase',
                    text: `Great! You completed this twice successfully. Try increasing weight to ${avgWeight + 2.5}kg (or add 2.5kg)`
                };
            } else {
                suggestion = {
                    action: 'increase',
                    text: `Great! You completed this twice successfully. Try increasing reps by 1-2 per set, or increase weight to ${avgWeight + 2.5}kg`
                };
            }
        } else if (bothEasy) {
            const avgReps = latest.reps.reduce((a, b) => a + b, 0) / latest.reps.length;
            if (avgReps >= 10) {
                suggestion = {
                    action: 'increase',
                    text: `Increase weight to ${avgWeight + 2.5}kg (or add 2.5kg)`
                };
            } else {
                suggestion = {
                    action: 'increase',
                    text: `Increase reps by 1-2 per set, or increase weight to ${avgWeight + 2.5}kg`
                };
            }
        } else if (bothVeryHard) {
            if (avgWeight > 2.5) {
                suggestion = {
                    action: 'decrease',
                    text: `Decrease weight to ${avgWeight - 2.5}kg`
                };
            } else {
                suggestion = {
                    action: 'decrease',
                    text: `Decrease reps by 1-2 per set`
                };
            }
        }

        return { lastTwo, suggestion, completedTwice };
    }

    checkExerciseCompletedTwice(exerciseName) {
        // Find all instances of this exercise
        const allExercises = [];
        this.sessions.forEach(session => {
            if (session.exercises) {
                session.exercises.forEach(ex => {
                    if (ex.name.toLowerCase() === exerciseName.toLowerCase()) {
                        allExercises.push({ ...ex, date: session.date });
                    }
                });
            }
        });

        // Need at least 2 instances
        if (allExercises.length < 2) {
            return false;
        }

        // Sort by date (most recent first)
        const sorted = allExercises.sort((a, b) => new Date(b.date) - new Date(a.date));
        const lastTwo = sorted.slice(0, 2);

        // Compare the last two exercises
        const first = lastTwo[0];
        const second = lastTwo[1];

        // Check if weight matches
        if (first.weight !== second.weight) {
            return false;
        }

        // Check if number of sets matches
        if (first.sets !== second.sets) {
            return false;
        }

        // Check if reps array matches (all sets must match)
        if (first.reps.length !== second.reps.length) {
            return false;
        }

        // Check if all reps match
        for (let i = 0; i < first.reps.length; i++) {
            if (first.reps[i] !== second.reps[i]) {
                return false;
            }
        }

        // All parameters match
        return true;
    }

    startRestTimer() {
        console.log('startRestTimer called');
        
        // Stop any existing timer
        if (this.restTimer) {
            clearInterval(this.restTimer);
            this.restTimer = null;
        }
        
        // Get the last exercise name to check for exercise-specific timer
        let timerDuration = this.defaultTimer;
        if (this.currentSession.exercises && this.currentSession.exercises.length > 0) {
            const lastExerciseName = this.currentSession.exercises[this.currentSession.exercises.length - 1].name;
            const exercise = this.getExerciseByName(lastExerciseName);
            if (exercise && exercise.timerDuration) {
                timerDuration = exercise.timerDuration;
            } else {
                timerDuration = this.restTimerDuration || this.defaultTimer;
            }
        } else {
            timerDuration = this.restTimerDuration || this.defaultTimer;
        }
        
        // Reset display elements
        const timerDisplay = document.getElementById('timer-seconds');
        const timerLabel = document.querySelector('.timer-label');
        const skipBtn = document.getElementById('skip-timer-btn');
        
        if (timerDisplay) {
            timerDisplay.style.fontSize = '48px';
        }
        if (timerLabel) {
            timerLabel.textContent = 'seconds';
        }
        if (skipBtn) {
            skipBtn.style.display = 'block';
        }
        
        // Set timer duration
        this.restTimerSeconds = timerDuration;
        console.log('Timer duration set to:', timerDuration, 'seconds');
        
        // Show timer display
        const timerContainer = document.getElementById('rest-timer');
        if (timerContainer) {
            timerContainer.style.display = 'block';
            console.log('Timer container displayed');
        } else {
            console.error('Timer container not found!');
        }
        
        // Update display immediately
        this.updateTimerDisplay();
        console.log('Timer display updated, starting countdown...');
        
        // Start countdown
        this.restTimer = setInterval(() => {
            this.restTimerSeconds--;
            this.updateTimerDisplay();
            
            if (this.restTimerSeconds <= 0) {
                this.completeRestTimer();
            }
        }, 1000);
        console.log('Timer interval started');
    }

    stopRestTimer() {
        if (this.restTimer) {
            clearInterval(this.restTimer);
            this.restTimer = null;
        }
        
        // Hide timer display
        const timerContainer = document.getElementById('rest-timer');
        if (timerContainer) {
            timerContainer.style.display = 'none';
        }
        
        // Reset display elements
        const timerDisplay = document.getElementById('timer-seconds');
        const timerLabel = document.querySelector('.timer-label');
        const skipBtn = document.getElementById('skip-timer-btn');
        
        if (timerDisplay) {
            timerDisplay.textContent = '60';
            timerDisplay.style.fontSize = '48px';
        }
        if (timerLabel) {
            timerLabel.textContent = 'seconds';
        }
        if (skipBtn) {
            skipBtn.style.display = 'block';
        }
        
        this.restTimerSeconds = 0;
    }

    updateTimerDisplay() {
        const timerDisplay = document.getElementById('timer-seconds');
        const timerLabel = document.querySelector('.timer-label');
        if (timerDisplay) {
            // Display in M:S format
            const formatted = this.formatRestTimer(this.restTimerSeconds);
            timerDisplay.textContent = formatted;
            if (timerLabel) {
                timerLabel.textContent = '';
            }
        }
    }

    completeRestTimer() {
        // Clear the interval but keep the timer visible
        if (this.restTimer) {
            clearInterval(this.restTimer);
            this.restTimer = null;
        }
        
        // Update display to show "Rest completed" message
        const timerDisplay = document.getElementById('timer-seconds');
        const timerLabel = document.querySelector('.timer-label');
        if (timerDisplay) {
            timerDisplay.textContent = '✓';
            timerDisplay.style.fontSize = '36px';
        }
        if (timerLabel) {
            timerLabel.textContent = 'Rest Completed';
        }
        
        // Hide skip button since rest is complete
        const skipBtn = document.getElementById('skip-timer-btn');
        if (skipBtn) {
            skipBtn.style.display = 'none';
        }
        
        // Automatically select the first exercise from remaining list
        this.selectFirstExercise();
    }

    selectFirstExercise() {
        const select = document.getElementById('exercise-name');
        if (!select) return;
        
        // Get the first exercise from the remaining list (skip the empty option)
        if (select.options.length > 1) {
            // First option is empty, so select the second one (first actual exercise)
            const firstExercise = select.options[1];
            if (firstExercise && firstExercise.value) {
                select.value = firstExercise.value;
                // Trigger change event to show recommendations
                const event = new Event('change', { bubbles: true });
                select.dispatchEvent(event);
            }
        }
    }

    formatDifficulty(difficulty) {
        const map = {
            'very-easy': 'Very Easy',
            'easy': 'Easy',
            'medium': 'Medium',
            'hard': 'Hard',
            'very-hard': 'Very Hard'
        };
        return map[difficulty] || difficulty;
    }

    // Format seconds to M:S for rest timer display
    formatRestTimer(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    // Parse M:S format to seconds for rest timer input
    parseRestTimer(timeStr) {
        if (!timeStr || !timeStr.trim()) return null;
        const parts = timeStr.trim().split(':');
        if (parts.length !== 2) return null;
        const mins = parseInt(parts[0], 10);
        const secs = parseInt(parts[1], 10);
        if (isNaN(mins) || isNaN(secs) || secs < 0 || secs > 59) return null;
        return mins * 60 + secs;
    }

    // Format seconds to H:M:S for exercise duration display
    formatExerciseDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        if (hours > 0) {
            return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    // Parse H:M:S or M:S format to seconds for exercise duration input
    parseExerciseDuration(timeStr) {
        if (!timeStr || !timeStr.trim()) return null;
        const parts = timeStr.trim().split(':');
        if (parts.length === 2) {
            // M:S format
            const mins = parseInt(parts[0], 10);
            const secs = parseInt(parts[1], 10);
            if (isNaN(mins) || isNaN(secs) || secs < 0 || secs > 59) return null;
            return mins * 60 + secs;
        } else if (parts.length === 3) {
            // H:M:S format
            const hours = parseInt(parts[0], 10);
            const mins = parseInt(parts[1], 10);
            const secs = parseInt(parts[2], 10);
            if (isNaN(hours) || isNaN(mins) || isNaN(secs) || mins < 0 || mins > 59 || secs < 0 || secs > 59) return null;
            return hours * 3600 + mins * 60 + secs;
        }
        return null;
    }

    // Helper to get exercise object by name
    getExerciseByName(name) {
        if (!name) return null;
        return this.exerciseList.find(ex => typeof ex === 'object' ? ex.name === name : ex === name);
    }

    // Helper to check if exercise name exists in list (works with both string and object arrays)
    exerciseListIncludes(name) {
        if (!name) return false;
        return this.exerciseList.some(ex => {
            if (typeof ex === 'string') return ex === name;
            return ex.name === name;
        });
    }

    // Helper to convert string array to object array (for migration)
    normalizeExerciseList(list) {
        if (!list || list.length === 0) return [];
        return list.map(item => {
            if (typeof item === 'string') {
                // Migrate from old string format
                return {
                    name: item,
                    timerDuration: this.defaultTimer,
                    youtubeLink: '',
                    isAerobic: false
                };
            }
            // Already an object, ensure all fields exist
            return {
                name: item.name || '',
                timerDuration: item.timerDuration || this.defaultTimer,
                youtubeLink: item.youtubeLink || '',
                isAerobic: item.isAerobic || false
            };
        });
    }

    renderTodayWorkout() {
        const container = document.getElementById('today-exercises');
        if (!this.currentSession.exercises || this.currentSession.exercises.length === 0) {
            container.innerHTML = '<p class="no-data">No exercises logged today</p>';
            return;
        }

        let html = '';
        this.currentSession.exercises.forEach((exercise, index) => {
            let detailsHtml = '';
            
            // Check if exercise is aerobic
            if (exercise.isAerobic && exercise.duration !== undefined) {
                // Show duration for aerobic exercises
                const durationStr = this.formatExerciseDuration(exercise.duration);
                detailsHtml = `<div class="details">Duration: ${durationStr}</div>`;
            } else {
                // Show reps/weights for non-aerobic exercises
                const weights = exercise.weights || (exercise.weight ? Array(exercise.reps.length).fill(exercise.weight) : []);
                const weightDetails = weights.map((w, i) => `Set ${i + 1}: ${exercise.reps[i] || 0} reps × ${w || 0}kg`).join(', ');
                detailsHtml = `<div class="details">${weightDetails}</div>`;
            }
            
            html += `
                <div class="exercise-card">
                    <h4>${exercise.name}</h4>
                    ${detailsHtml}
                    <div class="details">Difficulty: ${this.formatDifficulty(exercise.difficulty)}</div>
                    ${exercise.notes ? `<div class="details">Notes: ${exercise.notes}</div>` : ''}
                </div>
            `;
        });
        container.innerHTML = html;
    }

    renderHistory() {
        this.renderChart();
        this.renderHistoryList();
    }

    renderChart() {
        const exerciseFilter = document.getElementById('exercise-filter').value;
        const timeFilter = document.getElementById('time-filter').value;
        
        const allExercises = new Set();
        this.sessions.forEach(s => {
            if (s.exercises) {
                s.exercises.forEach(e => allExercises.add(e.name));
            }
        });

        const filterSelect = document.getElementById('exercise-filter');
        const currentValue = filterSelect.value;
        filterSelect.innerHTML = '<option value="all">All Exercises</option>';
        allExercises.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            filterSelect.appendChild(option);
        });
        filterSelect.value = currentValue;

        let filteredSessions = [...this.sessions];
        if (timeFilter !== 'all') {
            const daysAgo = parseInt(timeFilter);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysAgo);
            filteredSessions = filteredSessions.filter(s => new Date(s.date) >= cutoffDate);
        }

        const exerciseData = {};
        filteredSessions.forEach(session => {
            if (session.exercises) {
                session.exercises.forEach(ex => {
                    if (exerciseFilter === 'all' || ex.name === exerciseFilter) {
                        if (!exerciseData[ex.name]) {
                            exerciseData[ex.name] = [];
                        }
                        const weights = ex.weights || (ex.weight ? Array(ex.reps.length).fill(ex.weight) : []);
                        const totalVolume = weights.reduce((sum, w, i) => sum + (w * (ex.reps[i] || 0)), 0);
                        const avgWeight = weights.length > 0 ? weights.reduce((a, b) => a + b, 0) / weights.length : 0;
                        exerciseData[ex.name].push({
                            date: session.date,
                            weight: avgWeight,
                            volume: totalVolume,
                            reps: ex.reps.reduce((a, b) => a + b, 0)
                        });
                    }
                });
            }
        });

        const ctx = document.getElementById('progress-chart').getContext('2d');
        
        if (this.chart) {
            this.chart.destroy();
        }

        if (Object.keys(exerciseData).length === 0) {
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            return;
        }

        const colors = ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#00f2fe', '#43e97b', '#fa709a'];

        const allDates = new Set();
        Object.keys(exerciseData).forEach(exName => {
            exerciseData[exName].forEach(d => allDates.add(d.date));
        });
        const sortedDates = Array.from(allDates).sort();

        const chartDatasets = [];
        let colorIndex = 0;
        Object.keys(exerciseData).forEach(exName => {
            const data = exerciseData[exName];
            const volumeByDate = {};
            data.forEach(d => {
                volumeByDate[d.date] = d.volume;
            });
            
            chartDatasets.push({
                label: `${exName} - Volume (kg)`,
                data: sortedDates.map(date => volumeByDate[date] || null),
                borderColor: colors[colorIndex % colors.length],
                backgroundColor: colors[colorIndex % colors.length] + '20',
                tension: 0.4,
                fill: false
            });
            colorIndex++;
        });

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: sortedDates.map(d => {
                    const date = new Date(d);
                    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                }),
                datasets: chartDatasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Volume (kg)'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Date'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                }
            }
        });
    }

    renderHistoryList() {
        const container = document.getElementById('history-content');
        if (!container) {
            console.error('History content container not found');
            return;
        }
        
        const timeFilter = document.getElementById('time-filter')?.value || 'all';
        
        // Debug: log sessions to see what we have
        console.log('Rendering history with sessions:', this.sessions);
        console.log('Number of sessions:', this.sessions?.length || 0);
        console.log('Is signed in:', this.isSignedIn, 'Sheet ID:', this.sheetId);
        
        // Ensure sessions is an array
        if (!Array.isArray(this.sessions)) {
            console.warn('Sessions is not an array, resetting to empty array');
            this.sessions = [];
        }
        
        // Sort sessions by date (most recent first)
        // Handle date strings in YYYY-MM-DD format
        let filteredSessions = [...this.sessions].sort((a, b) => {
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
            // If dates are invalid, put them at the end
            if (isNaN(dateA.getTime())) return 1;
            if (isNaN(dateB.getTime())) return -1;
            return dateB - dateA; // Most recent first
        });
        
        if (timeFilter !== 'all') {
            const daysAgo = parseInt(timeFilter);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysAgo);
            filteredSessions = filteredSessions.filter(s => new Date(s.date) >= cutoffDate);
        }

        if (filteredSessions.length === 0) {
            // Show helpful message based on connection status
            let message = 'No workout history found';
            if (this.isSignedIn && this.sheetId) {
                message += '<br><small style="color: #666;">Try clicking "Sync from Sheet" in Settings to load your data.</small>';
            } else if (this.isSignedIn) {
                message += '<br><small style="color: #666;">Please connect to a Google Sheet in Settings.</small>';
            }
            container.innerHTML = `<p class="no-data">${message}</p>`;
            return;
        }

        let html = '';
        filteredSessions.forEach((session, index) => {
            const date = new Date(session.date);
            const dateStr = date.toLocaleDateString('en-US', { 
                weekday: 'short', 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric' 
            });
            
            html += `<div class="session-card">`;
            html += `<div class="date" style="display: flex; justify-content: space-between; align-items: center;">`;
            html += `<span>${dateStr}</span>`;
            html += `<div style="display: flex; gap: 5px;">`;
            html += `<button class="copy-session-btn" data-session-date="${session.date}" style="padding: 5px 10px; font-size: 12px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer;">📋 Copy</button>`;
            html += `<button class="delete-session-btn" data-session-date="${session.date}" style="padding: 5px 10px; font-size: 12px; background: #f44336; color: white; border: none; border-radius: 5px; cursor: pointer;">🗑️ Delete</button>`;
            html += `</div>`;
            html += `</div>`;
            
            if (session.exercises && session.exercises.length > 0) {
                session.exercises.forEach(ex => {
                    let detailsStr = '';
                    
                    // Check if exercise is aerobic
                    if (ex.isAerobic && ex.duration !== undefined) {
                        // Show duration for aerobic exercises
                        const durationStr = this.formatExerciseDuration(ex.duration);
                        detailsStr = `Duration: ${durationStr}`;
                    } else {
                        // Show reps/weights for non-aerobic exercises
                        const weights = ex.weights || (ex.weight ? Array(ex.reps.length).fill(ex.weight) : []);
                        const reps = ex.reps || [];
                        
                        // Format: show weight only if > 0, otherwise just show reps
                        // For bodyweight exercises, if all reps are the same, just show "8 reps" instead of "8 reps, 8 reps"
                        const hasWeight = weights.some(w => w > 0);
                        
                        if (hasWeight) {
                            // Exercise with weights - show each set with weight
                            const setStrings = [];
                            for (let i = 0; i < Math.max(reps.length, weights.length); i++) {
                                const rep = reps[i] || 0;
                                const weight = weights[i] || 0;
                                if (weight > 0) {
                                    setStrings.push(`${rep}×${weight}kg`);
                                } else if (rep > 0) {
                                    setStrings.push(`${rep} reps`);
                                }
                            }
                            detailsStr = setStrings.join(', ');
                        } else {
                            // Bodyweight exercise - show each set or use multiplication format
                            const validReps = reps.filter(r => r > 0);
                            if (validReps.length === 0) {
                                detailsStr = '';
                            } else if (validReps.length === 1) {
                                // Single set
                                detailsStr = `${validReps[0]} reps`;
                            } else {
                                // Multiple sets - check if all same
                                const uniqueReps = [...new Set(validReps)];
                                if (uniqueReps.length === 1) {
                                    // All sets have same reps - show "2 × 8 reps"
                                    detailsStr = `${validReps.length} × ${uniqueReps[0]} reps`;
                                } else {
                                    // Different reps per set - show "8 reps, 10 reps"
                                    detailsStr = validReps.map(r => `${r} reps`).join(', ');
                                }
                            }
                        }
                    }
                    
                    html += `
                        <div class="exercise-item">
                            <div class="exercise-name">${ex.name}</div>
                            <div class="exercise-details">
                                ${detailsStr} | 
                                ${this.formatDifficulty(ex.difficulty)}
                                ${ex.notes ? ` | ${ex.notes}` : ''}
                            </div>
                        </div>
                    `;
                });
            }
            
            html += `</div>`;
        });
        
        container.innerHTML = html;
        
        // Store filtered sessions for copy functionality (closure)
        const sessionsForCopy = [...filteredSessions];
        
        // Add event listeners for copy buttons
        container.querySelectorAll('.copy-session-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const sessionDate = btn.getAttribute('data-session-date');
                const session = sessionsForCopy.find(s => s.date === sessionDate);
                if (session) {
                    this.copySessionToClipboard(session);
                    
                    // Visual feedback
                    const originalText = btn.textContent;
                    btn.textContent = '✓ Copied!';
                    btn.style.background = '#4caf50';
                    setTimeout(() => {
                        btn.textContent = originalText;
                        btn.style.background = '#667eea';
                    }, 2000);
                }
            });
        });
        
        // Add event listeners for delete buttons
        container.querySelectorAll('.delete-session-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const sessionDate = btn.getAttribute('data-session-date');
                const session = sessionsForCopy.find(s => s.date === sessionDate);
                if (session) {
                    await this.deleteSession(sessionDate);
                }
            });
        });
    }

    async deleteSession(sessionDate) {
        if (!confirm(`Are you sure you want to delete the workout session from ${new Date(sessionDate).toLocaleDateString()}?`)) {
            return;
        }
        
        try {
            // Remove session from array
            const sessionIndex = this.sessions.findIndex(s => s.date === sessionDate);
            if (sessionIndex !== -1) {
                this.sessions.splice(sessionIndex, 1);
                
                // Update current session if it was deleted
                if (this.currentSession && this.currentSession.date === sessionDate) {
                    this.currentSession = this.getTodaySession();
                }
                
                // Save to localStorage
                this.saveSessions();
                
                // Immediately sync to Google Sheets
                const sessionsSheetId = this.getSessionsSheetId();
                if (this.isSignedIn && sessionsSheetId) {
                    await this.syncToSheet(true); // Silent sync
                }
                
                // Re-render history and today's workout
                this.renderHistory();
                this.renderTodayWorkout();
                
                console.log('Session deleted and synced to sheet');
            }
        } catch (error) {
            console.error('Error deleting session:', error);
            alert('Error deleting session: ' + (error.message || 'Unknown error') + '\n\nSession removed locally but may not be deleted from Google Sheets. Please try syncing again.');
        }
    }

    copySessionToClipboard(session) {
        const date = new Date(session.date);
        const dateStr = date.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
        
        let text = `${dateStr}\n\n`;
        
        if (session.exercises && session.exercises.length > 0) {
            session.exercises.forEach((ex, index) => {
                const weights = ex.weights || (ex.weight ? Array(ex.reps.length).fill(ex.weight) : Array(ex.reps.length).fill(0));
                const reps = ex.reps || [];
                
                // Format as: Exercise Name (Set 1: 10 reps × 50kg, Set 2: 8 reps, ...)
                // For bodyweight exercises (weight = 0), just show reps without weight
                const setStrings = [];
                // Only use actual data length, ignore ex.sets which might be incorrect
                const numSets = Math.max(reps.length, weights.length);
                
                // Only show sets that have actual data (reps > 0 or weight > 0)
                for (let i = 0; i < numSets; i++) {
                    const rep = reps[i] || 0;
                    const weight = weights[i] || 0;
                    
                    // Debug logging for Assisted Pullups
                    if (ex.name === 'Assisted Pullups' && i === 0) {
                        console.log('Copy function - Assisted Pullups:', {
                            rep: rep,
                            weight: weight,
                            reps: reps,
                            weights: weights,
                            numSets: numSets
                        });
                    }
                    
                    // Skip sets with no data (both rep and weight are 0)
                    if (rep === 0 && weight === 0) {
                        continue;
                    }
                    
                    if (weight > 0) {
                        // Exercise with weight
                        setStrings.push(`Set ${i + 1}: ${rep} reps × ${weight}kg`);
                    } else {
                        // Bodyweight exercise (no weight) or weight is 0
                        setStrings.push(`Set ${i + 1}: ${rep} reps`);
                    }
                }
                
                if (setStrings.length > 0) {
                    text += `${ex.name} (${setStrings.join(', ')})`;
                } else {
                    // No valid sets found - this shouldn't happen if data is correct
                    // Log for debugging
                    console.warn('No valid sets found for exercise:', ex.name, {
                        reps: ex.reps,
                        weights: ex.weights,
                        sets: ex.sets,
                        fullExercise: ex
                    });
                    // Try to show what we have, even if it's incomplete
                    if (reps.length > 0 || weights.length > 0) {
                        // Show the raw data for debugging
                        const rawData = [];
                        for (let i = 0; i < Math.max(reps.length, weights.length); i++) {
                            rawData.push(`Set ${i + 1}: rep=${reps[i] || 0}, weight=${weights[i] || 0}`);
                        }
                        text += `${ex.name} (${rawData.join(', ')})`;
                    } else {
                        // Show exercise name only, don't show incorrect set count
                        text += `${ex.name}`;
                    }
                }
                
                if (ex.notes) {
                    text += `, Notes: ${ex.notes}`;
                }
                text += '\n';
            });
        }
        
        // Copy to clipboard
        navigator.clipboard.writeText(text).then(() => {
            console.log('Session copied to clipboard');
        }).catch(err => {
            console.error('Failed to copy:', err);
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                console.log('Session copied to clipboard (fallback)');
            } catch (err) {
                console.error('Fallback copy failed:', err);
                alert('Failed to copy. Please select and copy manually.');
            }
            document.body.removeChild(textArea);
        });
    }

    async loadExerciseList() {
        // Google Sheets is the only source of truth - no local storage
        if (this.isSignedIn && this.sheetId) {
            try {
                // Make sure Google Sheets is initialized
                await this.initGoogleSheets();
                const sheetExercises = await this.loadExerciseListFromSheet();
                if (sheetExercises && sheetExercises.length > 0) {
                    // Normalize to ensure all are objects
                    return this.normalizeExerciseList(sheetExercises);
                }
            } catch (error) {
                console.warn('Error loading exercise list from sheet:', error);
            }
        }
        
        // Return empty if not signed in or no sheet
        return [];
    }

    async saveExerciseList() {
        // All data is cloud-based - sync to Google Sheets only
        if (this.isSignedIn && this.sheetId) {
            try {
                await this.syncExerciseListToSheet();
            } catch (error) {
                console.error('Error syncing exercise list to sheet:', error);
                // Don't show error to user, just log it
            }
        }
    }

    async getExercisesTabName() {
        // Get the Exercises sheet tab name (or create it if it doesn't exist)
        const staticSheetId = this.getStaticSheetId();
        if (!staticSheetId) return 'Exercises';
        try {
            await this.initGoogleSheets();
            const response = await gapi.client.sheets.spreadsheets.get({
                spreadsheetId: staticSheetId
            });
            const sheets = response.result.sheets || [];
            // Look for Exercises tab
            const exercisesSheet = sheets.find(s => s.properties.title === 'Exercises');
            if (exercisesSheet) {
                return 'Exercises';
            }
            // If not found, try to use first available tab
            if (sheets.length > 0) {
                return sheets[0].properties.title;
            }
        } catch (error) {
            console.warn('Could not get Exercises tab name:', error);
        }
        return 'Exercises'; // Default fallback
    }

    async syncExerciseListToSheet() {
        const staticSheetId = this.getStaticSheetId();
        if (!this.isSignedIn || !staticSheetId) return;

        try {
            await this.initGoogleSheets();
            
            // Get or create Exercises tab
            let exercisesTabName = await this.getExercisesTabName();
            
            // Normalize exercise list to ensure it's an array of objects
            const normalizedList = this.normalizeExerciseList(this.exerciseList);
            
            // Try to write to Exercises tab, create if it doesn't exist
            try {
                const rows = [['Exercise Name', 'Rest Timer (M:S)', 'YouTube Link', 'Is Aerobic']]; // Header
                normalizedList.forEach(exercise => {
                    const timerStr = exercise.timerDuration ? this.formatRestTimer(exercise.timerDuration) : '';
                    rows.push([
                        exercise.name,
                        timerStr,
                        exercise.youtubeLink || '',
                        exercise.isAerobic ? 'true' : 'false'
                    ]);
                });

                const escapedTabName = this.escapeSheetTabName(exercisesTabName);
                const range = `${escapedTabName}!A1`;
                await gapi.client.sheets.spreadsheets.values.update({
                    spreadsheetId: staticSheetId,
                    range: range,
                    valueInputOption: 'RAW',
                    resource: { values: rows }
                });
            } catch (error) {
                // If Exercises tab doesn't exist, create it
                if (error.message && error.message.includes('Unable to parse range')) {
                    await this.createExercisesSheet();
                    exercisesTabName = 'Exercises';
                    // Retry
                    const rows = [['Exercise Name', 'Rest Timer (M:S)', 'YouTube Link', 'Is Aerobic']];
                    normalizedList.forEach(exercise => {
                        const timerStr = exercise.timerDuration ? this.formatRestTimer(exercise.timerDuration) : '';
                        rows.push([
                            exercise.name,
                            timerStr,
                            exercise.youtubeLink || '',
                            exercise.isAerobic ? 'true' : 'false'
                        ]);
                    });
                    const escapedTabName = this.escapeSheetTabName('Exercises');
                    await gapi.client.sheets.spreadsheets.values.update({
                        spreadsheetId: staticSheetId,
                        range: `${escapedTabName}!A1`,
                        valueInputOption: 'RAW',
                        resource: { values: rows }
                    });
                } else {
                    throw error;
                }
            }
        } catch (error) {
            console.error('Error syncing exercise list to sheet:', error);
            // Don't throw - exercise list sync failure shouldn't break the main sync
        }
    }

    async createExercisesSheet() {
        const staticSheetId = this.getStaticSheetId();
        if (!staticSheetId) {
            throw new Error('Static sheet ID not available');
        }
        try {
            await gapi.client.sheets.spreadsheets.batchUpdate({
                spreadsheetId: staticSheetId,
                resource: {
                    requests: [{
                        addSheet: {
                            properties: {
                                title: 'Exercises',
                                gridProperties: {
                                    rowCount: 1000,
                                    columnCount: 4
                                }
                            }
                        }
                    }]
                }
            });
        } catch (error) {
            console.error('Error creating Exercises sheet:', error);
            throw error;
        }
    }

    async getPlansTabName() {
        const staticSheetId = this.getStaticSheetId();
        if (!staticSheetId) return 'Plans';
        try {
            await this.initGoogleSheets();
            const response = await gapi.client.sheets.spreadsheets.get({
                spreadsheetId: staticSheetId
            });
            const sheets = response.result.sheets || [];
            const plansSheet = sheets.find(s => s.properties.title === 'Plans');
            if (plansSheet) {
                return 'Plans';
            }
            if (sheets.length > 0) {
                return sheets[0].properties.title;
            }
        } catch (error) {
            console.warn('Could not get Plans tab name:', error);
        }
        return 'Plans';
    }

    async createPlansSheet() {
        const staticSheetId = this.getStaticSheetId();
        if (!staticSheetId) {
            throw new Error('Static sheet ID not available');
        }
        try {
            await gapi.client.sheets.spreadsheets.batchUpdate({
                spreadsheetId: staticSheetId,
                resource: {
                    requests: [{
                        addSheet: {
                            properties: {
                                title: 'Plans',
                                gridProperties: {
                                    rowCount: 1000,
                                    columnCount: 6
                                }
                            }
                        }
                    }]
                }
            });
        } catch (error) {
            console.error('Error creating Plans sheet:', error);
            throw error;
        }
    }

    async loadWorkoutPlans() {
        const staticSheetId = this.getStaticSheetId();
        if (!this.isSignedIn || !staticSheetId) return [];

        try {
            await this.initGoogleSheets();
            
            if (gapi.client) {
                gapi.client.setToken({ access_token: this.googleToken });
            } else {
                console.error('gapi.client not available in loadWorkoutPlans');
                return [];
            }
            
            let plansTabName = 'Plans';
            try {
                plansTabName = await this.getPlansTabName();
            } catch (e) {
                // Use default, tab might not exist yet
            }
            
            const escapedTabName = this.escapeSheetTabName(plansTabName);
            const response = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: staticSheetId,
                range: `${escapedTabName}!A2:F1000` // Skip header row, load columns A-F
            });

            const rows = response.result.values || [];
            if (rows.length > 0) {
                const plans = rows
                    .map(row => {
                        const id = row[0]?.trim();
                        if (!id || id.length === 0) return null;
                        
                        const plan = {
                            id: id,
                            name: row[1]?.trim() || '',
                            exerciseSlots: [],
                            createdAt: row[3]?.trim() || new Date().toISOString(),
                            createdBy: row[4]?.trim() || this.userEmail || '',
                            creatorSheetId: row[5]?.trim() || this.getStaticSheetId()
                        };
                        
                        // Column C: Exercise Slots (JSON string)
                        if (row[2] !== undefined && row[2] !== null && row[2] !== '') {
                            try {
                                plan.exerciseSlots = JSON.parse(row[2]);
                            } catch (e) {
                                console.warn('Error parsing exercise slots for plan:', id, e);
                            }
                        }
                        
                        return plan;
                    })
                    .filter(plan => plan !== null);
                
                return plans;
            }
        } catch (error) {
            console.log('Plans sheet not found or error loading:', error.message);
        }
        return [];
    }

    async saveWorkoutPlans() {
        const staticSheetId = this.getStaticSheetId();
        if (!this.isSignedIn || !staticSheetId) return;

        try {
            await this.initGoogleSheets();
            
            let plansTabName = await this.getPlansTabName();
            
            try {
                const rows = [['Plan ID', 'Plan Name', 'Exercise Slots (JSON)', 'Created At', 'Created By', 'Creator Sheet ID']];
                this.workoutPlans.forEach(plan => {
                    rows.push([
                        plan.id,
                        plan.name,
                        JSON.stringify(plan.exerciseSlots),
                        plan.createdAt,
                        plan.createdBy,
                        plan.creatorSheetId || staticSheetId
                    ]);
                });

                const escapedTabName = this.escapeSheetTabName(plansTabName);
                const range = `${escapedTabName}!A1`;
                await gapi.client.sheets.spreadsheets.values.update({
                    spreadsheetId: staticSheetId,
                    range: range,
                    valueInputOption: 'RAW',
                    resource: { values: rows }
                });
            } catch (error) {
                if (error.message && error.message.includes('Unable to parse range')) {
                    await this.createPlansSheet();
                    plansTabName = 'Plans';
                    const rows = [['Plan ID', 'Plan Name', 'Exercise Slots (JSON)', 'Created At', 'Created By', 'Creator Sheet ID']];
                    this.workoutPlans.forEach(plan => {
                        rows.push([
                            plan.id,
                            plan.name,
                            JSON.stringify(plan.exerciseSlots),
                            plan.createdAt,
                            plan.createdBy,
                            plan.creatorSheetId || staticSheetId
                        ]);
                    });
                    const escapedTabName = this.escapeSheetTabName('Plans');
                    await gapi.client.sheets.spreadsheets.values.update({
                        spreadsheetId: staticSheetId,
                        range: `${escapedTabName}!A1`,
                        valueInputOption: 'RAW',
                        resource: { values: rows }
                    });
                } else {
                    throw error;
                }
            }
        } catch (error) {
            console.error('Error saving workout plans to sheet:', error);
        }
    }

    async loadExerciseListFromSheet() {
        const staticSheetId = this.getStaticSheetId();
        if (!this.isSignedIn || !staticSheetId) return null;

        try {
            await this.initGoogleSheets();
            
            // CRITICAL: Ensure token is set on gapi.client before making API calls
            // This is especially important on mobile browsers
            if (gapi.client) {
                gapi.client.setToken({ access_token: this.googleToken });
                console.log('Token explicitly set for loadExerciseListFromSheet API call');
            } else {
                console.error('gapi.client not available in loadExerciseListFromSheet');
                return null;
            }
            
            // Get Exercises tab name (or try default)
            let exercisesTabName = 'Exercises';
            try {
                exercisesTabName = await this.getExercisesTabName();
            } catch (e) {
                // Use default, tab might not exist yet
            }
            
            const escapedTabName = this.escapeSheetTabName(exercisesTabName);
            // Load all columns (A:D) for exercise configuration
            const response = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: staticSheetId,
                range: `${escapedTabName}!A2:D1000` // Skip header row, load columns A-D
            });

            const rows = response.result.values || [];
            console.log('Exercise rows loaded from sheet:', rows.length);
            if (rows.length > 0) {
                const exercises = rows
                    .map(row => {
                        const name = row[0]?.trim();
                        if (!name || name.length === 0) return null;
                        
                        // Parse exercise object
                        const exercise = {
                            name: name,
                            timerDuration: this.defaultTimer,
                            youtubeLink: '',
                            isAerobic: false
                        };
                        
                        // Column B: Timer Duration (seconds, or M:S format)
                        if (row[1] !== undefined && row[1] !== null && row[1] !== '') {
                            const timerStr = String(row[1]).trim();
                            const parsed = this.parseRestTimer(timerStr);
                            if (parsed !== null) {
                                exercise.timerDuration = parsed;
                            } else {
                                // Try parsing as number (seconds)
                                const num = parseInt(timerStr, 10);
                                if (!isNaN(num) && num > 0) {
                                    exercise.timerDuration = num;
                                }
                            }
                        }
                        
                        // Column C: YouTube Link
                        if (row[2] !== undefined && row[2] !== null && row[2] !== '') {
                            exercise.youtubeLink = String(row[2]).trim();
                        }
                        
                        // Column D: Is Aerobic
                        if (row[3] !== undefined && row[3] !== null && row[3] !== '') {
                            const aerobicStr = String(row[3]).trim().toLowerCase();
                            exercise.isAerobic = aerobicStr === 'true' || aerobicStr === '1' || aerobicStr === 'yes';
                        }
                        
                        return exercise;
                    })
                    .filter(ex => ex !== null);
                
                // Keep exercises in the same order as they appear in the sheet (no sorting)
                console.log('Exercises loaded from sheet:', exercises.length, exercises.slice(0, 5));
                return exercises;
            }
        } catch (error) {
            // Exercises sheet might not exist yet, that's okay
            console.log('Exercises sheet not found or error loading:', error.message);
        }
        return null;
    }

    updateExerciseList(skipSave = false) {
        const select = document.getElementById('exercise-name');
        if (!select) {
            console.error('Exercise name select element not found');
            return;
        }
        
        const currentValue = select.value;
        
        // Normalize exercise list to ensure it's an array of objects
        this.exerciseList = this.normalizeExerciseList(this.exerciseList);
        
        // Merge exercises from sessions with saved list
        const exercisesFromSessions = new Set();
        this.sessions.forEach(session => {
            if (session.exercises) {
                session.exercises.forEach(ex => exercisesFromSessions.add(ex.name));
            }
        });

        console.log('updateExerciseList: Exercises from sessions:', Array.from(exercisesFromSessions));
        console.log('updateExerciseList: Saved exercise list:', this.exerciseList);

        // Combine saved list with exercises from sessions, preserving order
        // Start with saved list, then add any from sessions that aren't already there
        const allExercises = [...this.exerciseList];
        exercisesFromSessions.forEach(exName => {
            if (!this.exerciseListIncludes(exName)) {
                // Add new exercise from session with default values
                allExercises.push({
                    name: exName,
                    timerDuration: this.defaultTimer,
                    youtubeLink: '',
                    isAerobic: false
                });
            }
        });
        
        // Only update and save if the list actually changed
        const listChanged = JSON.stringify(this.exerciseList) !== JSON.stringify(allExercises);
        this.exerciseList = allExercises; // Keep in order (no sorting)
        console.log('updateExerciseList: Final exercise list:', this.exerciseList);
        
        // Only save to sheet if list changed and we're not in read-only mode
        if (!skipSave && listChanged) {
            this.saveExerciseList(); // Async, but fire-and-forget
        }

        // Filter exercises by plan if plan is active
        let exercisesToShow = this.exerciseList;
        if (this.activePlanId) {
            const filtered = this.filterExercisesByPlan();
            if (filtered) {
                exercisesToShow = filtered;
            }
        }

        // Update select dropdown with color coding
        select.innerHTML = '<option value="">Select or type to add new...</option>';
        exercisesToShow.forEach(exercise => {
            const exerciseName = typeof exercise === 'object' ? exercise.name : exercise;
            const option = document.createElement('option');
            option.value = exerciseName;
            option.textContent = exerciseName;
            
            // Check if exercise was completed twice with same parameters
            const completedTwice = this.checkExerciseCompletedTwice(exerciseName);
            if (completedTwice) {
                option.style.color = '#4caf50'; // Green
            } else {
                option.style.color = '#f44336'; // Red
            }
            
            select.appendChild(option);
        });

        console.log('updateExerciseList: Dropdown updated with', select.options.length, 'options');

        // Restore previous selection if it still exists
        if (currentValue && this.exerciseListIncludes(currentValue)) {
            // Check if current value is in filtered list
            const inFilteredList = exercisesToShow.some(ex => {
                const name = typeof ex === 'object' ? ex.name : ex;
                return name === currentValue;
            });
            if (inFilteredList) {
                select.value = currentValue;
            }
        }
    }

    async findSheetByName(sheetName) {
        // Using drive.file scope (non-sensitive, no CASA required)
        // Can only find sheets the app created or user selected via Picker API
        if (!this.isSignedIn || !this.googleToken) {
            console.warn('Cannot search for sheet: not signed in');
            return [];
        }

        try {
            await this.initGoogleDrive();
            
            // CRITICAL: Ensure token is set before API calls
            if (!gapi.client) {
                throw new Error('Google API client not initialized. Please refresh the page.');
            }
            
            // Ensure token is set
            gapi.client.setToken({ access_token: this.googleToken });
            console.log('Token set for Drive API search (using drive.file scope)');
            
            // Verify Drive API is loaded
            if (!gapi.client.drive) {
                console.warn('Drive API not loaded, attempting to initialize...');
                await this.initGoogleDrive();
                // Wait a moment for Drive API to be available
                await new Promise(resolve => setTimeout(resolve, 500));
                if (!gapi.client.drive) {
                    console.error('Drive API still not available after initialization attempt');
                    throw new Error('Google Drive API not available. Please refresh the page and sign in again.');
                }
            }
            console.log('Drive API is ready for search');
            
            // Escape single quotes in sheet name for the query
            const escapedName = sheetName.replace(/'/g, "\\'");
            
            // Search for sheets that start with the base name (to catch sheets with dates)
            // Use 'contains' to find sheets that start with the name
            console.log('Searching for sheet with name starting with:', sheetName, '(drive.file scope - only finds app-created or user-selected files)');
            const response = await gapi.client.drive.files.list({
                q: `name contains '${escapedName}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
                fields: 'files(id, name, modifiedTime)',
                orderBy: 'modifiedTime desc'
            });
            
            const files = response.result.files || [];
            console.log(`Found ${files.length} sheet(s) with name "${sheetName}" (within drive.file scope)`);
            files.forEach((file, idx) => {
                console.log(`  ${idx + 1}. "${file.name}" (ID: ${file.id}, Modified: ${file.modifiedTime})`);
            });
            
            const sheets = files.map(file => ({
                id: file.id,
                name: file.name,
                modifiedTime: file.modifiedTime
            }));
            
            return sheets;
        } catch (error) {
            console.error('Error searching for sheet by name:', error);
            return [];
        }
    }


    async handleMultipleSheetMatches(sheets, userEmail) {
        // Create a simple selection dialog
        let message = `Found ${sheets.length} sheets with this name. Please choose one:\n\n`;
        sheets.forEach((sheet, index) => {
            const date = new Date(sheet.modifiedTime);
            const dateStr = date.toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            message += `${index + 1}. ${sheet.name} (Last modified: ${dateStr})\n`;
        });
        message += `\nEnter the number (1-${sheets.length}):`;
        
        const choice = prompt(message);
        const selectedIndex = parseInt(choice) - 1;
        
        if (selectedIndex >= 0 && selectedIndex < sheets.length) {
            const selectedSheet = sheets[selectedIndex];
            this.sheetId = selectedSheet.id;
            this.saveSheetIdForUser(userEmail, selectedSheet.id);
            localStorage.setItem('sheetId', selectedSheet.id);
            
            // Store the other duplicate sheets for potential deletion (user will decide)
            const otherSheets = sheets.filter((_, index) => index !== selectedIndex);
            this.duplicateSheetsToDelete = otherSheets;
            
            const sheetStatus = document.getElementById('sheet-status');
            if (sheetStatus) {
                let statusHTML = `<p style="color: green;">✓ Connected to '${selectedSheet.name}'</p>`;
                
                // Show delete button if there are duplicate sheets
                if (otherSheets.length > 0) {
                    statusHTML += `<button id="delete-duplicate-sheets-btn" class="btn-secondary" style="margin-top: 10px; padding: 8px 16px; font-size: 14px;">🗑️ Delete ${otherSheets.length} Other Duplicate Sheet(s)</button>`;
                }
                
                sheetStatus.innerHTML = statusHTML;
                
                // Add click handler for delete button
                if (otherSheets.length > 0) {
                    const deleteBtn = document.getElementById('delete-duplicate-sheets-btn');
                    if (deleteBtn) {
                        deleteBtn.onclick = () => this.deleteDuplicateSheets();
                    }
                }
            }
            
            // Continue with connection process
            await this.completeSheetConnection(selectedSheet.id);
            
            // Show reconnect button
            const reconnectBtn = document.getElementById('reconnect-sheet-btn');
            if (reconnectBtn) {
                reconnectBtn.style.display = 'block';
            }
        } else {
            const sheetStatus = document.getElementById('sheet-status');
            if (sheetStatus) {
                sheetStatus.innerHTML = '<p style="color: orange;">⚠ No sheet selected. Please try again.</p>';
            }
        }
    }

    async deleteDuplicateSheets() {
        if (!this.duplicateSheetsToDelete || this.duplicateSheetsToDelete.length === 0) {
            return;
        }
        
        // Confirm with user
        const confirmMessage = `Are you sure you want to delete ${this.duplicateSheetsToDelete.length} duplicate sheet(s)?\n\nThis action cannot be undone.`;
        if (!confirm(confirmMessage)) {
            return;
        }
        
        const sheetStatus = document.getElementById('sheet-status');
        if (sheetStatus) {
            sheetStatus.innerHTML = '<p style="color: orange;">⏳ Deleting duplicate sheets...</p>';
        }
        
        try {
            await this.initGoogleDrive();
            if (gapi.client && gapi.client.drive) {
                gapi.client.setToken({ access_token: this.googleToken });
                
                let deletedCount = 0;
                let failedCount = 0;
                
                // Delete each duplicate sheet
                for (const sheet of this.duplicateSheetsToDelete) {
                    try {
                        await gapi.client.drive.files.delete({
                            fileId: sheet.id
                        });
                        console.log(`Deleted duplicate sheet: ${sheet.name} (${sheet.id})`);
                        deletedCount++;
                    } catch (deleteError) {
                        console.warn(`Failed to delete sheet ${sheet.id}:`, deleteError);
                        failedCount++;
                    }
                }
                
                console.log(`Finished deleting duplicate sheets: ${deletedCount} deleted, ${failedCount} failed`);
                
                // Update status message
                if (sheetStatus) {
                    if (failedCount === 0) {
                        sheetStatus.innerHTML = `<p style="color: green;">✓ Successfully deleted ${deletedCount} duplicate sheet(s)</p>`;
                    } else {
                        sheetStatus.innerHTML = `<p style="color: orange;">⚠ Deleted ${deletedCount} sheet(s), ${failedCount} failed</p>`;
                    }
                    
                    // Clear the message after 3 seconds
                    setTimeout(() => {
                        if (sheetStatus) {
                            sheetStatus.innerHTML = '<p style="color: green;">✓ Connected to your sheet</p>';
                        }
                    }, 3000);
                }
                
                // Clear the duplicate sheets list
                this.duplicateSheetsToDelete = [];
            }
        } catch (error) {
            console.error('Error deleting duplicate sheets:', error);
            if (sheetStatus) {
                sheetStatus.innerHTML = '<p style="color: red;">❌ Error deleting duplicate sheets. Please try again.</p>';
            }
        }
    }

    async completeSheetConnection(sheetId) {
        this.sheetId = sheetId;
        this.updateSyncStatus();
        
        try {
            await this.initGoogleSheets();
            
            // CRITICAL: Ensure token is set before API calls
            if (gapi.client) {
                gapi.client.setToken({ access_token: this.googleToken });
            }
            
            // Test access by trying to read the sheet
            const sheetInfo = await gapi.client.sheets.spreadsheets.get({
                spreadsheetId: sheetId
            });
            const sheetName = sheetInfo.result.properties?.title || 'Unknown';
            console.log('completeSheetConnection: Connected to sheet:', sheetName, 'ID:', sheetId);
            
            // Reload sessions from Google Sheets (source of truth)
            console.log('Connecting: Loading sessions from sheet ID:', sheetId);
            const loadedSessions = await this.loadSessions();
            console.log('Connecting: Loaded sessions:', loadedSessions?.length || 0);
            this.sessions = loadedSessions || [];
            this.currentSession = this.getTodaySession();
            
            // Force re-render to ensure UI updates
            this.renderTodayWorkout();
            this.renderHistory();
            
            // Reload exercise list from Google Sheets
            const sheetExercises = await this.loadExerciseListFromSheet();
            if (sheetExercises && sheetExercises.length > 0) {
                console.log('Connecting: Loaded', sheetExercises.length, 'exercises from sheet');
                this.exerciseList = sheetExercises;
                // Don't save back - we're just reading from the sheet
                this.updateExerciseList(true); // Skip save - just reading
            } else {
                this.exerciseList = await this.loadExerciseList();
                this.updateExerciseList(true); // Skip save - just reading
            }
            
            // Don't sync to sheet when connecting - sheet is source of truth, we only read from it
            // Sync only happens when user explicitly saves an exercise
            // await this.syncToSheet(true); // Removed - don't write on connect
            
            // Data is already loaded above, just render
            this.renderTodayWorkout();
            this.renderHistory();
            
            // Show reconnect button
            const reconnectBtn = document.getElementById('reconnect-sheet-btn');
            if (reconnectBtn) {
                reconnectBtn.style.display = 'block';
            }
        } catch (error) {
            console.warn('Error completing sheet connection:', error);
            const sheetStatus = document.getElementById('sheet-status');
            if (sheetStatus) {
                sheetStatus.innerHTML = '<p style="color: orange;">⚠ Connected but error loading data. Please try syncing manually.</p>';
            }
            
            // Show reconnect button even on error
            const reconnectBtn = document.getElementById('reconnect-sheet-btn');
            if (reconnectBtn) {
                reconnectBtn.style.display = 'block';
            }
        }
    }

    // Removed - reconnect handled automatically
    async _removed_reconnectToSheet() {
        if (!this.isSignedIn || !this.userEmail) {
            alert('Please sign in first');
            return;
        }
        
        const sheetStatus = document.getElementById('sheet-status');
        if (sheetStatus) {
            sheetStatus.innerHTML = '<p style="color: #666;">Searching for sheet...</p>';
        }
        
        // Clear stored Sheet ID
        this.saveSheetIdForUser(this.userEmail, null);
        localStorage.removeItem('sheetId');
        this.sheetId = null;
        
        try {
            // Force a fresh search
            await this.autoConnectSheet(this.userEmail);
        } catch (error) {
            console.error('Error reconnecting to sheet:', error);
            if (sheetStatus) {
                let errorMsg = '⚠ Error reconnecting. ';
                if (error.message) {
                    errorMsg += error.message;
                } else if (error.result?.error) {
                    errorMsg += error.result.error.message || 'Please check your permissions.';
                } else {
                    errorMsg += 'Please try signing out and signing in again to refresh permissions.';
                }
                sheetStatus.innerHTML = `<p style="color: orange;">${errorMsg}</p>`;
            }
        }
    }

    // connectSheet() removed - sheets are now automatically discovered by name
    // Users no longer need to manually enter Sheet IDs

    getSheetId() {
        // Return sessions sheet ID for backward compatibility
        return this.getSessionsSheetId();
    }

    getStaticSheetId() {
        // First try to get from instance property
        if (this.staticSheetId) {
            return this.staticSheetId;
        }
        // Then try user-specific storage
        if (this.userEmail) {
            const userStaticSheetId = this.getStaticSheetIdForUser(this.userEmail);
            if (userStaticSheetId) {
                this.staticSheetId = userStaticSheetId;
                return userStaticSheetId;
            }
        }
        // Fall back to general storage
        const staticId = localStorage.getItem('staticSheetId');
        if (staticId) {
            this.staticSheetId = staticId;
        }
        return staticId;
    }

    getSessionsSheetId() {
        // First try to get from instance property
        if (this.sessionsSheetId) {
            return this.sessionsSheetId;
        }
        // Then try user-specific storage
        if (this.userEmail) {
            const userSessionsSheetId = this.getSessionsSheetIdForUser(this.userEmail);
            if (userSessionsSheetId) {
                this.sessionsSheetId = userSessionsSheetId;
                return userSessionsSheetId;
            }
        }
        // Fall back to general storage
        const sessionsId = localStorage.getItem('sessionsSheetId');
        if (sessionsId) {
            this.sessionsSheetId = sessionsId;
        }
        // For backward compatibility, also check old sheetId
        if (!sessionsId) {
            const oldSheetId = this.getSheetIdForUser(this.userEmail) || localStorage.getItem('sheetId');
            if (oldSheetId) {
                this.sessionsSheetId = oldSheetId;
                return oldSheetId;
            }
        }
        return sessionsId;
    }

    getSheetIdForUser(userEmail) {
        // Backward compatibility: return sessions sheet ID
        const userSessionsSheetId = this.getSessionsSheetIdForUser(userEmail);
        if (userSessionsSheetId) {
            return userSessionsSheetId;
        }
        // Fall back to old storage format
        const userSheetIds = JSON.parse(localStorage.getItem('userSheetIds') || '{}');
        return userSheetIds[userEmail] || null;
    }

    getStaticSheetIdForUser(userEmail) {
        const userSheetIds = JSON.parse(localStorage.getItem('userSheetIds') || '{}');
        const userData = userSheetIds[userEmail];
        if (userData && typeof userData === 'object' && userData.staticSheetId) {
            return userData.staticSheetId;
        }
        return null;
    }

    getSessionsSheetIdForUser(userEmail) {
        const userSheetIds = JSON.parse(localStorage.getItem('userSheetIds') || '{}');
        const userData = userSheetIds[userEmail];
        if (userData && typeof userData === 'object' && userData.sessionsSheetId) {
            return userData.sessionsSheetId;
        }
        // Fall back to old format (single sheetId)
        if (userData && typeof userData === 'string') {
            return userData;
        }
        return null;
    }

    saveSheetIdForUser(userEmail, sheetId) {
        // Backward compatibility: save as sessions sheet ID
        this.saveSessionsSheetIdForUser(userEmail, sheetId);
    }

    saveStaticSheetIdForUser(userEmail, staticSheetId) {
        const userSheetIds = JSON.parse(localStorage.getItem('userSheetIds') || '{}');
        if (!userSheetIds[userEmail] || typeof userSheetIds[userEmail] !== 'object') {
            // Migrate from old format if needed
            const oldValue = userSheetIds[userEmail];
            userSheetIds[userEmail] = {};
            if (oldValue && typeof oldValue === 'string') {
                userSheetIds[userEmail].sessionsSheetId = oldValue;
            }
        }
        if (staticSheetId) {
            userSheetIds[userEmail].staticSheetId = staticSheetId;
            this.staticSheetId = staticSheetId;
        } else {
            delete userSheetIds[userEmail].staticSheetId;
            this.staticSheetId = null;
        }
        localStorage.setItem('userSheetIds', JSON.stringify(userSheetIds));
        if (staticSheetId) {
            localStorage.setItem('staticSheetId', staticSheetId);
        } else {
            localStorage.removeItem('staticSheetId');
        }
    }

    saveSessionsSheetIdForUser(userEmail, sessionsSheetId) {
        const userSheetIds = JSON.parse(localStorage.getItem('userSheetIds') || '{}');
        if (!userSheetIds[userEmail] || typeof userSheetIds[userEmail] !== 'object') {
            // Migrate from old format if needed
            const oldValue = userSheetIds[userEmail];
            userSheetIds[userEmail] = {};
            if (oldValue && typeof oldValue === 'string') {
                userSheetIds[userEmail].sessionsSheetId = oldValue;
            }
        }
        if (sessionsSheetId) {
            userSheetIds[userEmail].sessionsSheetId = sessionsSheetId;
            this.sessionsSheetId = sessionsSheetId;
        } else {
            delete userSheetIds[userEmail].sessionsSheetId;
            this.sessionsSheetId = null;
        }
        localStorage.setItem('userSheetIds', JSON.stringify(userSheetIds));
        if (sessionsSheetId) {
            localStorage.setItem('sessionsSheetId', sessionsSheetId);
            // Also save to old format for backward compatibility
            const oldFormat = JSON.parse(localStorage.getItem('userSheetIds') || '{}');
            oldFormat[userEmail] = sessionsSheetId;
            localStorage.setItem('userSheetIds', JSON.stringify(oldFormat));
        } else {
            localStorage.removeItem('sessionsSheetId');
        }
    }

    escapeSheetTabName(tabName) {
        // If tab name contains spaces or special characters, wrap in single quotes
        if (tabName.includes(' ') || tabName.includes('-') || tabName.includes('!') || tabName.includes("'")) {
            return `'${tabName.replace(/'/g, "''")}'`; // Escape single quotes by doubling them
        }
        return tabName;
    }

    async getSheetTabName() {
        // Get the first sheet tab name (or default to 'Sheet1')
        try {
            await this.initGoogleSheets();
            
            // CRITICAL: Ensure token is set before making API call
            // This is especially important on mobile browsers
            if (gapi.client) {
                gapi.client.setToken({ access_token: this.googleToken });
                console.log('Token explicitly set for getSheetTabName API call');
            } else {
                console.error('gapi.client not available in getSheetTabName');
                return 'Sheet1'; // Fallback to default
            }
            
            const response = await gapi.client.sheets.spreadsheets.get({
                spreadsheetId: this.sheetId
            });
            const sheets = response.result.sheets || [];
            if (sheets.length > 0) {
                const tabName = sheets[0].properties.title;
                console.log('Using sheet tab name:', tabName);
                return tabName;
            }
        } catch (error) {
            console.warn('Could not get sheet tab name, using default:', error);
            if (error.result?.error) {
                console.error('API Error details:', error.result.error);
            }
        }
        console.log('Using default sheet tab name: Sheet1');
        return 'Sheet1'; // Default fallback
    }

    async syncToSheet(silent = false) {
        const sessionsSheetId = this.getSessionsSheetId();
        if (!this.isSignedIn || !sessionsSheetId) {
            if (!silent) alert('Please sign in and connect a Google Sheet first');
            return;
        }

        if (!silent) {
            const statusEl = document.getElementById('sync-status');
            if (statusEl) {
                statusEl.innerHTML = '<span id="sync-indicator">🔄</span><span id="sync-text">Syncing...</span>';
            }
        }

        try {
            await this.initGoogleSheets();
            
            // Always ensure token is set before API calls (mobile browsers sometimes lose it)
            if (gapi.client) {
                gapi.client.setToken({ access_token: this.googleToken });
                console.log('Token set for API call');
            } else {
                console.error('gapi.client not available');
                throw new Error('Google API client not initialized');
            }
            
            // Get the actual sheet tab name
            const sheetTabName = await this.getSheetTabName();
            const escapedTabName = this.escapeSheetTabName(sheetTabName);
            
            // Convert sessions to sheet format
            // Format: Date, Exercise, Set, Reps, Weight (kg), Difficulty, Notes
            // Set is the number of sets, Reps and Weight are comma-separated values (e.g., "8,8" and "65,65")
            const rows = [['Date', 'Exercise', 'Set', 'Reps', 'Weight (kg)', 'Difficulty', 'Notes']];
            
            this.sessions.forEach(session => {
                if (session.exercises) {
                    session.exercises.forEach(ex => {
                        // Use actual array lengths, not ex.sets which might be incorrect
                        const weights = ex.weights || (ex.weight ? Array(ex.reps.length).fill(ex.weight) : []);
                        const reps = ex.reps || [];
                        // Use the actual number of sets from the arrays
                        const numSets = Math.max(reps.length, weights.length);
                        
                        // Filter out sets with no data (both rep and weight are 0)
                        const validWeights = [];
                        const validReps = [];
                        for (let i = 0; i < numSets; i++) {
                            const rep = reps[i] || 0;
                            const weight = weights[i] || 0;
                            
                            // Only include sets with actual data
                            if (rep > 0 || weight > 0) {
                                validReps.push(rep);
                                validWeights.push(weight);
                            }
                        }
                        
                        // Only write row if there's at least one valid set
                        if (validReps.length > 0 || validWeights.length > 0) {
                            rows.push([
                                session.date,
                                ex.name,
                                (validReps.length || validWeights.length).toString(), // Number of sets
                                validReps.join(','),    // Comma-separated reps
                                validWeights.join(','), // Comma-separated weights
                                this.formatDifficulty(ex.difficulty),
                                ex.notes || ''
                            ]);
                        }
                    });
                }
            });

            const range = `${escapedTabName}!A1`;
            const response = await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: sessionsSheetId,
                range: range,
                valueInputOption: 'RAW',
                resource: { values: rows }
            });

            // Also sync exercise list
            await this.syncExerciseListToSheet();
            
            if (!silent) {
                alert('Data synced to Google Sheets successfully!');
            }
            this.updateSyncStatus();
        } catch (error) {
            console.error('Sync error:', error);
            if (!silent) {
                // Better error message handling
                let errorMessage = 'Unknown error';
                if (error && typeof error === 'object') {
                    errorMessage = error.message || error.error?.message || error.statusText || JSON.stringify(error);
                } else if (error) {
                    errorMessage = String(error);
                }
                
                // Check for common errors
                if (errorMessage.includes('403') || errorMessage.includes('permission')) {
                    errorMessage = 'Permission denied. Make sure you have edit access to the Google Sheet.';
                } else if (errorMessage.includes('404') || errorMessage.includes('not found')) {
                    errorMessage = 'Sheet not found. Please make sure the sheet exists and is accessible.';
                } else if (errorMessage.includes('401') || errorMessage.includes('unauthorized')) {
                    errorMessage = 'Authentication failed. Please sign in again.';
                }
                
                alert('Error syncing to Google Sheets: ' + errorMessage);
            }
            this.updateSyncStatus();
        }
    }

    async syncFromSheet() {
        const sessionsSheetId = this.getSessionsSheetId();
        if (!this.isSignedIn || !sessionsSheetId) {
            alert('Please sign in and connect a Google Sheet first');
            return;
        }

        document.getElementById('sync-status').innerHTML = '<span id="sync-indicator">🔄</span><span id="sync-text">Syncing...</span>';

        try {
            // Ensure token is still valid
            const tokenExpiry = localStorage.getItem('googleTokenExpiry');
            if (tokenExpiry && new Date() >= new Date(tokenExpiry)) {
                console.log('Token expired, need to re-authenticate');
                alert('Your session has expired. Please sign out and sign in again to refresh your permissions.');
                return;
            }
            
            await this.initGoogleSheets();
            
            // Validate that the sheet exists before trying to sync
            if (gapi.client) {
                gapi.client.setToken({ access_token: this.googleToken });
            }
            
            try {
                await gapi.client.sheets.spreadsheets.get({
                    spreadsheetId: sessionsSheetId
                });
            } catch (error) {
                // Sheet doesn't exist or is inaccessible
                console.warn('Sheet not found or inaccessible during sync:', sessionsSheetId, error);
                // Clear the sheet ID
                const oldSheetId = sessionsSheetId;
                if (this.userEmail) {
                    this.saveSessionsSheetIdForUser(this.userEmail, null);
                }
                localStorage.removeItem('sessionsSheetId');
                this.sessionsSheetId = null;
                console.log('Cleared invalid sheet ID:', oldSheetId);
                
                // Clear all data
                this.sessions = [];
                this.exerciseList = [];
                this.currentSession = { date: new Date().toISOString().split('T')[0], exercises: [] };
                this.renderTodayWorkout();
                this.renderHistory();
                this.updateExerciseList();
                this.updateSyncStatus();
                
                throw new Error('The Google Sheet was not found or is no longer accessible. Please reconnect to a sheet.');
            }
            
            // Verify we have a valid token set
            if (!this.googleToken) {
                console.error('No Google token available');
                alert('Authentication error. Please sign out and sign in again.');
                return;
            }
            
            // CRITICAL: Ensure token is set on gapi.client before making API calls
            // This is especially important on mobile browsers
            if (gapi.client) {
                gapi.client.setToken({ access_token: this.googleToken });
                console.log('Token explicitly set for syncFromSheet API call');
            } else {
                console.error('gapi.client not available');
                alert('Google API not initialized. Please refresh the page and try again.');
                return;
            }
            
            // Get the actual sheet tab name
            console.log('Getting sheet tab name for sheet:', this.sheetId);
            const sheetTabName = await this.getSheetTabName();
            console.log('Detected sheet tab name:', sheetTabName);
            const escapedTabName = this.escapeSheetTabName(sheetTabName);
            console.log('Escaped tab name:', escapedTabName);
            
            console.log('Attempting to read from sheet:', this.sheetId, 'range:', `${escapedTabName}!A2:G10000`);
            
            let response;
            let rows = [];
            let apiError = null;
            
            try {
                response = await gapi.client.sheets.spreadsheets.values.get({
                    spreadsheetId: this.sheetId,
                    range: `${escapedTabName}!A2:G10000`
                });

                console.log('API Response:', response);
                console.log('Response result:', response.result);
                console.log('Response values:', response.result?.values);
                
                rows = response.result?.values || [];
                console.log('Rows received from API (A2:G10000):', rows.length);
            } catch (error) {
                apiError = error;
                console.error('Error reading from A2:', error);
                // Try to get more info about the error
                if (error.result?.error) {
                    console.error('API Error details:', error.result.error);
                }
            }
            
            // If no rows from A2, try reading from A1 (maybe data starts at row 1)
            if (rows.length === 0 && !apiError) {
                console.warn('No rows from A2, trying A1...');
                try {
                    // Ensure token is still set
                    if (gapi.client) {
                        gapi.client.setToken({ access_token: this.googleToken });
                    }
                    const testResponse = await gapi.client.sheets.spreadsheets.values.get({
                        spreadsheetId: this.sheetId,
                        range: `${escapedTabName}!A1:G10000`
                    });
                    rows = testResponse.result?.values || [];
                    console.log('Rows from A1:', rows.length);
                    if (rows.length > 0) {
                        console.log('First row from A1:', rows[0]);
                        // Skip the header row if it exists
                        if (rows[0] && rows[0][0] && rows[0][0].toLowerCase() === 'date') {
                            console.log('Skipping header row');
                            rows = rows.slice(1);
                        }
                    }
                } catch (e) {
                    console.error('Error reading from A1:', e);
                    if (!apiError) apiError = e;
                }
            }
            
            // If we got an API error, try to provide helpful feedback
            if (apiError && rows.length === 0) {
                let errorMsg = 'Error reading from Google Sheet.\n\n';
                if (apiError.result?.error) {
                    const apiErr = apiError.result.error;
                    if (apiErr.code === 404 || apiErr.message?.includes('not found')) {
                        errorMsg += 'Sheet not found. Please check:\n';
                        errorMsg += '• The sheet exists and is accessible\n';
                        errorMsg += '• The sheet exists and is accessible\n';
                    } else if (apiErr.code === 403 || apiErr.message?.includes('permission')) {
                        errorMsg += 'Permission denied. Please:\n';
                        errorMsg += '• Make sure the sheet is shared with your Google account\n';
                        errorMsg += '• Sign out and sign in again to refresh permissions\n';
                    } else {
                        errorMsg += `Error: ${apiErr.message || JSON.stringify(apiErr)}\n\n`;
                        errorMsg += 'Please check:\n';
                        errorMsg += '• The sheet exists and is accessible\n';
                        errorMsg += '• You have access to the sheet\n';
                        errorMsg += '• The sheet tab name is correct\n';
                    }
                } else {
                    errorMsg += `Error: ${apiError.message || String(apiError)}\n\n`;
                    errorMsg += 'Please verify the Sheet ID and try again.';
                }
                alert(errorMsg);
                this.updateSyncStatus();
                return;
            }
            
            if (rows.length > 0) {
                console.log('Processing', rows.length, 'rows');
                console.log('First row:', rows[0]);
                console.log('First 3 rows:', rows.slice(0, 3));
            } else {
                // No error but no rows - sheet might be empty or tab name wrong
                console.log('No data rows found in sheet. This is normal for a new sheet.');
                
                // Check if this is a new/empty sheet by checking if header row exists
                let hasHeaders = false;
                try {
                    if (gapi.client) {
                        gapi.client.setToken({ access_token: this.googleToken });
                    }
                    const headerResponse = await gapi.client.sheets.spreadsheets.values.get({
                        spreadsheetId: this.sheetId,
                        range: `${escapedTabName}!A1:G1`
                    });
                    const headerRow = headerResponse.result.values?.[0];
                    if (headerRow && headerRow.length > 0 && headerRow[0]?.toLowerCase() === 'date') {
                        hasHeaders = true;
                    }
                } catch (e) {
                    console.log('Could not check headers:', e);
                }
                
                if (hasHeaders) {
                    // Sheet has headers but no data - this is normal for a new sheet
                    alert('Sheet connected successfully!\n\nThe sheet is empty (no workout data yet).\n\nStart logging workouts in the "Track Workout" tab and they will automatically sync to your sheet.');
                } else {
                    // Sheet might not be set up correctly
                    let errorMsg = 'No data found in the sheet.\n\n';
                    errorMsg += 'The sheet appears to be empty or not set up correctly.\n\n';
                    errorMsg += 'If this is a new sheet, try logging a workout first - it will automatically create the headers and sync data.\n\n';
                    errorMsg += 'If this is an existing sheet, please verify:\n';
                    errorMsg += '1. The sheet has data in the first tab\n';
                    errorMsg += '2. The data starts in column A with a "Date" header\n';
                    alert(errorMsg);
                }
                this.updateSyncStatus();
                return;
            }
            
            // Detect format by checking header row
            // Formats:
            // 1. Newest: Date, Exercise, Set, Reps, Weight (kg), Difficulty, Notes (Set is count, Reps/Weight are comma-separated)
            // 2. Previous: Date, Exercise, Set, Reps, Weight (kg), Difficulty, Notes (one row per set, Set is set number)
            // 3. Oldest: Date, Exercise, Weight, Sets, Reps, Difficulty, Notes
            let formatType = 'newest'; // newest, previous, oldest
            try {
                if (gapi.client) {
                    gapi.client.setToken({ access_token: this.googleToken });
                }
                const headerResponse = await gapi.client.sheets.spreadsheets.values.get({
                    spreadsheetId: this.sheetId,
                    range: `${escapedTabName}!A1:G1`
                });
                const headerRow = headerResponse.result.values?.[0];
                if (headerRow && headerRow.length >= 3) {
                    const col2 = (headerRow[2] || '').toString().toLowerCase();
                    const col3 = (headerRow[3] || '').toString().toLowerCase();
                    const col4 = (headerRow[4] || '').toString().toLowerCase();
                    
                    if (col2.includes('set') && col3.includes('reps') && col4.includes('weight')) {
                        // Column 2 is Set, Column 3 is Reps, Column 4 is Weight
                        // Need to check if Reps/Weight contain commas to distinguish newest vs previous
                        formatType = 'newest'; // Default to newest, will check data
                        console.log('Detected format with Set, Reps, Weight columns - will check data for comma-separated values');
                    } else if (col2.includes('weight') && !col2.includes('set')) {
                        // Column 2 is Weight - could be oldest format
                        if (col3.includes('sets')) {
                            formatType = 'oldest'; // Date, Exercise, Weight, Sets, Reps
                            console.log('Detected oldest format from header (Weight, Sets, Reps)');
                        } else {
                            formatType = 'oldest';
                            console.log('Detected oldest format from header');
                        }
                    } else {
                        // Try to infer from data
                        formatType = 'newest';
                        console.log('Could not determine format from header, will infer from data');
                    }
                }
            } catch (e) {
                console.log('Could not detect format from header, will try to infer from data:', e);
            }
            
            // If header detection found Set/Reps/Weight format, check data to distinguish newest vs previous
            if (formatType === 'newest' && rows.length > 0) {
                // Look at first few data rows to determine format
                let newestFormatCount = 0; // Set is count, Reps/Weight are comma-separated
                let previousFormatCount = 0; // Set is set number (1,2,3...), Reps/Weight are single values
                let oldestFormatCount = 0; // Weight, Sets, Reps
                
                for (let i = 0; i < Math.min(5, rows.length); i++) {
                    const row = rows[i];
                    if (!row || row.length < 4 || (row[0] && row[0].toLowerCase() === 'date')) {
                        continue; // Skip header or invalid rows
                    }
                    
                    const col2 = (row[2] || '').toString(); // Set
                    const col3 = (row[3] || '').toString(); // Reps
                    const col4 = (row[4] || '').toString(); // Weight
                    
                    // Check if Reps or Weight contain commas (newest format)
                    if (col3.includes(',') || col4.includes(',')) {
                        newestFormatCount++; // Comma-separated format
                    } else if (col2 && !isNaN(parseFloat(col2)) && parseFloat(col2) >= 1 && parseFloat(col2) <= 20) {
                        // Column 2 (Set) is a number 1-20, and Reps/Weight don't have commas
                        // This could be previous format (one row per set) or newest with single set
                        // Check if Set number is sequential across rows for same exercise
                        previousFormatCount++; // Likely one row per set format
                    } else if (col2 && !isNaN(parseFloat(col2)) && parseFloat(col2) > 5) {
                        // Column 2 is a weight (> 5) - oldest format
                        oldestFormatCount++;
                    }
                }
                
                if (newestFormatCount > previousFormatCount && newestFormatCount > oldestFormatCount) {
                    formatType = 'newest';
                    console.log(`Inferred newest format from data (Set is count, Reps/Weight are comma-separated)`);
                } else if (previousFormatCount > oldestFormatCount) {
                    formatType = 'previous';
                    console.log(`Inferred previous format from data (one row per set, Set is set number)`);
                } else {
                    formatType = 'oldest';
                    console.log(`Inferred oldest format from data (Weight, Sets, Reps)`);
                }
            }
            
            const newSessions = {};
            // Group exercises by date and name to combine sets
            const exerciseGroups = {};

            rows.forEach((row, index) => {
                // Skip empty rows
                if (!row || row.length === 0) {
                    return;
                }
                
                // Skip header row if it somehow got included
                if (index === 0 && row[0] && row[0].toLowerCase() === 'date') {
                    return;
                }
                
                if (row.length >= 4) {
                    const date = row[0]?.trim();
                    const exerciseName = row[1]?.trim();
                    
                    // Skip rows with empty date or exercise name
                    if (!date || !exerciseName) {
                        return;
                    }
                    
                    let setNum, reps, weight, difficulty, notes;
                    
                    if (formatType === 'newest') {
                        // Newest format: Date, Exercise, Set, Reps, Weight (kg), Difficulty, Notes
                        // Set is the number of sets, Reps and Weight are comma-separated (e.g., "8,8" and "65,65")
                        const setCount = parseInt(row[2]) || 0; // Number of sets
                        const repsStr = (row[3] || '').toString().trim(); // Column D: Reps
                        const weightsStr = (row[4] || '').toString().trim(); // Column E: Weight (kg)
                        difficulty = this.parseDifficulty(row[5] || 'medium');
                        notes = (row[6] || '').trim();
                        
                        // Debug logging
                        console.log('Parsing newest format:', {
                            exercise: exerciseName,
                            setCount: setCount,
                            repsStr: repsStr,
                            weightsStr: weightsStr,
                            row: row
                        });
                        
                        // Parse comma-separated values
                        const repsArray = repsStr.split(',').map(r => parseInt(r.trim()) || 0);
                        const weightsArray = weightsStr.split(',').map(w => parseFloat(w.trim()) || 0);
                        
                        console.log('Parsed arrays:', {
                            repsArray: repsArray,
                            weightsArray: weightsArray
                        });
                        
                        // Create a key for grouping exercises
                        const key = `${date}|${exerciseName}`;
                        
                        if (!exerciseGroups[key]) {
                            exerciseGroups[key] = {
                                date: date,
                                name: exerciseName,
                                sets: [],
                                reps: [],
                                weights: [],
                                difficulty: difficulty,
                                notes: notes,
                                timestamp: new Date().toISOString()
                            };
                        }
                        
                        // Add all sets from comma-separated values
                        // Use the actual number from the arrays, but validate against setCount
                        const numSets = Math.max(weightsArray.length, repsArray.length, setCount);
                        for (let i = 0; i < numSets; i++) {
                            exerciseGroups[key].sets.push(i + 1);
                            exerciseGroups[key].reps.push(repsArray[i] || 0);
                            exerciseGroups[key].weights.push(weightsArray[i] || 0);
                        }
                        
                        console.log('After adding sets:', {
                            sets: exerciseGroups[key].sets,
                            reps: exerciseGroups[key].reps,
                            weights: exerciseGroups[key].weights
                        });
                    } else if (formatType === 'oldest') {
                        // Oldest format: Date, Exercise, Weight, Sets, Reps, Difficulty, Notes
                        weight = parseFloat(row[2]) || 0;
                        const sets = parseInt(row[3]) || 1;
                        const repsStr = row[4] ? row[4].toString() : '';
                        let repsArray = repsStr.split('+').map(r => parseInt(r.trim()) || 0).filter(r => r > 0);
                        
                        // If repsArray has fewer values than sets, repeat the last rep value
                        // This handles cases where old format had "5" for 2 sets (should be "5+5")
                        if (repsArray.length > 0 && repsArray.length < sets) {
                            const lastRep = repsArray[repsArray.length - 1];
                            while (repsArray.length < sets) {
                                repsArray.push(lastRep);
                            }
                        }
                        // If no reps found but sets > 0, create empty reps
                        if (repsArray.length === 0 && sets > 0) {
                            repsArray = Array(sets).fill(0);
                        }
                        
                        difficulty = this.parseDifficulty(row[5] || 'medium');
                        notes = (row[6] || '').trim();
                        
                        // Create a key for grouping exercises
                        const key = `${date}|${exerciseName}`;
                        
                        if (!exerciseGroups[key]) {
                            exerciseGroups[key] = {
                                date: date,
                                name: exerciseName,
                                sets: [],
                                reps: [],
                                weights: [],
                                difficulty: difficulty,
                                notes: notes,
                                timestamp: new Date().toISOString()
                            };
                        }
                        
                        // Add each set's data (old format had all sets in one row)
                        // Use the actual number of sets from the data, not repsArray length
                        const numSetsToAdd = Math.max(sets, repsArray.length);
                        for (let i = 0; i < numSetsToAdd; i++) {
                            exerciseGroups[key].sets.push(i + 1);
                            exerciseGroups[key].reps.push(repsArray[i] || 0);
                            exerciseGroups[key].weights.push(weight); // Same weight for all sets in old format
                        }
                    } else {
                        // Previous format: Date, Exercise, Set, Reps, Weight (kg), Difficulty, Notes (one row per set)
                        setNum = parseInt(row[2]) || 1;
                        reps = parseInt(row[3]) || 0;
                        weight = parseFloat(row[4]) || 0;
                        difficulty = this.parseDifficulty(row[5] || 'medium');
                        notes = (row[6] || '').trim();
                        
                        // Validate set number (should be 1-20, if not, something is wrong)
                        if (setNum < 1 || setNum > 20) {
                            console.warn('Invalid set number detected:', setNum, 'for row:', row);
                            // Skip this row
                            return;
                        }
                        
                        // Create a key for grouping exercises (same exercise on same date)
                        const key = `${date}|${exerciseName}`;
                        
                        if (!exerciseGroups[key]) {
                            exerciseGroups[key] = {
                                date: date,
                                name: exerciseName,
                                sets: [],
                                reps: [],
                                weights: [],
                                difficulty: difficulty,
                                notes: notes,
                                timestamp: new Date().toISOString()
                            };
                        }
                        
                        // Check if this set number already exists (shouldn't happen, but handle it)
                        const existingSetIndex = exerciseGroups[key].sets.indexOf(setNum);
                        if (existingSetIndex >= 0) {
                            // Set number already exists, update it instead of adding duplicate
                            exerciseGroups[key].reps[existingSetIndex] = reps;
                            exerciseGroups[key].weights[existingSetIndex] = weight;
                        } else {
                            // Add this set's data
                            exerciseGroups[key].sets.push(setNum);
                            exerciseGroups[key].reps.push(reps);
                            exerciseGroups[key].weights.push(weight);
                        }
                        
                        // Keep the first set's notes
                        if (notes && !exerciseGroups[key].notes) {
                            exerciseGroups[key].notes = notes;
                        }
                    }
                }
            });

            // Convert grouped exercises to session format
            Object.values(exerciseGroups).forEach(ex => {
                if (!newSessions[ex.date]) {
                    newSessions[ex.date] = { date: ex.date, exercises: [] };
                }
                
                // Ensure sets, reps, and weights arrays are aligned and valid
                let numSets = Math.max(
                    ex.sets?.length || 0,
                    ex.reps?.length || 0,
                    ex.weights?.length || 0
                );
                
                // Sort sets by set number and align reps/weights accordingly
                if (ex.sets && ex.sets.length > 0 && ex.reps && ex.reps.length > 0) {
                    // Create indexed pairs and sort by set number
                    const pairs = ex.sets.map((setNum, idx) => ({
                        set: setNum,
                        rep: ex.reps[idx] || 0,
                        weight: ex.weights?.[idx] || 0
                    })).sort((a, b) => a.set - b.set);
                    
                    // Rebuild arrays in order
                    ex.sets = pairs.map(p => p.set);
                    ex.reps = pairs.map(p => p.rep);
                    ex.weights = pairs.map(p => p.weight);
                }
                
                // Use the actual array lengths as the source of truth
                // After sorting, all arrays should be the same length
                const actualNumSets = Math.max(
                    ex.reps?.length || 0,
                    ex.weights?.length || 0,
                    ex.sets?.length || 0
                );
                
                // Final validation - ensure numSets is reasonable
                if (actualNumSets > 20) {
                    console.warn('Suspicious numSets:', actualNumSets, 'for exercise:', ex.name);
                    console.warn('  sets array length:', ex.sets?.length);
                    console.warn('  reps array length:', ex.reps?.length);
                    console.warn('  weights array length:', ex.weights?.length);
                    console.warn('  sets array:', ex.sets);
                    console.warn('  reps array:', ex.reps);
                    console.warn('  weights array:', ex.weights);
                    // Cap at 20
                    numSets = Math.min(actualNumSets, 20);
                    console.warn('  Capped numSets to:', numSets);
                } else {
                    numSets = actualNumSets;
                }
                
                const exercise = {
                    name: ex.name,
                    weights: (ex.weights || []).slice(0, numSets), // Trim to actual number of sets
                    sets: numSets, // Use the actual count
                    reps: (ex.reps || []).slice(0, numSets), // Trim to actual number of sets
                    difficulty: ex.difficulty,
                    notes: ex.notes,
                    timestamp: ex.timestamp
                };
                
                console.log('Created exercise:', exercise.name, 'with', exercise.sets, 'sets');
                console.log('  reps:', exercise.reps);
                console.log('  weights:', exercise.weights);
                
                newSessions[ex.date].exercises.push(exercise);
            });

            // Google Sheets is source of truth - replace local data with sheet data
            const sessionArray = Object.values(newSessions);
            console.log('Sync from sheet: Parsed', sessionArray.length, 'sessions from', rows.length, 'rows');
            
            // Check if we got rows but couldn't parse any sessions
            if (sessionArray.length === 0 && rows.length > 0) {
                console.warn('No sessions created from rows. First few rows:', rows.slice(0, 3));
                // Analyze why parsing failed
                const sampleRow = rows[0];
                let errorDetails = 'Data found in sheet but could not be parsed.\n\n';
                errorDetails += `Found ${rows.length} row(s) but 0 sessions created.\n\n`;
                errorDetails += 'Expected format:\n';
                errorDetails += 'Column A: Date (YYYY-MM-DD)\n';
                errorDetails += 'Column B: Exercise Name\n';
                errorDetails += 'Column C: Set (number of sets)\n';
                errorDetails += 'Column D: Reps - comma-separated values (e.g., "8,8")\n';
                errorDetails += 'Column E: Weight (kg) - comma-separated values (e.g., "65,65")\n';
                errorDetails += 'Column F: Difficulty\n';
                errorDetails += 'Column G: Notes (optional)\n\n';
                if (sampleRow) {
                    errorDetails += `First row has ${sampleRow.length} column(s).\n`;
                    errorDetails += `First row data: ${JSON.stringify(sampleRow.slice(0, 7))}`;
                }
                alert(errorDetails);
                this.updateSyncStatus();
                return;
            }
            
            this.sessions = sessionArray;
            console.log('Sync from sheet: Set sessions array. Length:', this.sessions.length);
            if (this.sessions.length > 0) {
                console.log('Sample session:', this.sessions[0]);
            }
            // Don't save sessions back during syncFromSheet - we're just reading from the sheet
            // this.saveSessions(); // Removed - syncFromSheet is read-only
            this.currentSession = this.getTodaySession();
            
            // Also load exercise list from Google Sheets
            const sheetExercises = await this.loadExerciseListFromSheet();
            console.log('Sync from sheet: Loaded', sheetExercises?.length || 0, 'exercises from Exercises tab');
            if (sheetExercises && sheetExercises.length > 0) {
                this.exerciseList = sheetExercises;
                // Don't save back - we're just reading from the sheet
            } else {
                console.warn('No exercises found in Exercises tab, will extract from sessions');
                // If Exercises tab is empty, clear the exercise list
                this.exerciseList = [];
            }
            
            // Always update exercise list (it will merge with exercises from sessions)
            // Skip save during syncFromSheet to avoid modifying the sheet when just reading
            this.updateExerciseList(true); // true = skip save, we're just reading
            console.log('Exercise list updated in dropdown. Final count:', this.exerciseList.length);
            
            // Force re-render everything
            this.renderTodayWorkout();
            this.renderHistory();
            this.updateSyncStatus();
            
            // If user is on history tab, make sure it's visible
            const historyTab = document.getElementById('history-tab');
            if (historyTab && historyTab.classList.contains('active')) {
                // Force a re-render of history
                setTimeout(() => {
                    this.renderHistory();
                }, 100);
            }
            
            // Show success message with data counts
            const sessionCount = this.sessions.length;
            const exerciseCount = this.exerciseList.length;
            
            // Only show success if we actually loaded data
            if (sessionCount > 0 || exerciseCount > 0) {
                // No alert - user will see exercises populate in the list
            } else {
                // This shouldn't happen if the earlier check worked, but just in case
                alert('Sync completed, but no data was found in the sheet.\n\nPlease verify:\n1. The sheet has data in the correct format\n2. The sheet exists and is accessible\n3. You have access to the sheet');
            }
        } catch (error) {
            console.error('Sync error:', error);
            // Better error message handling
            let errorMessage = 'Unknown error';
            if (error && typeof error === 'object') {
                errorMessage = error.message || error.error?.message || error.statusText || JSON.stringify(error);
            } else if (error) {
                errorMessage = String(error);
            }
            
            // Check for common errors and provide helpful guidance
            if (errorMessage.includes('403') || errorMessage.includes('permission')) {
                const shouldRetry = confirm(
                    'Permission denied. This usually means:\n\n' +
                    '• Your session expired\n' +
                    '• The sheet needs to be shared with your Google account\n\n' +
                    'Would you like to sign out and sign in again to refresh permissions?\n\n' +
                    'Click OK to sign out, or Cancel to try manually.'
                );
                
                if (shouldRetry) {
                    // Sign out and prompt to sign in again
                    this.signOut();
                    setTimeout(() => {
                        alert('Please sign in again to refresh your permissions.');
                        this.requestAccessToken();
                    }, 500);
                    return;
                } else {
                    errorMessage = 'Permission denied. Please:\n\n' +
                        '1. Sign out and sign in again\n' +
                        '2. Make sure the Google Sheet is shared with your account\n' +
                        '3. Try connecting to the sheet again';
                }
            } else if (errorMessage.includes('404') || errorMessage.includes('not found')) {
                errorMessage = 'Sheet not found. Please check that the Sheet ID is correct.';
            } else if (errorMessage.includes('401') || errorMessage.includes('unauthorized')) {
                const shouldRetry = confirm(
                    'Authentication failed. Your session may have expired.\n\n' +
                    'Would you like to sign out and sign in again?'
                );
                
                if (shouldRetry) {
                    this.signOut();
                    setTimeout(() => {
                        this.requestAccessToken();
                    }, 500);
                    return;
                } else {
                    errorMessage = 'Authentication failed. Please sign out and sign in again.';
                }
            }
            
            console.error('Full sync error details:', error);
            alert('Error syncing from Google Sheets: ' + errorMessage);
            this.updateSyncStatus();
        }
    }

    parseDifficulty(difficulty) {
        const lower = difficulty.toLowerCase();
        if (lower.includes('very easy')) return 'very-easy';
        if (lower.includes('easy')) return 'easy';
        if (lower.includes('medium')) return 'medium';
        if (lower.includes('hard') && !lower.includes('very')) return 'hard';
        if (lower.includes('very hard')) return 'very-hard';
        return 'medium';
    }

    // Removed - all data is cloud-based
    _removed_exportData() {
        const dataStr = JSON.stringify(this.sessions, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `workout-data-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        URL.revokeObjectURL(url);
    }

    // Removed - all data is cloud-based
    _removed_importData(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                if (Array.isArray(imported)) {
                    this.sessions = imported;
                    this.saveSessions();
                    this.currentSession = this.getTodaySession();
                    this.renderTodayWorkout();
                    this.renderHistory();
                    alert('Data imported successfully!');
                } else {
                    alert('Invalid file format');
                }
            } catch (error) {
                alert('Error importing file: ' + error.message);
            }
        };
        reader.readAsText(file);
    }

    // Removed - all data is cloud-based
    _removed_clearLocalData() {
        // No local data to clear
    }

    updateSyncStatus() {
        const indicator = document.getElementById('sync-indicator');
        const text = document.getElementById('sync-text');
        
        if (this.isSignedIn && this.sheetId) {
            if (indicator) indicator.textContent = '🟢';
            if (text) text.textContent = 'Connected';
        } else if (this.isSignedIn) {
            if (indicator) indicator.textContent = '🟡';
            if (text) text.textContent = 'Signed In';
        } else {
            if (indicator) indicator.textContent = '⚪';
            if (text) text.textContent = 'Not Connected';
        }
    }
    
    async clearExercisesTab() {
        // Clear the Exercises tab in the Google Sheet
        if (!this.isSignedIn || !this.sheetId) return;
        
        try {
            await this.initGoogleSheets();
            if (gapi.client) {
                gapi.client.setToken({ access_token: this.googleToken });
            }
            
            let exercisesTabName = 'Exercises';
            try {
                exercisesTabName = await this.getExercisesTabName();
            } catch (e) {
                // Tab might not exist, that's okay
                return;
            }
            
            const escapedTabName = this.escapeSheetTabName(exercisesTabName);
            // Clear all data except header
            await gapi.client.sheets.spreadsheets.values.clear({
                spreadsheetId: this.sheetId,
                range: `${escapedTabName}!A2:A1000`
            });
            console.log('Cleared Exercises tab');
        } catch (error) {
            console.error('Error clearing Exercises tab:', error);
            // Don't throw - this is not critical
        }
    }
    
    async refreshDataFromSheet() {
        if (!this.isSignedIn) {
            alert('Please sign in first');
            return;
        }
        
        // Confirm with user
        const confirmed = confirm(
            'This will delete all local data and reload everything from your Google Sheet.\n\n' +
            'Any unsaved changes will be lost. Continue?'
        );
        
        if (!confirmed) {
            return;
        }
        
        try {
            // Update status to show refreshing FIRST
            const indicator = document.getElementById('sync-indicator');
            const text = document.getElementById('sync-text');
            if (indicator) indicator.textContent = '🔄';
            if (text) text.textContent = 'Refreshing...';
            
            // Clear all local data in memory FIRST
            this.sessions = [];
            this.exerciseList = [];
            this.currentSession = { date: new Date().toISOString().split('T')[0], exercises: [] };
            
            // Clear the exercise dropdown completely
            const exerciseSelect = document.getElementById('exercise-name');
            if (exerciseSelect) {
                exerciseSelect.innerHTML = '<option value="">Select or type to add new...</option>';
            }
            
            // Clear UI immediately
            this.renderTodayWorkout();
            this.renderHistory();
            
            // Check if sheet still exists, if not, clear sheet ID and let user reconnect
            if (this.sheetId) {
                try {
                    await this.initGoogleSheets();
                    if (gapi.client) {
                        gapi.client.setToken({ access_token: this.googleToken });
                    }
                    // Try to access the sheet to see if it exists
                    const sheetInfo = await gapi.client.sheets.spreadsheets.get({
                        spreadsheetId: this.sheetId
                    });
                    
                    const sheetTitle = sheetInfo.result?.properties?.title || '';
                    console.log('Current sheet:', sheetTitle);
                    
                    // Check if sheet name contains ".old" - offer to create new one
                    if (sheetTitle.toLowerCase().includes('.old') || sheetTitle.toLowerCase().includes('old')) {
                        const createNew = confirm(
                            `You're currently connected to: "${sheetTitle}"\n\n` +
                            `Would you like to disconnect and create a fresh new sheet?\n\n` +
                            `Click OK to create a new sheet, or Cancel to keep using the current one.`
                        );
                        
                        if (createNew) {
                            // Clear the old sheet ID
                            const oldSheetId = this.sheetId;
                            if (this.userEmail) {
                                this.saveSheetIdForUser(this.userEmail, null);
                            }
                            localStorage.removeItem('sheetId');
                            this.sheetId = null;
                            
                            // Create new sheet
                            if (this.userEmail) {
                                await this.autoConnectSheet(this.userEmail);
                                if (this.sheetId) {
                                    // New sheet created, sync from it
                                    await this.syncFromSheet();
                                    this.updateSyncStatus();
                                    this.updateHeaderButtons();
                                    alert('Disconnected from old sheet. A new sheet has been created and connected!');
                                    return;
                                }
                            }
                        }
                    }
                    
                    // Sheet exists, clear Exercises tab first, then sync from it
                    await this.clearExercisesTab();
                    await this.syncFromSheet();
                } catch (error) {
                    // Sheet doesn't exist or is inaccessible
                    console.log('Sheet not found or inaccessible:', error);
                    const oldSheetId = this.sheetId;
                    
                    // Clear the sheet ID from localStorage
                    if (this.userEmail) {
                        this.saveSheetIdForUser(this.userEmail, null);
                    }
                    localStorage.removeItem('sheetId');
                    this.sheetId = null; // Clear from memory too
                    
                    console.log('Cleared old sheet ID:', oldSheetId);
                    
                    // Ensure everything is cleared
                    this.sessions = [];
                    this.exerciseList = [];
                    this.currentSession = { date: new Date().toISOString().split('T')[0], exercises: [] };
                    this.renderTodayWorkout();
                    this.renderHistory();
                    this.updateExerciseList(); // Update with empty list
                    
                    // Try to auto-connect to create a new sheet
                    if (this.userEmail) {
                        await this.autoConnectSheet(this.userEmail);
                        if (this.sheetId) {
                            // New sheet created, sync from it
                            await this.syncFromSheet();
                            this.updateSyncStatus();
                            this.updateHeaderButtons(); // Ensure session button is visible
                            alert('Old sheet was deleted. A new sheet has been created and connected!');
                            return;
                        }
                    }
                    
                    alert('The Google Sheet was not found or is no longer accessible.\n\n' +
                          'Please reconnect to a sheet. A new sheet will be created automatically if needed.');
                    this.updateSyncStatus();
                    this.updateHeaderButtons(); // Ensure session button is visible if signed in
                    return;
                }
            } else {
                // No sheet ID, try to auto-connect
                if (this.userEmail) {
                    await this.autoConnectSheet(this.userEmail);
                    if (this.sheetId) {
                        await this.clearExercisesTab();
                        await this.syncFromSheet();
                    } else {
                        // No sheet found, ensure everything is cleared
                        this.sessions = [];
                        this.exerciseList = [];
                        this.currentSession = { date: new Date().toISOString().split('T')[0], exercises: [] };
                        this.renderTodayWorkout();
                        this.renderHistory();
                        this.updateExerciseList(); // Update with empty list
                    }
                }
            }
            
            // syncFromSheet already updates sessions, exerciseList, and UI
            // But make sure exercise list is updated one more time to reflect current state
            this.updateExerciseList();
            
            // Update sync status and header buttons (to ensure session button is visible)
            this.updateSyncStatus();
            this.updateHeaderButtons();
            
            alert('Data refreshed successfully from Google Sheet!');
        } catch (error) {
            console.error('Error refreshing data:', error);
            // On error, ensure everything is cleared
            this.sessions = [];
            this.exerciseList = [];
            this.currentSession = { date: new Date().toISOString().split('T')[0], exercises: [] };
            this.renderTodayWorkout();
            this.renderHistory();
            this.updateExerciseList();
            alert('Error refreshing data: ' + (error.message || 'Unknown error'));
            this.updateSyncStatus();
            this.updateHeaderButtons(); // Ensure session button is visible if signed in
        }
    }

    saveSessions() {
        // All data is cloud-based - no local storage
        // Data is synced to Google Sheets automatically
    }

    async loadSessions() {
        // Google Sheets is the only source of truth - no local storage
        const sessionsSheetId = this.getSessionsSheetId();
        if (this.isSignedIn && sessionsSheetId) {
            try {
                await this.initGoogleSheets();
                const sheetSessions = await this.loadSessionsFromSheet();
                if (sheetSessions && sheetSessions.length > 0) {
                    return sheetSessions;
                }
                // If sheetSessions is null, it means the sheet was invalid and has been cleared
                // Return empty array
                return [];
            } catch (error) {
                console.warn('Error loading sessions from sheet:', error);
                // If sheet ID was cleared during validation, return empty
                if (!this.getSessionsSheetId()) {
                    return [];
                }
            }
        }
        
        // Return empty if not signed in or no sheet
        return [];
    }

    async loadSessionsFromSheet() {
        const sessionsSheetId = this.getSessionsSheetId();
        if (!this.isSignedIn || !sessionsSheetId) {
            console.log('Cannot load from sheet: isSignedIn=', this.isSignedIn, 'sessionsSheetId=', sessionsSheetId);
            return null;
        }

        try {
            await this.initGoogleSheets();
            
            // CRITICAL: Ensure token is set on gapi.client before making API calls
            // This is especially important on mobile browsers
            if (gapi.client) {
                gapi.client.setToken({ access_token: this.googleToken });
                console.log('Token explicitly set for loadSessionsFromSheet API call');
            } else {
                console.error('gapi.client not available in loadSessionsFromSheet');
                return null;
            }
            
            // First, validate that the sheet exists
            try {
                const sheetInfo = await gapi.client.sheets.spreadsheets.get({
                    spreadsheetId: sessionsSheetId
                });
                const sheetTitle = sheetInfo.result?.properties?.title || '';
                console.log('Sheet validation passed:', sessionsSheetId, 'Title:', sheetTitle);
                
                // Check if sheet name contains ".old" - user might want to start fresh
                if (sheetTitle.toLowerCase().includes('.old') || sheetTitle.toLowerCase().includes('old')) {
                    console.warn('Detected old sheet name, prompting user to create new sheet');
                    const createNew = confirm(
                        `You're connected to an old sheet: "${sheetTitle}"\n\n` +
                        `Would you like to create a fresh new sheet instead?\n\n` +
                        `Click OK to create a new sheet, or Cancel to keep using the old one.`
                    );
                    
                    if (createNew) {
                        // Clear the old sheet ID
                        const oldSheetId = sessionsSheetId;
                        if (this.userEmail) {
                            this.saveSessionsSheetIdForUser(this.userEmail, null);
                        }
                        localStorage.removeItem('sessionsSheetId');
                        this.sessionsSheetId = null;
                        
                        // Clear all data
                        this.sessions = [];
                        this.exerciseList = [];
                        this.currentSession = { date: new Date().toISOString().split('T')[0], exercises: [] };
                        
                        // Create new sheet
                        if (this.userEmail) {
                            await this.autoConnectSheet(this.userEmail);
                            const newSessionsSheetId = this.getSessionsSheetId();
                            if (newSessionsSheetId) {
                                console.log('Created new sheet:', newSessionsSheetId);
                                // Return null so it will load from the new sheet
                                return null;
                            }
                        }
                    }
                }
            } catch (error) {
                // Sheet doesn't exist or is inaccessible
                const errorCode = error.result?.error?.code;
                const errorMessage = error.result?.error?.message || error.message;
                console.warn('Sheet validation failed:', {
                    sheetId: sessionsSheetId,
                    errorCode: errorCode,
                    errorMessage: errorMessage,
                    fullError: error
                });
                
                // Check if it's a 404 (not found) or 403 (permission denied) or 400 (bad request)
                if (errorCode === 404 || errorCode === 403 || errorCode === 400 || 
                    errorMessage?.includes('not found') || 
                    errorMessage?.includes('permission') ||
                    errorMessage?.includes('Unable to parse range')) {
                    
                    const oldSheetId = sessionsSheetId;
                    console.warn('Sheet is invalid (404/403/400), clearing sheet ID:', oldSheetId);
                    
                    // Clear the sheet ID from localStorage
                    if (this.userEmail) {
                        this.saveSessionsSheetIdForUser(this.userEmail, null);
                    }
                    localStorage.removeItem('sessionsSheetId');
                    
                    // Clear from memory
                    this.sessionsSheetId = null;
                    
                    // Clear all data since sheet is invalid
                    this.sessions = [];
                    this.exerciseList = [];
                    this.currentSession = { date: new Date().toISOString().split('T')[0], exercises: [] };
                    
                    console.log('Cleared invalid sheet ID and data. Old sheet ID was:', oldSheetId);
                    return null;
                } else {
                    // Other error - might be temporary, log but don't clear
                    console.warn('Sheet access error (might be temporary):', error);
                    throw error; // Re-throw to be handled by outer catch
                }
            }
            
            console.log('Loading sessions from sheet:', sessionsSheetId);
            // Get the actual sheet tab name
            const sheetTabName = await this.getSheetTabName();
            const escapedTabName = this.escapeSheetTabName(sheetTabName);
            
            const response = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: sessionsSheetId,
                range: `${escapedTabName}!A2:G10000` // Increased range for more data
            });

            const rows = response.result.values || [];
            console.log('Rows loaded from sheet:', rows.length);
            
            const sessions = {};

            rows.forEach((row, index) => {
                // Debug first few rows
                if (index < 3) {
                    console.log(`Row ${index}:`, row);
                }
                
                // Skip empty rows
                if (!row || row.length === 0) {
                    return;
                }
                
                // Skip header row if it somehow got included
                if (index === 0 && row[0] && row[0].toLowerCase() === 'date') {
                    return;
                }
                
                if (row.length >= 5) {
                    const date = row[0]?.trim();
                    const exerciseName = row[1]?.trim();
                    
                    // Skip rows with empty date or exercise name
                    if (!date || !exerciseName) {
                        return;
                    }
                    
                    // New format: Date, Exercise, Set, Reps, Weight (kg), Difficulty, Notes
                    // Set is the number of sets, Reps and Weight are comma-separated
                    const setCount = parseInt(row[2]) || 0;
                    const repsStr = (row[3] || '').toString().trim();
                    const weightsStr = (row[4] || '').toString().trim();
                    const difficulty = this.parseDifficulty(row[5] || 'medium');
                    const notes = (row[6] || '').trim();
                    
                    // Parse comma-separated values
                    const repsArray = repsStr.split(',').map(r => parseInt(r.trim()) || 0);
                    const weightsArray = weightsStr.split(',').map(w => parseFloat(w.trim()) || 0);
                    
                    const exercise = {
                        name: exerciseName,
                        sets: Math.max(repsArray.length, weightsArray.length, setCount),
                        reps: repsArray,
                        weights: weightsArray,
                        difficulty: difficulty,
                        notes: notes,
                        timestamp: new Date().toISOString()
                    };

                    if (!sessions[date]) {
                        sessions[date] = { date, exercises: [] };
                    }
                    sessions[date].exercises.push(exercise);
                } else {
                    console.warn(`Row ${index} has insufficient columns (${row.length}):`, row);
                }
            });

            const sessionArray = Object.values(sessions);
            console.log('Sessions loaded from sheet:', sessionArray.length);
            if (sessionArray.length > 0) {
                console.log('Sample session:', sessionArray[0]);
            }
            return sessionArray;
        } catch (error) {
            console.error('Error loading sessions from sheet:', error);
            return null;
        }
    }

    async handleSessionButton() {
        if (this.sessionActive) {
            await this.endSession();
        } else {
            await this.startSession();
        }
    }

    async startSession() {
        const sessionBtn = document.getElementById('session-btn');
        if (!sessionBtn) return;

        try {
            // Disable button during process
            sessionBtn.disabled = true;
            sessionBtn.textContent = 'Connecting...';

            // Step 1: Ensure user is logged in to Google
            if (!this.isSignedIn || !this.googleToken) {
                // Check if token exists but might be expired
                const tokenExpiry = localStorage.getItem('googleTokenExpiry');
                if (tokenExpiry && new Date() >= new Date(tokenExpiry)) {
                    // Token expired, need to re-authenticate
                    sessionBtn.disabled = false;
                    this.updateSessionButton();
                    alert('Your Google session has expired. Please sign in again in Settings.');
                    return;
                }

                // Not signed in, request access token using promise wrapper
                sessionBtn.textContent = 'Signing in...';
                const signedIn = await this.requestAccessTokenPromise();
                
                if (!signedIn) {
                    sessionBtn.disabled = false;
                    this.updateSessionButton();
                    // User cancelled or error occurred
                    return;
                }
                
                // Wait a bit for the sign-in process to complete
                await new Promise(resolve => setTimeout(resolve, 1500));
                
                // Check again if we're signed in
                if (!this.isSignedIn || !this.googleToken) {
                sessionBtn.disabled = false;
                this.updateSessionButton();
                alert('Sign-in incomplete. Please try again.');
                    return;
                }
            }

            // Step 2: Ensure Google Sheets is initialized
            sessionBtn.textContent = 'Initializing...';
            await this.initGoogleSheets();

            // Step 3: Ensure sheet is connected
            if (!this.sheetId) {
                sessionBtn.textContent = 'Connecting to sheet...';
                // Try to auto-connect
                if (this.userEmail) {
                    await this.autoConnectSheet(this.userEmail);
                }
                
                if (!this.sheetId) {
                sessionBtn.disabled = false;
                this.updateSessionButton();
                alert('Please connect to a Google Sheet first. You can do this in the Settings tab.');
                    return;
                }
            }

            // Step 4: Sync from Google Sheets (load exercises, sessions, last done dates)
            sessionBtn.textContent = 'Syncing from Google...';
            
            // Sync sessions and exercises from sheet
            await this.syncFromSheet();
            
            // Reload exercise list from sheet to repopulate all exercises
            this.exerciseList = await this.loadExerciseList();
            
            // Reload current session (today's session)
            this.currentSession = this.getTodaySession();
            
            // Plan rotation: if plans exist, rotate to next plan
            if (this.workoutPlans.length > 0) {
                const nextPlan = this.getNextPlan();
                if (nextPlan) {
                    this.activatePlan(nextPlan.id);
                    this.currentSession.currentPlanId = nextPlan.id;
                }
            }
            
            // Update UI
            this.renderTodayWorkout();
            this.renderHistory();
            this.updateExerciseList();

            // Automatically select the first exercise
            this.selectFirstExercise();

            // Step 5: Mark session as active and update button
            this.sessionActive = true;
            sessionBtn.disabled = false;
            this.updateSessionButton();
            
            // Update sync status
            this.updateSyncStatus();
            
            console.log('Session started successfully');
        } catch (error) {
            console.error('Error starting session:', error);
            sessionBtn.disabled = false;
            this.updateSessionButton();
            alert('Error starting session: ' + (error.message || 'Unknown error'));
        }
    }

    async endSession() {
        const sessionBtn = document.getElementById('session-btn');
        if (!sessionBtn) return;

        try {
            // Disable button during sync
            sessionBtn.disabled = true;
            sessionBtn.textContent = 'Syncing to Google...';

            // Ensure we're still signed in
            if (!this.isSignedIn || !this.googleToken || !this.sheetId) {
                sessionBtn.disabled = false;
                this.updateSessionButton();
                alert('Not connected to Google. Session ended locally.');
                this.sessionActive = false;
                this.updateSessionButton();
                return;
            }

            // Sync back to Google Sheets
            await this.initGoogleSheets();
            await this.syncToSheet(true); // Silent sync (no alert)

            // Reload exercise list from sheet to repopulate all exercises
            this.exerciseList = await this.loadExerciseList();
            this.updateExerciseList();

            // Mark session as inactive and update button
            this.sessionActive = false;
            sessionBtn.disabled = false;
            this.updateSessionButton();
            
            // Update sync status
            this.updateSyncStatus();
            
            console.log('Session ended successfully');
        } catch (error) {
            console.error('Error ending session:', error);
            sessionBtn.disabled = false;
            this.updateSessionButton();
            alert('Error syncing to Google: ' + (error.message || 'Unknown error') + '\n\nYour data is saved locally.');
        }
    }

    updateSessionButton() {
        const sessionBtn = document.getElementById('session-btn');
        if (!sessionBtn) return;

        if (this.sessionActive) {
            sessionBtn.textContent = 'End Session';
            sessionBtn.style.background = 'rgba(244, 67, 54, 0.9)';
            sessionBtn.style.borderColor = 'rgba(244, 67, 54, 1)';
        } else {
            sessionBtn.textContent = 'New Session';
            sessionBtn.style.background = 'rgba(255, 255, 255, 0.2)';
            sessionBtn.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        }
        
        // Also update the start session button in track tab
        this.updateSessionButtonInTrackTab();
    }

    updateSessionButtonInTrackTab() {
        const startSessionBtn = document.getElementById('start-session-btn');
        if (!startSessionBtn) return;
        
        if (this.sessionActive) {
            startSessionBtn.textContent = 'End Session';
            startSessionBtn.style.background = 'rgba(244, 67, 54, 0.9)';
            startSessionBtn.style.borderColor = 'rgba(244, 67, 54, 1)';
        } else {
            startSessionBtn.textContent = 'Start Session';
            startSessionBtn.style.background = '';
            startSessionBtn.style.borderColor = '';
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    try {
        new WorkoutTracker();
    } catch (error) {
        console.error('Error initializing WorkoutTracker:', error);
        alert('Error loading app. Check console for details.');
    }
});

