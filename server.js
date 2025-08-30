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

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

// Gmail API routes
app.get('/api/gmail/auth-url', async (req, res) => {
  try {
    if (!gmailAvailable) {
      return res.status(503).json({ error: 'Gmail service not available' });
    }
    const authUrl = await gmailService.getAuthUrl();
    res.json({ authUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
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
