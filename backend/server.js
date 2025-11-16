import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import GmailService from './gmail-service.js';
import SearchService from './search-service.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize services
const gmailService = new GmailService();
const searchService = new SearchService();

// Initialize Gmail service
gmailService.initialize().then(success => {
  if (success) {
    console.log('Gmail service initialized successfully');
  } else {
    console.log('Gmail service initialization failed - features will be limited');
  }
});

app.use(cors());
app.use(express.json());

// Common session config used for creating ephemeral tokens
const SESSION_CONFIG = {
  session: {
    type: 'realtime',
    model: 'gpt-realtime',
    audio: {
      output: { voice: 'fable' }
    }
  }
};

async function createEphemeralToken() {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY in .env');
  }

  const resp = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(SESSION_CONFIG)
  });

  const data = await resp.json().catch(() => null);

  if (!resp.ok) {
    // Propagate OpenAI error details if available
    const details = data || { status: resp.status, statusText: resp.statusText };
    const err = new Error('OpenAI error when creating ephemeral token');
    err.details = details;
    throw err;
  }

  // Support multiple possible response shapes from the OpenAI endpoint.
  // Newer responses may return { client_secret: { value, expires_at }, session }
  // while some responses return { value, expires_at, session } directly.
  const token = data?.client_secret?.value ?? data?.value;
  const expires_at = data?.client_secret?.expires_at ?? data?.expires_at;

  if (!token) {
    const err = new Error('Invalid response from OpenAI: missing token');
    err.details = data;
    throw err;
  }

  return {
    token,
    expires_at,
    raw: data
  };
}

// Keep both endpoints for compatibility with examples
app.post('/api/token', async (req, res) => {
  try {
    const result = await createEphemeralToken();
    res.json(result);
  } catch (err) {
    console.error('Failed to create ephemeral token:', err);
    res.status(500).json({ error: err.message, details: err.details || null });
  }
});

app.get('/token', async (req, res) => {
  try {
    const result = await createEphemeralToken();
    res.json(result);
  } catch (err) {
    console.error('Failed to create ephemeral token (/token):', err);
    res.status(500).json({ error: err.message, details: err.details || null });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Gmail setup page
app.get('/gmail-setup', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Gmail Setup - Ti-Sang</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            code { background: #f4f4f4; padding: 2px 4px; border-radius: 3px; }
            pre { background: #f4f4f4; padding: 10px; border-radius: 5px; overflow-x: auto; }
            .step { margin: 20px 0; padding: 15px; border-left: 4px solid #007acc; background: #f9f9f9; }
        </style>
    </head>
    <body>
        <h1>Gmail Setup for Ti-Sang</h1>
        
        <div class="step">
            <h3>Step 1: Create Google Cloud Project</h3>
            <p>1. Go to <a href="https://console.cloud.google.com/" target="_blank">Google Cloud Console</a></p>
            <p>2. Create a new project or select an existing one</p>
        </div>

        <div class="step">
            <h3>Step 2: Enable Gmail API</h3>
            <p>1. In the Google Cloud Console, go to "APIs & Services" > "Library"</p>
            <p>2. Search for "Gmail API" and enable it</p>
        </div>

        <div class="step">
            <h3>Step 3: Create Credentials</h3>
            <p>1. Go to "APIs & Services" > "Credentials"</p>
            <p>2. Click "Create Credentials" > "OAuth client ID"</p>
            <p>3. Choose "Desktop application" as the application type</p>
            <p>4. Download the credentials JSON file</p>
        </div>

        <div class="step">
            <h3>Step 4: Setup OAuth Consent Screen</h3>
            <p>1. Go to "APIs & Services" > "OAuth consent screen"</p>
            <p>2. Choose "External" user type</p>
            <p>3. Fill in the required information</p>
            <p>4. Add your email to "Test users" if in testing mode</p>
        </div>

        <div class="step">
            <h3>Step 5: Configure Credentials</h3>
            <p>1. Save the downloaded JSON file as <code>gmail-credentials.json</code> in the backend folder</p>
            <p>2. The file should be in: <code>backend/gmail-credentials.json</code></p>
        </div>

        <div class="step">
            <h3>Step 6: Test Authentication</h3>
            <p>Once you've completed the setup, return to Ti-Sang and click "Setup Gmail" to authenticate!</p>
        </div>
    </body>
    </html>
  `);
});

// Gmail authentication endpoints
app.get('/api/gmail/auth-url', async (req, res) => {
  try {
    await gmailService.initialize();
    const authUrl = await gmailService.getAuthUrl();
    res.json({ authUrl });
  } catch (error) {
    console.error('Failed to get auth URL:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/gmail/auth-redirect', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).send('Authorization code not provided');
    }

    await gmailService.setAuthCode(code);
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
          <title>Gmail Authentication Complete</title>
          <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              .success { color: #28a745; font-size: 24px; margin-bottom: 20px; }
              .message { color: #666; font-size: 16px; }
          </style>
      </head>
      <body>
          <div class="success">✓ Gmail Authentication Successful!</div>
          <div class="message">Closing window...</div>
          <script>
              // Immediately try to close the window
              setTimeout(() => {
                  window.close();
                  // If window.close() doesn't work (browser security), show message
                  setTimeout(() => {
                      document.body.innerHTML = '<div class="success">✓ Gmail Authentication Successful!</div><div class="message">You can close this window now.</div>';
                  }, 500);
              }, 500);
          </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
          <title>Gmail Authentication Error</title>
          <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              .error { color: #dc3545; font-size: 24px; margin-bottom: 20px; }
              .message { color: #666; font-size: 16px; }
          </style>
      </head>
      <body>
          <div class="error">✗ Gmail Authentication Failed</div>
          <div class="message">Error: ${error.message}</div>
          <div class="message">Please try again or check your setup.</div>
      </body>
      </html>
    `);
  }
});

// Gmail API endpoints
app.get('/api/gmail/emails', async (req, res) => {
  try {
    const emails = await gmailService.getRecentEmails();
    res.json(emails);
  } catch (error) {
    console.error('Failed to get emails:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/gmail/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Query parameter required' });
    }
    const emails = await gmailService.searchEmails(q);
    res.json(emails);
  } catch (error) {
    console.error('Failed to search emails:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/gmail/status', async (req, res) => {
  try {
    // Try to make a simple API call to check if we're authenticated
    await gmailService.getRecentEmails(1);
    res.json({ authenticated: true, message: 'Gmail is connected and working' });
  } catch (error) {
    res.json({ authenticated: false, message: 'Gmail authentication required' });
  }
});

// Search API endpoints
app.get('/api/search', async (req, res) => {
  try {
    const { q, type = 'general' } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Query parameter required' });
    }
    
    let results;
    switch (type) {
      case 'news':
        results = await searchService.searchNews(q);
        break;
      case 'general':
      default:
        results = await searchService.search(q);
        break;
    }
    
    res.json(results);
  } catch (error) {
    console.error('Search failed:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
