import React, { useState, useRef, useEffect, useCallback } from 'react';
import './App.css';

// Type declarations
declare global {
  interface Window {
    SpeechRecognition?: SRConstructor;
    webkitSpeechRecognition?: SRConstructor;
  }
}

interface SpeechRecognitionAlternative { transcript: string; confidence: number }
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message?: string;
}
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: SpeechRecognitionEvent) => unknown) | null;
  onend: ((ev: Event) => unknown) | null;
  onerror: ((ev: SpeechRecognitionErrorEvent) => unknown) | null;
  onstart?: ((ev: Event) => unknown) | null;
  start(): void;
  stop(): void;
}
type SRConstructor = new () => SpeechRecognition;

// Similarity functions
const levenshtein = (a: string, b: string) => {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
};

const similarity = (a: string, b: string) => {
  if (!a && !b) return 1;
  const maxLen = Math.max(a.length, b.length) || 1;
  const dist = levenshtein(a, b);
  return 1 - dist / maxLen;
};

const WAKE_WORDS = ['tisang', 'ti-sang', 'ti sang', 'hey tisang', 'hey ti-sang'];
const wakeThreshold = 0.6;
const sanitize = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
const WAKE_GREETING = `Hi there! I'm ti-sang. How can I help?`;

type MouthShape = 'closed' | 'mid' | 'open' | 'narrow';

const TiSangAvatar: React.FC<{ speaking: boolean; mouthScale?: number; blink?: boolean; shape?: MouthShape }> = ({ mouthScale = 1, blink = false, shape = 'mid' }) => {
  const ORANGE = '#CC5500';
  const base = {
    closed: { rx: 20, ry: 2 },
    narrow: { rx: 18, ry: 3 },
    mid: { rx: 22, ry: 8 },
    open: { rx: 22, ry: 22 },
  }[shape];
  return (
    <div style={{ display: 'inline-block', textAlign: 'center', position: 'relative' }}>
      <svg className="ti-sang-svg" width="280" height="280" viewBox="0 0 280 280" aria-label="Ti-sang avatar">
        <circle cx="140" cy="140" r="100" fill="#FFFFFF" stroke={ORANGE} strokeWidth="6" />
        <g className={`eyes ${blink ? 'blink' : ''}`}> 
          <circle cx="110" cy="125" r="6" fill={ORANGE} />
          <circle cx="170" cy="125" r="6" fill={ORANGE} />
        </g>
        <ellipse
          className="mouth"
          cx="140" cy="180" rx={base.rx} ry={base.ry}
          fill={ORANGE}
          style={{ transform: `scaleY(${mouthScale})`, transformOrigin: '140px 180px' }}
        />
      </svg>
    </div>
  );
};

const WebRTCApp: React.FC = () => {
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mouthScale, setMouthScale] = useState(1);
  const [mouthShape, setMouthShape] = useState<MouthShape>('mid');
  const [blink, setBlink] = useState(false);
  const [wakeWordEnabled, setWakeWordEnabled] = useState(true);
  const [lastHeard, setLastHeard] = useState('');
  const [lastSimilarity, setLastSimilarity] = useState(0);
  const [pendingWakeStart, setPendingWakeStart] = useState(false);

  // Refs
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const mouthScaleRef = useRef(1);
  const mouthShapeRef = useRef<MouthShape>('mid');
  const rafRef = useRef<number | null>(null);
  const blinkIntervalRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const recognizerRef = useRef<SpeechRecognition | null>(null);
  const wakeRestartTimeoutRef = useRef<number | null>(null);
  const wakeStartingRef = useRef<boolean>(false);
  const wakeRunningRef = useRef<boolean>(false);
  const wakeShouldRunRef = useRef<boolean>(false);
  const lastWakeTimeRef = useRef<number>(0);
  const tokenRef = useRef<{ value: string; expiresAt?: number } | null>(null);
  const shouldGreetOnConnectRef = useRef<boolean>(false);
  const visemeDecayTimerRef = useRef<number | null>(null);

  // Wake word detection
  const detectWakeWord = useCallback((text: string) => {
    const cleaned = sanitize(text);
    let best = 0;
    
    // Check against all wake words
    for (const wakeWord of WAKE_WORDS) {
      const cleanWake = sanitize(wakeWord);
      let currentBest = similarity(cleaned, cleanWake);
      
      // Also check substrings
      const len = cleanWake.length;
      for (let w = Math.max(3, len - 2); w <= len + 3; w++) {
        for (let i = 0; i + w <= cleaned.length; i++) {
          const chunk = cleaned.slice(i, i + w);
          currentBest = Math.max(currentBest, similarity(chunk, cleanWake));
        }
      }
      
      // Check if wake word appears as substring with word boundaries
      if (cleaned.includes(cleanWake.replace(/\s/g, ''))) {
        currentBest = Math.max(currentBest, 0.85);
      }
      
      best = Math.max(best, currentBest);
    }
    
    setLastSimilarity(Number(best.toFixed(2)));
    return best >= wakeThreshold;
  }, []);

  // Fetch ephemeral token
  const fetchEphemeralToken = useCallback(async (): Promise<string> => {
    const now = Date.now() / 1000;
    const cached = tokenRef.current;
    if (cached && (!cached.expiresAt || cached.expiresAt - now > 15)) {
      return cached.value;
    }
    const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const base = isLocal ? 'http://localhost:3000' : '';
    const response = await fetch(`${base}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to fetch token');
    }

    const data = await response.json();
    const value: string = data.token ?? data?.client_secret?.value;
    const expiresAt: number | undefined = data.expires_at ?? data?.client_secret?.expires_at;
    tokenRef.current = { value, expiresAt };
    return value;
  }, []);

  // API handler functions
  const handleGmailCheck = useCallback(async (maxResults: number = 5) => {
    try {
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const base = isLocal ? 'http://localhost:3000' : '';
      const response = await fetch(`${base}/api/gmail/emails?maxResults=${maxResults}`);
      
      if (!response.ok) {
        const error = await response.json();
        return { error: error.error || 'Failed to check Gmail' };
      }
      
      const data = await response.json();
      return { emails: data.emails };
    } catch {
      return { error: 'Gmail check failed' };
    }
  }, []);

  const handleGmailSearch = useCallback(async (query: string, maxResults: number = 5) => {
    try {
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const base = isLocal ? 'http://localhost:3000' : '';
      const response = await fetch(`${base}/api/gmail/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, maxResults })
      });
      
      if (!response.ok) {
        const error = await response.json();
        return { error: error.error || 'Gmail search failed' };
      }
      
      const data = await response.json();
      return { emails: data.emails };
    } catch {
      return { error: 'Gmail search failed' };
    }
  }, []);

  const handleWebSearch = useCallback(async (query: string, maxResults: number = 5) => {
    try {
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const base = isLocal ? 'http://localhost:3000' : '';
      const response = await fetch(`${base}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, maxResults })
      });
      
      if (!response.ok) {
        const error = await response.json();
        return { error: error.error || 'Web search failed' };
      }
      
      const data = await response.json();
      return { results: data.results };
    } catch {
      return { error: 'Web search failed' };
    }
  }, []);

  const handleNewsSearch = useCallback(async (topic: string, maxResults: number = 3) => {
    try {
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const base = isLocal ? 'http://localhost:3000' : '';
      const response = await fetch(`${base}/api/search/news`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, maxResults })
      });
      
      if (!response.ok) {
        const error = await response.json();
        return { error: error.error || 'News search failed' };
      }
      
      const data = await response.json();
      return { results: data.results };
    } catch {
      return { error: 'News search failed' };
    }
  }, []);

  // Wake word recognition
  const startWakeRecognition = useCallback(() => {
    try {
      const SpeechRec: SRConstructor | undefined = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRec) {
        console.warn('SpeechRecognition not supported in this browser.');
        return;
      }
      if (wakeStartingRef.current || wakeRunningRef.current) return;

      const recognition = new SpeechRec();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      wakeShouldRunRef.current = true;

      if (wakeRestartTimeoutRef.current) {
        window.clearTimeout(wakeRestartTimeoutRef.current);
        wakeRestartTimeoutRef.current = null;
      }

      recognition.onstart = () => {
        wakeStartingRef.current = false;
        wakeRunningRef.current = true;
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const results = event.results;
        const idx = event.resultIndex;
        const transcript = results[idx][0].transcript;
        const confidence = results[idx][0].confidence;
        setLastHeard(transcript);
        
        if (results[idx].isFinal || (confidence ?? 0) > 0.7) {
          const now = Date.now();
          const onCooldown = now - lastWakeTimeRef.current < 3000;
          if (!onCooldown && detectWakeWord(transcript)) {
            lastWakeTimeRef.current = now;
            console.log('Wake word detected.');
            shouldGreetOnConnectRef.current = true;
            setPendingWakeStart(true);
          }
        }
      };

      recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
        console.warn('SpeechRecognition error:', e);
        wakeRunningRef.current = false;
        const recoverable = e.error === 'no-speech' || e.error === 'aborted' || e.error === 'network';
        if (recoverable && wakeShouldRunRef.current && !listening) {
          if (wakeRestartTimeoutRef.current) window.clearTimeout(wakeRestartTimeoutRef.current);
          wakeRestartTimeoutRef.current = window.setTimeout(() => {
            try { recognition.start(); wakeStartingRef.current = true; } catch { /* noop */ }
          }, 800);
        }
      };

      recognition.onend = () => {
        wakeRunningRef.current = false;
        if (wakeWordEnabled && wakeShouldRunRef.current && !listening) {
          if (wakeRestartTimeoutRef.current) window.clearTimeout(wakeRestartTimeoutRef.current);
          wakeRestartTimeoutRef.current = window.setTimeout(() => {
            try { recognition.start(); wakeStartingRef.current = true; } catch { /* noop */ }
          }, 600);
        }
      };

      recognizerRef.current = recognition;
      try { wakeStartingRef.current = true; recognition.start(); } catch { /* noop */ }
      console.log('Wake word recognition started');
    } catch (e) {
      console.warn('Failed to start wake recognition:', e);
    }
  }, [wakeWordEnabled, listening, detectWakeWord]);

  const stopWakeRecognition = useCallback(() => {
    const rec = recognizerRef.current;
    if (rec) {
      try {
        wakeShouldRunRef.current = false;
        if (wakeRestartTimeoutRef.current) { 
          window.clearTimeout(wakeRestartTimeoutRef.current); 
          wakeRestartTimeoutRef.current = null; 
        }
        rec.onresult = null; 
        rec.onend = null; 
        rec.onerror = null; 
        (rec as any).onstart = null;
        rec.stop();
      } catch { /* noop */ }
      recognizerRef.current = null;
      wakeRunningRef.current = false;
      wakeStartingRef.current = false;
      console.log('Wake word recognition stopped');
    }
  }, []);

  // WebRTC connection using OpenAI documentation method
  const handleStartListening = useCallback(async () => {
    if (connected || loading) return;

    setLoading(true);
    setError('');

    try {
      // Get ephemeral token from backend
      const token = await fetchEphemeralToken();
      console.log('✅ Got ephemeral token');

      // Create WebRTC peer connection
      const pc = new RTCPeerConnection();
      
      // Set up audio element for model output
      const audioElement = document.createElement("audio");
      audioElement.autoplay = true;
      pc.ontrack = (e) => {
        audioElement.srcObject = e.streams[0];
        console.log('🎵 Connected to OpenAI audio stream');
        
        // Set up audio analysis for lip-sync
        try {
          const audioContext = audioContextRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
          if (!audioContextRef.current) audioContextRef.current = audioContext;
          
          const source = audioContext.createMediaElementSource(audioElement);
          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 128;
          analyser.smoothingTimeConstant = 0.6;
          
          source.connect(analyser);
          source.connect(audioContext.destination);
          analyserRef.current = analyser;
          
          const analyzeAudio = () => {
            if (!analyserRef.current) return;
            
            const dataArray = new Uint8Array(analyserRef.current.fftSize);
            analyserRef.current.getByteTimeDomainData(dataArray);
            
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              const centered = (dataArray[i] - 128) / 128;
              sum += centered * centered;
            }
            const rms = Math.sqrt(sum / dataArray.length);
            
            const targetScale = 1.0 + Math.min(1.4, rms * 8);
            mouthScaleRef.current = mouthScaleRef.current * 0.7 + targetScale * 0.3;
            
            if (rafRef.current == null) {
              rafRef.current = requestAnimationFrame(() => {
                setMouthScale(mouthScaleRef.current);
                rafRef.current = null;
              });
            }
            
            animationFrameRef.current = requestAnimationFrame(analyzeAudio);
          };
          
          analyzeAudio();
          console.log('✅ Audio analysis started');
        } catch (e) {
          console.warn('❌ Failed to set up audio analysis:', e);
        }
      };

      // Add local microphone audio
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      pc.addTrack(mediaStream.getTracks()[0]);

      // Set up data channel for events
      const dataChannel = pc.createDataChannel("oai-events");
      
      dataChannel.onopen = () => {
        console.log('🔗 Data channel opened');
        setConnected(true);
        setListening(true);
        
        // Send session configuration
        const sessionUpdateEvent = {
          type: "session.update",
          session: {
            instructions: [
              'You are ti-sang, a friendly voice assistant with Gmail access and web search capabilities.',
              'User: 12-year-old, friendly and curious. Use their name (Atticus) only when greeting or when it adds clarity - avoid overusing it.',
              'Style: Natural, encouraging, with light Gen Z slang. Keep responses concise and upbeat.',
              'Safety: Kid-appropriate content only. No profanity, adult content, or inappropriate slang.',
              '',
              'CAPABILITIES:',
              '1. Gmail Management:',
              '   - Check new emails: "Check my Gmail" or "Any new emails?"',
              '   - Read specific emails: "Read my latest email" or "What\'s in my inbox?"', 
              '   - Send emails: "Send an email to [person] about [topic]"',
              '   - Search emails: "Find emails from [person]" or "Search for [keyword]"',
              '',
              '2. Web Search:',
              '   - General search: "Search for [topic]" or "Look up [information]"',
              '   - News: "What\'s the latest news about [topic]?"',
              '   - Facts: "Tell me about [subject]" or "How does [thing] work?"',
              '',
              'Gen Z slang to use naturally (when appropriate):',
              '- bet = okay/for sure',
              '- no cap = for real/seriously', 
              '- bussin = really good (especially food)',
              '- slay/ate that up = did amazing',
              '- it\'s giving... = the vibe is...',
              '- based = being confidently yourself',
              '- let them cook = let them do their thing',
              '',
              'AVOID: Overusing names, asking for age, inappropriate slang like "gyat", being overly formal.',
              'FOCUS: Be helpful, encouraging, and naturally conversational.'
            ].join('\n'),
            tools: [
              {
                type: "function",
                name: "check_gmail",
                description: "Check recent Gmail emails",
                parameters: {
                  type: "object",
                  properties: {
                    maxResults: {
                      type: "number",
                      description: "Maximum number of emails to retrieve (default: 5)"
                    }
                  }
                }
              },
              {
                type: "function", 
                name: "search_gmail",
                description: "Search Gmail for specific emails",
                parameters: {
                  type: "object",
                  properties: {
                    query: {
                      type: "string",
                      description: "Gmail search query (e.g., 'from:friend@email.com', 'subject:important')"
                    },
                    maxResults: {
                      type: "number",
                      description: "Maximum number of results (default: 5)"
                    }
                  },
                  required: ["query"]
                }
              },
              {
                type: "function",
                name: "web_search", 
                description: "Search the internet for information",
                parameters: {
                  type: "object",
                  properties: {
                    query: {
                      type: "string",
                      description: "Search query"
                    },
                    maxResults: {
                      type: "number", 
                      description: "Maximum number of results (default: 5)"
                    }
                  },
                  required: ["query"]
                }
              },
              {
                type: "function",
                name: "get_news",
                description: "Get recent news about a topic",
                parameters: {
                  type: "object",
                  properties: {
                    topic: {
                      type: "string",
                      description: "News topic to search for"
                    },
                    maxResults: {
                      type: "number",
                      description: "Maximum number of news items (default: 3)"
                    }
                  },
                  required: ["topic"]
                }
              }
            ]
          }
        };
        dataChannel.send(JSON.stringify(sessionUpdateEvent));
        
        // Send greeting if triggered by wake word
        if (shouldGreetOnConnectRef.current) {
          shouldGreetOnConnectRef.current = false;
          setTimeout(() => {
            const greetEvent = {
              type: "conversation.item.create",
              item: {
                type: "message",
                role: "user",
                content: [{ type: "input_text", text: WAKE_GREETING }]
              }
            };
            dataChannel.send(JSON.stringify(greetEvent));
            
            const responseEvent = { type: "response.create" };
            dataChannel.send(JSON.stringify(responseEvent));
          }, 100);
        }
      };

      dataChannel.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('📨 Received event:', data.type);
          
          if (data.type === 'response.audio.start') {
            setSpeaking(true);
            mouthShapeRef.current = 'mid';
            setMouthShape('mid');
            
            if (blinkIntervalRef.current == null) {
              blinkIntervalRef.current = window.setInterval(() => {
                setBlink(true);
                setTimeout(() => setBlink(false), 120);
              }, 3200);
            }
          } else if (data.type === 'response.audio.done') {
            setSpeaking(false);
            mouthScaleRef.current = 1;
            mouthShapeRef.current = 'closed';
            setMouthShape('closed');
            
            if (blinkIntervalRef.current != null) {
              clearInterval(blinkIntervalRef.current);
              blinkIntervalRef.current = null;
            }
          } else if (data.type === 'response.audio_transcript.delta') {
            const delta = data.delta || '';
            if (delta) {
              const last = (delta.match(/[a-z]+/gi)?.pop() || '').toLowerCase();
              const ch = last.slice(-1);
              let shape: MouthShape = 'mid';
              if (!last) shape = 'closed';
              else if ('aeiou'.includes(ch)) shape = 'open';
              else if (/s|z|f|v|sh|ch|th|j|x/.test(last)) shape = 'narrow';
              else if (/[pbm]$/.test(last)) shape = 'closed';
              else shape = 'mid';

              mouthShapeRef.current = shape;
              setMouthShape(shape);

              if (visemeDecayTimerRef.current) window.clearTimeout(visemeDecayTimerRef.current);
              visemeDecayTimerRef.current = window.setTimeout(() => {
                mouthShapeRef.current = 'mid';
                setMouthShape('mid');
                visemeDecayTimerRef.current = window.setTimeout(() => {
                  mouthShapeRef.current = 'closed';
                  setMouthShape('closed');
                }, 140);
              }, 120);
            }
          } else if (data.type === 'response.function_call_arguments.delta') {
            // Handle function call arguments
            console.log('📞 Function call delta:', data);
          } else if (data.type === 'response.function_call_arguments.done') {
            // Function call complete - execute the function
            const { call_id, name, arguments: args } = data;
            console.log('📞 Function call:', name, args);
            
            (async () => {
              try {
                let result = null;
                const parsedArgs = JSON.parse(args || '{}');
                
                switch (name) {
                  case 'check_gmail':
                    result = await handleGmailCheck(parsedArgs.maxResults || 5);
                    break;
                  case 'search_gmail':
                    result = await handleGmailSearch(parsedArgs.query, parsedArgs.maxResults || 5);
                    break;
                  case 'web_search':
                    result = await handleWebSearch(parsedArgs.query, parsedArgs.maxResults || 5);
                    break;
                  case 'get_news':
                    result = await handleNewsSearch(parsedArgs.topic, parsedArgs.maxResults || 3);
                    break;
                  default:
                    result = { error: `Unknown function: ${name}` };
                }
                
                // Send function result back
                const responseEvent = {
                  type: "conversation.item.create",
                  item: {
                    type: "function_call_output",
                    call_id,
                    output: JSON.stringify(result)
                  }
                };
                dataChannel.send(JSON.stringify(responseEvent));
                
                // Continue the response
                const continueEvent = { type: "response.create" };
                dataChannel.send(JSON.stringify(continueEvent));
                
              } catch (error) {
                console.error('Function call error:', error);
                const errorEvent = {
                  type: "conversation.item.create",
                  item: {
                    type: "function_call_output", 
                    call_id,
                    output: JSON.stringify({ error: (error as Error).message || 'Unknown error' })
                  }
                };
                dataChannel.send(JSON.stringify(errorEvent));
              }
            })();
          }
        } catch (e) {
          console.warn('Failed to parse event:', e);
        }
      };

      // Create offer and set local description
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Send offer to OpenAI Realtime API using WebRTC
      const baseUrl = "https://api.openai.com/v1/realtime/calls";
      const model = "gpt-realtime";
      const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/sdp",
          "OpenAI-Beta": "realtime=v1",
        },
      });

      if (!sdpResponse.ok) {
        const errorText = await sdpResponse.text();
        throw new Error(`WebRTC connection failed: ${sdpResponse.status} ${sdpResponse.statusText} - ${errorText}`);
      }

      const answer = {
        type: "answer" as RTCSdpType,
        sdp: await sdpResponse.text(),
      };
      await pc.setRemoteDescription(answer);

      // Store references
      peerConnectionRef.current = pc;
      dataChannelRef.current = dataChannel;
      audioElementRef.current = audioElement;

      // Stop wake recognition while actively engaged
      stopWakeRecognition();

      console.log('✅ WebRTC connection established with OpenAI Realtime API');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start listening');
      console.error('WebRTC connection error:', err);
    } finally {
      setLoading(false);
    }
  }, [connected, loading, fetchEphemeralToken, stopWakeRecognition, handleGmailCheck, handleGmailSearch, handleWebSearch, handleNewsSearch]);

  // Stop listening and disconnect
  const handleStopListening = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    if (audioElementRef.current && audioElementRef.current.srcObject) {
      const stream = audioElementRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      audioElementRef.current = null;
    }
    
    setListening(false);
    setConnected(false);
    setSpeaking(false);
    
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (blinkIntervalRef.current != null) {
      clearInterval(blinkIntervalRef.current);
      blinkIntervalRef.current = null;
    }
    if (animationFrameRef.current != null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setMouthScale(1);

    // Resume wake recognition if enabled
    if (wakeWordEnabled) {
      startWakeRecognition();
    }
  }, [wakeWordEnabled, startWakeRecognition]);

  // Wake word recognition lifecycle
  useEffect(() => {
    if (wakeWordEnabled && !listening && !recognizerRef.current) {
      startWakeRecognition();
    }
    if ((!wakeWordEnabled || listening) && recognizerRef.current) {
      stopWakeRecognition();
    }
    return () => {
      stopWakeRecognition();
    };
  }, [wakeWordEnabled, listening, startWakeRecognition, stopWakeRecognition]);

  // Trigger start when wake word detected
  useEffect(() => {
    if (pendingWakeStart && !listening && !loading) {
      setPendingWakeStart(false);
      void handleStartListening();
    }
  }, [pendingWakeStart, listening, loading, handleStartListening]);

  // Prefetch token on mount
  useEffect(() => {
    (async () => {
      try { await fetchEphemeralToken(); } catch { /* noop */ }
    })();
  }, [fetchEphemeralToken]);

  return (
    <div className="App" style={{ textAlign: 'center', marginTop: 40 }}>
      <h1 style={{ color: '#CC5500' }}>Ti-Sang</h1>

      {error && (
        <div style={{
          backgroundColor: '#ffebee',
          color: '#c62828',
          padding: 10,
          borderRadius: 8,
          margin: '0 20px 20px',
          border: '1px solid #ef5350'
        }}>
          Error: {error}
        </div>
      )}

      {/* Debug overlay */}
      <div style={{
        position: 'fixed',
        top: 10,
        right: 10,
        background: 'rgba(0,0,0,0.8)',
        color: 'white',
        padding: '10px',
        borderRadius: '5px',
        fontSize: '12px',
        zIndex: 1000
      }}>
        Mouth Scale: {mouthScale.toFixed(2)}<br/>
        Speaking: {speaking ? 'Yes' : 'No'}<br/>
        Connected: {connected ? 'Yes' : 'No'}<br/>
        Wake: {wakeWordEnabled ? 'On' : 'Off'}<br/>
        Heard: {lastHeard || '-'}<br/>
        Sim: {lastSimilarity.toFixed(2)}<br/>
        Shape: {mouthShape}
      </div>

      <TiSangAvatar speaking={speaking} mouthScale={mouthScale} blink={blink} shape={mouthShape} />
      
      <div style={{ marginTop: 20 }}>
        <div style={{ marginBottom: 12 }}>
          <button
            onClick={() => {
              const next = !wakeWordEnabled;
              setWakeWordEnabled(next);
              if (next && !listening) startWakeRecognition(); 
              else stopWakeRecognition();
            }}
            style={{ backgroundColor: wakeWordEnabled ? '#CC5500' : '#aaa' }}
          >
            Wake Word Detection: {wakeWordEnabled ? 'On' : 'Off'}
          </button>
        </div>
        {!listening ? (
          <button
            onClick={handleStartListening}
            disabled={loading}
            style={{
              backgroundColor: loading ? '#ccc' : '#CC5500',
              color: '#fff',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Connecting...' : 'Start Listening'}
          </button>
        ) : (
          <button
            onClick={handleStopListening}
            style={{ backgroundColor: '#CC5500', color: '#fff' }}
          >
            Stop Listening
          </button>
        )}
      </div>
    </div>
  );
};

export default WebRTCApp;
