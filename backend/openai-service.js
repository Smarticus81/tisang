import { WebSocketServer } from 'ws';

class OpenAIService {
    constructor() {
        this.apiKey = process.env.OPENAI_API_KEY;
        this.wss = null;
    }

    initialize(server) {
        if (!this.apiKey) {
            console.error('⚠️ OPENAI_API_KEY is missing. OpenAI features will be disabled.');
            return false;
        }

        try {
            this.wss = new WebSocketServer({ server, path: '/api/openai/token' });
            console.log('✅ OpenAI Service initialized');
            this.setupWebSocket();
            return true;
        } catch (error) {
            console.error('Failed to initialize OpenAI Service:', error);
            return false;
        }
    }

    setupWebSocket() {
        this.wss.on('connection', async (ws) => {
            console.log('🔌 Client connected to OpenAI Token Service');

            try {
                // Generate ephemeral token
                const token = await this.generateEphemeralToken();

                if (token.error) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: token.error
                    }));
                    ws.close();
                    return;
                }

                // Send token to client
                ws.send(JSON.stringify({
                    type: 'token',
                    data: {
                        token: token.client_secret.value,
                        expires_at: token.client_secret.expires_at
                    }
                }));

                console.log('✅ Sent ephemeral token to client');

            } catch (error) {
                console.error('Error generating token:', error);
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Failed to generate token'
                }));
                ws.close();
            }

            ws.on('error', (error) => {
                console.error('WebSocket error:', error);
            });

            ws.on('close', () => {
                console.log('Client disconnected from OpenAI Token Service');
            });
        });
    }

    async generateEphemeralToken() {
        try {
            const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'OpenAI-Beta': 'realtime=v1'
                },
                body: JSON.stringify({
                    model: 'gpt-4o-realtime-preview-2024-12-17',
                    voice: 'shimmer',
                    instructions: [
                        'You are a friendly, encouraging voice assistant named Ti-Sang.',
                        'Keep responses concise and natural.',
                        'You have access to various tools for email, calendar, web search, weather, and more.',
                        'Always refer to yourself as Ti-Sang.'
                    ].join(' ')
                })
            });

            if (!response.ok) {
                const error = await response.json();
                console.error('OpenAI API error:', error);
                return { error: error.error?.message || 'Failed to generate token' };
            }

            const data = await response.json();
            return data;

        } catch (error) {
            console.error('Failed to fetch ephemeral token:', error);
            return { error: error.message };
        }
    }
}

export default OpenAIService;
