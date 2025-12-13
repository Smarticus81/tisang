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

You have access to various tools including:
- Gmail (read, search, send emails)
- Google Calendar (view, create events, set reminders)
- Web search for current information
- Weather, stocks, crypto prices
- Calculator, unit conversion
- Wikipedia and dictionary lookups
- Time zone conversions

When users ask to connect their Google account or set up Gmail/Calendar, use the google_auth_setup tool.
When users ask about their schedule, calendar, or meetings, use the calendar tools.
When users ask about emails, use the Gmail tools.
Always be helpful and get things done efficiently.`;

// Tool definitions for Gemini
const TOOL_DEFINITIONS = {
  google_auth_setup: {
    name: "google_auth_setup",
    description: "Initiates Google authentication for Gmail and Calendar access when the user asks to connect or set up their Google account.",
    parameters: { type: "object", properties: {} }
  },
  create_calendar_event: {
    name: "create_calendar_event",
    description: "Creates a new event in the user's Google Calendar.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Title of the event" },
        description: { type: "string", description: "Description of the event" },
        start: { type: "string", description: "Start time in ISO 8601 format" },
        end: { type: "string", description: "End time in ISO 8601 format" },
        location: { type: "string", description: "Location of the event" },
        attendees: { type: "array", items: { type: "string" }, description: "Email addresses to invite" }
      },
      required: ["summary", "start", "end"]
    }
  },
  list_calendar_events: {
    name: "list_calendar_events",
    description: "Lists upcoming events from the user's calendar.",
    parameters: {
      type: "object",
      properties: {
        maxResults: { type: "number", description: "Max events to return" },
        timeMin: { type: "string", description: "Start time filter (ISO 8601)" },
        timeMax: { type: "string", description: "End time filter (ISO 8601)" },
        query: { type: "string", description: "Search query" }
      }
    }
  },
  get_emails: {
    name: "get_emails",
    description: "Retrieves recent emails from Gmail inbox.",
    parameters: {
      type: "object",
      properties: {
        maxResults: { type: "number", description: "Max emails to return (default 5)" }
      }
    }
  },
  search_emails: {
    name: "search_emails",
    description: "Searches emails in Gmail.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        maxResults: { type: "number", description: "Max results" }
      },
      required: ["query"]
    }
  },
  send_email: {
    name: "send_email",
    description: "Sends an email via Gmail.",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email" },
        subject: { type: "string", description: "Email subject" },
        text: { type: "string", description: "Email body" },
        cc: { type: "string", description: "CC recipients" },
        bcc: { type: "string", description: "BCC recipients" }
      },
      required: ["to", "subject", "text"]
    }
  },
  web_search: {
    name: "web_search",
    description: "Searches the web for information.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        maxResults: { type: "number", description: "Max results" }
      },
      required: ["query"]
    }
  },
  get_weather: {
    name: "get_weather",
    description: "Gets current weather for a location.",
    parameters: {
      type: "object",
      properties: {
        location: { type: "string", description: "City or location" },
        units: { type: "string", description: "fahrenheit or celsius" }
      },
      required: ["location"]
    }
  },
  calculate: {
    name: "calculate",
    description: "Performs mathematical calculations.",
    parameters: {
      type: "object",
      properties: {
        expression: { type: "string", description: "Math expression" }
      },
      required: ["expression"]
    }
  },
  get_stock_price: {
    name: "get_stock_price",
    description: "Gets current stock price.",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Stock ticker (e.g., AAPL)" }
      },
      required: ["symbol"]
    }
  },
  get_crypto_price: {
    name: "get_crypto_price",
    description: "Gets cryptocurrency price.",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Crypto name (e.g., bitcoin)" },
        currency: { type: "string", description: "Display currency" }
      },
      required: ["symbol"]
    }
  },
  get_definition: {
    name: "get_definition",
    description: "Gets dictionary definition of a word.",
    parameters: {
      type: "object",
      properties: {
        word: { type: "string", description: "Word to define" }
      },
      required: ["word"]
    }
  },
  wikipedia_search: {
    name: "wikipedia_search",
    description: "Searches Wikipedia for information.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Topic to search" }
      },
      required: ["query"]
    }
  },
  convert_units: {
    name: "convert_units",
    description: "Converts between units.",
    parameters: {
      type: "object",
      properties: {
        value: { type: "number", description: "Value to convert" },
        from: { type: "string", description: "Source unit" },
        to: { type: "string", description: "Target unit" }
      },
      required: ["value", "from", "to"]
    }
  },
  get_time: {
    name: "get_time",
    description: "Gets current time in a timezone.",
    parameters: {
      type: "object",
      properties: {
        timezone: { type: "string", description: "Timezone (e.g., America/New_York)" }
      },
      required: ["timezone"]
    }
  },
  set_reminder: {
    name: "set_reminder",
    description: "Creates a reminder as a calendar event.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Reminder title" },
        dateTime: { type: "string", description: "When to remind (ISO 8601)" },
        priority: { type: "string", description: "low, medium, or high" }
      },
      required: ["title", "dateTime"]
    }
  }
};

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

      try {
        const host = 'generativelanguage.googleapis.com';
        const path = `/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;
        const url = `wss://${host}${path}`;

        geminiWs = new WebSocket(url);

        geminiWs.on('open', () => {
          console.log('Connected to Gemini Live API');

          // Convert tool definitions to Gemini format
          const tools = Object.values(TOOL_DEFINITIONS).map(tool => ({
            functionDeclarations: [{
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters
            }]
          }));

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
              tools: tools
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

            if (response.setupComplete) {
              console.log('Gemini setup complete');
            }

          } catch (e) {
            console.error('Error parsing Gemini message:', e);
          }
        });

        geminiWs.on('error', (err) => {
          console.error('Gemini WebSocket Error:', err);
          ws.send(JSON.stringify({ type: 'error', message: 'Connection error' }));
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
              // Client sent session update - we handle tools server-side now
              console.log('Session update received from client');
            } else if (data.type === 'conversation.item.create') {
              if (data.item.type === 'message' && data.item.role === 'user') {
                const text = data.item.content[0]?.text;
                if (text) {
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
              // Trigger response generation
              const responseMsg = {
                clientContent: {
                  turnComplete: true
                }
              };
              geminiWs.send(JSON.stringify(responseMsg));
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
