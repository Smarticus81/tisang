import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import GmailService from './backend/gmail-service.js';
import SearchService from './backend/search-service.js';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize services
const gmailService = new GmailService();
const searchService = new SearchService();

// Initialize Gmail service
let gmailAvailable = false;
gmailService.initialize().then(available => {
  gmailAvailable = available;
  if (available) {
    console.log('✅ Gmail service initialized');
  } else {
    console.log('⚠️ Gmail service not available (missing credentials or token)');
  }
});

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

// Gmail API routes
app.get('/api/gmail/auth-url', async (req, res) => {
  try {
    if (!gmailAvailable) {
      // Try to reinitialize Gmail service
      const available = await gmailService.initialize();
      if (!available) {
        return res.status(503).json({ 
          error: 'Gmail service not available. Please ensure gmail-credentials.json is in the backend folder.',
          setup_url: '/gmail-setup'
        });
      }
      gmailAvailable = true;
    }
    const authUrl = await gmailService.getAuthUrl();
    res.json({ authUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/gmail/auth-redirect', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).send(`
        <html>
          <body>
            <h2>Gmail Authentication Failed</h2>
            <p>No authorization code received.</p>
            <p><a href="/">Return to Ti-Sang</a></p>
          </body>
        </html>
      `);
    }
    
    await gmailService.setAuthCode(code);
    gmailAvailable = true;
    
    res.send(`
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            .success { color: #CC5500; }
            .button { 
              background-color: #CC5500; 
              color: white; 
              padding: 10px 20px; 
              text-decoration: none; 
              border-radius: 5px; 
              display: inline-block;
              margin-top: 20px;
            }
          </style>
        </head>
        <body>
          <h2 class="success">✅ Gmail Authentication Successful!</h2>
          <p>Ti-Sang can now access your Gmail.</p>
          <p>You can now use voice commands like:</p>
          <ul style="text-align: left; display: inline-block;">
            <li>"Check my Gmail"</li>
            <li>"Any new emails?"</li>
            <li>"Search for emails from [person]"</li>
          </ul>
          <a href="/" class="button">Return to Ti-Sang</a>
          <script>
            // Auto-close after 5 seconds
            setTimeout(() => {
              window.close();
            }, 5000);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send(`
      <html>
        <body>
          <h2>Gmail Authentication Error</h2>
          <p>Error: ${error.message}</p>
          <p><a href="/">Return to Ti-Sang</a></p>
        </body>
      </html>
    `);
  }
});

app.post('/api/gmail/auth', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Authorization code required' });
    }
    
    await gmailService.setAuthCode(code);
    gmailAvailable = true;
    res.json({ success: true, message: 'Gmail authentication successful' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/gmail/emails', async (req, res) => {
  try {
    if (!gmailAvailable) {
      return res.status(503).json({ error: 'Gmail not authenticated' });
    }
    
    const maxResults = parseInt(req.query.maxResults) || 10;
    const emails = await gmailService.getRecentEmails(maxResults);
    res.json({ emails });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/gmail/search', async (req, res) => {
  try {
    if (!gmailAvailable) {
      return res.status(503).json({ error: 'Gmail not authenticated' });
    }
    
    const { query, maxResults = 5 } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Search query required' });
    }
    
    const emails = await gmailService.searchEmails(query, maxResults);
    res.json({ emails });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search API routes
app.post('/api/search', async (req, res) => {
  try {
    const { query, maxResults = 5 } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Search query required' });
    }
    
    const results = await searchService.search(query, maxResults);
    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/search/news', async (req, res) => {
  try {
    const { topic = 'technology', maxResults = 3 } = req.body;
    const results = await searchService.getNews(topic, maxResults);
    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/search/facts', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query required' });
    }
    
    const result = await searchService.getFactualInfo(query);
    res.json({ result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Gmail setup page
app.get('/gmail-setup', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Ti-Sang Gmail Setup</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            max-width: 800px; 
            margin: 0 auto; 
            padding: 20px; 
            line-height: 1.6;
          }
          .header { color: #CC5500; text-align: center; }
          .step { 
            background: #f5f5f5; 
            padding: 15px; 
            margin: 10px 0; 
            border-radius: 8px; 
            border-left: 4px solid #CC5500;
          }
          .code { 
            background: #e8e8e8; 
            padding: 2px 6px; 
            border-radius: 3px; 
            font-family: monospace;
          }
          .button { 
            background-color: #CC5500; 
            color: white; 
            padding: 10px 20px; 
            text-decoration: none; 
            border-radius: 5px; 
            display: inline-block;
            margin: 10px 5px;
          }
        </style>
      </head>
      <body>
        <h1 class="header">🔧 Ti-Sang Gmail Setup</h1>
        
        <p>To enable Gmail features in Ti-Sang, you need to set up Google API credentials:</p>
        
        <div class="step">
          <h3>Step 1: Create Google Cloud Project</h3>
          <ol>
            <li>Go to <a href="https://console.cloud.google.com/" target="_blank">Google Cloud Console</a></li>
            <li>Create a new project or select an existing one</li>
            <li>Enable the Gmail API:
              <ul>
                <li>Go to "APIs & Services" > "Library"</li>
                <li>Search for "Gmail API"</li>
                <li>Click "Enable"</li>
              </ul>
            </li>
          </ol>
        </div>

        <div class="step">
          <h3>Step 2: Create OAuth 2.0 Credentials</h3>
          <ol>
            <li>Go to "APIs & Services" > "Credentials"</li>
            <li>Click "Create Credentials" > "OAuth 2.0 Client IDs"</li>
            <li>Configure OAuth consent screen if prompted:
              <ul>
                <li>User Type: External (for personal use)</li>
                <li>App name: "Ti-Sang Voice Assistant"</li>
                <li>User support email: your email</li>
              </ul>
            </li>
            <li>Create OAuth 2.0 Client ID:
              <ul>
                <li>Application type: "Web application"</li>
                <li>Name: "Ti-Sang Gmail Client"</li>
                <li>Authorized redirect URIs: <span class="code">https://tisang-production.up.railway.app/api/gmail/auth-redirect</span></li>
              </ul>
            </li>
            <li>Download the JSON file</li>
          </ol>
        </div>

        <div class="step">
          <h3>Step 3: Setup Credentials</h3>
          <ol>
            <li>Rename the downloaded file to <span class="code">gmail-credentials.json</span></li>
            <li>Contact the developer to add these credentials to the server</li>
            <li>The file should contain your client ID and secret</li>
          </ol>
        </div>

        <div class="step">
          <h3>Step 4: Authentication</h3>
          <p>Once credentials are set up, you can authenticate by saying:</p>
          <ul>
            <li><strong>"Set up Gmail"</strong> - Ti-Sang will open the authentication window</li>
            <li><strong>"Connect my Gmail"</strong> - Alternative command</li>
          </ul>
        </div>

        <div style="text-align: center; margin-top: 30px;">
          <a href="/" class="button">← Back to Ti-Sang</a>
          <a href="https://console.cloud.google.com/" target="_blank" class="button">Google Cloud Console →</a>
        </div>
      </body>
    </html>
  `);
});

// Service status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    gmail: gmailAvailable,
    search: true,
    timestamp: new Date().toISOString()
  });
});

// API route for token generation
app.post('/api/token', async (req, res) => {
  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return res.status(500).json({ 
        error: 'OPENAI_API_KEY not configured', 
        code: 'CONFIG_MISSING'
      });
    }

    // Use the OpenAI Realtime API to get an ephemeral token for WebRTC
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'realtime=v1'
      },
      body: JSON.stringify({
        model: 'gpt-realtime',
        voice: 'echo'
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      return res.status(500).json({ 
        error: 'OpenAI API error', 
        status: response.status,
        details: data 
      });
    }

    const token = data.client_secret?.value;
    const expires_at = data.client_secret?.expires_at;

    if (!token) {
      return res.status(500).json({ 
        error: 'No token in OpenAI response', 
        data 
      });
    }

    return res.status(200).json({ token, expires_at });
  } catch (error) {
    return res.status(500).json({ 
      error: 'Server error', 
      message: error?.message || String(error)
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Serve static files from dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// Catch-all handler for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Ti-Sang server running on port ${PORT}`);
});
