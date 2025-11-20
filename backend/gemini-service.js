import { WebSocketServer, WebSocket } from 'ws';

class GeminiService {
    constructor() {
        this.apiKey = process.env.GOOGLE_GENAI_API_KEY;
        this.model = 'gemini-2.0-flash-exp';
        this.wss = null;
    }

    initialize(server) {
        if (!this.apiKey) {
            console.error('⚠️ GOOGLE_GENAI_API_KEY is missing. Gemini features will be disabled.');
            return false;
        }

        try {
            this.wss = new WebSocketServer({ server, path: '/api/gemini/stream' });
            console.log('✅ Gemini Service initialized');
            this.setupWebSocket();
            return true;
        } catch (error) {
            console.error('Failed to initialize Gemini Service:', error);
            return false;
        }
    }

    setupWebSocket() {
        this.wss.on('connection', (ws) => {
            console.log('🔌 Client connected to Gemini Stream');

            let geminiWs = null;

            try {
                // Connect to Gemini Multimodal Live API
                const host = 'generativelanguage.googleapis.com';
                const path = `/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;
                const url = `wss://${host}${path}`;

                geminiWs = new WebSocket(url);

                geminiWs.on('open', () => {
                    console.log('✅ Connected to Google Gemini Live API');

                    // Initial setup message
                    const setupMsg = {
                        setup: {
                            model: "models/gemini-2.0-flash-exp", // Using latest available model for live
                            generationConfig: {
                                responseModalities: ["AUDIO"]
                            }
                        }
                    };
                    geminiWs.send(JSON.stringify(setupMsg));
                });

                geminiWs.on('message', (data) => {
                    try {
                        const response = JSON.parse(data.toString());

                        // Forward audio to client
                        if (response.serverContent?.modelTurn?.parts) {
                            const parts = response.serverContent.modelTurn.parts;
                            for (const part of parts) {
                                if (part.inlineData && part.inlineData.mimeType.startsWith('audio/')) {
                                    // Forward audio chunk
                                    ws.send(JSON.stringify({
                                        type: 'audio',
                                        data: part.inlineData.data
                                    }));
                                }
                            }
                        }

                        // Handle tool calls
                        if (response.toolCall) {
                            const functionCalls = response.toolCall.functionCalls;
                            // We'll forward these to the client to handle for now, 
                            // or handle them here if they are backend-only.
                            // For this architecture, we'll let the client handle them 
                            // since the tools are defined there.
                            // BUT, the current architecture defines tools in the frontend 
                            // and sends them via 'session.update'.
                            // We need to ensure we forward the tool calls to the client.

                            // Actually, for Bidi, we need to send tool responses back to Gemini.
                            // Let's forward the tool call to the client.
                            ws.send(JSON.stringify({
                                type: 'tool_call',
                                data: response.toolCall
                            }));
                        }

                        if (response.serverContent?.turnComplete) {
                            // Turn complete
                        }

                    } catch (e) {
                        console.error('Error parsing Gemini message:', e);
                    }
                });

                geminiWs.on('error', (err) => {
                    console.error('Gemini WebSocket Error:', err);
                    ws.send(JSON.stringify({ type: 'error', message: 'Gemini connection error' }));
                });

                geminiWs.on('close', () => {
                    console.log('Gemini WebSocket closed');
                    ws.close();
                });

            } catch (e) {
                console.error('Failed to connect to Gemini:', e);
                ws.close();
                return;
            }

            ws.on('message', async (message) => {
                try {
                    const data = JSON.parse(message);

                    if (geminiWs.readyState === WebSocket.OPEN) {
                        if (data.type === 'audio') {
                            // Send audio chunk to Gemini
                            const audioMsg = {
                                realtimeInput: {
                                    mediaChunks: [{
                                        mimeType: "audio/pcm",
                                        data: data.data
                                    }]
                                }
                            };
                            geminiWs.send(JSON.stringify(audioMsg));
                        } else if (data.type === 'session.update') {
                            // Handle session update (tools, etc.)
                            // We might need to send a tool definition update to Gemini
                            // The Bidi API handles this via 'setup' or 'toolConfig' messages.
                            // For now, we'll assume the initial setup is enough or we adapt this.

                            // If the client sends tools, we should send them to Gemini.
                            if (data.session && data.session.tools) {
                                // Construct tool definition message
                                const toolMsg = {
                                    toolConfig: {
                                        functionCallingConfig: {
                                            mode: "AUTO"
                                        }
                                    },
                                    tools: data.session.tools
                                };
                                // Note: In Bidi API, tools are usually sent in the 'setup' message.
                                // Sending them mid-stream might not be supported or requires a specific message.
                                // We will log this for now.
                                console.log('Received tool definitions from client');
                            }
                        } else if (data.type === 'conversation.item.create') {
                            // Handle text input or other items
                            if (data.item.type === 'message' && data.item.role === 'user') {
                                const text = data.item.content[0].text;
                                const textMsg = {
                                    clientContent: {
                                        turns: [{
                                            role: "user",
                                            parts: [{ text: text }]
                                        }],
                                        turnComplete: true
                                    }
                                };
                                geminiWs.send(JSON.stringify(textMsg));
                            } else if (data.item.type === 'function_call_output') {
                                // Handle tool response
                                const toolResponseMsg = {
                                    toolResponse: {
                                        functionResponses: [{
                                            id: data.item.call_id,
                                            name: "unknown", // We might need to track this
                                            response: { result: JSON.parse(data.item.output) }
                                        }]
                                    }
                                };
                                geminiWs.send(JSON.stringify(toolResponseMsg));
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error processing client message:', error);
                }
            });

            ws.on('close', () => {
                console.log('Client disconnected');
                if (geminiWs) geminiWs.close();
            });
        });
    }
}

export default GeminiService;
