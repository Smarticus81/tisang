import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Add CORS headers for debugging
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return res.status(500).json({ 
        error: 'OPENAI_API_KEY not configured', 
        code: 'CONFIG_MISSING',
        env_keys: Object.keys(process.env).filter(k => k.includes('OPENAI'))
      });
    }
    // Use the most straightforward realtime ephemeral token request
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'realtime=v1'
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview-2024-12-17',
        voice: 'alloy'
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
  } catch (error: unknown) {
    return res.status(500).json({ 
      error: 'Server error', 
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
  }
}