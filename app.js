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
        this.exerciseList = []; // Will be loaded asynchronously
        this.userEmail = null; // Store user email for per-user sheet ID
        this.init();
    }

    async init() {
        this.setupEventListeners();
        
        // Load sessions (will try Google Sheets first if signed in)
        this.sessions = await this.loadSessions();
        this.currentSession = this.getTodaySession();
        
        // Load exercise list (will try Google Sheets if signed in)
        this.exerciseList = await this.loadExerciseList();
        this.updateExerciseList(); // This will populate the select dropdown
        this.updateRepsInputs();
        this.renderTodayWorkout();
        this.renderHistory();
        this.setupTabs(); // Setup tabs first so they work immediately
        this.updateSyncStatus();
        
        // Ensure reconnect button is visible if signed in
        const reconnectBtn = document.getElementById('reconnect-sheet-btn');
        if (reconnectBtn && this.isSignedIn) {
            reconnectBtn.style.display = 'block';
        }
        
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
        }

        // Create sign-in button
        const buttonContainer = document.getElementById('google-signin-button');
        if (buttonContainer) {
            buttonContainer.innerHTML = '';
            const signInBtn = document.createElement('button');
            signInBtn.className = 'btn-primary';
            signInBtn.textContent = '🔐 Sign in with Google';
            signInBtn.onclick = () => this.requestAccessToken();
            buttonContainer.appendChild(signInBtn);
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
                return this.googleConfig;
            }
        } catch (error) {
            console.error('Error loading config from API:', error);
        }

        return null;
    }

    async getClientId() {
        // Load config (from local or API)
        const config = await this.loadConfig();
        return config?.CLIENT_ID || null;
    }

    async getApiKey() {
        // Load config (from local or API)
        const config = await this.loadConfig();
        return config?.API_KEY || null;
    }

    async requestAccessToken() {
        // Request OAuth2 token with proper scopes
        const clientId = await this.getClientId();
        if (!clientId) {
            alert('Google OAuth Client ID not configured. Please check your settings.');
            return;
        }

        const scopes = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';
        
        // Use Google Identity Services token client
        const tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: scopes,
            callback: (tokenResponse) => {
                if (tokenResponse.access_token) {
                    this.googleToken = tokenResponse.access_token;
                    // Store token with expiry (subtract 5 minutes for safety)
                    const expiry = new Date(Date.now() + (tokenResponse.expires_in - 300) * 1000);
                    localStorage.setItem('googleAccessToken', this.googleToken);
                    localStorage.setItem('googleTokenExpiry', expiry.toISOString());
                    this.isSignedIn = true;
                    
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
                    
                    // Update button
                    const buttonContainer = document.getElementById('google-signin-button');
                    buttonContainer.innerHTML = '<p style="color: green;">✓ Signed in successfully!</p>';
                } else if (tokenResponse.error) {
                    alert('Sign-in error: ' + tokenResponse.error);
                }
            },
        });
        
        // Request token with consent to ensure we get all permissions
        tokenClient.requestAccessToken({ prompt: 'consent' });
    }

    async loadUserInfo() {
        if (!this.googleToken) return;
        try {
            const response = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${this.googleToken}`);
            if (response.ok) {
                const data = await response.json();
                if (data.name || data.email) {
                    document.getElementById('user-name').textContent = `Signed in as: ${data.name || data.email}`;
                    document.getElementById('user-info').style.display = 'block';
                    
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
        // Load Sheet ID for this user
        let userSheetId = this.getSheetIdForUser(userEmail);
        
        // Validate the stored sheet ID if it exists
        if (userSheetId) {
            try {
                await this.initGoogleSheets();
                
                // CRITICAL: Ensure token is set before API calls
                if (gapi.client) {
                    gapi.client.setToken({ access_token: this.googleToken });
                }
                
                // Test if the sheet is accessible
                await gapi.client.sheets.spreadsheets.get({
                    spreadsheetId: userSheetId
                });
                
                console.log('Stored sheet ID is valid:', userSheetId);
            } catch (error) {
                console.warn('Stored sheet ID is invalid or inaccessible:', error);
                
                // Invalid stored sheet ID - clear it and search by name instead
                console.warn('Stored sheet ID invalid, will search by name instead');
                this.saveSheetIdForUser(userEmail, null);
                localStorage.removeItem('sheetId');
                userSheetId = null; // Continue to search by name below
            }
        }
        
        // If no sheet ID exists, search for sheet by name
        if (!userSheetId) {
            try {
                const defaultSheetName = 'Workout Tracker';
                const matchingSheets = await this.findSheetByName(defaultSheetName);
                
                if (matchingSheets.length === 0) {
                    // No sheet found - ask user what to do
                    const userChoice = confirm(
                        `No '${defaultSheetName}' sheet found. Would you like to:\n\n` +
                        `Click OK to create a new sheet named '${defaultSheetName}'\n` +
                        `Click Cancel to enter a sheet name manually`
                    );
                    
                    if (userChoice) {
                        // User chose to create new sheet
                        try {
                            userSheetId = await this.createNewSheet(defaultSheetName);
                            if (userSheetId) {
                                this.saveSheetIdForUser(userEmail, userSheetId);
                                localStorage.setItem('sheetId', userSheetId);
                                
                                const sheetStatus = document.getElementById('sheet-status');
                                if (sheetStatus) {
                                    sheetStatus.innerHTML = `<p style="color: green;">✓ Created and connected to '${defaultSheetName}'</p>`;
                                }
                                
                                // Complete the connection process
                                await this.completeSheetConnection(userSheetId);
                            }
                        } catch (error) {
                            console.error('Error creating new sheet:', error);
                            const sheetStatus = document.getElementById('sheet-status');
                            if (sheetStatus) {
                                sheetStatus.innerHTML = '<p style="color: red;">Error creating sheet. Please try again.</p>';
                            }
                            return;
                        }
                    } else {
                        // User chose to enter name manually
                        const manualName = prompt('Enter the name of your workout sheet:');
                        if (manualName && manualName.trim()) {
                            const trimmedName = manualName.trim();
                            const manualSheets = await this.findSheetByName(trimmedName);
                            
                            if (manualSheets.length === 0) {
                                // Not found - create it
                                try {
                                    userSheetId = await this.createNewSheet(trimmedName);
                                    if (userSheetId) {
                                        this.saveSheetIdForUser(userEmail, userSheetId);
                                        localStorage.setItem('sheetId', userSheetId);
                                        
                                        const sheetStatus = document.getElementById('sheet-status');
                                        if (sheetStatus) {
                                            sheetStatus.innerHTML = `<p style="color: green;">✓ Created and connected to '${trimmedName}'</p>`;
                                        }
                                        
                                        // Complete the connection process
                                        await this.completeSheetConnection(userSheetId);
                                    }
                                } catch (error) {
                                    console.error('Error creating sheet:', error);
                                    const sheetStatus = document.getElementById('sheet-status');
                                    if (sheetStatus) {
                                        sheetStatus.innerHTML = '<p style="color: red;">Error creating sheet. Please try again.</p>';
                                    }
                                    return;
                                }
                            } else if (manualSheets.length === 1) {
                                // Found exactly one - use it
                                userSheetId = manualSheets[0].id;
                                this.saveSheetIdForUser(userEmail, userSheetId);
                                localStorage.setItem('sheetId', userSheetId);
                                
                                const sheetStatus = document.getElementById('sheet-status');
                                if (sheetStatus) {
                                    sheetStatus.innerHTML = `<p style="color: green;">✓ Connected to '${trimmedName}'</p>`;
                                }
                                
                                // Complete the connection process
                                await this.completeSheetConnection(userSheetId);
                            } else {
                                // Multiple matches - let user choose
                                await this.handleMultipleSheetMatches(manualSheets, userEmail);
                                return; // handleMultipleSheetMatches will handle connection
                            }
                        } else {
                            // User cancelled
                            const sheetStatus = document.getElementById('sheet-status');
                            if (sheetStatus) {
                                sheetStatus.innerHTML = '<p style="color: #666;">Please connect to a sheet to sync your data.</p>';
                            }
                            return;
                        }
                    }
                } else if (matchingSheets.length === 1) {
                    // Found exactly one - use it automatically
                    userSheetId = matchingSheets[0].id;
                    console.log('Auto-connecting to single sheet found:', userSheetId, 'Name:', matchingSheets[0].name);
                    this.saveSheetIdForUser(userEmail, userSheetId);
                    localStorage.setItem('sheetId', userSheetId);
                    
                    const sheetStatus = document.getElementById('sheet-status');
                    if (sheetStatus) {
                        sheetStatus.innerHTML = `<p style="color: green;">✓ Automatically connected to '${matchingSheets[0].name}'</p>`;
                    }
                    
                    // Complete the connection process
                    await this.completeSheetConnection(userSheetId);
                } else {
                    // Multiple matches - always let user choose to avoid connecting to wrong sheet
                    console.log(`Found ${matchingSheets.length} sheets with name "${defaultSheetName}", showing selection dialog`);
                    await this.handleMultipleSheetMatches(matchingSheets, userEmail);
                    return; // handleMultipleSheetMatches will handle connection
                }
            } catch (error) {
                console.error('Error searching for sheet:', error);
                const sheetStatus = document.getElementById('sheet-status');
                if (sheetStatus) {
                    let errorMsg = '⚠ Error searching for sheet. ';
                    
                    // Check for specific Drive API errors
                    const errorStr = error.message || error.result?.error?.message || JSON.stringify(error);
                    if (errorStr.includes('API discovery response missing') || errorStr.includes('discovery')) {
                        errorMsg += 'The Google Drive API may not be enabled in your Google Cloud Console.\n\n';
                        errorMsg += 'Please:\n';
                        errorMsg += '1. Go to Google Cloud Console → APIs & Services → Library\n';
                        errorMsg += '2. Search for "Google Drive API" and click Enable\n';
                        errorMsg += '3. Refresh this page and try again';
                    } else if (error.message) {
                        errorMsg += error.message;
                    } else if (error.result?.error) {
                        errorMsg += error.result.error.message || 'Please check your permissions.';
                    } else {
                        errorMsg += 'Please try clicking "Reconnect to Sheet" below.';
                    }
                    sheetStatus.innerHTML = `<p style="color: orange; white-space: pre-line;">${errorMsg}</p>`;
                }
                return;
            }
        }
        
        if (userSheetId) {
            // Automatically connect to the sheet
            await this.completeSheetConnection(userSheetId);
            
            // Update status if not already set
            const sheetStatus = document.getElementById('sheet-status');
            if (sheetStatus && !sheetStatus.innerHTML.includes('Connected') && !sheetStatus.innerHTML.includes('Created')) {
                sheetStatus.innerHTML = '<p style="color: green;">✓ Automatically connected to your sheet</p>';
            }
        }
    }

    async createNewSheet(sheetName = 'Workout Tracker') {
        try {
            await this.initGoogleSheets();
            
            // CRITICAL: Ensure token is set before creating sheet
            if (gapi.client) {
                gapi.client.setToken({ access_token: this.googleToken });
                console.log('Token set for createNewSheet');
            } else {
                throw new Error('gapi.client not available');
            }
            
            // Create a new spreadsheet with the provided name
            const response = await gapi.client.sheets.spreadsheets.create({
                properties: {
                    title: sheetName
                },
                sheets: [
                    {
                        properties: {
                            title: 'Sheet1',
                            gridProperties: {
                                rowCount: 1000,
                                columnCount: 7
                            }
                        }
                    },
                    {
                        properties: {
                            title: 'Exercises',
                            gridProperties: {
                                rowCount: 1000,
                                columnCount: 1
                            }
                        }
                    }
                ]
            });
            
            const spreadsheetId = response.result.spreadsheetId;
            
            // Ensure token is still set for update operations
            if (gapi.client) {
                gapi.client.setToken({ access_token: this.googleToken });
            }
            
            // Set up headers for Sheet1
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: spreadsheetId,
                range: 'Sheet1!A1:G1',
                valueInputOption: 'RAW',
                resource: {
                    values: [['Date', 'Exercise', 'Weight', 'Sets', 'Reps', 'Difficulty', 'Notes']]
                }
            });
            
            // Ensure token is still set for second update
            if (gapi.client) {
                gapi.client.setToken({ access_token: this.googleToken });
            }
            
            // Set up headers for Exercises sheet
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: spreadsheetId,
                range: 'Exercises!A1',
                valueInputOption: 'RAW',
                resource: {
                    values: [['Exercise Name']]
                }
            });
            
            return spreadsheetId;
        } catch (error) {
            console.error('Error creating new sheet:', error);
            throw error;
        }
    }

    signOut() {
        google.accounts.id.disableAutoSelect();
        if (this.googleToken) {
            google.accounts.oauth2.revoke(this.googleToken);
        }
        this.googleToken = null;
        this.isSignedIn = false;
        this.userEmail = null;
        localStorage.removeItem('googleAccessToken');
        document.getElementById('user-info').style.display = 'none';
        this.updateSyncStatus();
    }

    async initGoogleSheets() {
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
            
            // Initialize both Sheets and Drive APIs together
            // Only initialize if not already initialized
            // Note: gapi.client.init() can only be called once, so we need to initialize both together from the start
            if (!gapi.client.sheets) {
                // First time initialization - initialize both APIs together
                // Initialize both APIs together in one call
                // This is the only way since gapi.client.init() can only be called once
                await gapi.client.init({
                    apiKey: apiKey,
                    discoveryDocs: [
                        'https://sheets.googleapis.com/$discovery/rest?version=v4',
                        'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
                    ],
                });
                console.log('Both Sheets and Drive APIs initialized');
            } else if (!gapi.client.drive) {
                // Sheets was initialized without Drive (old session) - can't add it now
                // User needs to refresh the page
                throw new Error('Drive API not available. Please refresh the page to initialize both APIs together.');
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
        // Drive API is now initialized together with Sheets API
        // Just ensure token is set
        if (!this.googleToken || !gapi) {
            console.warn('Cannot init Google Drive: token or gapi missing', {
                hasToken: !!this.googleToken,
                hasGapi: !!gapi
            });
            return;
        }
        
        try {
            // Make sure Sheets API is initialized (which also initializes Drive)
            await this.initGoogleSheets();
            
            // Verify Drive API is available
            if (!gapi.client || !gapi.client.drive) {
                // If Drive API is not available, it means Sheets was initialized without it
                // We need to tell the user to refresh the page
                throw new Error('Drive API not available. Please refresh the page to initialize both APIs together.');
            }
            
            // Ensure token is set
            if (gapi.client) {
                gapi.client.setToken({ access_token: this.googleToken });
            }
            
            console.log('Google Drive API ready');
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
        document.getElementById('sign-out-btn').addEventListener('click', () => this.signOut());
        document.getElementById('sync-to-sheet-btn').addEventListener('click', () => this.syncToSheet());
        document.getElementById('sync-from-sheet-btn').addEventListener('click', () => this.syncFromSheet());
        const reconnectBtn = document.getElementById('reconnect-sheet-btn');
        if (reconnectBtn) {
            reconnectBtn.addEventListener('click', () => this.reconnectToSheet());
        }
        document.getElementById('export-btn').addEventListener('click', () => this.exportData());
        document.getElementById('import-file').addEventListener('change', (e) => this.importData(e));
        document.getElementById('clear-local-btn').addEventListener('click', () => this.clearLocalData());
        
        // Exercise name select change handler
        document.getElementById('exercise-name').addEventListener('change', (e) => {
            const selectedExercise = e.target.value.trim();
            
            // Don't hide the input field immediately - let it linger
            // Only hide if a value is actually selected (not empty)
            if (selectedExercise && selectedExercise !== '') {
                const newInput = document.getElementById('exercise-name-new');
                // Only hide if the new input is empty
                if (!newInput.value.trim()) {
                    newInput.style.display = 'none';
                    newInput.value = '';
                }
                
                // Show last time and recommendations for selected exercise
                this.showExercisePreview(selectedExercise);
            } else {
                // Clear recommendations if no exercise selected
                const container = document.getElementById('recommendations-content');
                container.innerHTML = '<p class="no-data">Select an exercise to see your last session and recommendations</p>';
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
                                    this.updateExerciseList();
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
                }
            });
        });
    }

    updateRepsInputs() {
        const sets = parseInt(document.getElementById('sets').value) || 3;
        const container = document.getElementById('reps-container');
        container.innerHTML = '';
        
        for (let i = 1; i <= sets; i++) {
            const group = document.createElement('div');
            group.className = 'rep-input-group';
            group.innerHTML = `
                <label>Set ${i} reps:</label>
                <input type="number" class="rep-input" data-set="${i}" placeholder="0" min="0" value="0">
            `;
            container.appendChild(group);
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
        if (!this.exerciseList.includes(exerciseName)) {
            this.exerciseList.push(exerciseName);
            this.exerciseList.sort(); // Keep sorted alphabetically
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
            // Add it to the list
            if (!this.exerciseList.includes(exerciseName)) {
                this.exerciseList.push(exerciseName);
                this.exerciseList.sort();
                this.saveExerciseList(); // Async, but fire-and-forget
            }
            select.value = exerciseName;
            newInput.style.display = 'none';
            newInput.value = '';
            this.updateExerciseList();
        }

        const weight = parseFloat(document.getElementById('weight').value) || 0;
        const sets = parseInt(document.getElementById('sets').value) || 3;
        const difficulty = document.getElementById('difficulty').value;
        const notes = document.getElementById('notes').value.trim();

        if (!exerciseName) {
            alert('Please select or enter an exercise name');
            return;
        }

        const reps = [];
        document.querySelectorAll('.rep-input').forEach(input => {
            reps.push(parseInt(input.value) || 0);
        });

        const exercise = {
            name: exerciseName,
            weight: weight,
            sets: sets,
            reps: reps,
            difficulty: difficulty,
            notes: notes,
            timestamp: new Date().toISOString()
        };

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

        // Add exercise to list if not already there
        if (!this.exerciseList.includes(exerciseName)) {
            this.exerciseList.push(exerciseName);
            this.exerciseList.sort();
            this.saveExerciseList();
        }

        // Save to localStorage first (for offline backup)
        this.saveSessions();
        this.updateExerciseList();
        this.renderTodayWorkout();
        this.showRecommendations(exercise);
        this.clearForm();

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

        let html = `
            <div class="recommendation-item">
                <h4>${exerciseName}</h4>
                <p class="current"><strong>Last time:</strong> ${dateStr} (${daysAgoText})</p>
                <p class="current">${lastExercise.weight}kg × ${lastExercise.sets} sets (${lastExercise.reps.join(', ')}) reps | ${this.formatDifficulty(lastExercise.difficulty)}</p>
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
        // Set weight
        document.getElementById('weight').value = lastExercise.weight || '';
        
        // Set sets (this will trigger updateRepsInputs)
        document.getElementById('sets').value = lastExercise.sets || 3;
        
        // Update reps inputs first (creates the right number of inputs)
        this.updateRepsInputs();
        
        // Then populate each rep input
        const repInputs = document.querySelectorAll('.rep-input');
        if (lastExercise.reps && lastExercise.reps.length > 0) {
            lastExercise.reps.forEach((rep, index) => {
                if (repInputs[index]) {
                    repInputs[index].value = rep || 0;
                }
            });
        }
        
        // Keep difficulty and notes clear - don't prefill them
        document.getElementById('difficulty').value = 'medium';
        document.getElementById('notes').value = '';
    }

    clearFormFields() {
        document.getElementById('weight').value = '';
        document.getElementById('sets').value = '3';
        document.getElementById('difficulty').value = 'medium';
        document.getElementById('notes').value = '';
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

        let html = `
            <div class="recommendation-item ${suggestion.action}">
                <h4>${currentExercise.name}</h4>
                <p class="current">Current: ${currentExercise.weight}kg × ${currentExercise.reps.join(' + ')} reps (${this.formatDifficulty(currentExercise.difficulty)})</p>
        `;

        if (lastTwo.length === 2) {
            html += `<p class="current">Last 2 sessions: ${lastTwo.map(e => `${e.weight}kg × ${e.reps.join(' + ')} (${this.formatDifficulty(e.difficulty)})`).join(' | ')}</p>`;
        }

        if (suggestion.action === 'increase') {
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

        const difficulties = lastTwo.map(e => e.difficulty);
        const bothEasy = difficulties.every(d => d === 'easy' || d === 'very-easy');
        const bothVeryHard = difficulties.every(d => d === 'very-hard');

        const latest = lastTwo[0];
        let suggestion = {
            action: 'maintain',
            text: 'Maintain current weight and reps'
        };

        if (bothEasy) {
            const avgReps = latest.reps.reduce((a, b) => a + b, 0) / latest.reps.length;
            if (avgReps >= 10) {
                suggestion = {
                    action: 'increase',
                    text: `Increase weight to ${latest.weight + 2.5}kg (or add 2.5kg)`
                };
            } else {
                suggestion = {
                    action: 'increase',
                    text: `Increase reps by 1-2 per set, or increase weight to ${latest.weight + 2.5}kg`
                };
            }
        } else if (bothVeryHard) {
            if (latest.weight > 2.5) {
                suggestion = {
                    action: 'decrease',
                    text: `Decrease weight to ${latest.weight - 2.5}kg`
                };
            } else {
                suggestion = {
                    action: 'decrease',
                    text: `Decrease reps by 1-2 per set`
                };
            }
        }

        return { lastTwo, suggestion };
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

    renderTodayWorkout() {
        const container = document.getElementById('today-exercises');
        if (!this.currentSession.exercises || this.currentSession.exercises.length === 0) {
            container.innerHTML = '<p class="no-data">No exercises logged today</p>';
            return;
        }

        let html = '';
        this.currentSession.exercises.forEach((exercise, index) => {
            html += `
                <div class="exercise-card">
                    <h4>${exercise.name}</h4>
                    <div class="details">Weight: ${exercise.weight}kg</div>
                    <div class="details">Sets: ${exercise.sets} × ${exercise.reps.join(', ')} reps</div>
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
                        const totalVolume = ex.weight * ex.reps.reduce((a, b) => a + b, 0);
                        exerciseData[ex.name].push({
                            date: session.date,
                            weight: ex.weight,
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
        
        let filteredSessions = [...this.sessions].sort((a, b) => new Date(b.date) - new Date(a.date));
        
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
        filteredSessions.forEach(session => {
            const date = new Date(session.date);
            const dateStr = date.toLocaleDateString('en-US', { 
                weekday: 'short', 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric' 
            });
            
            html += `<div class="session-card">`;
            html += `<div class="date">${dateStr}</div>`;
            
            if (session.exercises && session.exercises.length > 0) {
                session.exercises.forEach(ex => {
                    html += `
                        <div class="exercise-item">
                            <div class="exercise-name">${ex.name}</div>
                            <div class="exercise-details">
                                ${ex.weight}kg × ${ex.sets} sets (${ex.reps.join(', ')}) | 
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
    }

    async loadExerciseList() {
        // Try to load from Google Sheets first (if signed in and sheet is connected)
        if (this.isSignedIn && this.sheetId) {
            try {
                // Make sure Google Sheets is initialized
                await this.initGoogleSheets();
                const sheetExercises = await this.loadExerciseListFromSheet();
                if (sheetExercises && sheetExercises.length > 0) {
                    // Save to localStorage as backup
                    localStorage.setItem('exerciseList', JSON.stringify(sheetExercises));
                    return sheetExercises;
                }
            } catch (error) {
                console.warn('Error loading exercise list from sheet, falling back to localStorage:', error);
            }
        }

        // Fall back to localStorage
        const saved = localStorage.getItem('exerciseList');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error('Error parsing exercise list:', e);
            }
        }
        
        // If no saved list, extract from existing sessions
        const exercises = new Set();
        if (this.sessions && this.sessions.length > 0) {
            this.sessions.forEach(session => {
                if (session.exercises) {
                    session.exercises.forEach(ex => exercises.add(ex.name));
                }
            });
        }
        return Array.from(exercises).sort();
    }

    async saveExerciseList() {
        // Save to localStorage
        localStorage.setItem('exerciseList', JSON.stringify(this.exerciseList));
        
        // Also sync to Google Sheets if signed in
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
        try {
            await this.initGoogleSheets();
            const response = await gapi.client.sheets.spreadsheets.get({
                spreadsheetId: this.sheetId
            });
            const sheets = response.result.sheets || [];
            // Look for Exercises tab
            const exercisesSheet = sheets.find(s => s.properties.title === 'Exercises');
            if (exercisesSheet) {
                return 'Exercises';
            }
            // If not found, try to create it or use first available tab
            if (sheets.length > 1) {
                // Use second tab if it exists
                return sheets[1].properties.title;
            }
        } catch (error) {
            console.warn('Could not get Exercises tab name:', error);
        }
        return 'Exercises'; // Default fallback
    }

    async syncExerciseListToSheet() {
        if (!this.isSignedIn || !this.sheetId) return;

        try {
            await this.initGoogleSheets();
            
            // Get or create Exercises tab
            let exercisesTabName = await this.getExercisesTabName();
            
            // Try to write to Exercises tab, create if it doesn't exist
            try {
                const rows = [['Exercise Name']]; // Header
                this.exerciseList.forEach(exercise => {
                    rows.push([exercise]);
                });

                const escapedTabName = this.escapeSheetTabName(exercisesTabName);
                const range = `${escapedTabName}!A1`;
                await gapi.client.sheets.spreadsheets.values.update({
                    spreadsheetId: this.sheetId,
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
                    const rows = [['Exercise Name']];
                    this.exerciseList.forEach(exercise => {
                        rows.push([exercise]);
                    });
                    const escapedTabName = this.escapeSheetTabName('Exercises');
                    await gapi.client.sheets.spreadsheets.values.update({
                        spreadsheetId: this.sheetId,
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
        try {
            await gapi.client.sheets.spreadsheets.batchUpdate({
                spreadsheetId: this.sheetId,
                resource: {
                    requests: [{
                        addSheet: {
                            properties: {
                                title: 'Exercises',
                                gridProperties: {
                                    rowCount: 1000,
                                    columnCount: 1
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

    async loadExerciseListFromSheet() {
        if (!this.isSignedIn || !this.sheetId) return null;

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
            const response = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: this.sheetId,
                range: `${escapedTabName}!A2:A1000` // Skip header row
            });

            const rows = response.result.values || [];
            console.log('Exercise rows loaded from sheet:', rows.length);
            if (rows.length > 0) {
                const exercises = rows
                    .map(row => row[0]?.trim())
                    .filter(name => name && name.length > 0)
                    .sort();
                console.log('Exercises loaded from sheet:', exercises.length, exercises.slice(0, 5));
                return exercises;
            }
        } catch (error) {
            // Exercises sheet might not exist yet, that's okay
            console.log('Exercises sheet not found or error loading:', error.message);
        }
        return null;
    }

    updateExerciseList() {
        const select = document.getElementById('exercise-name');
        if (!select) {
            console.error('Exercise name select element not found');
            return;
        }
        
        const currentValue = select.value;
        
        // Merge exercises from sessions with saved list
        const exercisesFromSessions = new Set();
        this.sessions.forEach(session => {
            if (session.exercises) {
                session.exercises.forEach(ex => exercisesFromSessions.add(ex.name));
            }
        });

        console.log('updateExerciseList: Exercises from sessions:', Array.from(exercisesFromSessions));
        console.log('updateExerciseList: Saved exercise list:', this.exerciseList);

        // Combine saved list with exercises from sessions
        const allExercises = new Set([...this.exerciseList, ...exercisesFromSessions]);
        this.exerciseList = Array.from(allExercises).sort();
        console.log('updateExerciseList: Final exercise list:', this.exerciseList);
        this.saveExerciseList(); // Async, but fire-and-forget

        // Update select dropdown
        select.innerHTML = '<option value="">Select or type to add new...</option>';
        this.exerciseList.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            select.appendChild(option);
        });

        console.log('updateExerciseList: Dropdown updated with', select.options.length, 'options');

        // Restore previous selection if it still exists
        if (currentValue && this.exerciseList.includes(currentValue)) {
            select.value = currentValue;
        }
    }

    async findSheetByName(sheetName) {
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
            console.log('Token set for Drive API search');
            
            // Verify Drive API is loaded
            if (!gapi.client.drive) {
                console.error('Drive API not loaded, attempting to initialize...');
                await this.initGoogleDrive();
                if (!gapi.client.drive) {
                    throw new Error('Google Drive API not available. Please refresh the page and sign in again.');
                }
            }
            
            // Escape single quotes in sheet name for the query
            const escapedName = sheetName.replace(/'/g, "\\'");
            
            console.log('Searching for sheet with name:', sheetName);
            const response = await gapi.client.drive.files.list({
                q: `name='${escapedName}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
                fields: 'files(id, name, modifiedTime)',
                orderBy: 'modifiedTime desc'
            });
            
            const files = response.result.files || [];
            console.log(`Found ${files.length} sheet(s) with name "${sheetName}"`);
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
            // If Drive API is not available, provide helpful message
            if (error.message && error.message.includes('Drive API not available')) {
                throw new Error('Drive API not loaded. Please refresh the page and try again.');
            }
            throw error;
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
            
            const sheetStatus = document.getElementById('sheet-status');
            if (sheetStatus) {
                sheetStatus.innerHTML = `<p style="color: green;">✓ Connected to '${selectedSheet.name}'</p>`;
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
                this.saveExerciseList();
                this.updateExerciseList();
            } else {
                this.exerciseList = await this.loadExerciseList();
                this.updateExerciseList();
            }
            
            // Immediately sync to sheet after connection (uploads local data if any)
            await this.syncToSheet(true); // Silent sync
            
            // After sync, reload to get the latest data
            this.sessions = await this.loadSessions();
            this.currentSession = this.getTodaySession();
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

    async reconnectToSheet() {
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
        // First try to get from user-specific storage if signed in
        if (this.userEmail) {
            const userSheetId = this.getSheetIdForUser(this.userEmail);
            if (userSheetId) {
                return userSheetId;
            }
        }
        // Fall back to general storage (backward compatibility)
        return localStorage.getItem('sheetId');
    }

    getSheetIdForUser(userEmail) {
        const userSheetIds = JSON.parse(localStorage.getItem('userSheetIds') || '{}');
        return userSheetIds[userEmail] || null;
    }

    saveSheetIdForUser(userEmail, sheetId) {
        const userSheetIds = JSON.parse(localStorage.getItem('userSheetIds') || '{}');
        if (sheetId) {
            userSheetIds[userEmail] = sheetId;
        } else {
            // Remove the entry if sheetId is null/undefined
            delete userSheetIds[userEmail];
        }
        localStorage.setItem('userSheetIds', JSON.stringify(userSheetIds));
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
        if (!this.isSignedIn || !this.sheetId) {
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
            const rows = [['Date', 'Exercise', 'Weight', 'Sets', 'Reps', 'Difficulty', 'Notes']];
            
            this.sessions.forEach(session => {
                if (session.exercises) {
                    session.exercises.forEach(ex => {
                        rows.push([
                            session.date,
                            ex.name,
                            ex.weight.toString(),
                            ex.sets.toString(),
                            ex.reps.join('+'),
                            this.formatDifficulty(ex.difficulty),
                            ex.notes || ''
                        ]);
                    });
                }
            });

            const range = `${escapedTabName}!A1`;
            const response = await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: this.sheetId,
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
        if (!this.isSignedIn || !this.sheetId) {
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
            
            const newSessions = {};

            rows.forEach((row, index) => {
                // Skip empty rows
                if (!row || row.length === 0) {
                    return;
                }
                
                // Skip header row if it somehow got included
                if (index === 0 && row[0] && row[0].toLowerCase() === 'date') {
                    return;
                }
                
                if (row.length >= 6) {
                    const date = row[0]?.trim();
                    const exerciseName = row[1]?.trim();
                    
                    // Skip rows with empty date or exercise name
                    if (!date || !exerciseName) {
                        return;
                    }
                    
                    const exercise = {
                        name: exerciseName,
                        weight: parseFloat(row[2]) || 0,
                        sets: parseInt(row[3]) || 1,
                        reps: row[4] ? row[4].toString().split('+').map(r => parseInt(r.trim()) || 0).filter(r => r > 0) : [0],
                        difficulty: this.parseDifficulty(row[5] || 'medium'),
                        notes: (row[6] || '').trim(),
                        timestamp: new Date().toISOString()
                    };

                    if (!newSessions[date]) {
                        newSessions[date] = { date, exercises: [] };
                    }
                    newSessions[date].exercises.push(exercise);
                }
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
                errorDetails += 'Column C: Weight\n';
                errorDetails += 'Column D: Sets\n';
                errorDetails += 'Column E: Reps (e.g., "10+8+6")\n';
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
            this.saveSessions(); // Save to localStorage as backup
            this.currentSession = this.getTodaySession();
            
            // Also load exercise list from Google Sheets
            const sheetExercises = await this.loadExerciseListFromSheet();
            console.log('Sync from sheet: Loaded', sheetExercises?.length || 0, 'exercises from Exercises tab');
            if (sheetExercises && sheetExercises.length > 0) {
                this.exerciseList = sheetExercises;
                this.saveExerciseList(); // Save to localStorage as backup
            } else {
                console.warn('No exercises found in Exercises tab, will extract from sessions');
            }
            
            // Always update exercise list (it will merge with exercises from sessions)
            this.updateExerciseList();
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
                alert(`Data synced successfully!\n\n${sessionCount} workout session(s) loaded\n${exerciseCount} exercise(s) loaded`);
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

    exportData() {
        const dataStr = JSON.stringify(this.sessions, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `workout-data-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        URL.revokeObjectURL(url);
    }

    importData(event) {
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

    clearLocalData() {
        if (confirm('Are you sure you want to clear all local data? This cannot be undone.')) {
            localStorage.removeItem('workoutSessions');
            this.sessions = [];
            this.currentSession = this.getTodaySession();
            this.renderTodayWorkout();
            this.renderHistory();
            alert('Local data cleared');
        }
    }

    updateSyncStatus() {
        const indicator = document.getElementById('sync-indicator');
        const text = document.getElementById('sync-text');
        const reconnectBtn = document.getElementById('reconnect-sheet-btn');
        
        if (this.isSignedIn && this.sheetId) {
            indicator.textContent = '🟢';
            text.textContent = 'Connected';
            if (reconnectBtn) {
                reconnectBtn.style.display = 'block';
            }
        } else if (this.isSignedIn) {
            indicator.textContent = '🟡';
            text.textContent = 'Signed In';
            if (reconnectBtn) {
                reconnectBtn.style.display = 'block';
            }
        } else {
            indicator.textContent = '⚪';
            text.textContent = 'Not Connected';
            if (reconnectBtn) {
                reconnectBtn.style.display = 'none';
            }
        }
    }

    saveSessions() {
        // Save to localStorage as backup (for offline use)
        localStorage.setItem('workoutSessions', JSON.stringify(this.sessions));
    }

    async loadSessions() {
        // Google Sheets is the source of truth - load from there first if available
        if (this.isSignedIn && this.sheetId) {
            try {
                await this.initGoogleSheets();
                const sheetSessions = await this.loadSessionsFromSheet();
                if (sheetSessions && sheetSessions.length > 0) {
                    // Save to localStorage as backup
                    localStorage.setItem('workoutSessions', JSON.stringify(sheetSessions));
                    return sheetSessions;
                }
            } catch (error) {
                console.warn('Error loading sessions from sheet, falling back to localStorage:', error);
            }
        }
        
        // Fall back to localStorage if sheet not available or error
        const saved = localStorage.getItem('workoutSessions');
        return saved ? JSON.parse(saved) : [];
    }

    async loadSessionsFromSheet() {
        if (!this.isSignedIn || !this.sheetId) {
            console.log('Cannot load from sheet: isSignedIn=', this.isSignedIn, 'sheetId=', this.sheetId);
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
            
            console.log('Loading sessions from sheet:', this.sheetId);
            // Get the actual sheet tab name
            const sheetTabName = await this.getSheetTabName();
            const escapedTabName = this.escapeSheetTabName(sheetTabName);
            
            const response = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: this.sheetId,
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
                
                if (row.length >= 6) {
                    const date = row[0]?.trim();
                    const exerciseName = row[1]?.trim();
                    
                    // Skip rows with empty date or exercise name
                    if (!date || !exerciseName) {
                        return;
                    }
                    
                    const exercise = {
                        name: exerciseName,
                        weight: parseFloat(row[2]) || 0,
                        sets: parseInt(row[3]) || 1,
                        reps: row[4] ? row[4].toString().split('+').map(r => parseInt(r.trim()) || 0).filter(r => r > 0) : [0],
                        difficulty: this.parseDifficulty(row[5] || 'medium'),
                        notes: (row[6] || '').trim(),
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
