# Access Workout Tracker from Your Phone

## Step 1: Find Your Computer's IP Address

### Windows:
1. Open **Command Prompt** or **PowerShell**
2. Type: `ipconfig`
3. Look for **"IPv4 Address"** under your active network adapter
   - Usually looks like: `192.168.1.xxx` or `10.0.0.xxx`

### Mac/Linux:
1. Open **Terminal**
2. Type: `ifconfig` (Mac/Linux) or `ip addr` (Linux)
3. Look for your local IP address (usually starts with 192.168 or 10.0)

## Step 2: Make Sure Phone and Computer Are on Same Network

- Both devices must be on the **same Wi-Fi network**
- Your phone's Wi-Fi and your computer's Wi-Fi must be the same network

## Step 3: Start the Server (Allow External Connections)

### Windows (PowerShell/Command Prompt):
```bash
python -m http.server 8000 --bind 0.0.0.0
```

### Mac/Linux:
```bash
python3 -m http.server 8000 --bind 0.0.0.0
```

The `--bind 0.0.0.0` allows connections from other devices on your network.

## Step 4: Access from Your Phone

1. Open your phone's web browser (Chrome, Safari, etc.)
2. Type in the address bar:
   ```
   http://YOUR_IP_ADDRESS:8000
   ```
   Replace `YOUR_IP_ADDRESS` with the IP you found in Step 1
   
   Example: `http://192.168.1.100:8000`

3. The workout tracker should load!

## Step 5: Add to Home Screen (Optional)

### iPhone:
1. Open the app in Safari
2. Tap the **Share** button (square with arrow)
3. Tap **"Add to Home Screen"**
4. Name it "Workout Tracker"
5. Tap **"Add"**

### Android:
1. Open the app in Chrome
2. Tap the **Menu** (three dots)
3. Tap **"Add to Home screen"** or **"Install app"**
4. Name it "Workout Tracker"
5. Tap **"Add"** or **"Install"**

Now you have a quick icon on your home screen!

## Troubleshooting

**Can't connect?**
- Make sure both devices are on the same Wi-Fi
- Check Windows Firewall isn't blocking port 8000
- Try temporarily disabling firewall to test
- Make sure the server is running with `--bind 0.0.0.0`

**Connection refused?**
- Make sure the server is still running
- Check you're using the correct IP address
- Try `http://` not `https://`

**Works on computer but not phone?**
- Check firewall settings
- Make sure you used `--bind 0.0.0.0` when starting the server

## For Permanent Access (Advanced)

If you want to access it from anywhere (not just same Wi-Fi), you'd need to:
- Use a service like ngrok (temporary)
- Set up port forwarding on your router
- Deploy to a hosting service (GitHub Pages, Netlify, etc.)

For now, same Wi-Fi network is the easiest solution!

