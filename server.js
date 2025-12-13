import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import GmailService from './backend/gmail-service.js';
import SearchService from './backend/search-service.js';
import UtilityService from './backend/utility-service.js';
import GeminiService from './backend/gemini-service.js';

// Load environment variables
dotenv.config();

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize services
const gmailService = new GmailService();
const searchService = new SearchService();
const utilityService = new UtilityService();
const geminiService = new GeminiService();

// Initialize Gmail service
let gmailAvailable = false;
gmailService.initialize().then(available => {
  gmailAvailable = available;
  if (available) {
    console.log('Gmail service initialized');
  } else {
    console.log('Gmail service not available (missing credentials or token)');
  }
});

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

async function createOpenAIRealtimeEphemeralToken() {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    const err = new Error('OPENAI_API_KEY not configured');
    err.code = 'OPENAI_API_KEY_MISSING';
    throw err;
  }

  const model = process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview-2024-12-17';
  const voice = process.env.OPENAI_VOICE || 'fable';

  // Mint an ephemeral client secret on the server using a standard API key.
  // The browser uses the ephemeral key to connect directly to Realtime via WebRTC.
  const sessionConfig = {
    session: {
      type: 'realtime',
      model,
      audio: {
        output: {
          voice,
        },
      },
    },
  };

  const resp = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(sessionConfig),
  });

  const data = await resp.json().catch(() => null);

  if (!resp.ok) {
    const err = new Error('OpenAI error when creating realtime client secret');
    err.details = data || { status: resp.status, statusText: resp.statusText };
    throw err;
  }

  // Support multiple possible response shapes.
  // Typically: { client_secret: { value, expires_at }, session: {...} }
  // Sometimes: { value, expires_at, session: {...} }
  const token = data?.client_secret?.value ?? data?.value;
  const expires_at = data?.client_secret?.expires_at ?? data?.expires_at;

  if (!token) {
    const err = new Error('Invalid OpenAI response: missing client_secret token');
    err.details = data;
    throw err;
  }

  return { token, expires_at, model, voice };
}

// OpenAI Realtime ephemeral token endpoint (used by the browser for WebRTC auth)
app.options('/api/token', (_req, res) => res.status(204).end());
app.get('/api/token', async (_req, res) => {
  try {
    const result = await createOpenAIRealtimeEphemeralToken();
    res.setHeader('Cache-Control', 'no-store');
    res.json(result);
  } catch (err) {
    console.error('Failed to create OpenAI realtime token:', err);
    res.status(500).json({ error: err.message, details: err.details || null, code: err.code || null });
  }
});
app.post('/api/token', async (_req, res) => {
  try {
    const result = await createOpenAIRealtimeEphemeralToken();
    res.setHeader('Cache-Control', 'no-store');
    res.json(result);
  } catch (err) {
    console.error('Failed to create OpenAI realtime token:', err);
    res.status(500).json({ error: err.message, details: err.details || null, code: err.code || null });
  }
});

// Gmail API routes - PWA compatible OAuth
app.get('/api/gmail/auth-url', async (req, res) => {
  try {
    if (!gmailAvailable) {
      const available = await gmailService.initialize();
      if (!available) {
        return res.status(503).json({
          error: 'Gmail service not available. Please ensure gmail-credentials.json is configured.',
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

// OAuth redirect handler - PWA compatible
app.get('/api/gmail/auth-redirect', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).send(`
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body { 
                font-family: -apple-system, BlinkMacSystemFont, sans-serif; 
                background: #0a0a0f; 
                color: #fff; 
                display: flex; 
                align-items: center; 
                justify-content: center; 
                min-height: 100vh; 
                margin: 0;
                padding: 20px;
                text-align: center;
              }
              .container { max-width: 300px; }
              h2 { font-weight: 400; color: #fca5a5; margin-bottom: 16px; }
              p { color: rgba(255,255,255,0.6); font-size: 14px; }
              a { color: #7dd3fc; }
            </style>
          </head>
          <body>
            <div class="container">
              <h2>Authentication Failed</h2>
              <p>No authorization code received.</p>
              <p><a href="/">Return to Maylah</a></p>
            </div>
          </body>
        </html>
      `);
    }

    await gmailService.setAuthCode(code);
    gmailAvailable = true;

    // PWA-compatible redirect page
    res.send(`
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, sans-serif; 
              background: #0a0a0f; 
              color: #fff; 
              display: flex; 
              align-items: center; 
              justify-content: center; 
              min-height: 100vh; 
              margin: 0;
              padding: 20px;
              text-align: center;
            }
            .container { max-width: 300px; }
            h2 { font-weight: 400; color: #6ee7b7; margin-bottom: 16px; }
            p { color: rgba(255,255,255,0.6); font-size: 14px; margin: 8px 0; }
            .spinner {
              width: 24px;
              height: 24px;
              border: 2px solid rgba(125, 211, 252, 0.3);
              border-top-color: #7dd3fc;
              border-radius: 50%;
              animation: spin 1s linear infinite;
              margin: 20px auto;
            }
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Google Connected</h2>
            <p id="status">Closing window...</p>
            <div class="spinner" id="spinner"></div>
          </div>
          <script>
            (function() {
              const isPopup = window.opener && !window.opener.closed;
              const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                window.navigator.standalone === true;

              if (isPopup) {
                // We're in a popup - try to close
                document.getElementById('status').textContent = 'Closing window...';
                setTimeout(() => {
                  try {
                    window.close();
                  } catch(e) {}
                  // Fallback if close doesn't work
                  setTimeout(() => {
                    document.getElementById('status').textContent = 'You can close this window now.';
                    document.getElementById('spinner').style.display = 'none';
                  }, 500);
                }, 500);
              } else if (isStandalone) {
                // PWA standalone mode - redirect back to app
                document.getElementById('status').textContent = 'Returning to Maylah...';
                setTimeout(() => {
                  window.location.href = '/?auth_success=true';
                }, 800);
              } else {
                // Regular browser - redirect
                document.getElementById('status').textContent = 'Returning to Maylah...';
                setTimeout(() => {
                  window.location.href = '/?auth_success=true';
                }, 800);
              }
            })();
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send(`
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, sans-serif; 
              background: #0a0a0f; 
              color: #fff; 
              display: flex; 
              align-items: center; 
              justify-content: center; 
              min-height: 100vh; 
              margin: 0;
              padding: 20px;
              text-align: center;
            }
            .container { max-width: 300px; }
            h2 { font-weight: 400; color: #fca5a5; margin-bottom: 16px; }
            p { color: rgba(255,255,255,0.6); font-size: 14px; }
            a { color: #7dd3fc; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Authentication Error</h2>
            <p>${error.message}</p>
            <p><a href="/">Return to Maylah</a></p>
          </div>
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

// Send email
app.post('/api/gmail/send', async (req, res) => {
  try {
    if (!gmailAvailable) return res.status(503).json({ error: 'Gmail not authenticated' });
    const { to, subject, text, cc, bcc } = req.body;
    const result = await gmailService.sendEmail({ to, subject, text, cc, bcc });
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get email by ID
app.get('/api/gmail/email/:id', async (req, res) => {
  try {
    if (!gmailAvailable) return res.status(503).json({ error: 'Gmail not authenticated' });
    const email = await gmailService.getEmailById(req.params.id);
    res.json({ email });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete email
app.delete('/api/gmail/email/:id', async (req, res) => {
  try {
    if (!gmailAvailable) return res.status(503).json({ error: 'Gmail not authenticated' });
    const { permanent = false } = req.query;
    const result = await gmailService.deleteEmail(req.params.id, permanent === 'true');
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reply to email
app.post('/api/gmail/reply/:id', async (req, res) => {
  try {
    if (!gmailAvailable) return res.status(503).json({ error: 'Gmail not authenticated' });
    const { text, html } = req.body;
    const result = await gmailService.replyToEmail(req.params.id, text, html);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Summarize emails
app.post('/api/gmail/summarize', async (req, res) => {
  try {
    if (!gmailAvailable) return res.status(503).json({ error: 'Gmail not authenticated' });
    const { maxResults = 10 } = req.body;
    const emails = await gmailService.getRecentEmails(maxResults);
    const summary = await gmailService.summarizeEmails(emails);
    res.json({ summary, emails: emails.slice(0, 5) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create calendar event
app.post('/api/calendar/events', async (req, res) => {
  try {
    if (!gmailAvailable) return res.status(503).json({ error: 'Google not authenticated' });
    const { summary, description, start, end, timezone, attendees, location, reminders } = req.body;
    const result = await gmailService.createCalendarEvent({
      summary, description, start, end, timezone, attendees, location, reminders
    });
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List calendar events
app.get('/api/calendar/events', async (req, res) => {
  try {
    if (!gmailAvailable) return res.status(503).json({ error: 'Google not authenticated' });
    const { timeMin, timeMax, maxResults = 10, query } = req.query;
    const events = await gmailService.listCalendarEvents({
      timeMin, timeMax, maxResults: parseInt(maxResults), query
    });
    res.json({ events });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add action item to calendar
app.post('/api/calendar/action-item', async (req, res) => {
  try {
    if (!gmailAvailable) return res.status(503).json({ error: 'Google not authenticated' });
    const { actionItem, dueDate, priority = 'medium' } = req.body;
    const result = await gmailService.addActionItemToCalendar(actionItem, dueDate, priority);
    res.json({ success: true, result });
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

// Utility API routes
app.post('/api/weather', async (req, res) => {
  try {
    const { location, units = 'fahrenheit' } = req.body;
    if (!location) return res.status(400).json({ error: 'Location required' });
    const result = await utilityService.getWeather(location, units);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/calculate', async (req, res) => {
  try {
    const { expression } = req.body;
    if (!expression) return res.status(400).json({ error: 'Expression required' });
    const result = utilityService.calculate(expression);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/convert', async (req, res) => {
  try {
    const { value, from, to } = req.body;
    if (value === undefined || !from || !to) return res.status(400).json({ error: 'Value, from, to required' });
    const result = utilityService.convertUnits(value, from, to);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/translate', async (req, res) => {
  try {
    const { text, targetLanguage, sourceLanguage } = req.body;
    if (!text || !targetLanguage) return res.status(400).json({ error: 'Text and target language required' });
    const result = await utilityService.translateText(text, targetLanguage, sourceLanguage);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/definition', async (req, res) => {
  try {
    const { word } = req.body;
    if (!word) return res.status(400).json({ error: 'Word required' });
    const result = await utilityService.getDefinition(word);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/wikipedia', async (req, res) => {
  try {
    const { query, sentences = 3 } = req.body;
    if (!query) return res.status(400).json({ error: 'Query required' });
    const result = await utilityService.wikipediaSearch(query, sentences);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/stock', async (req, res) => {
  try {
    const { symbol } = req.body;
    if (!symbol) return res.status(400).json({ error: 'Stock symbol required' });
    const result = await utilityService.getStockPrice(symbol);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/crypto', async (req, res) => {
  try {
    const { symbol, currency = 'USD' } = req.body;
    if (!symbol) return res.status(400).json({ error: 'Crypto symbol required' });
    const result = await utilityService.getCryptoPrice(symbol, currency);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/time', async (req, res) => {
  try {
    const { timezone } = req.body;
    if (!timezone) return res.status(400).json({ error: 'Timezone required' });
    const result = utilityService.getTime(timezone);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/search/images', async (req, res) => {
  try {
    const { query, maxResults = 5 } = req.body;
    if (!query) return res.status(400).json({ error: 'Query required' });
    const result = await utilityService.searchImages(query, maxResults);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/search/videos', async (req, res) => {
  try {
    const { query, maxResults = 5 } = req.body;
    if (!query) return res.status(400).json({ error: 'Query required' });
    const result = await utilityService.searchVideos(query, maxResults);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/search/advanced', async (req, res) => {
  try {
    const { query, timeRange, site, maxResults } = req.body;
    if (!query) return res.status(400).json({ error: 'Query required' });
    const result = await utilityService.advancedWebSearch(query, { timeRange, site, maxResults });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Gmail setup page
app.get('/gmail-setup', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Maylah - Google Setup</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, sans-serif; 
            max-width: 700px; 
            margin: 0 auto; 
            padding: 20px; 
            line-height: 1.6;
            background: #0a0a0f;
            color: rgba(255,255,255,0.9);
          }
          .header { color: #7dd3fc; text-align: center; font-weight: 400; }
          .step { 
            background: rgba(255,255,255,0.03); 
            padding: 20px; 
            margin: 15px 0; 
            border-radius: 12px; 
            border-left: 3px solid #7dd3fc;
          }
          .step h3 { color: #7dd3fc; font-weight: 500; margin-top: 0; }
          .code { 
            background: rgba(255,255,255,0.08); 
            padding: 4px 8px; 
            border-radius: 4px; 
            font-family: monospace;
            font-size: 13px;
          }
          .button { 
            background: rgba(125, 211, 252, 0.15); 
            color: #7dd3fc;
            border: 1px solid rgba(125, 211, 252, 0.3);
            padding: 12px 24px; 
            text-decoration: none; 
            border-radius: 8px; 
            display: inline-block;
            margin: 10px 5px;
            font-size: 14px;
          }
          .button:hover { background: rgba(125, 211, 252, 0.25); }
          a { color: #7dd3fc; }
          ul, ol { color: rgba(255,255,255,0.7); }
          li { margin: 8px 0; }
        </style>
      </head>
      <body>
        <h1 class="header">Maylah - Google Setup</h1>
        
        <p style="text-align: center; color: rgba(255,255,255,0.6);">
          Connect your Google account to enable Gmail and Calendar features.
        </p>
        
        <div class="step">
          <h3>Step 1: Create Google Cloud Project</h3>
          <ol>
            <li>Go to <a href="https://console.cloud.google.com/" target="_blank">Google Cloud Console</a></li>
            <li>Create a new project or select an existing one</li>
            <li>Enable the Gmail API and Calendar API:
              <ul>
                <li>Go to "APIs & Services" > "Library"</li>
                <li>Search and enable "Gmail API"</li>
                <li>Search and enable "Google Calendar API"</li>
              </ul>
            </li>
          </ol>
        </div>

        <div class="step">
          <h3>Step 2: Create OAuth Credentials</h3>
          <ol>
            <li>Go to "APIs & Services" > "Credentials"</li>
            <li>Click "Create Credentials" > "OAuth 2.0 Client IDs"</li>
            <li>Configure OAuth consent screen if prompted:
              <ul>
                <li>User Type: External</li>
                <li>App name: "Maylah"</li>
                <li>Add your email as a test user</li>
              </ul>
            </li>
            <li>Create OAuth 2.0 Client ID:
              <ul>
                <li>Application type: "Web application"</li>
                <li>Name: "Maylah"</li>
                <li>Authorized redirect URIs: <span class="code">https://your-domain.com/api/gmail/auth-redirect</span></li>
              </ul>
            </li>
            <li>Download the JSON credentials file</li>
          </ol>
        </div>

        <div class="step">
          <h3>Step 3: Configure Credentials</h3>
          <ol>
            <li>Rename the downloaded file to <span class="code">gmail-credentials.json</span></li>
            <li>Place it in the <span class="code">backend/</span> folder</li>
            <li>Or set the <span class="code">GMAIL_CREDENTIALS_JSON</span> environment variable with the JSON contents</li>
          </ol>
        </div>

        <div class="step">
          <h3>Step 4: Authenticate</h3>
          <p>Once credentials are configured, open Maylah and:</p>
          <ul>
            <li>Tap the settings icon</li>
            <li>Tap "Connect" next to Google Account</li>
            <li>Or say "Connect my Google account"</li>
          </ul>
        </div>

        <div style="text-align: center; margin-top: 30px;">
          <a href="/" class="button">Back to Maylah</a>
          <a href="https://console.cloud.google.com/" target="_blank" class="button">Google Cloud Console</a>
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

const server = app.listen(PORT, () => {
  console.log(`Maylah server running on port ${PORT}`);
  geminiService.initialize(server);
});
