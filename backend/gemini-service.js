import { WebSocketServer, WebSocket } from 'ws';

const MAYLAH_PERSONALITY = `You are Maylah, a laid-back but professional AI assistant. You're calm, collected, and genuinely helpful without being overly enthusiastic. Think of yourself as a knowledgeable friend who happens to be really good at getting things done.

Your communication style:
- Speak naturally and conversationally, but stay focused
- Use casual language when appropriate, but maintain professionalism for important tasks
- Don't use excessive exclamation points or overly cheerful language
- Be confident and direct - you know your stuff
- Occasionally show a dry sense of humor when it fits
- Keep responses concise - say what needs to be said without rambling
- When helping with tasks, be thorough but not verbose

You have access to various tools including Gmail, Google Calendar, web search, weather, stocks, crypto prices, calculator, unit conversion, Wikipedia and dictionary lookups, and time zone conversions.

When users ask to connect their Google account or set up Gmail/Calendar, use the google_auth_setup tool.
When users ask about their schedule, calendar, or meetings, use the calendar tools.
When users ask about emails, use the Gmail tools.
Always be helpful and get things done efficiently.`;

class GeminiService {
  constructor() {
    this.apiKey = process.env.GOOGLE_GENAI_API_KEY;
    this.model = 'gemini-2.0-flash-exp';
    this.wss = null;
  }

  initialize(server) {
    if (!this.apiKey) {
      console.error('GOOGLE_GENAI_API_KEY is missing. Gemini features will be disabled.');
      return false;
    }

    try {
      this.wss = new WebSocketServer({ server, path: '/api/gemini/stream' });
      console.log('Gemini Service initialized');
      this.setupWebSocket();
      return true;
    } catch (error) {
      console.error('Failed to initialize Gemini Service:', error);
      return false;
    }
  }

  setupWebSocket() {
    this.wss.on('connection', (ws) => {
      console.log('Client connected to Maylah');

      let geminiWs = null;
      let pendingToolCalls = new Map();
      let isGeminiReady = false;

      const connectToGemini = () => {
        try {
          const host = 'generativelanguage.googleapis.com';
          const path = `/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;
          const url = `wss://${host}${path}`;

          console.log('Connecting to Gemini Live API...');
          geminiWs = new WebSocket(url);

          geminiWs.on('open', () => {
            console.log('Connected to Gemini Live API');

            // Send setup message with proper format for Gemini Live API
            const setupMsg = {
              setup: {
                model: "models/gemini-2.0-flash-exp",
                generationConfig: {
                  responseModalities: ["AUDIO"],
                  speechConfig: {
                    voiceConfig: {
                      prebuiltVoiceConfig: {
                        voiceName: "Aoede"
                      }
                    }
                  }
                },
                systemInstruction: {
                  parts: [{ text: MAYLAH_PERSONALITY }]
                },
                tools: [{
                  functionDeclarations: [
                    {
                      name: "google_auth_setup",
                      description: "Initiates Google authentication for Gmail and Calendar access",
                      parameters: { type: "OBJECT", properties: {} }
                    },
                    {
                      name: "create_calendar_event",
                      description: "Creates a new event in Google Calendar",
                      parameters: {
                        type: "OBJECT",
                        properties: {
                          summary: { type: "STRING", description: "Title of the event" },
                          description: { type: "STRING", description: "Description of the event" },
                          start: { type: "STRING", description: "Start time in ISO 8601 format" },
                          end: { type: "STRING", description: "End time in ISO 8601 format" },
                          location: { type: "STRING", description: "Location of the event" }
                        },
                        required: ["summary", "start", "end"]
                      }
                    },
                    {
                      name: "list_calendar_events",
                      description: "Lists upcoming events from the calendar",
                      parameters: {
                        type: "OBJECT",
                        properties: {
                          maxResults: { type: "NUMBER", description: "Max events to return" },
                          query: { type: "STRING", description: "Search query" }
                        }
                      }
                    },
                    {
                      name: "get_emails",
                      description: "Retrieves recent emails from Gmail inbox",
                      parameters: {
                        type: "OBJECT",
                        properties: {
                          maxResults: { type: "NUMBER", description: "Max emails to return" }
                        }
                      }
                    },
                    {
                      name: "search_emails",
                      description: "Searches emails in Gmail",
                      parameters: {
                        type: "OBJECT",
                        properties: {
                          query: { type: "STRING", description: "Search query" },
                          maxResults: { type: "NUMBER", description: "Max results" }
                        },
                        required: ["query"]
                      }
                    },
                    {
                      name: "send_email",
                      description: "Sends an email via Gmail",
                      parameters: {
                        type: "OBJECT",
                        properties: {
                          to: { type: "STRING", description: "Recipient email" },
                          subject: { type: "STRING", description: "Email subject" },
                          text: { type: "STRING", description: "Email body" }
                        },
                        required: ["to", "subject", "text"]
                      }
                    },
                    {
                      name: "web_search",
                      description: "Searches the web for information",
                      parameters: {
                        type: "OBJECT",
                        properties: {
                          query: { type: "STRING", description: "Search query" }
                        },
                        required: ["query"]
                      }
                    },
                    {
                      name: "get_weather",
                      description: "Gets current weather for a location",
                      parameters: {
                        type: "OBJECT",
                        properties: {
                          location: { type: "STRING", description: "City or location" },
                          units: { type: "STRING", description: "fahrenheit or celsius" }
                        },
                        required: ["location"]
                      }
                    },
                    {
                      name: "calculate",
                      description: "Performs mathematical calculations",
                      parameters: {
                        type: "OBJECT",
                        properties: {
                          expression: { type: "STRING", description: "Math expression" }
                        },
                        required: ["expression"]
                      }
                    },
                    {
                      name: "get_stock_price",
                      description: "Gets current stock price",
                      parameters: {
                        type: "OBJECT",
                        properties: {
                          symbol: { type: "STRING", description: "Stock ticker symbol" }
                        },
                        required: ["symbol"]
                      }
                    },
                    {
                      name: "get_crypto_price",
                      description: "Gets cryptocurrency price",
                      parameters: {
                        type: "OBJECT",
                        properties: {
                          symbol: { type: "STRING", description: "Crypto name like bitcoin" }
                        },
                        required: ["symbol"]
                      }
                    },
                    {
                      name: "get_definition",
                      description: "Gets dictionary definition of a word",
                      parameters: {
                        type: "OBJECT",
                        properties: {
                          word: { type: "STRING", description: "Word to define" }
                        },
                        required: ["word"]
                      }
                    },
                    {
                      name: "wikipedia_search",
                      description: "Searches Wikipedia for information",
                      parameters: {
                        type: "OBJECT",
                        properties: {
                          query: { type: "STRING", description: "Topic to search" }
                        },
                        required: ["query"]
                      }
                    },
                    {
                      name: "convert_units",
                      description: "Converts between units of measurement",
                      parameters: {
                        type: "OBJECT",
                        properties: {
                          value: { type: "NUMBER", description: "Value to convert" },
                          from: { type: "STRING", description: "Source unit" },
                          to: { type: "STRING", description: "Target unit" }
                        },
                        required: ["value", "from", "to"]
                      }
                    },
                    {
                      name: "get_time",
                      description: "Gets current time in a timezone",
                      parameters: {
                        type: "OBJECT",
                        properties: {
                          timezone: { type: "STRING", description: "Timezone like America/New_York" }
                        },
                        required: ["timezone"]
                      }
                    },
                    {
                      name: "set_reminder",
                      description: "Creates a reminder as a calendar event",
                      parameters: {
                        type: "OBJECT",
                        properties: {
                          title: { type: "STRING", description: "Reminder title" },
                          dateTime: { type: "STRING", description: "When to remind (ISO 8601)" }
                        },
                        required: ["title", "dateTime"]
                      }
                    }
                  ]
                }]
              }
            };
            
            console.log('Sending setup message to Gemini...');
            geminiWs.send(JSON.stringify(setupMsg));
          });

          geminiWs.on('message', (data) => {
            try {
              const response = JSON.parse(data.toString());
              
              // Log for debugging
              if (response.setupComplete) {
                console.log('Gemini setup complete - ready for audio');
                isGeminiReady = true;
              }

              // Forward audio to client
              if (response.serverContent?.modelTurn?.parts) {
                const parts = response.serverContent.modelTurn.parts;
                for (const part of parts) {
                  if (part.inlineData && part.inlineData.mimeType.startsWith('audio/')) {
                    ws.send(JSON.stringify({
                      type: 'audio',
                      data: part.inlineData.data
                    }));
                  }
                }
              }

              // Handle tool calls
              if (response.toolCall) {
                const functionCalls = response.toolCall.functionCalls || [];
                for (const call of functionCalls) {
                  console.log('Tool call received:', call.name);
                  pendingToolCalls.set(call.id, call.name);
                  ws.send(JSON.stringify({
                    type: 'tool_call',
                    data: {
                      id: call.id,
                      name: call.name,
                      args: call.args
                    }
                  }));
                }
              }

              // Check for errors in response
              if (response.error) {
                console.error('Gemini error:', response.error);
                ws.send(JSON.stringify({ type: 'error', message: response.error.message || 'Gemini error' }));
              }

            } catch (e) {
              console.error('Error parsing Gemini message:', e);
            }
          });

          geminiWs.on('error', (err) => {
            console.error('Gemini WebSocket Error:', err.message);
            ws.send(JSON.stringify({ type: 'error', message: 'Connection error: ' + err.message }));
          });

          geminiWs.on('close', (code, reason) => {
            console.log('Gemini WebSocket closed. Code:', code, 'Reason:', reason?.toString() || 'none');
            isGeminiReady = false;
            // Don't immediately close client - let them know there was an issue
            ws.send(JSON.stringify({ type: 'error', message: 'Gemini connection closed' }));
          });

        } catch (e) {
          console.error('Failed to connect to Gemini:', e);
          ws.send(JSON.stringify({ type: 'error', message: 'Failed to connect to AI service' }));
        }
      };

      // Connect to Gemini when client connects
      connectToGemini();

      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message);

          if (!geminiWs || geminiWs.readyState !== WebSocket.OPEN) {
            console.log('Gemini not connected, ignoring message');
            return;
          }

          if (data.type === 'audio') {
            if (!isGeminiReady) {
              // Queue or skip audio until setup is complete
              return;
            }
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
            console.log('Session update received from client');
          } else if (data.type === 'conversation.item.create') {
            if (data.item.type === 'message' && data.item.role === 'user') {
              const text = data.item.content[0]?.text;
              if (text) {
                console.log('Sending text to Gemini:', text);
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
              }
            } else if (data.item.type === 'function_call_output') {
              const callName = pendingToolCalls.get(data.item.call_id) || 'unknown';
              let result;
              try {
                result = JSON.parse(data.item.output);
              } catch {
                result = { output: data.item.output };
              }
              
              const toolResponseMsg = {
                toolResponse: {
                  functionResponses: [{
                    id: data.item.call_id,
                    name: callName,
                    response: result
                  }]
                }
              };
              geminiWs.send(JSON.stringify(toolResponseMsg));
              pendingToolCalls.delete(data.item.call_id);
            }
          } else if (data.type === 'response.create') {
            const responseMsg = {
              clientContent: {
                turnComplete: true
              }
            };
            geminiWs.send(JSON.stringify(responseMsg));
          }
        } catch (error) {
          console.error('Error processing client message:', error);
        }
      });

      ws.on('close', () => {
        console.log('Client disconnected');
        if (geminiWs) {
          geminiWs.close();
          geminiWs = null;
        }
      });

      ws.on('error', (err) => {
        console.error('Client WebSocket error:', err);
      });
    });
  }
}

export default GeminiService;
