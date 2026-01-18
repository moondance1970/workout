# How to Make Your Workout Tracker App Public

This guide explains how to make your app accessible to anyone (not just test users).

## Current Status

Your app is currently in **"Testing"** mode, which means:
- Only users you add as "test users" can sign in
- Limited to 100 test users maximum
- No Google verification required

## Making the App Public

To allow anyone to use your app, you need to **publish** it in Google Cloud Console. However, because your app uses sensitive scopes (Google Sheets and Drive access), Google requires verification.

### Option 1: Publish Without Verification (Limited)

**Note:** This option has restrictions and may not work for all users.

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Go to **APIs & Services** → **OAuth consent screen**
4. Scroll to the bottom
5. Click **"PUBLISH APP"**
6. You'll see a warning about verification - click **"Confirm"**

**Limitations:**
- Google may still show warnings to users
- Some users may be blocked
- Not recommended for production use

### Option 2: Full Verification (Recommended for Public Use)

To make your app fully public and trusted, you need to complete Google's verification process:

#### Step 1: Prepare Your App Information

1. Go to **APIs & Services** → **OAuth consent screen**
2. Fill out all required fields:
   - **App name**: "Workout Tracker" (or your preferred name)
   - **User support email**: Your email
   - **Developer contact information**: Your email
   - **App logo** (optional): Upload a logo
   - **App domain** (optional): Your Vercel URL or custom domain
   - **Application home page**: Your Vercel URL
   - **Privacy policy URL**: Required for verification
   - **Terms of service URL**: Required for verification

#### Step 2: Create Privacy Policy and Terms of Service

You'll need to create these pages. You can:
- Host them on your Vercel deployment
- Use a free service like GitHub Pages
- Create simple pages explaining:
  - What data you collect (Google Sheets access)
  - How you use it (storing workout data)
  - That data is stored in user's own Google Sheets

#### Step 3: Submit for Verification

1. In the OAuth consent screen, click **"PUBLISH APP"**
2. Click **"Submit for verification"**
3. Fill out the verification form:
   - Explain your app's purpose
   - Describe how you use the scopes
   - Provide any additional documentation

#### Step 4: Wait for Google's Review

- Verification can take **1-2 weeks**
- Google will review your app
- They may ask for additional information
- Once approved, your app will be public

### Option 3: Keep as Testing (Easiest for Personal Use)

If you only want to share with a small group:
- Keep the app in Testing mode
- Add users as "test users" (up to 100)
- No verification needed
- Works immediately

## Scopes Your App Uses

Your app requests these permissions:
- `https://www.googleapis.com/auth/spreadsheets` - **Sensitive scope** (requires verification)
- `https://www.googleapis.com/auth/drive.readonly` - **Sensitive scope** (requires verification)
- `https://www.googleapis.com/auth/userinfo.email` - Basic scope
- `https://www.googleapis.com/auth/userinfo.profile` - Basic scope

**Why verification is needed:** The Spreadsheets and Drive scopes are considered "sensitive" because they access user data. Google requires verification to ensure apps are legitimate and protect users.

## Quick Steps Summary

**For Personal/Small Group Use:**
1. Keep app in Testing mode
2. Add users as test users (up to 100)
3. Done! ✅

**For Public Use:**
1. Create Privacy Policy and Terms of Service pages
2. Complete OAuth consent screen information
3. Submit for Google verification
4. Wait 1-2 weeks for approval
5. Once approved, app is public! ✅

## Important Notes

- **Client ID is public**: Your OAuth Client ID is meant to be public (it's in your code)
- **API Key should be restricted**: Make sure your API Key is restricted to only Google Sheets API in Google Cloud Console
- **Data privacy**: Each user's data is stored in their own Google Sheet, so privacy is maintained
- **No backend needed**: Your app is client-side only, which simplifies deployment

## Need Help?

If you run into issues:
- Check Google Cloud Console for verification status
- Review Google's [OAuth verification guide](https://support.google.com/cloud/answer/9110914)
- Make sure all required fields in OAuth consent screen are filled out


