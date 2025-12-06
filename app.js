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
        if (this.sheetId) {
            const sheetIdInput = document.getElementById('sheet-id');
            if (sheetIdInput) {
                sheetIdInput.value = this.sheetId;
            }
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
            // Load user info (which will auto-connect to sheet, create if needed, and sync)
            await this.loadUserInfo();
            this.initGoogleSheets();
            this.updateSyncStatus();
            
            // Reload sessions from Google Sheets (source of truth)
            this.sessions = await this.loadSessions();
            this.currentSession = this.getTodaySession();
            this.renderTodayWorkout();
            this.renderHistory();
            
            // Reload exercise list from Google Sheets if available
            this.exerciseList = await this.loadExerciseList();
            this.updateExerciseList();
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

        const scopes = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';
        
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
        
        // If no sheet ID exists, create a new sheet
        if (!userSheetId) {
            try {
                await this.initGoogleSheets();
                userSheetId = await this.createNewSheet();
                
                if (userSheetId) {
                    // Save the new sheet ID for this user
                    this.saveSheetIdForUser(userEmail, userSheetId);
                    this.sheetId = userSheetId;
                    localStorage.setItem('sheetId', userSheetId); // Keep backward compatibility
                    
                    // Update the input field
                    const sheetIdInput = document.getElementById('sheet-id');
                    if (sheetIdInput) {
                        sheetIdInput.value = userSheetId;
                    }
                    
                    // Update status
                    const sheetStatus = document.getElementById('sheet-status');
                    if (sheetStatus) {
                        sheetStatus.innerHTML = '<p style="color: green;">✓ Created and connected to your new sheet</p>';
                    }
                }
            } catch (error) {
                console.error('Error creating new sheet:', error);
                const sheetStatus = document.getElementById('sheet-status');
                if (sheetStatus) {
                    sheetStatus.innerHTML = '<p style="color: orange;">⚠ Could not create sheet automatically. Please create one manually.</p>';
                }
                return;
            }
        }
        
        if (userSheetId) {
            // Automatically connect to the sheet
            this.sheetId = userSheetId;
            localStorage.setItem('sheetId', userSheetId); // Keep backward compatibility
            
            // Update the input field
            const sheetIdInput = document.getElementById('sheet-id');
            if (sheetIdInput) {
                sheetIdInput.value = userSheetId;
            }
            
            // Update status
            const sheetStatus = document.getElementById('sheet-status');
            if (sheetStatus) {
                sheetStatus.innerHTML = '<p style="color: green;">✓ Automatically connected to your sheet</p>';
            }
            
            this.updateSyncStatus();
            
            // Try to verify the sheet is accessible and load exercise list
            try {
                await this.initGoogleSheets();
                // Test access by trying to read the sheet
                await gapi.client.sheets.spreadsheets.get({
                    spreadsheetId: userSheetId
                });
                
                // Reload exercise list from Google Sheets now that we're connected
                const sheetExercises = await this.loadExerciseListFromSheet();
                if (sheetExercises && sheetExercises.length > 0) {
                    this.exerciseList = sheetExercises;
                    this.saveExerciseList(); // Save to localStorage as backup
                    this.updateExerciseList();
                } else {
                    // If no exercises in sheet, try loading from localStorage or sessions
                    this.exerciseList = await this.loadExerciseList();
                    this.updateExerciseList();
                }
                
                // Immediately sync to sheet after login
                await this.syncToSheet(true); // Silent sync
            } catch (error) {
                console.warn('Sheet might not be accessible:', error);
                if (sheetStatus) {
                    sheetStatus.innerHTML = '<p style="color: orange;">⚠ Sheet ID found but may not be accessible. Please verify.</p>';
                }
                // Still try to load exercises from localStorage as fallback
                this.exerciseList = await this.loadExerciseList();
                this.updateExerciseList();
            }
        } else {
            // No sheet ID stored for this user
            const sheetStatus = document.getElementById('sheet-status');
            if (sheetStatus) {
                sheetStatus.innerHTML = '<p style="color: #666;">Enter your Google Sheet ID below to connect</p>';
            }
        }
    }

    async createNewSheet() {
        try {
            await this.initGoogleSheets();
            
            // Create a new spreadsheet
            const response = await gapi.client.sheets.spreadsheets.create({
                properties: {
                    title: 'Workout Tracker - ' + new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
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
            
            // Set up headers for Sheet1
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: spreadsheetId,
                range: 'Sheet1!A1:G1',
                valueInputOption: 'RAW',
                resource: {
                    values: [['Date', 'Exercise', 'Weight', 'Sets', 'Reps', 'Difficulty', 'Notes']]
                }
            });
            
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
        if (!this.googleToken || !gapi) return;
        
        try {
            await new Promise((resolve) => {
                gapi.load('client', resolve);
            });
            
            const apiKey = await this.getApiKey();
            if (!apiKey) {
                console.error('Google API Key not configured');
                return;
            }
            
            await gapi.client.init({
                apiKey: apiKey,
                discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
            });
            
            gapi.client.setToken({ access_token: this.googleToken });
        } catch (error) {
            console.error('Error initializing Google Sheets:', error);
        }
    }

    setupEventListeners() {
        document.getElementById('save-workout').addEventListener('click', () => this.saveExercise());
        document.getElementById('sets').addEventListener('input', () => this.updateRepsInputs());
        document.getElementById('exercise-filter').addEventListener('change', () => this.renderHistory());
        document.getElementById('time-filter').addEventListener('change', () => this.renderHistory());
        document.getElementById('sign-out-btn').addEventListener('click', () => this.signOut());
        document.getElementById('connect-sheet-btn').addEventListener('click', () => this.connectSheet());
        document.getElementById('sync-to-sheet-btn').addEventListener('click', () => this.syncToSheet());
        document.getElementById('sync-from-sheet-btn').addEventListener('click', () => this.syncFromSheet());
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
                    if (this.isSignedIn && this.sheetId) {
                        this.loadSessions().then(sessions => {
                            this.sessions = sessions;
                            this.currentSession = this.getTodaySession();
                            this.renderHistory();
                        });
                    } else {
                        this.renderHistory();
                    }
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
        const timeFilter = document.getElementById('time-filter').value;
        
        // Debug: log sessions to see what we have
        console.log('Rendering history with sessions:', this.sessions);
        console.log('Number of sessions:', this.sessions.length);
        
        let filteredSessions = [...this.sessions].sort((a, b) => new Date(b.date) - new Date(a.date));
        
        if (timeFilter !== 'all') {
            const daysAgo = parseInt(timeFilter);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysAgo);
            filteredSessions = filteredSessions.filter(s => new Date(s.date) >= cutoffDate);
        }

        if (filteredSessions.length === 0) {
            container.innerHTML = '<p class="no-data">No workout history found</p>';
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

    async syncExerciseListToSheet() {
        if (!this.isSignedIn || !this.sheetId) return;

        try {
            await this.initGoogleSheets();
            
            // Check if Exercises sheet exists, create if not
            try {
                await gapi.client.sheets.spreadsheets.get({
                    spreadsheetId: this.sheetId
                });
            } catch (e) {
                // Sheet might not exist, we'll handle it
            }

            // Write exercise list to "Exercises" sheet
            const rows = [['Exercise Name']]; // Header
            this.exerciseList.forEach(exercise => {
                rows.push([exercise]);
            });

            const range = 'Exercises!A1';
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: this.sheetId,
                range: range,
                valueInputOption: 'RAW',
                resource: { values: rows }
            });
        } catch (error) {
            // If Exercises sheet doesn't exist, create it
            if (error.status === 400 || error.message?.includes('range')) {
                await this.createExercisesSheet();
                // Retry after creating sheet
                await this.syncExerciseListToSheet();
            } else {
                throw error;
            }
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
            
            const response = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: this.sheetId,
                range: 'Exercises!A2:A1000' // Skip header row
            });

            const rows = response.result.values || [];
            if (rows.length > 0) {
                const exercises = rows
                    .map(row => row[0]?.trim())
                    .filter(name => name && name.length > 0)
                    .sort();
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
        const currentValue = select.value;
        
        // Merge exercises from sessions with saved list
        const exercisesFromSessions = new Set();
        this.sessions.forEach(session => {
            if (session.exercises) {
                session.exercises.forEach(ex => exercisesFromSessions.add(ex.name));
            }
        });

        // Combine saved list with exercises from sessions
        const allExercises = new Set([...this.exerciseList, ...exercisesFromSessions]);
        this.exerciseList = Array.from(allExercises).sort();
        this.saveExerciseList(); // Async, but fire-and-forget

        // Update select dropdown
        select.innerHTML = '<option value="">Select or type to add new...</option>';
        this.exerciseList.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            select.appendChild(option);
        });

        // Restore previous selection if it still exists
        if (currentValue && this.exerciseList.includes(currentValue)) {
            select.value = currentValue;
        }
    }

    connectSheet() {
        const sheetId = document.getElementById('sheet-id').value.trim();
        if (!sheetId) {
            alert('Please enter a Google Sheet ID');
            return;
        }
        this.sheetId = sheetId;
        
        // Save to localStorage (backward compatibility)
        localStorage.setItem('sheetId', sheetId);
        
        // Also save per user if signed in
        if (this.userEmail) {
            this.saveSheetIdForUser(this.userEmail, sheetId);
        }
        
        document.getElementById('sheet-status').innerHTML = '<p style="color: green;">✓ Sheet ID saved</p>';
        this.updateSyncStatus();
    }

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
        userSheetIds[userEmail] = sheetId;
        localStorage.setItem('userSheetIds', JSON.stringify(userSheetIds));
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

            const range = 'Sheet1!A1';
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
                    errorMessage = 'Sheet not found. Please check that the Sheet ID is correct.';
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
            await this.initGoogleSheets();
            
            const response = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: this.sheetId,
                range: 'Sheet1!A2:G1000'
            });

            const rows = response.result.values || [];
            const newSessions = {};

            rows.forEach(row => {
                if (row.length >= 6) {
                    const date = row[0];
                    const exercise = {
                        name: row[1],
                        weight: parseFloat(row[2]) || 0,
                        sets: parseInt(row[3]) || 1,
                        reps: row[4] ? row[4].split('+').map(r => parseInt(r) || 0) : [0],
                        difficulty: this.parseDifficulty(row[5]),
                        notes: row[6] || '',
                        timestamp: new Date().toISOString()
                    };

                    if (!newSessions[date]) {
                        newSessions[date] = { date, exercises: [] };
                    }
                    newSessions[date].exercises.push(exercise);
                }
            });

            // Google Sheets is source of truth - replace local data with sheet data
            this.sessions = Object.values(newSessions);
            this.saveSessions(); // Save to localStorage as backup
            this.currentSession = this.getTodaySession();
            
            // Also load exercise list from Google Sheets
            const sheetExercises = await this.loadExerciseListFromSheet();
            if (sheetExercises && sheetExercises.length > 0) {
                this.exerciseList = sheetExercises;
                this.saveExerciseList(); // Save to localStorage as backup
                this.updateExerciseList();
            }
            
            this.renderTodayWorkout();
            this.renderHistory();
            this.updateSyncStatus();
            alert('Data synced from Google Sheets successfully!');
        } catch (error) {
            console.error('Sync error:', error);
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
                errorMessage = 'Sheet not found. Please check that the Sheet ID is correct.';
            } else if (errorMessage.includes('401') || errorMessage.includes('unauthorized')) {
                errorMessage = 'Authentication failed. Please sign in again.';
            }
            
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
        
        if (this.isSignedIn && this.sheetId) {
            indicator.textContent = '🟢';
            text.textContent = 'Connected';
        } else if (this.isSignedIn) {
            indicator.textContent = '🟡';
            text.textContent = 'Signed In';
        } else {
            indicator.textContent = '⚪';
            text.textContent = 'Not Connected';
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
            
            console.log('Loading sessions from sheet:', this.sheetId);
            const response = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: this.sheetId,
                range: 'Sheet1!A2:G10000' // Increased range for more data
            });

            const rows = response.result.values || [];
            console.log('Rows loaded from sheet:', rows.length);
            
            const sessions = {};

            rows.forEach((row, index) => {
                // Debug first few rows
                if (index < 3) {
                    console.log(`Row ${index}:`, row);
                }
                
                if (row.length >= 6) {
                    const date = row[0];
                    const exercise = {
                        name: row[1],
                        weight: parseFloat(row[2]) || 0,
                        sets: parseInt(row[3]) || 1,
                        reps: row[4] ? row[4].split('+').map(r => parseInt(r) || 0) : [0],
                        difficulty: this.parseDifficulty(row[5]),
                        notes: row[6] || '',
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
