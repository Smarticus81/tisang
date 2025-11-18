# Gmail Setup Instructions for Ti-Sang

To enable Gmail features in Ti-Sang, you need to set up Google API credentials:

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Gmail API:
   - Go to "APIs & Services" > "Library"
   - Search for "Gmail API"
   - Click "Enable"

## Step 2: Create OAuth 2.0 Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth 2.0 Client IDs"
3. Configure OAuth consent screen if prompted:
   - User Type: External (for personal use)
   - App name: "Ti-Sang Voice Assistant"
   - User support email: your email
   - Scopes: Add Gmail API and Calendar API scopes
4. Create OAuth 2.0 Client ID:
   - Application type: "Web application"
   - Name: "Ti-Sang Web Client"
   - Authorized redirect URIs: 
     - `http://localhost:3000/api/gmail/auth-redirect`
     - `https://tisang-production.up.railway.app/api/gmail/auth-redirect` (if deploying)
5. Download the JSON file

## Step 3: Setup Credentials

1. Rename the downloaded file to `gmail-credentials.json`
2. Place it in the `backend/` folder of your Ti-Sang project
3. The file should look like this:
   ```json
   {
     "web": {
       "client_id": "your-client-id",
       "client_secret": "your-client-secret",
       "redirect_uris": ["http://localhost:3000/api/gmail/auth-redirect", "..."]
     }
   }
   ```

## Step 4: First-Time Authentication

1. Start Ti-Sang server
2. The first time you use Gmail features, you'll need to authenticate:
   - Ti-Sang will provide an authorization URL
   - Open the URL in your browser
   - Grant permissions to access your Gmail
   - Copy the authorization code back to Ti-Sang

## Supported Gmail Commands

Once set up, you can use these voice commands with Ti-Sang:

- **"Check my Gmail"** - Get recent emails
- **"Any new emails?"** - Check for new messages  
- **"Read my latest email"** - Get the most recent email
- **"Search for emails from [person]"** - Find emails from specific sender
- **"Find emails about [topic]"** - Search email content

## Security Notes

- Your credentials are stored locally only
- Ti-Sang only requests read-only access to your Gmail
- You can revoke access anytime in your Google Account settings
- The app follows Google's security best practices

## Troubleshooting

- If Gmail features aren't working, check that `gmail-credentials.json` exists in the `backend/` folder
- Make sure you've completed the OAuth flow at least once
- Check the server logs for any authentication errors

Gmail integration is optional - Ti-Sang works perfectly without it!
