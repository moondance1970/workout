#!/bin/bash
echo "Starting local web server..."
echo ""
echo "Open your browser and go to: http://localhost:8000"
echo ""
echo "To access from your phone:"
echo "1. Make sure phone and computer are on same Wi-Fi"
echo "2. Find your computer's IP address (run: ifconfig or ip addr)"
echo "3. On phone, go to: http://YOUR_IP:8000"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""
python3 -m http.server 8000 --bind 0.0.0.0

