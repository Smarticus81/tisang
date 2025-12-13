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

const WAKE_WORDS = ['maylah', 'may-lah', 'may lah', 'hey maylah', 'hey may-lah', 'mayla', 'maila'];
const wakeThreshold = 0.6;
const sanitize = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();

// Liquid Glass Orb Component
const LiquidOrb: React.FC<{
  state: 'idle' | 'listening' | 'thinking' | 'speaking';
  audioLevel?: number;
}> = ({ state, audioLevel = 0 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const timeRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const size = 280;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    const centerX = size / 2;
    const centerY = size / 2;
    const baseRadius = 80;

    const animate = () => {
      timeRef.current += 0.016;
      const t = timeRef.current;

      ctx.clearRect(0, 0, size, size);

      // Dynamic parameters based on state
      let waveIntensity = 0.08;
      let waveSpeed = 0.8;
      let glowIntensity = 0.3;
      let primaryHue = 200;
      let secondaryHue = 260;

      switch (state) {
        case 'listening':
          waveIntensity = 0.12 + audioLevel * 0.15;
          waveSpeed = 1.2;
          glowIntensity = 0.5 + audioLevel * 0.3;
          primaryHue = 180;
          secondaryHue = 220;
          break;
        case 'thinking':
          waveIntensity = 0.1;
          waveSpeed = 2;
          glowIntensity = 0.4;
          primaryHue = 260;
          secondaryHue = 300;
          break;
        case 'speaking':
          waveIntensity = 0.15 + audioLevel * 0.25;
          waveSpeed = 1.5;
          glowIntensity = 0.6 + audioLevel * 0.4;
          primaryHue = 170;
          secondaryHue = 200;
          break;
      }

      // Outer glow layers
      for (let i = 4; i >= 0; i--) {
        const glowRadius = baseRadius + 30 + i * 15;
        const alpha = (glowIntensity * 0.08) * (1 - i * 0.15);
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, glowRadius);
        gradient.addColorStop(0, `hsla(${primaryHue}, 60%, 70%, ${alpha})`);
        gradient.addColorStop(0.5, `hsla(${secondaryHue}, 50%, 60%, ${alpha * 0.5})`);
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
      }

      // Main orb with liquid morphing
      ctx.save();
      ctx.beginPath();

      const points = 120;
      for (let i = 0; i <= points; i++) {
        const angle = (i / points) * Math.PI * 2;
        
        // Multiple wave layers for liquid effect
        const wave1 = Math.sin(angle * 3 + t * waveSpeed) * baseRadius * waveIntensity;
        const wave2 = Math.sin(angle * 5 - t * waveSpeed * 1.3) * baseRadius * waveIntensity * 0.5;
        const wave3 = Math.sin(angle * 7 + t * waveSpeed * 0.7) * baseRadius * waveIntensity * 0.3;
        const wave4 = Math.cos(angle * 2 + t * waveSpeed * 1.1) * baseRadius * waveIntensity * 0.4;
        
        const radius = baseRadius + wave1 + wave2 + wave3 + wave4;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();

      // Glass gradient fill
      const glassGradient = ctx.createRadialGradient(
        centerX - 20, centerY - 30, 0,
        centerX, centerY, baseRadius + 20
      );
      glassGradient.addColorStop(0, `hsla(${primaryHue}, 30%, 95%, 0.9)`);
      glassGradient.addColorStop(0.3, `hsla(${primaryHue}, 40%, 80%, 0.6)`);
      glassGradient.addColorStop(0.6, `hsla(${secondaryHue}, 50%, 60%, 0.4)`);
      glassGradient.addColorStop(1, `hsla(${secondaryHue}, 60%, 40%, 0.2)`);
      ctx.fillStyle = glassGradient;
      ctx.fill();

      // Glass border
      ctx.strokeStyle = `hsla(${primaryHue}, 50%, 80%, 0.3)`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      // Inner highlight
      ctx.save();
      ctx.beginPath();
      const highlightRadius = baseRadius * 0.6;
      const highlightGradient = ctx.createRadialGradient(
        centerX - 15, centerY - 25, 0,
        centerX - 10, centerY - 15, highlightRadius
      );
      highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
      highlightGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)');
      highlightGradient.addColorStop(1, 'transparent');
      ctx.fillStyle = highlightGradient;
      ctx.arc(centerX - 15, centerY - 20, highlightRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Soundwave rings when speaking or listening
      if (state === 'speaking' || state === 'listening') {
        const numRings = 3;
        for (let i = 0; i < numRings; i++) {
          const ringProgress = ((t * 0.5 + i * 0.33) % 1);
          const ringRadius = baseRadius + ringProgress * 60;
          const ringAlpha = (1 - ringProgress) * 0.3 * (state === 'speaking' ? audioLevel + 0.3 : 0.5);
          
          ctx.beginPath();
          ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
          ctx.strokeStyle = `hsla(${primaryHue}, 60%, 70%, ${ringAlpha})`;
          ctx.lineWidth = 2 - ringProgress * 1.5;
          ctx.stroke();
        }
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [state, audioLevel]);

  return (
    <div className="orb-container">
      <canvas ref={canvasRef} className="liquid-orb" />
    </div>
  );
};

// Smooth transcript display
const TranscriptDisplay: React.FC<{
  text: string;
  type: 'user' | 'agent' | 'system';
  isInterim?: boolean;
}> = ({ text, type, isInterim }) => {
  return (
    <div className={`transcript ${type} ${isInterim ? 'interim' : ''}`}>
      <span className="transcript-text">{text}</span>
    </div>
  );
};

const WebRTCApp: React.FC = () => {
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');

  const [wakeWordEnabled, setWakeWordEnabled] = useState(true);
  const [googleStatus, setGoogleStatus] = useState<'unknown' | 'available' | 'unavailable'>('unknown');
  const [showSettings, setShowSettings] = useState(false);
  const [showAudioHint, setShowAudioHint] = useState(false);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const listeningRef = useRef(false);
  const wakeWordEnabledRef = useRef(true);

  // Update refs when state changes
  useEffect(() => {
    listeningRef.current = listening;
  }, [listening]);

  useEffect(() => {
    wakeWordEnabledRef.current = wakeWordEnabled;
  }, [wakeWordEnabled]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const nextPlayTimeRef = useRef(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioLevelIntervalRef = useRef<number | null>(null);

  const recognizerRef = useRef<SpeechRecognition | null>(null);
  const wakeRunningRef = useRef<boolean>(false);
  const shouldGreetOnConnectRef = useRef<boolean>(false);
  const transcriptRecognizerRef = useRef<SpeechRecognition | null>(null);

  // Initialize Audio Context
  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    return () => {
      audioContextRef.current?.close();
    };
  }, []);

  // Check Google Status and handle OAuth callback
  const checkGoogleStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/status');
      if (response.ok) {
        const data = await response.json();
        setGoogleStatus(data.gmail ? 'available' : 'unavailable');
      }
    } catch {
      setGoogleStatus('unknown');
    }
  }, []);

  useEffect(() => {
    checkGoogleStatus();

    // Handle OAuth callback for PWA
    const urlParams = new URLSearchParams(window.location.search);
    const authSuccess = urlParams.get('auth_success');
    if (authSuccess === 'true') {
      setGoogleStatus('available');
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [checkGoogleStatus]);

  // PWA-compatible OAuth trigger
  const triggerGoogleAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/gmail/auth-url');
      const data = await response.json();
      
      if (data.authUrl) {
        // Check if running as PWA standalone
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
          (window.navigator as any).standalone === true ||
          document.referrer.includes('android-app://');
        
        if (isStandalone) {
          // For PWA: redirect in same window, will redirect back after auth
          window.location.href = data.authUrl;
        } else {
          // For browser: use popup
          const width = 500;
          const height = 600;
          const left = (window.screen.width - width) / 2;
          const top = (window.screen.height - height) / 2;
          
          const popup = window.open(
            data.authUrl,
            'GoogleAuth',
            `width=${width},height=${height},top=${top},left=${left}`
          );
          
          // Poll for popup close
          const checkPopup = setInterval(async () => {
            if (popup?.closed) {
              clearInterval(checkPopup);
              await checkGoogleStatus();
            }
          }, 1000);
          
          setTimeout(() => clearInterval(checkPopup), 120000);
        }
      }
    } catch (err) {
      console.error('Failed to start auth:', err);
      setError('Failed to start authentication');
    }
  }, [checkGoogleStatus]);

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

    // Calculate audio level for visualization
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) sum += Math.abs(audioData[i]);
    const avg = sum / audioData.length;
    setAudioLevel(Math.min(avg * 8, 1));

    source.onended = () => {
      if (audioQueueRef.current.length === 0) {
        isPlayingRef.current = false;
        setSpeaking(false);
        setAudioLevel(0);
      }
    };

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
    } catch (e) {
      console.error('Error processing audio message:', e);
    }
  }, [playNextAudioChunk]);

  // Start transcript recognition for smooth display
  const startTranscriptRecognition = useCallback(() => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) return;

    try {
      const recognition = new SpeechRec();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            final += result[0].transcript;
          } else {
            interim += result[0].transcript;
          }
        }

        if (final) {
          setTranscript(final);
          setInterimTranscript('');
        } else {
          setInterimTranscript(interim);
        }
      };

      recognition.onend = () => {
        if (listening) {
          try {
            recognition.start();
          } catch (e) {
            // Ignore restart errors
          }
        }
      };

      recognition.start();
      transcriptRecognizerRef.current = recognition;
    } catch (e) {
      console.error('Failed to start transcript recognition:', e);
    }
  }, [listening]);

  const stopTranscriptRecognition = useCallback(() => {
    if (transcriptRecognizerRef.current) {
      transcriptRecognizerRef.current.stop();
      transcriptRecognizerRef.current = null;
    }
    setTranscript('');
    setInterimTranscript('');
  }, []);

  const startAudioCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          sampleRate: 16000, 
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
      mediaStreamRef.current = stream;

      if (!audioContextRef.current) return;

      const source = audioContextRef.current.createMediaStreamSource(stream);
      
      // Create analyser for input level visualization
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Monitor input audio level
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      audioLevelIntervalRef.current = window.setInterval(() => {
        if (analyserRef.current && listening && !speaking) {
          analyserRef.current.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          setAudioLevel(Math.min(avg / 128, 1));
        }
      }, 50);

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
    if (audioLevelIntervalRef.current) {
      clearInterval(audioLevelIntervalRef.current);
      audioLevelIntervalRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
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
        console.log('Connected to Maylah Backend');
        setConnected(true);
        setLoading(false);
        setListening(true);
        wsRef.current = ws;
        startAudioCapture();
        startTranscriptRecognition();

        // Send session update with tools and personality
        const sessionUpdate = {
          type: "session.update",
          session: {
            instructions: `You are Maylah, a laid-back but professional AI assistant. You're calm, collected, and genuinely helpful without being overly enthusiastic. Think of yourself as a knowledgeable friend who happens to be really good at getting things done. You speak naturally, use casual language when appropriate, but maintain professionalism when handling important tasks. You don't use excessive exclamation points or overly cheerful language. You're confident, direct, and occasionally have a dry sense of humor. When helping with tasks, you're thorough but not verbose.`,
            tools: [
              {
                type: "function",
                name: "google_auth_setup",
                description: "Initiates Google authentication for Gmail and Calendar access when the user asks to connect or set up their Google account, Gmail, or Calendar.",
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
                name: "get_emails",
                description: "Retrieves recent emails from the user's Gmail inbox.",
                parameters: {
                  type: "object",
                  properties: {
                    maxResults: { type: "number", description: "Maximum number of emails to return (default 5)" }
                  }
                }
              },
              {
                type: "function",
                name: "search_emails",
                description: "Searches emails in Gmail with a query.",
                parameters: {
                  type: "object",
                  properties: {
                    query: { type: "string", description: "Search query (e.g., 'from:john subject:meeting')" },
                    maxResults: { type: "number", description: "Maximum results (default 5)" }
                  },
                  required: ["query"]
                }
              },
              {
                type: "function",
                name: "send_email",
                description: "Sends an email via Gmail.",
                parameters: {
                  type: "object",
                  properties: {
                    to: { type: "string", description: "Recipient email address" },
                    subject: { type: "string", description: "Email subject" },
                    text: { type: "string", description: "Email body text" },
                    cc: { type: "string", description: "CC recipients (optional)" },
                    bcc: { type: "string", description: "BCC recipients (optional)" }
                  },
                  required: ["to", "subject", "text"]
                }
              },
              {
                type: "function",
                name: "web_search",
                description: "Searches the web for information.",
                parameters: {
                  type: "object",
                  properties: {
                    query: { type: "string", description: "Search query" },
                    maxResults: { type: "number", description: "Maximum results (default 5)" }
                  },
                  required: ["query"]
                }
              },
              {
                type: "function",
                name: "get_weather",
                description: "Gets current weather for a location.",
                parameters: {
                  type: "object",
                  properties: {
                    location: { type: "string", description: "City name or location" },
                    units: { type: "string", description: "Units: 'fahrenheit' or 'celsius'" }
                  },
                  required: ["location"]
                }
              },
              {
                type: "function",
                name: "calculate",
                description: "Performs mathematical calculations.",
                parameters: {
                  type: "object",
                  properties: {
                    expression: { type: "string", description: "Mathematical expression to evaluate" }
                  },
                  required: ["expression"]
                }
              },
              {
                type: "function",
                name: "get_stock_price",
                description: "Gets current stock price and change.",
                parameters: {
                  type: "object",
                  properties: {
                    symbol: { type: "string", description: "Stock ticker symbol (e.g., AAPL, GOOGL)" }
                  },
                  required: ["symbol"]
                }
              },
              {
                type: "function",
                name: "get_crypto_price",
                description: "Gets current cryptocurrency price.",
                parameters: {
                  type: "object",
                  properties: {
                    symbol: { type: "string", description: "Crypto symbol (e.g., bitcoin, ethereum)" },
                    currency: { type: "string", description: "Currency to display price in (default USD)" }
                  },
                  required: ["symbol"]
                }
              },
              {
                type: "function",
                name: "get_definition",
                description: "Gets the dictionary definition of a word.",
                parameters: {
                  type: "object",
                  properties: {
                    word: { type: "string", description: "Word to define" }
                  },
                  required: ["word"]
                }
              },
              {
                type: "function",
                name: "wikipedia_search",
                description: "Searches Wikipedia for information on a topic.",
                parameters: {
                  type: "object",
                  properties: {
                    query: { type: "string", description: "Topic to search" }
                  },
                  required: ["query"]
                }
              },
              {
                type: "function",
                name: "convert_units",
                description: "Converts between units of measurement.",
                parameters: {
                  type: "object",
                  properties: {
                    value: { type: "number", description: "Value to convert" },
                    from: { type: "string", description: "Source unit (e.g., 'km', 'miles', 'kg', 'lbs')" },
                    to: { type: "string", description: "Target unit" }
                  },
                  required: ["value", "from", "to"]
                }
              },
              {
                type: "function",
                name: "get_time",
                description: "Gets current time in a specific timezone.",
                parameters: {
                  type: "object",
                  properties: {
                    timezone: { type: "string", description: "Timezone (e.g., 'America/New_York', 'Europe/London')" }
                  },
                  required: ["timezone"]
                }
              },
              {
                type: "function",
                name: "set_reminder",
                description: "Creates a reminder as a calendar event.",
                parameters: {
                  type: "object",
                  properties: {
                    title: { type: "string", description: "Reminder title" },
                    dateTime: { type: "string", description: "When to remind (ISO 8601 format)" },
                    priority: { type: "string", description: "Priority: low, medium, high" }
                  },
                  required: ["title", "dateTime"]
                }
              }
            ]
          }
        };
        ws.send(JSON.stringify(sessionUpdate));

        if (shouldGreetOnConnectRef.current) {
          shouldGreetOnConnectRef.current = false;
          ws.send(JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "user",
              content: [{ type: "input_text", text: "Hey Maylah" }]
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
          } else if (data.type === 'transcript') {
            setTranscript(data.text);
          }
        } catch (e) {
          console.error('WebSocket message error:', e);
        }
      };

      ws.onclose = () => {
        console.log('Disconnected from Maylah Backend');
        setConnected(false);
        setListening(false);
        setLoading(false);
        stopAudioCapture();
        stopTranscriptRecognition();
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
  }, [connected, loading, handleAudioMessage, startTranscriptRecognition, stopTranscriptRecognition]);

  const disconnectFromGemini = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    stopAudioCapture();
    stopTranscriptRecognition();
    setConnected(false);
    setListening(false);
  }, [stopTranscriptRecognition]);

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

  const handleStartListening = useCallback(async () => {
    // Resume audio context if suspended (browser autoplay policy)
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      try {
        await audioContextRef.current.resume();
        setShowAudioHint(false);
      } catch (e) {
        console.error('Failed to resume audio context:', e);
        setShowAudioHint(true);
      }
    }
    
    shouldGreetOnConnectRef.current = true;
    connectToGemini();
  }, [connectToGemini]);

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
            stopWakeRecognition();
            handleStartListening();
          }
        }
      };

      recognition.onend = () => {
        wakeRunningRef.current = false;
        recognizerRef.current = null;
        // Check refs instead of captured state to avoid stale closures
        if (wakeWordEnabledRef.current && !listeningRef.current) {
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
    } catch (e) {
      console.error('Failed to start wake recognition:', e);
    }
  }, [wakeWordEnabled, listening, detectWakeWord, handleStartListening]);

  const stopWakeRecognition = useCallback(() => {
    if (recognizerRef.current) {
      recognizerRef.current.stop();
      recognizerRef.current = null;
    }
    wakeRunningRef.current = false;
  }, []);

  const handleStopListening = useCallback(() => {
    disconnectFromGemini();
    if (wakeWordEnabled) {
      startWakeRecognition();
    }
  }, [disconnectFromGemini, wakeWordEnabled, startWakeRecognition]);

  // Manage wake word recognition state
  useEffect(() => {
    if (wakeWordEnabled && !listening && !loading && !connected) {
      startWakeRecognition();
    } else {
      stopWakeRecognition();
    }
  }, [wakeWordEnabled, listening, loading, connected, startWakeRecognition, stopWakeRecognition]);

  // Determine state
  let orbState: 'idle' | 'listening' | 'thinking' | 'speaking' = 'idle';
  if (loading) orbState = 'thinking';
  else if (speaking) orbState = 'speaking';
  else if (listening) orbState = 'listening';

  return (
    <div className="maylah-container">
      {/* Ambient background */}
      <div className="ambient-bg" />
      <div className="glass-overlay" />

      {/* Status indicator */}
      <div className="status-bar">
        {showAudioHint && (
          <div className="audio-hint" onClick={() => {
            if (audioContextRef.current) {
              audioContextRef.current.resume();
              setShowAudioHint(false);
            }
          }}>
            Tap to enable audio
          </div>
        )}
        <div className={`status-indicator ${connected ? 'connected' : ''}`}>
          <span className="status-dot" />
          <span className="status-text">{connected ? 'Connected' : 'Ready'}</span>
        </div>
        <button 
          className="settings-btn"
          onClick={() => setShowSettings(!showSettings)}
          aria-label="Settings"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="settings-panel">
          <div className="settings-content">
            <h3>Settings</h3>
            
            <div className="setting-item">
              <span>Wake Word Detection</span>
              <button 
                className={`toggle-btn ${wakeWordEnabled ? 'active' : ''}`}
                onClick={() => {
                  const next = !wakeWordEnabled;
                  setWakeWordEnabled(next);
                  if (next && !listening) startWakeRecognition();
                  else stopWakeRecognition();
                }}
              >
                {wakeWordEnabled ? 'On' : 'Off'}
              </button>
            </div>

            <div className="setting-item">
              <span>Google Account</span>
              <button 
                className={`toggle-btn ${googleStatus === 'available' ? 'active' : ''}`}
                onClick={triggerGoogleAuth}
              >
                {googleStatus === 'available' ? 'Connected' : 'Connect'}
              </button>
            </div>

            <button className="close-settings" onClick={() => setShowSettings(false)}>
              Done
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="main-content">
        {/* Logo/Name */}
        <div className="brand">
          <h1 className="brand-name">maylah</h1>
        </div>

        {/* Orb visualization */}
        <LiquidOrb state={orbState} audioLevel={audioLevel} />

        {/* Transcript area */}
        <div className="transcript-area">
          {error ? (
            <TranscriptDisplay text={error} type="system" />
          ) : interimTranscript ? (
            <TranscriptDisplay text={interimTranscript} type="user" isInterim />
          ) : transcript ? (
            <TranscriptDisplay text={transcript} type="user" />
          ) : (
            <TranscriptDisplay 
              text={
                listening 
                  ? "I'm listening..." 
                  : speaking 
                    ? "" 
                    : loading 
                      ? "Connecting..." 
                      : wakeWordEnabled 
                        ? 'Say "Maylah" to start' 
                        : "Tap to start"
              } 
              type="system" 
            />
          )}
        </div>
      </main>

      {/* Control bar */}
      <div className="control-bar">
        {!listening ? (
          <button
            className="main-btn"
            onClick={handleStartListening}
            disabled={loading}
            aria-label="Start conversation"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>
        ) : (
          <button
            className="main-btn active"
            onClick={handleStopListening}
            aria-label="Stop conversation"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};

export default WebRTCApp;
