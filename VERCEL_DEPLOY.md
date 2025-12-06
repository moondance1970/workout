# Deploy to Vercel - Step by Step Guide

This guide will walk you through deploying your Workout Tracker to Vercel, which will make it accessible from your phone!

## What We've Set Up

✅ **Serverless Function**: `api/config.js` - Securely serves your credentials  
✅ **Vercel Config**: `vercel.json` - Configuration for deployment  
✅ **Updated App**: `app.js` - Now fetches config from API when deployed

## Step 1: Sign Up for Vercel

1. Go to [https://vercel.com](https://vercel.com)
2. Click **"Sign Up"**
3. Choose **"Continue with GitHub"** (easiest - connects to your existing GitHub account)
4. Authorize Vercel to access your GitHub repositories

## Step 2: Deploy Your Project

1. After signing in, click **"Add New..."** → **"Project"**
2. Find and select your repository: **`moondance1970/workout`**
3. Click **"Import"**
4. Vercel will auto-detect your project settings:
   - **Framework Preset**: Other (or leave as default)
   - **Root Directory**: `./` (root)
   - **Build Command**: Leave empty (no build needed for static site)
   - **Output Directory**: Leave empty
5. Click **"Deploy"**

## Step 3: Add Environment Variables

**This is the important part - this is where your credentials go securely!**

1. While your project is deploying, click on your project name
2. Go to **"Settings"** tab
3. Click **"Environment Variables"** in the left sidebar
4. Add these two variables:

   **Variable 1:**
   - **Name**: `GOOGLE_CLIENT_ID`
   - **Value**: `964380264058-m7j567ft35l5pqne7o5qngh24gf2k07e.apps.googleusercontent.com`
   - **Environment**: Select all (Production, Preview, Development)
   - Click **"Save"**

   **Variable 2:**
   - **Name**: `GOOGLE_API_KEY`
   - **Value**: `AIzaSyA2XLn8HAIMp1bkuG81WF8E32Jf3ngnet4`
   - **Environment**: Select all (Production, Preview, Development)
   - Click **"Save"**

5. After adding variables, go to **"Deployments"** tab
6. Click the **"..."** menu on your latest deployment
7. Click **"Redeploy"** (this applies the new environment variables)

## Step 4: Update Google OAuth Settings

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Credentials**
2. Click the edit icon (pencil) next to your OAuth 2.0 Client ID
3. Add to **Authorized JavaScript origins**:
   - Your Vercel URL (e.g., `https://workout-xxxxx.vercel.app`)
   - Or your custom domain if you set one up
4. Add to **Authorized redirect URIs**:
   - Your Vercel URL (e.g., `https://workout-xxxxx.vercel.app`)
   - Or your custom domain if you set one up
5. Click **"Save"**

## Step 5: Access from Your Phone!

1. Once deployed, Vercel will give you a URL like: `https://workout-xxxxx.vercel.app`
2. Open this URL on your phone's browser
3. **Add to Home Screen**:
   - **iOS**: Tap Share button → "Add to Home Screen"
   - **Android**: Tap Menu (3 dots) → "Add to Home Screen" or "Install App"

## What You've Learned! 🎓

By deploying to Vercel, you've learned:
- ✅ **Serverless Functions** - API endpoints that run on-demand
- ✅ **Environment Variables** - Secure way to store credentials
- ✅ **Modern Deployment** - CI/CD with automatic deployments
- ✅ **Edge Computing** - Your app runs on Vercel's global network

## Automatic Deployments

Every time you push to GitHub, Vercel will automatically:
- Detect the changes
- Build and deploy your app
- Give you a preview URL for each commit

## Custom Domain (Optional)

1. Go to **Settings** → **Domains**
2. Add your custom domain (if you have one)
3. Follow Vercel's DNS instructions
4. Update Google OAuth settings with your custom domain

## Troubleshooting

**"Config not loading"**
- Check that environment variables are set correctly
- Make sure you redeployed after adding variables
- Check browser console for errors

**"OAuth not working"**
- Verify your Vercel URL is in Google OAuth authorized origins
- Check that the URL matches exactly (including https://)

**"Function not found"**
- Make sure `api/config.js` exists
- Check that `vercel.json` is in the root directory

## Local Development

Your app still works locally! It will:
- Use `config.js` when running locally (if it exists)
- Fall back to API endpoint when `config.js` is not available

To test locally:
```bash
# Make sure config.js exists with your credentials
# Then run your local server
python -m http.server 8000
```

## Security Notes

✅ **Credentials are secure**: Stored as environment variables, never in code  
✅ **API endpoint**: Only serves config, credentials never exposed to browser directly  
✅ **Git-safe**: `config.js` is in `.gitignore`, won't be committed

---

**Congratulations!** Your workout tracker is now live and accessible from anywhere! 🎉

