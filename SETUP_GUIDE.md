# Quick Setup Guide for Experienced Programmers

You've created your Google Cloud project. Here's the fast track to get it working:

## Step 1: Enable APIs (2 minutes)

1. In the Google Cloud Console, click **"Go to APIs overview"** (or use the hamburger menu → **APIs & Services** → **Library**)
2. Search for **"Google Sheets API"** → Click it → Click **"Enable"**

**Note**: You don't need to enable "Google Identity Services API" - it's a client-side library that's already loaded in the HTML. The OAuth flow works through the OAuth consent screen configuration (next step).

That's it. No billing needed.

## Step 2: Create OAuth 2.0 Client ID (3 minutes)

1. Go to **APIs & Services** → **Credentials**
2. Click **"+ CREATE CREDENTIALS"** → **"OAuth client ID"**
3. If prompted, configure OAuth consent screen:
   - **User Type**: External
   - **App name**: Workout Tracker
   - **User support email**: Your email
   - **Developer contact**: Your email
   - Click **"Save and Continue"**
   - **Scopes**: Click **"Add or Remove Scopes"** → Search and add:
     - `https://www.googleapis.com/auth/spreadsheets`
     - `https://www.googleapis.com/auth/userinfo.email`
     - `https://www.googleapis.com/auth/userinfo.profile`
   - Click **"Save and Continue"**
   - **Test users**: 
     - Click **"+ ADD USERS"**
     - Add your Google email address: `ozietman@gmail.com` (or whatever email you're using)
     - Click **"Add"**
     - **IMPORTANT**: You must add yourself as a test user or you'll get "Error 403: access_denied"
   - Click **"Save and Continue"** → **"Back to Dashboard"**
4. Now create the OAuth client:
   - **Application type**: Web application
   - **Name**: Workout Tracker Web Client
   - **Authorized JavaScript origins**: 
     - `http://localhost` (for local testing)
     - `http://localhost:8000` (if using port 8000)
     - `http://localhost:8080` (if using port 8080)
     - Add your domain if hosting
   - **Authorized redirect URIs**: 
     - **IMPORTANT**: Add `http://localhost:8000` (or whatever port you're using)
     - Also add `http://localhost` if using that
     - This is required even though we're using the token flow
   - Click **"Create"**
5. **Copy the Client ID** (looks like: `123456789-abc.apps.googleusercontent.com`)

**⚠️ If you get "redirect_uri_mismatch" error:**
- Go back to your OAuth client settings
- Click the edit (pencil) icon
- Make sure `http://localhost:8000` (or your port) is in **Authorized redirect URIs**
- Save and try again

## Step 3: Create API Key (2 minutes)

1. Still in **Credentials**, click **"+ CREATE CREDENTIALS"** → **"API key"**
2. Copy the API key (looks like: `AIzaSy...`)
3. **Optional but recommended**: Click the key to restrict it:
   - **Application restrictions**: HTTP referrers
   - Add: `http://localhost/*` and your domain if hosting
   - **API restrictions**: Restrict to **Google Sheets API**
   - Click **"Save"**

## Step 4: Update Your Code (1 minute)

Open `app.js` and replace:

```javascript
getClientId() {
    return 'YOUR_CLIENT_ID.apps.googleusercontent.com'; // ← Paste your Client ID here
}

getApiKey() {
    return 'YOUR_API_KEY'; // ← Paste your API Key here
}
```

## Step 5: Get Your Sheet ID

From your Google Sheet URL:
```
https://docs.google.com/spreadsheets/d/1wuViYApTz6WJYHVLlI0zTDKqMSqbdw0RnN1zvG5dGjI/edit
```

The Sheet ID is: `1wuViYApTz6WJYHVLlI0zTDKqMSqbdw0RnN1zvG5dGjI`

## Step 6: Run the App

**⚠️ IMPORTANT**: You must run this through a web server, not by opening the HTML file directly!

### Start a Local Server:

**Windows/Mac/Linux:**
```bash
python -m http.server 8000
# or
python3 -m http.server 8000
```

**Or use the provided script:**
- Windows: Double-click `start-server.bat`
- Mac/Linux: `chmod +x start-server.sh && ./start-server.sh`

Then open: **http://localhost:8000** in your browser

## Step 7: Test It

1. Open **http://localhost:8000** in your browser
2. Go to **Settings** tab
3. Click **"Sign in with Google"** → Authorize
4. Paste your Sheet ID → Click **"Connect to Sheet"**
5. Go to **Track Workout** tab and log an exercise
6. Check your Google Sheet - data should appear!

## Common Issues

- **"Access blocked"**: Add your email as a test user in OAuth consent screen
- **"API not enabled"**: Make sure both APIs are enabled in the API Library
- **CORS errors**: Make sure you added `http://localhost` to authorized origins
- **"Permission denied"**: Make sure you have edit access to the Google Sheet

## Architecture Notes

- Uses Google Identity Services (new OAuth 2.0 flow)
- Token stored in localStorage (expires after ~1 hour, auto-refreshes)
- Data syncs bidirectionally: local → Sheets and Sheets → local
- All data also stored locally for offline use

That's it! Should take ~10 minutes total.

