# Workout Tracker

A web-based workout tracking application that syncs with Google Sheets, allowing you to track your exercises across all your devices (phone and computer).

## Features

- 📱 **Cross-Device Sync**: Sign in with Google to sync workouts between phone and computer
- 🌐 **Access Anywhere**: Deploy to GitHub Pages/Netlify for internet access (see `DEPLOY.md`)
- 📊 **Google Sheets Integration**: Automatically syncs with your Google Sheet
- 💪 **Smart Recommendations**: Suggests weight/reps increases after 2 easy sessions, decreases after 2 very hard sessions
- 📈 **Progress Charts**: Visualize your progress over time with interactive graphs
- 📝 **Easy Logging**: Quick entry form optimized for mobile use during workouts
- 💾 **Export/Import**: Backup your data as JSON files

## Setup Instructions

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. **Important**: You can skip the "$300 free trial" offer - you don't need it! The APIs we use are free.
3. Create a new project or select an existing one
   - Click "Select a project" → "New Project"
   - Give it a name like "Workout Tracker"
   - **No billing required** - just click "Create"
4. Enable the Google Sheets API:
   - Search for **"Google Sheets API"** in the API Library
   - Click it → Click **"Enable"**
   
   **Note**: You don't need to enable "Google Identity Services API" - it's a client-side JavaScript library already included in the HTML. Authentication works through OAuth consent screen configuration.

### 2. Configure OAuth Consent Screen

1. Go to **APIs & Services** > **OAuth consent screen**
2. Choose **External** (unless you have a Google Workspace)
3. Fill in the required information:
   - App name: "Workout Tracker"
   - User support email: Your email
   - Developer contact: Your email
4. Add scopes:
   - `https://www.googleapis.com/auth/spreadsheets`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`
5. Add test users (your Google account email) - **REQUIRED**:
   - Click **"+ ADD USERS"**
   - Enter your Google email address
   - Click **"Add"**
   - **Important**: Without this, you'll get "Error 403: access_denied" when trying to sign in

### 3. Create OAuth 2.0 Credentials

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. Choose **Web application**
4. Add authorized JavaScript origins:
   - `http://localhost` (for local testing)
   - Your domain (if hosting)
5. Copy the **Client ID**

### 4. Create API Key (Optional but Recommended)

1. In **Credentials**, click **Create Credentials** > **API key**
2. Restrict the API key to:
   - **Application restrictions**: HTTP referrers
   - **API restrictions**: Restrict to Google Sheets API
3. Copy the **API Key**

### 5. Update the Application

**Option 1: Direct Edit (Simple)**
1. Open `app.js`
2. Find the `getClientId()` method (around line 30) and replace `YOUR_CLIENT_ID.apps.googleusercontent.com` with your actual Client ID
3. Find the `getApiKey()` method (around line 35) and replace `YOUR_API_KEY` with your actual API Key

**Option 2: Config File (Recommended for Security)**
1. Copy `config.example.js` to `config.js`
2. Fill in your Client ID and API Key in `config.js`
3. Update `app.js` to import from `config.js` (see config.example.js for reference)
4. **Important**: Add `config.js` to `.gitignore` to avoid committing your credentials

### 6. Get Your Google Sheet ID

1. Open your Google Sheet: https://docs.google.com/spreadsheets/d/1wuViYApTz6WJYHVLlI0zTDKqMSqbdw0RnN1zvG5dGjI/edit
2. The Sheet ID is the long string in the URL: `1wuViYApTz6WJYHVLlI0zTDKqMSqbdw0RnN1zvG5dGjI`
3. In the app, go to Settings and paste this ID

### 7. Share Your Google Sheet

Make sure your Google account has edit access to the sheet, or the app won't be able to write to it.

## Running the App

**Important**: You must run this app through a web server, not by opening the HTML file directly.

### Option 1: Python (Easiest)
```bash
# Windows/Mac/Linux
python -m http.server 8000
# or
python3 -m http.server 8000
```
Then open: http://localhost:8000

### Option 2: Node.js
```bash
npx http-server -p 8000
```
Then open: http://localhost:8000

### Option 3: VS Code Live Server
If using VS Code, install the "Live Server" extension and click "Go Live"

### Quick Start Scripts
- **Windows**: Double-click `start-server.bat`
- **Mac/Linux**: Run `chmod +x start-server.sh && ./start-server.sh`

### Access from Your Phone

**Option 1: Same Wi-Fi Network**
See `ACCESS_FROM_PHONE.md` for accessing from your phone on the same Wi-Fi network.

**Option 2: Deploy to Internet (Recommended for Gym Use)**
See `DEPLOY.md` for deploying to GitHub Pages, Netlify, or Vercel so you can access it from anywhere, including the gym!

## Usage

1. **Start the server** (see above)
2. **Sign In**: Click "Sign in with Google" in the Settings tab
3. **Connect Sheet**: Enter your Google Sheet ID and click "Connect to Sheet"
4. **Track Workouts**: Use the "Track Workout" tab to log exercises
5. **View Progress**: Check the "History & Graphs" tab for charts and past sessions
6. **Sync**: Data automatically syncs when you save exercises, or manually sync using the buttons

## Data Format

The app stores data in this format:
- **Date**: YYYY-MM-DD
- **Exercise**: Exercise name
- **Weight**: Weight in kg
- **Sets**: Number of sets
- **Reps**: Reps per set (comma-separated)
- **Difficulty**: Very Easy, Easy, Medium, Hard, Very Hard
- **Notes**: Optional notes

## Troubleshooting

- **Can't sign in**: Make sure you've added your email as a test user in OAuth consent screen
- **Can't sync to sheet**: Check that the Sheet ID is correct and you have edit access
- **API errors**: Verify your API key and OAuth credentials are correct in `app.js`

## Pricing / Cost

**✅ FREE for personal use!**

All the services used are free:
- **Google Cloud Project**: Free to create (no billing required)
- **Google Sheets API**: Free tier includes 500 requests per 100 seconds (more than enough for personal use)
- **Google OAuth**: Completely free
- **Google Sheets**: Free (15GB storage included with Google account)

**Important**: You do NOT need to:
- Sign up for the "$300 free trial"
- Provide billing information
- Enable any paid services

You would only pay if you:
- Exceed 500 API requests per 100 seconds (extremely unlikely for personal workout tracking)
- Need more than 15GB of Google Drive storage (workout data is tiny - thousands of workouts = a few MB)

For typical use (logging workouts a few times per week), you'll never hit any limits or incur any costs. The free tier is sufficient for personal use.

## Sharing with Others

**Yes, you can share this app with family/friends!** Here are your options:

### Option 1: Share the Code (Recommended)
- Give them the app files (HTML, CSS, JS)
- They set up their own Google Cloud project and credentials
- Each person uses their own Google account and Google Sheet
- **Pros**: Complete privacy separation, no shared costs
- **Cons**: Each person needs to do the setup

### Option 2: Share Google Cloud Credentials
- You can use the same OAuth Client ID and API Key for multiple users
- Each person signs in with their own Google account
- Each person uses their own Google Sheet
- **Pros**: Easier setup for others (they just need to add their Sheet ID)
- **Cons**: You're responsible for the Google Cloud project

### Option 3: Shared Google Sheet (Not Recommended)
- Multiple people use the same Google Sheet
- **Pros**: One sheet to manage
- **Cons**: Data gets mixed together, privacy concerns, harder to track individual progress

**Best Practice**: Share the code and let each person set up their own Google Cloud project. It's free and takes about 10 minutes.

## Privacy

- All data is stored locally in your browser
- Google Sheets sync is optional
- No data is sent to third-party servers (except Google for authentication and sheet sync)
- Each user's data is separate (if using separate Google accounts/sheets)

