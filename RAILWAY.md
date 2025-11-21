# Ti-Sang Deployment

Ti-Sang is now configured for Railway deployment with:

## Architecture
- **Frontend**: React + Vite (built to `/dist`)
- **Backend**: Express server with full API suite:
  - **Dual Voice Providers**: Choose between Gemini or OpenAI Realtime API
  - Gmail integration (read, send, search emails)
  - Calendar management
  - Web search and news
  - Weather, stock, crypto prices
  - Translation, definitions, Wikipedia
- **Port**: Uses `process.env.PORT` (Railway auto-assigns)

## Railway Deployment Steps

1. **Connect to Railway**:
   - Go to [railway.app](https://railway.app)
   - "New Project" → "Deploy from GitHub repo"
   - Select `Smarticus81/tisang`

2. **Set Environment Variables**:
   - In Railway project dashboard → Variables
   - **Voice Providers** (at least one required):
     - `GOOGLE_GENAI_API_KEY` = `your-google-genai-api-key` (for Gemini voice)
     - `OPENAI_API_KEY` = `your-openai-api-key` (for OpenAI Realtime voice)
   - **Optional APIs**:
     - `OPENWEATHER_API_KEY` = `your-openweather-api-key` (for weather)
     - `COINMARKETCAP_API_KEY` = `your-coinmarketcap-api-key` (for crypto)

3. **Deploy**:
   - Railway will auto-detect Node.js
   - Build command: `npm run build`
   - Start command: `npm start`
   - Railway assigns a public URL like `https://your-app.railway.app`

## Local Testing

Test the server locally:
```bash
npm run build
npm start
```

Visit `http://localhost:3000` - should serve the Ti-Sang app with working `/api/token`.

## Voice Provider Selection

Ti-Sang now supports **two voice providers** that you can switch between in the UI:

- **Gemini Multimodal Live API**: Google's latest multimodal voice model
  - Requires: `GOOGLE_GENAI_API_KEY`
  - WebSocket-based streaming
  - Voice: "Aoede"

- **OpenAI Realtime API**: OpenAI's GPT-4o real-time voice
  - Requires: `OPENAI_API_KEY`
  - WebRTC-based connection
  - Voice: "Shimmer"

Toggle between providers using the button in the bottom-right of the UI.

## Endpoints

- `/` - Ti-Sang React app
- `/health` - GET health check
- `/api/status` - Service status check
- `/api/gemini/stream` - WebSocket endpoint for Gemini voice
- `/api/openai/token` - WebSocket endpoint for OpenAI token generation
- `/api/gmail/*` - Gmail API endpoints
- `/api/calendar/*` - Calendar API endpoints
- `/api/search` - Web search
- `/api/weather` - Weather information
- `/api/stock`, `/api/crypto` - Financial data

Railway deployment is much simpler than Vercel for full-stack apps!
