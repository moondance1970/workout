# Fix: Error 403: access_denied

If you're seeing "Access blocked: workout tracker has not completed the Google verification process", you need to add yourself as a test user.

## Quick Fix (2 minutes)

1. Go to **Google Cloud Console** → **APIs & Services** → **OAuth consent screen**

2. Scroll down to the **"Test users"** section

3. Click **"+ ADD USERS"**

4. Enter your Google email address (the one you're trying to sign in with):
   - Example: `ozietman@gmail.com`

5. Click **"Add"**

6. Click **"Save"** at the bottom

7. Try signing in again - it should work now!

## Why This Happens

When you first create an OAuth app, Google puts it in "Testing" mode. In this mode, only users you explicitly add as "test users" can sign in. This is a security feature.

## For Production Use

If you want to share the app with others later:
- You can add more test users (up to 100)
- Or publish the app (requires verification if using sensitive scopes)
- For personal use, test users are fine - no verification needed

## Still Not Working?

- Make sure you're using the exact email address you added
- Wait a minute after adding yourself (sometimes takes a moment to propagate)
- Clear your browser cache and try again
- Make sure you're signed in to the correct Google account

