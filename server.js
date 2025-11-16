import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import GmailService from './backend/gmail-service.js';
import SearchService from './backend/search-service.js';
import UtilityService from './backend/utility-service.js';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize services
const gmailService = new GmailService();
const searchService = new SearchService();
const utilityService = new UtilityService();

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
          <p id="redirect-msg">Closing window...</p>
          <p>Gmail is now connected!</p>
          <script>
            // Check if we're in a popup or standalone mode
            const isPopup = window.opener && !window.opener.closed;

            if (isPopup) {
              // We're in a popup, auto-close immediately
              document.getElementById('redirect-msg').textContent = 'Closing window...';
              setTimeout(() => {
                window.close();
                // If window.close() doesn't work, show fallback message
                setTimeout(() => {
                  document.getElementById('redirect-msg').textContent = 'You can close this window now.';
                }, 500);
              }, 500);
            } else {
              // We're in standalone PWA mode, redirect back to app
              document.getElementById('redirect-msg').textContent = 'Redirecting back to app...';
              setTimeout(() => {
                window.location.href = '/';
              }, 1000);
            }
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
    res.json({ summary, emails: emails.slice(0, 5) }); // Include top 5 emails in summary
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
