export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
    }

    const SESSION_CONFIG = {
      session: {
        type: 'realtime',
        model: 'gpt-realtime',
        audio: {
          output: { voice: 'fable' }
        }
      }
    };

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
      return res.status(500).json({ error: 'OpenAI error', details: data });
    }

    const token = data?.client_secret?.value ?? data?.value;
    const expires_at = data?.client_secret?.expires_at ?? data?.expires_at;

    if (!token) return res.status(500).json({ error: 'Invalid OpenAI response' });

    return res.status(200).json({ token, expires_at });
  } catch (err) {
    return res.status(500).json({ error: (err && err.message) || 'Token error' });
  }
}
