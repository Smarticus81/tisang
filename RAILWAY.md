# Ti-Sang Deployment

Ti-Sang is now configured for Railway deployment with:

## Architecture
- **Frontend**: React + Vite (built to `/dist`)
- **Backend**: Express server with full API suite:
  - Gmail integration (read, send, search emails)
  - Calendar management
  - Web search and news
  - Weather, stock, crypto prices
  - Translation, definitions, Wikipedia
  - Gemini Multimodal Live API (WebSocket-based voice)
- **Port**: Uses `process.env.PORT` (Railway auto-assigns)

## Railway Deployment Steps

1. **Connect to Railway**:
   - Go to [railway.app](https://railway.app)
   - "New Project" → "Deploy from GitHub repo"
   - Select `Smarticus81/tisang`

2. **Set Environment Variables**:
   - In Railway project dashboard → Variables
   - **Required**: `GOOGLE_GENAI_API_KEY` = `your-google-genai-api-key`
   - Optional: `OPENWEATHER_API_KEY` = `your-openweather-api-key` (for weather)
   - Optional: `COINMARKETCAP_API_KEY` = `your-coinmarketcap-api-key` (for crypto)
   - Optional: `OPENAI_API_KEY` = `your-openai-api-key` (for OpenAI features)

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

## Endpoints

- `/` - Ti-Sang React app
- `/health` - GET health check
- `/api/status` - Service status check
- `/api/gmail/*` - Gmail API endpoints
- `/api/calendar/*` - Calendar API endpoints
- `/api/search` - Web search
- `/api/weather` - Weather information
- `/api/stock`, `/api/crypto` - Financial data
- WebSocket endpoint for Gemini Multimodal Live API

Railway deployment is much simpler than Vercel for full-stack apps!
