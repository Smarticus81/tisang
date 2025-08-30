# Ti-Sang Deployment

Ti-Sang is now configured for Railway deployment with:

## Architecture
- **Frontend**: React + Vite (built to `/dist`)
- **Backend**: Express server serving static files + `/api/token` endpoint
- **Port**: Uses `process.env.PORT` (Railway auto-assigns)

## Railway Deployment Steps

1. **Connect to Railway**:
   - Go to [railway.app](https://railway.app)
   - "New Project" → "Deploy from GitHub repo"
   - Select `Smarticus81/tisang`

2. **Set Environment Variable**:
   - In Railway project dashboard → Variables
   - Add: `OPENAI_API_KEY` = `your-openai-api-key-here`

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
- `/api/token` - POST endpoint for OpenAI ephemeral tokens
- `/health` - GET health check

Railway deployment is much simpler than Vercel for full-stack apps!
