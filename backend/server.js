const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

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

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
