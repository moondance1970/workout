# Deploy Workout Tracker to the Internet

Since you need to access it from the gym (where your computer won't be), let's deploy it to a free hosting service.

## Option 1: GitHub Pages (Recommended - Free & Easy)

### Step 1: Create a GitHub Repository

1. Go to [GitHub.com](https://github.com) and sign in
2. Click the **"+"** icon → **"New repository"**
3. Name it: `workout-tracker` (or whatever you want)
4. Make it **Public** (required for free GitHub Pages)
5. **Don't** initialize with README
6. Click **"Create repository"**

### Step 2: Upload Your Files

**Option A: Using GitHub Desktop (Easiest)**
1. Download [GitHub Desktop](https://desktop.github.com/)
2. Sign in and clone your repository
3. Copy all your files (`index.html`, `app.js`, `styles.css`) into the repository folder
4. Commit and push

**Option B: Using Git Command Line**
```bash
cd c:\dev\workout
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/workout-tracker.git
git push -u origin main
```

**Option C: Using GitHub Web Interface**
1. Go to your repository on GitHub
2. Click **"uploading an existing file"**
3. Drag and drop: `index.html`, `app.js`, `styles.css`
4. Click **"Commit changes"**

### Step 3: Enable GitHub Pages

1. Go to your repository on GitHub
2. Click **"Settings"** tab
3. Scroll to **"Pages"** in the left sidebar
4. Under **"Source"**, select **"main"** branch and **"/ (root)"**
5. Click **"Save"**
6. Your site will be at: `https://YOUR_USERNAME.github.io/workout-tracker/`

### Step 4: Update Google OAuth Settings

1. Go to **Google Cloud Console** → **APIs & Services** → **Credentials**
2. Click the edit icon (pencil) next to your OAuth client
3. Add to **Authorized JavaScript origins**:
   - `https://YOUR_USERNAME.github.io`
4. Add to **Authorized redirect URIs**:
   - `https://YOUR_USERNAME.github.io`
5. Click **"Save"**

### Step 5: Update Your Code (Optional - for cleaner URLs)

If you want a custom domain later, you can set it up. For now, the GitHub Pages URL works great!

## Option 2: Netlify (Also Free, Even Easier)

### Step 1: Sign Up
1. Go to [Netlify.com](https://netlify.com)
2. Sign up with GitHub (easiest)

### Step 2: Deploy
1. Click **"Add new site"** → **"Deploy manually"**
2. Drag and drop your `index.html`, `app.js`, and `styles.css` files
3. Your site is live! (You'll get a random URL like `random-name-123.netlify.app`)

### Step 3: Update OAuth Settings
1. Go to **Google Cloud Console** → **Credentials**
2. Edit your OAuth client
3. Add your Netlify URL to **Authorized JavaScript origins** and **Authorized redirect URIs**

### Step 4: Custom Domain (Optional)
- Netlify lets you set a custom domain for free
- Or use their free subdomain

## Option 3: Vercel (Also Free)

Similar to Netlify:
1. Go to [Vercel.com](https://vercel.com)
2. Sign up with GitHub
3. Import your repository
4. Deploy automatically

## Which Should You Choose?

- **GitHub Pages**: Best if you want to keep code on GitHub
- **Netlify**: Easiest drag-and-drop deployment
- **Vercel**: Great for developers, automatic deployments

All are **100% free** for personal use!

## After Deployment

1. **Update OAuth settings** with your new URL (important!)
2. **Test sign-in** from your phone
3. **Add to home screen** on your phone for quick access
4. Your data will sync via Google Sheets, so it works from anywhere!

## Security Note

Since your Client ID and API Key are in the code, consider:
- Using environment variables (Netlify/Vercel support this)
- Or just keep the API Key restricted to Google Sheets API only (which you should do anyway)

The Client ID is meant to be public, but the API Key should be restricted.

