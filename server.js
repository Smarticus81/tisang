const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

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

    // Use the OpenAI Realtime API to get an ephemeral token
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'realtime=v1'
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview-2024-12-17',
        voice: 'fable'
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
