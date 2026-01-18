// Serverless function to serve Google API credentials securely
// Environment variables are set in Vercel dashboard

export default function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Return config from environment variables
  // These are set in Vercel dashboard under Project Settings > Environment Variables
  const config = {
    CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
    API_KEY: process.env.GOOGLE_API_KEY || ''
  };

  // Set CORS headers to allow requests from your domain
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Content-Type', 'application/json');

  res.status(200).json(config);
}

