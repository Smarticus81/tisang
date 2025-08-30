import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return res.status(500).json({ error: 'OPENAI_API_KEY not configured', code: 'CONFIG_MISSING' });
    }
    // Try multiple compatible endpoints and model names to mint an ephemeral client token
    const models = [
      'gpt-4o-realtime-preview-2024-12-17',
      'gpt-4o-realtime-preview',
      'gpt-realtime',
    ];
    type Attempt = { url: string; headers: Record<string, string>; body: unknown };
    const attempts: Attempt[] = [];
    for (const model of models) {
      // Preferred: sessions endpoint (returns client_secret)
      attempts.push({
        url: 'https://api.openai.com/v1/realtime/sessions',
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'OpenAI-Beta': 'realtime=v1',
        },
        body: { model, voice: 'fable' },
      });
      // Fallback: client_secrets endpoint
      attempts.push({
        url: 'https://api.openai.com/v1/realtime/client_secrets',
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'OpenAI-Beta': 'realtime=v1',
        },
        body: { model, voice: 'fable' },
      });
    }

  let lastErr: unknown = null;
    for (const attempt of attempts) {
      try {
        const resp = await fetch(attempt.url, {
          method: 'POST',
          headers: attempt.headers,
          body: JSON.stringify(attempt.body),
        });
  const data = await resp.json().catch(() => null);
        if (!resp.ok) {
          lastErr = { status: resp.status, data };
          continue;
        }
  const token = (data && (data.client_secret?.value ?? data.value)) as string | undefined;
  const expires_at = (data && (data.client_secret?.expires_at ?? data.expires_at)) as number | undefined;
        if (!token) {
          lastErr = { status: resp.status, data };
          continue;
        }
        return res.status(200).json({ token, expires_at });
      } catch (e: unknown) {
        if (e instanceof Error) {
          lastErr = { message: e.message };
        } else {
          lastErr = { message: String(e) };
        }
      }
    }

    return res.status(500).json({ error: 'Failed to mint realtime client token', details: lastErr || null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message || 'Token error' });
  }
}
