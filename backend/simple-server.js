import express from 'express';
import cors from 'cors';
import GmailService from './gmail-service.js';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const gmailService = new GmailService();

// Initialize Gmail service
gmailService.initialize().then(success => {
  console.log('Gmail init result:', success);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Gmail auth URL
app.get('/api/gmail/auth-url', async (req, res) => {
  try {
    await gmailService.initialize();
    const authUrl = await gmailService.getAuthUrl();
    res.json({ authUrl });
  } catch (error) {
    console.error('Auth URL error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Gmail auth redirect
app.get('/api/gmail/auth-redirect', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).send('No auth code provided');
    }

    console.log('Processing auth code:', code.substring(0, 20) + '...');
    await gmailService.setAuthCode(code);
    
    res.send(`
      <h1>✅ Gmail Authentication Successful!</h1>
      <p>You can now close this window and return to Ti-Sang.</p>
      <script>setTimeout(() => window.close(), 3000);</script>
    `);
  } catch (error) {
    console.error('Auth redirect error:', error);
    res.status(500).send(`
      <h1>❌ Authentication Failed</h1>
      <p>Error: ${error.message}</p>
    `);
  }
});

// Gmail status
app.get('/api/gmail/status', async (req, res) => {
  try {
    await gmailService.getRecentEmails(1);
    res.json({ authenticated: true });
  } catch (error) {
    res.json({ authenticated: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Simple Gmail server running on http://localhost:${PORT}`);
});
