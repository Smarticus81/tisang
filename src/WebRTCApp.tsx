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

const ReactiveCore: React.FC<{
  state: 'idle' | 'listening' | 'thinking' | 'speaking';
  volume?: number;
}> = ({ state, volume = 0 }) => {
  return (
    <div className="core-container">
      <div className={`core-orb ${state}`} style={{
        transform: state === 'speaking' ? `scale(${1 + Math.min(volume, 0.5)})` : undefined
      }} />
      <div className="core-ring ring-1" />
      <div className="core-ring ring-2" />
      <div className="core-ring ring-3" />
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

  const [wakeWordEnabled, setWakeWordEnabled] = useState(false);
  const [gmailStatus, setGmailStatus] = useState<'unknown' | 'available' | 'unavailable'>('unknown');

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const nextPlayTimeRef = useRef(0);

  const recognizerRef = useRef<SpeechRecognition | null>(null);
  const wakeRunningRef = useRef<boolean>(false);
  const shouldGreetOnConnectRef = useRef<boolean>(false);

  // Initialize Audio Context
  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    return () => {
      audioContextRef.current?.close();
    };
  }, []);

  // Check Gmail Status
  const checkGmailStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/status');
      if (response.ok) {
        const data = await response.json();
        setGmailStatus(data.gmail ? 'available' : 'unavailable');
      }
    } catch {
      setGmailStatus('unknown');
    }
  }, []);

  useEffect(() => {
    checkGmailStatus();
  }, [checkGmailStatus]);

  const triggerGmailSetup = () => {
    const width = 500;
    const height = 600;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;

    window.open(
      '/api/gmail/auth-url',
      'GmailAuth',
      `width=${width},height=${height},top=${top},left=${left}`
    );

    const checkInterval = setInterval(async () => {
      await checkGmailStatus();
      if (gmailStatus === 'available') {
        clearInterval(checkInterval);
      }
    }, 2000);

    setTimeout(() => clearInterval(checkInterval), 60000);
  };

  // Audio Playback Logic
  const playNextAudioChunk = useCallback(() => {
    if (audioQueueRef.current.length === 0 || !audioContextRef.current) {
      isPlayingRef.current = false;
      setSpeaking(false);
      return;
    }

    isPlayingRef.current = true;
    setSpeaking(true);
    const audioData = audioQueueRef.current.shift()!;
    const buffer = audioContextRef.current.createBuffer(1, audioData.length, 24000);
    buffer.getChannelData(0).set(audioData);

    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);

    const currentTime = audioContextRef.current.currentTime;
    const startTime = Math.max(currentTime, nextPlayTimeRef.current);
    source.start(startTime);
    nextPlayTimeRef.current = startTime + buffer.duration;

    source.onended = () => {
      if (audioQueueRef.current.length === 0) {
        isPlayingRef.current = false;
        setSpeaking(false);
      }
    };

    // Schedule next chunk
    if (audioQueueRef.current.length > 0) {
      setTimeout(playNextAudioChunk, (buffer.duration * 1000) / 2);
    }
  }, []);

  const handleAudioMessage = useCallback((base64Audio: string) => {
    try {
      const binaryString = window.atob(base64Audio);
      const len = binaryString.length;
      const bytes = new Float32Array(len / 2);
      const view = new DataView(new ArrayBuffer(len));

      for (let i = 0; i < len; i++) {
        view.setUint8(i, binaryString.charCodeAt(i));
      }

      for (let i = 0; i < len / 2; i++) {
        bytes[i] = view.getInt16(i * 2, true) / 32768.0;
      }

      audioQueueRef.current.push(bytes);
      if (!isPlayingRef.current) {
        playNextAudioChunk();
      }

      // Visualize volume
      let sum = 0;
      for (let i = 0; i < bytes.length; i++) sum += Math.abs(bytes[i]);
      const avg = sum / bytes.length;
      setMouthScale(1 + avg * 5);

    } catch (e) {
      console.error('Error processing audio message:', e);
    }
  }, [playNextAudioChunk]);

  const startAudioCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 } });
      mediaStreamRef.current = stream;

      if (!audioContextRef.current) return;

      const source = audioContextRef.current.createMediaStreamSource(stream);
      const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        const buffer = new ArrayBuffer(pcm16.length * 2);
        new Int16Array(buffer).set(pcm16);
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        const base64 = window.btoa(binary);

        wsRef.current.send(JSON.stringify({ type: 'audio', data: base64 }));
      };

      source.connect(processor);
      processor.connect(audioContextRef.current.destination);
      processorRef.current = processor;

    } catch (e) {
      console.error('Microphone access denied:', e);
      setError('Microphone access denied');
    }
  };

  const stopAudioCapture = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
  };

  // Connect to Gemini
  const connectToGemini = useCallback(async () => {
    if (connected || loading) return;
    setLoading(true);
    setError('');

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const ws = new WebSocket(`${protocol}//${host}/api/gemini/stream`);

      ws.onopen = () => {
        console.log('Connected to Gemini Backend');
        setConnected(true);
        setLoading(false);
        setListening(true);
        wsRef.current = ws;
        startAudioCapture();

        // Send session update with tools
        const sessionUpdate = {
          type: "session.update",
          session: {
            tools: [
              {
                type: "function",
                name: "gmail_setup",
                description: "Initiates the Gmail authentication process when the user asks to connect or set up Gmail.",
                parameters: { type: "object", properties: {} }
              },
              {
                type: "function",
                name: "create_calendar_event",
                description: "Creates a new event in the user's Google Calendar.",
                parameters: {
                  type: "object",
                  properties: {
                    summary: { type: "string", description: "Title of the event" },
                    description: { type: "string", description: "Description or details of the event" },
                    start: { type: "string", description: "Start time in ISO 8601 format (e.g., 2023-10-27T10:00:00-05:00)" },
                    end: { type: "string", description: "End time in ISO 8601 format" },
                    location: { type: "string", description: "Location of the event" },
                    attendees: { type: "array", items: { type: "string" }, description: "List of email addresses to invite" }
                  },
                  required: ["summary", "start", "end"]
                }
              },
              {
                type: "function",
                name: "list_calendar_events",
                description: "Lists upcoming events from the user's calendar.",
                parameters: {
                  type: "object",
                  properties: {
                    maxResults: { type: "number", description: "Maximum number of events to return (default 10)" },
                    timeMin: { type: "string", description: "Start time to list events from (ISO 8601)" },
                    timeMax: { type: "string", description: "End time to list events to (ISO 8601)" },
                    query: { type: "string", description: "Free text search terms to filter events" }
                  }
                }
              },
              {
                type: "function",
                name: "advanced_web_search",
                description: "Advanced web search with filters and options",
                parameters: {
                  type: "object",
                  properties: {
                    query: { type: "string", description: "Search query" },
                    timeRange: { type: "string", description: "Time filter: day, week, month, year (optional)" },
                    site: { type: "string", description: "Specific site to search (e.g., 'reddit.com') (optional)" },
                    maxResults: { type: "number", description: "Maximum results (default: 5)" }
                  },
                  required: ["query"]
                }
              }
            ]
          }
        };
        ws.send(JSON.stringify(sessionUpdate));

        if (shouldGreetOnConnectRef.current) {
          shouldGreetOnConnectRef.current = false;
          // Send greeting trigger
          ws.send(JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "user",
              content: [{ type: "input_text", text: WAKE_GREETING }]
            }
          }));
          ws.send(JSON.stringify({ type: "response.create" }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'audio') {
            handleAudioMessage(data.data);
          } else if (data.type === 'error') {
            setError(data.message);
          }
        } catch (e) {
          console.error('WebSocket message error:', e);
        }
      };

      ws.onclose = () => {
        console.log('Disconnected from Gemini Backend');
        setConnected(false);
        setListening(false);
        setLoading(false);
        stopAudioCapture();
        wsRef.current = null;
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        setError('Connection error');
        setLoading(false);
      };

    } catch (e) {
      console.error('Connection failed:', e);
      setError('Failed to connect');
      setLoading(false);
    }
  }, [connected, loading, handleAudioMessage]);

  const disconnectFromGemini = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    stopAudioCapture();
    setConnected(false);
    setListening(false);
  }, []);

  // Wake Word Logic
  const detectWakeWord = useCallback((transcript: string) => {
    const lower = sanitize(transcript);
    for (const word of WAKE_WORDS) {
      if (lower.includes(word) || similarity(lower, word) > wakeThreshold) {
        return true;
      }
    }
    return false;
  }, []);

  const startWakeRecognition = useCallback(() => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      setError('Speech recognition not supported');
      return;
    }

    if (wakeRunningRef.current || recognizerRef.current) return;

    try {
      const recognition = new SpeechRec();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const results = event.results;
        const idx = event.resultIndex;
        const transcript = results[idx][0].transcript;
        const isFinal = results[idx].isFinal;

        if (isFinal || results[idx][0].confidence > 0.7) {
          if (detectWakeWord(transcript)) {
            console.log('🎯 Wake word detected:', transcript);
            stopWakeRecognition();
            handleStartListening();
          }
        }
      };

      recognition.onend = () => {
        wakeRunningRef.current = false;
        recognizerRef.current = null;
        // Auto-restart if it wasn't stopped intentionally
        if (wakeWordEnabled && !listening) {
          setTimeout(() => startWakeRecognition(), 1000);
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.warn('Wake word error:', event.error);
        wakeRunningRef.current = false;
      };

      recognition.start();
      recognizerRef.current = recognition;
      wakeRunningRef.current = true;
      console.log('✅ Wake word recognition started');
    } catch (e) {
      console.error('Failed to start wake recognition:', e);
    }
  }, [wakeWordEnabled, listening, detectWakeWord]);

  const stopWakeRecognition = useCallback(() => {
    if (recognizerRef.current) {
      recognizerRef.current.stop();
      recognizerRef.current = null;
    }
    wakeRunningRef.current = false;
    console.log('🛑 Wake word recognition stopped');
  }, []);

  const handleStartListening = () => {
    shouldGreetOnConnectRef.current = true;
    connectToGemini();
  };

  const handleStopListening = () => {
    disconnectFromGemini();
    if (wakeWordEnabled) {
      startWakeRecognition();
    }
  };

  // Determine Core State
  let coreState: 'idle' | 'listening' | 'thinking' | 'speaking' = 'idle';
  if (loading) coreState = 'thinking';
  else if (speaking) coreState = 'speaking';
  else if (listening) coreState = 'listening';

  return (
    <>
      <div className="deep-space-bg" />
      <div className="star-field" />

      <div className="app-container">
        <div className="status-indicators">
          <div className={`status-dot ${connected ? 'connected' : 'error'}`} title="Gemini Connection" />
          <div className={`status-dot ${gmailStatus === 'available' ? 'connected' : 'error'}`} title="Gmail Connection" />
        </div>

        <ReactiveCore state={coreState} volume={mouthScale - 1} />

        <div className="hud-transcript">
          {error && <div style={{ color: '#ff4444' }}>{error}</div>}
          {!error && (
            <>
              {listening ? (
                <span className="user-text">Listening...</span>
              ) : speaking ? (
                <span className="agent-text">Speaking...</span>
              ) : loading ? (
                <span className="agent-text">Connecting to Gemini...</span>
              ) : (
                <span className="user-text">Say "Ti-Sang" or press Start</span>
              )}
            </>
          )}
        </div>

        <div className="hud-controls">
          <button
            className={`hud-btn ${wakeWordEnabled ? 'active' : ''}`}
            onClick={() => {
              const next = !wakeWordEnabled;
              setWakeWordEnabled(next);
              if (next && !listening) startWakeRecognition();
              else stopWakeRecognition();
            }}
            title="Toggle Wake Word"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>

          {!listening ? (
            <button
              className="hud-btn"
              onClick={handleStartListening}
              disabled={loading}
              title="Start Chat"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </button>
          ) : (
            <button
              className="hud-btn active"
              onClick={handleStopListening}
              title="Stop Chat"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="6" height="6" />
                <circle cx="12" cy="12" r="10" />
              </svg>
            </button>
          )}

          <button
            className={`hud-btn ${gmailStatus === 'available' ? 'active' : ''}`}
            onClick={triggerGmailSetup}
            title="Gmail Settings"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
};

export default WebRTCApp;
