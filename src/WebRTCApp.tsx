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

const TiSangAvatar: React.FC<{ speaking: boolean; mouthScale?: number; blink?: boolean; shape?: MouthShape }> = ({ speaking, mouthScale = 1, blink = false, shape = 'mid' }: { speaking: boolean; mouthScale?: number; blink?: boolean; shape?: MouthShape }) => {
  const ORANGE = '#CC5500';
  const ORANGE_LIGHT = '#FF6B1A';
  const ORANGE_DARK = '#A34400';
  const baseShapes = {
    closed: { rx: 20, ry: 2 },
    narrow: { rx: 18, ry: 3 },
    mid: { rx: 22, ry: 8 },
    open: { rx: 22, ry: 22 },
  };
  const base = baseShapes[shape] || baseShapes.mid;

  return (
    <div className={`avatar-container ${speaking ? 'speaking' : ''}`}>
      <svg className="ti-sang-svg" width="400" height="400" viewBox="0 0 400 400" aria-label="Ti-sang avatar">
        <defs>
          {/* Gradients for 3D effect */}
          <radialGradient id="faceGradient" cx="45%" cy="35%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="70%" stopColor="#F5F5F5" />
            <stop offset="100%" stopColor="#E0E0E0" />
          </radialGradient>

          <radialGradient id="hairGradient" cx="50%" cy="30%">
            <stop offset="0%" stopColor={ORANGE_LIGHT} />
            <stop offset="60%" stopColor={ORANGE} />
            <stop offset="100%" stopColor={ORANGE_DARK} />
          </radialGradient>

          <radialGradient id="eyeGradient" cx="35%" cy="35%">
            <stop offset="0%" stopColor={ORANGE_LIGHT} />
            <stop offset="50%" stopColor={ORANGE} />
            <stop offset="100%" stopColor={ORANGE_DARK} />
          </radialGradient>

          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>

          <filter id="shadow">
            <feDropShadow dx="0" dy="4" stdDeviation="6" floodOpacity="0.3"/>
          </filter>
        </defs>

        {/* Animated background ring */}
        <circle
          cx="200" cy="200" r="160"
          fill="none"
          stroke={ORANGE}
          strokeWidth="3"
          opacity="0.2"
          className="pulse-ring"
        />
        <circle
          cx="200" cy="200" r="140"
          fill="none"
          stroke={ORANGE_LIGHT}
          strokeWidth="2"
          opacity="0.15"
          className="pulse-ring-2"
        />

        {/* Main face with 3D gradient */}
        <circle
          cx="200" cy="200" r="120"
          fill="url(#faceGradient)"
          filter="url(#shadow)"
        />

        {/* Face outline with glow effect */}
        <circle
          cx="200" cy="200" r="120"
          fill="none"
          stroke={ORANGE}
          strokeWidth="8"
          className={speaking ? 'face-glow-active' : 'face-glow'}
        />

        {/* Hair - more 3D styled */}
        <g className="hair-group">
          {/* Main hair shape */}
          <ellipse
            cx="200" cy="130" rx="130" ry="70"
            fill="url(#hairGradient)"
            filter="url(#shadow)"
          />

          {/* Hair strands for detail */}
          <path
            d="M 100 140 Q 90 100 95 80 Q 100 90 105 100"
            fill={ORANGE}
            opacity="0.7"
          />
          <path
            d="M 140 110 Q 140 70 145 55 Q 145 75 145 95"
            fill={ORANGE_LIGHT}
            opacity="0.6"
          />
          <path
            d="M 200 105 Q 200 60 200 40 Q 200 65 200 90"
            fill={ORANGE_LIGHT}
            opacity="0.8"
          />
          <path
            d="M 260 110 Q 260 70 255 55 Q 255 75 255 95"
            fill={ORANGE_LIGHT}
            opacity="0.6"
          />
          <path
            d="M 300 140 Q 310 100 305 80 Q 300 90 295 100"
            fill={ORANGE}
            opacity="0.7"
          />

          {/* Hair highlights */}
          <ellipse cx="160" cy="100" rx="15" ry="8" fill="#FFB380" opacity="0.4" />
          <ellipse cx="240" cy="100" rx="15" ry="8" fill="#FFB380" opacity="0.4" />
        </g>

        {/* Eyes with 3D effect */}
        <g className={`eyes ${blink ? 'blink' : ''}`}>
          {/* Eye whites */}
          <ellipse cx="160" cy="185" rx="20" ry="18" fill="white" opacity="0.9" />
          <ellipse cx="240" cy="185" rx="20" ry="18" fill="white" opacity="0.9" />

          {/* Iris */}
          <circle cx="160" cy="185" r="12" fill="url(#eyeGradient)" filter="url(#shadow)" />
          <circle cx="240" cy="185" r="12" fill="url(#eyeGradient)" filter="url(#shadow)" />

          {/* Pupils with shine */}
          <circle cx="160" cy="185" r="6" fill="#1a1a1a" />
          <circle cx="240" cy="185" r="6" fill="#1a1a1a" />
          <circle cx="163" cy="182" r="2.5" fill="white" opacity="0.9" />
          <circle cx="243" cy="182" r="2.5" fill="white" opacity="0.9" />
        </g>

        {/* Eyebrows */}
        <path
          d="M 140 165 Q 160 160 180 165"
          stroke={ORANGE_DARK}
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M 220 165 Q 240 160 260 165"
          stroke={ORANGE_DARK}
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />

        {/* Nose - subtle 3D */}
        <ellipse cx="200" cy="210" rx="8" ry="12" fill={ORANGE} opacity="0.2" />

        {/* Mouth with 3D effect */}
        <g className="mouth-group">
          <ellipse
            className="mouth"
            cx="200" cy="245"
            rx={base.rx} ry={base.ry}
            fill={ORANGE}
            filter="url(#shadow)"
            style={{ transform: `scaleY(${mouthScale})`, transformOrigin: '200px 245px' }}
          />
          {/* Mouth highlight for 3D effect */}
          <ellipse
            cx="200" cy="243"
            rx={base.rx * 0.6} ry={base.ry * 0.5}
            fill={ORANGE_LIGHT}
            opacity="0.3"
            style={{ transform: `scaleY(${mouthScale * 0.8})`, transformOrigin: '200px 243px' }}
          />
        </g>

        {/* Cheek blush */}
        <ellipse cx="140" cy="215" rx="18" ry="12" fill="#FFB3BA" opacity="0.4" />
        <ellipse cx="260" cy="215" rx="18" ry="12" fill="#FFB3BA" opacity="0.4" />

        {/* Sound waves when speaking */}
        {speaking && (
          <g className="sound-waves">
            <path d="M 340 200 Q 350 190 360 200 Q 350 210 340 200"
                  stroke={ORANGE} strokeWidth="3" fill="none" opacity="0.6" />
            <path d="M 360 200 Q 375 185 390 200 Q 375 215 360 200"
                  stroke={ORANGE_LIGHT} strokeWidth="2" fill="none" opacity="0.4" />
            <path d="M 60 200 Q 50 190 40 200 Q 50 210 60 200"
                  stroke={ORANGE} strokeWidth="3" fill="none" opacity="0.6" />
            <path d="M 40 200 Q 25 185 10 200 Q 25 215 40 200"
                  stroke={ORANGE_LIGHT} strokeWidth="2" fill="none" opacity="0.4" />
          </g>
        )}
      </svg>

      {/* Particle effects when speaking */}
      {speaking && (
        <div className="particles">
          <div className="particle"></div>
          <div className="particle"></div>
          <div className="particle"></div>
          <div className="particle"></div>
          <div className="particle"></div>
        </div>
      )}
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
  const [wakeWordEnabled, setWakeWordEnabled] = useState(false); // Changed to false by default
  const [pendingWakeStart, setPendingWakeStart] = useState(false);
  const [gmailStatus, setGmailStatus] = useState<'unknown' | 'available' | 'unavailable'>('unknown');

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
    
    return best >= wakeThreshold;
  }, []);

  // Command detection for returning to wake word mode or shutting down
  const detectVoiceCommands = useCallback((text: string) => {
    const cleaned = sanitize(text);
    console.log('🔍 Checking command in:', cleaned);
    
    // Commands to return to wake word mode
    const wakeCommands = [
      'ok bye', 'okay bye', 'bye ti-sang', 'thanks ti-sang', 'thank you ti-sang',
      'see you later', 'talk to you later', 'goodbye', 'bye bye', 'bye', 'thanks'
    ];
    
    // Commands to shut down completely
    const shutdownCommands = [
      'shut down', 'shutdown', 'stop listening', 'turn off', 'go to sleep', 'stop'
    ];
    
    for (const cmd of wakeCommands) {
      const cmdClean = sanitize(cmd);
      if (cleaned.includes(cmdClean) || similarity(cleaned, cmdClean) > 0.6) {
        console.log('✅ Wake mode command detected:', cmd);
        return 'wake_mode';
      }
    }
    
    for (const cmd of shutdownCommands) {
      const cmdClean = sanitize(cmd);
      if (cleaned.includes(cmdClean) || similarity(cleaned, cmdClean) > 0.6) {
        console.log('✅ Shutdown command detected:', cmd);
        return 'shutdown';
      }
    }
    
    return null;
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

  const handleGmailSetup = useCallback(async () => {
    try {
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const base = isLocal ? 'http://localhost:3000' : '';
      const response = await fetch(`${base}/api/gmail/auth-url`);

      if (!response.ok) {
        const error = await response.json();
        return {
          error: error.error || 'Gmail setup failed',
          message: 'Gmail credentials not found. Please check the setup guide.'
        };
      }

      const data = await response.json();

      // Detect if running as standalone PWA
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                          (window.navigator as any).standalone === true;

      if (isStandalone) {
        // In standalone mode, store return URL and redirect the whole page
        sessionStorage.setItem('oauth-return-url', window.location.href);
        sessionStorage.setItem('oauth-in-progress', 'true');
        window.location.href = data.authUrl;

        return {
          success: true,
          message: 'Redirecting to Gmail authentication...'
        };
      } else {
        // In browser mode, use popup window
        window.open(data.authUrl, 'gmail-auth', 'width=600,height=600,scrollbars=yes,resizable=yes');

        return {
          success: true,
          message: 'Gmail authentication window opened. Please complete the OAuth flow.'
        };
      }
    } catch {
      return {
        error: 'Gmail setup failed',
        message: 'Unable to start Gmail authentication. Please try again.'
      };
    }
  }, []);

  const handleSendEmail = useCallback(async (args: { to: string; subject: string; text: string; cc?: string; bcc?: string; }) => {
    try {
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const base = isLocal ? 'http://localhost:3000' : '';
      const response = await fetch(`${base}/api/gmail/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
      });
      if (!response.ok) {
        const error = await response.json();
        return { error: error.error || 'Failed to send email' };
      }
      const data = await response.json();
      return { success: true, id: data.result?.id };
    } catch {
      return { error: 'Failed to send email' };
    }
  }, []);

  const handleCreateCalendarEvent = useCallback(async (args: { summary: string; description?: string; start: { date?: string; dateTime?: string }; end: { date?: string; dateTime?: string }; timezone?: string; }) => {
    try {
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const base = isLocal ? 'http://localhost:3000' : '';
      const response = await fetch(`${base}/api/calendar/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
      });
      if (!response.ok) {
        const error = await response.json();
        return { error: error.error || 'Failed to create calendar event' };
      }
      const data = await response.json();
      return { success: true, id: data.result?.id, link: data.result?.htmlLink };
    } catch {
      return { error: 'Failed to create calendar event' };
    }
  }, []);

  const handleGetEmailDetails = useCallback(async (args: { emailId: string }) => {
    try {
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const base = isLocal ? 'http://localhost:3000' : '';
      const response = await fetch(`${base}/api/gmail/email/${args.emailId}`);
      if (!response.ok) {
        const error = await response.json();
        return { error: error.error || 'Failed to get email details' };
      }
      const data = await response.json();
      return { success: true, email: data.email };
    } catch {
      return { error: 'Failed to get email details' };
    }
  }, []);

  const handleDeleteEmail = useCallback(async (args: { emailId: string; permanent?: boolean }) => {
    try {
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const base = isLocal ? 'http://localhost:3000' : '';
      const response = await fetch(`${base}/api/gmail/email/${args.emailId}?permanent=${args.permanent || false}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        const error = await response.json();
        return { error: error.error || 'Failed to delete email' };
      }
      const data = await response.json();
      return { success: true, result: data.result };
    } catch {
      return { error: 'Failed to delete email' };
    }
  }, []);

  const handleReplyToEmail = useCallback(async (args: { emailId: string; text: string }) => {
    try {
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const base = isLocal ? 'http://localhost:3000' : '';
      const response = await fetch(`${base}/api/gmail/reply/${args.emailId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: args.text })
      });
      if (!response.ok) {
        const error = await response.json();
        return { error: error.error || 'Failed to reply to email' };
      }
      const data = await response.json();
      return { success: true, result: data.result };
    } catch {
      return { error: 'Failed to reply to email' };
    }
  }, []);

  const handleSummarizeEmails = useCallback(async (args: { maxResults?: number }) => {
    try {
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const base = isLocal ? 'http://localhost:3000' : '';
      const response = await fetch(`${base}/api/gmail/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxResults: args.maxResults || 10 })
      });
      if (!response.ok) {
        const error = await response.json();
        return { error: error.error || 'Failed to summarize emails' };
      }
      const data = await response.json();
      return { success: true, summary: data.summary, emails: data.emails };
    } catch {
      return { error: 'Failed to summarize emails' };
    }
  }, []);

  const handleListCalendarEvents = useCallback(async (args: { maxResults?: number; timeMin?: string; timeMax?: string; query?: string }) => {
    try {
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const base = isLocal ? 'http://localhost:3000' : '';
      const params = new URLSearchParams();
      if (args.maxResults) params.set('maxResults', args.maxResults.toString());
      if (args.timeMin) params.set('timeMin', args.timeMin);
      if (args.timeMax) params.set('timeMax', args.timeMax);
      if (args.query) params.set('query', args.query);

      const response = await fetch(`${base}/api/calendar/events?${params.toString()}`);
      if (!response.ok) {
        const error = await response.json();
        return { error: error.error || 'Failed to list calendar events' };
      }
      const data = await response.json();
      return { success: true, events: data.events };
    } catch {
      return { error: 'Failed to list calendar events' };
    }
  }, []);

  const handleAddActionItem = useCallback(async (args: { actionItem: string; dueDate: string; priority?: string }) => {
    try {
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const base = isLocal ? 'http://localhost:3000' : '';
      const response = await fetch(`${base}/api/calendar/action-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
      });
      if (!response.ok) {
        const error = await response.json();
        return { error: error.error || 'Failed to add action item' };
      }
      const data = await response.json();
      return { success: true, result: data.result };
    } catch {
      return { error: 'Failed to add action item' };
    }
  }, []);

  // New utility tool handlers
  const handleGetWeather = useCallback(async (args: { location: string; units?: string }) => {
    try {
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const base = isLocal ? 'http://localhost:3000' : '';
      const response = await fetch(`${base}/api/weather`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
      });
      if (!response.ok) {
        const error = await response.json();
        return { error: error.error || 'Failed to get weather' };
      }
      return await response.json();
    } catch {
      return { error: 'Failed to get weather' };
    }
  }, []);

  const handleCalculate = useCallback(async (args: { expression: string }) => {
    try {
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const base = isLocal ? 'http://localhost:3000' : '';
      const response = await fetch(`${base}/api/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
      });
      if (!response.ok) {
        const error = await response.json();
        return { error: error.error || 'Failed to calculate' };
      }
      return await response.json();
    } catch {
      return { error: 'Failed to calculate' };
    }
  }, []);

  const handleConvertUnits = useCallback(async (args: { value: number; from: string; to: string }) => {
    try {
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const base = isLocal ? 'http://localhost:3000' : '';
      const response = await fetch(`${base}/api/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
      });
      if (!response.ok) {
        const error = await response.json();
        return { error: error.error || 'Failed to convert units' };
      }
      return await response.json();
    } catch {
      return { error: 'Failed to convert units' };
    }
  }, []);

  const handleTranslateText = useCallback(async (args: { text: string; targetLanguage: string; sourceLanguage?: string }) => {
    try {
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const base = isLocal ? 'http://localhost:3000' : '';
      const response = await fetch(`${base}/api/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
      });
      if (!response.ok) {
        const error = await response.json();
        return { error: error.error || 'Failed to translate' };
      }
      return await response.json();
    } catch {
      return { error: 'Failed to translate' };
    }
  }, []);

  const handleGetDefinition = useCallback(async (args: { word: string }) => {
    try {
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const base = isLocal ? 'http://localhost:3000' : '';
      const response = await fetch(`${base}/api/definition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
      });
      if (!response.ok) {
        const error = await response.json();
        return { error: error.error || 'Failed to get definition' };
      }
      return await response.json();
    } catch {
      return { error: 'Failed to get definition' };
    }
  }, []);

  const handleWikipediaSearch = useCallback(async (args: { query: string; sentences?: number }) => {
    try {
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const base = isLocal ? 'http://localhost:3000' : '';
      const response = await fetch(`${base}/api/wikipedia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
      });
      if (!response.ok) {
        const error = await response.json();
        return { error: error.error || 'Failed to search Wikipedia' };
      }
      return await response.json();
    } catch {
      return { error: 'Failed to search Wikipedia' };
    }
  }, []);

  const handleGetStockPrice = useCallback(async (args: { symbol: string }) => {
    try {
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const base = isLocal ? 'http://localhost:3000' : '';
      const response = await fetch(`${base}/api/stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
      });
      if (!response.ok) {
        const error = await response.json();
        return { error: error.error || 'Failed to get stock price' };
      }
      return await response.json();
    } catch {
      return { error: 'Failed to get stock price' };
    }
  }, []);

  const handleGetCryptoPrice = useCallback(async (args: { symbol: string; currency?: string }) => {
    try {
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const base = isLocal ? 'http://localhost:3000' : '';
      const response = await fetch(`${base}/api/crypto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
      });
      if (!response.ok) {
        const error = await response.json();
        return { error: error.error || 'Failed to get crypto price' };
      }
      return await response.json();
    } catch {
      return { error: 'Failed to get crypto price' };
    }
  }, []);

  const handleGetTime = useCallback(async (args: { timezone: string }) => {
    try {
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const base = isLocal ? 'http://localhost:3000' : '';
      const response = await fetch(`${base}/api/time`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
      });
      if (!response.ok) {
        const error = await response.json();
        return { error: error.error || 'Failed to get time' };
      }
      return await response.json();
    } catch {
      return { error: 'Failed to get time' };
    }
  }, []);

  const handleSearchImages = useCallback(async (args: { query: string; maxResults?: number }) => {
    try {
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const base = isLocal ? 'http://localhost:3000' : '';
      const response = await fetch(`${base}/api/search/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
      });
      if (!response.ok) {
        const error = await response.json();
        return { error: error.error || 'Failed to search images' };
      }
      return await response.json();
    } catch {
      return { error: 'Failed to search images' };
    }
  }, []);

  const handleSearchVideos = useCallback(async (args: { query: string; maxResults?: number }) => {
    try {
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const base = isLocal ? 'http://localhost:3000' : '';
      const response = await fetch(`${base}/api/search/videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
      });
      if (!response.ok) {
        const error = await response.json();
        return { error: error.error || 'Failed to search videos' };
      }
      return await response.json();
    } catch {
      return { error: 'Failed to search videos' };
    }
  }, []);

  const handleAdvancedWebSearch = useCallback(async (args: { query: string; timeRange?: string; site?: string; maxResults?: number }) => {
    try {
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const base = isLocal ? 'http://localhost:3000' : '';
      const response = await fetch(`${base}/api/search/advanced`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
      });
      if (!response.ok) {
        const error = await response.json();
        return { error: error.error || 'Failed to search' };
      }
      return await response.json();
    } catch {
      return { error: 'Failed to search' };
    }
  }, []);

  // Check Gmail status
  const checkGmailStatus = useCallback(async () => {
    try {
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const base = isLocal ? 'http://localhost:3000' : '';
      const response = await fetch(`${base}/api/status`);
      
      if (response.ok) {
        const data = await response.json();
        setGmailStatus(data.gmail ? 'available' : 'unavailable');
      } else {
        setGmailStatus('unavailable');
      }
    } catch {
      setGmailStatus('unavailable');
    }
  }, []);

  // Manual Gmail setup trigger
  const triggerGmailSetup = useCallback(async () => {
    try {
      const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const base = isLocal ? 'http://localhost:3000' : '';
      const response = await fetch(`${base}/api/gmail/auth-url`);

      if (!response.ok) {
        const error = await response.json();
        if (error.setup_url) {
          // Open setup guide
          window.open(`${base}/gmail-setup`, 'gmail-setup', 'width=900,height=700,scrollbars=yes,resizable=yes');
        } else {
          alert('Gmail setup failed: ' + (error.error || 'Unknown error'));
        }
        return;
      }

      const data = await response.json();

      // Detect if running as standalone PWA
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                          (window.navigator as any).standalone === true;

      if (isStandalone) {
        // In standalone mode, redirect the whole page
        sessionStorage.setItem('oauth-return-url', window.location.href);
        sessionStorage.setItem('oauth-in-progress', 'true');
        window.location.href = data.authUrl;
      } else {
        // In browser mode, use popup window
        const authWindow = window.open(data.authUrl, 'gmail-auth', 'width=600,height=600,scrollbars=yes,resizable=yes');

        // Check if window was closed and refresh status
        const checkClosed = setInterval(() => {
          if (authWindow?.closed) {
            clearInterval(checkClosed);
            setTimeout(() => {
              checkGmailStatus();
            }, 1000);
          }
        }, 1000);
      }

    } catch (error) {
      console.error('Gmail setup error:', error);
      alert('Failed to start Gmail setup. Please try again.');
    }
  }, [checkGmailStatus]);

  // Wake word recognition
  const startWakeRecognition = useCallback(() => {
    try {
      const SpeechRec: SRConstructor | undefined = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRec) {
        console.warn('SpeechRecognition not supported in this browser.');
        return;
      }
      
      // Prevent multiple instances
      if (wakeStartingRef.current || wakeRunningRef.current || recognizerRef.current) {
        console.log('Wake recognition already running or starting');
        return;
      }

      const recognition = new SpeechRec();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      wakeShouldRunRef.current = true;

      // Clear any existing timeouts
      if (wakeRestartTimeoutRef.current) {
        window.clearTimeout(wakeRestartTimeoutRef.current);
        wakeRestartTimeoutRef.current = null;
      }

      recognition.onstart = () => {
        console.log('✅ Wake word recognition started');
        wakeStartingRef.current = false;
        wakeRunningRef.current = true;
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        if (!wakeShouldRunRef.current) return; // Ignore results if we're shutting down
        
        const results = event.results;
        const idx = event.resultIndex;
        const transcript = results[idx][0].transcript;
        const confidence = results[idx][0].confidence;
        
        if (results[idx].isFinal || (confidence ?? 0) > 0.7) {
          const now = Date.now();
          const onCooldown = now - lastWakeTimeRef.current < 3000;
          if (!onCooldown && detectWakeWord(transcript)) {
            lastWakeTimeRef.current = now;
            console.log('🎯 Wake word detected:', transcript);
            shouldGreetOnConnectRef.current = true;
            setPendingWakeStart(true);
          }
        }
      };

      recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
        console.warn('⚠️ SpeechRecognition error:', e.error, e.message);
        wakeRunningRef.current = false;
        
        // Only restart for recoverable errors and if we should still be running
        const recoverable = e.error === 'no-speech' || e.error === 'network';
        const shouldRestart = recoverable && wakeShouldRunRef.current && !listening && wakeWordEnabled;
        
        if (e.error === 'aborted') {
          // Don't restart on aborted - this usually means we're stopping intentionally
          console.log('🛑 Speech recognition aborted - not restarting');
          return;
        }
        
        if (shouldRestart) {
          // Longer delay to prevent rapid restart cycles
          if (wakeRestartTimeoutRef.current) window.clearTimeout(wakeRestartTimeoutRef.current);
          wakeRestartTimeoutRef.current = window.setTimeout(() => {
            if (wakeShouldRunRef.current && !listening && !recognizerRef.current) {
              console.log('🔄 Restarting wake recognition after error');
              startWakeRecognition();
            }
          }, 1500); // Increased delay to 1.5 seconds
        }
      };

      recognition.onend = () => {
        console.log('🔚 Wake recognition ended');
        wakeRunningRef.current = false;
        
        // Only restart if we should still be running
        if (wakeWordEnabled && wakeShouldRunRef.current && !listening) {
          if (wakeRestartTimeoutRef.current) window.clearTimeout(wakeRestartTimeoutRef.current);
          wakeRestartTimeoutRef.current = window.setTimeout(() => {
            if (wakeShouldRunRef.current && !listening && !recognizerRef.current) {
              console.log('🔄 Restarting wake recognition after end');
              startWakeRecognition();
            }
          }, 1000); // 1 second delay for normal restart
        }
      };

      recognizerRef.current = recognition;
      
      try { 
        wakeStartingRef.current = true; 
        recognition.start(); 
      } catch (error) {
        console.error('❌ Failed to start recognition:', error);
        wakeStartingRef.current = false;
        recognizerRef.current = null;
      }
      
    } catch (e) {
      console.warn('❌ Failed to start wake recognition:', e);
      wakeStartingRef.current = false;
    }
  }, [wakeWordEnabled, listening, detectWakeWord]);

  const stopWakeRecognition = useCallback(() => {
    console.log('🛑 Stopping wake recognition');
    const rec = recognizerRef.current;
    
    // Stop should run flag first to prevent restarts
    wakeShouldRunRef.current = false;
    
    // Clear any pending restart timeouts
    if (wakeRestartTimeoutRef.current) { 
      window.clearTimeout(wakeRestartTimeoutRef.current); 
      wakeRestartTimeoutRef.current = null; 
    }
    
    if (rec) {
      try {
        // Clear event handlers to prevent callbacks during shutdown
        rec.onresult = null; 
        rec.onend = null; 
        rec.onerror = null; 
        rec.onstart = null;
        
        // Stop the recognition
        rec.stop();
      } catch (error) {
        console.warn('⚠️ Error stopping recognition:', error);
      }
      
      recognizerRef.current = null;
    }
    
    // Reset state flags
    wakeRunningRef.current = false;
    wakeStartingRef.current = false;
    
    console.log('✅ Wake word recognition stopped');
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
          const AudioCtor =
            window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          const audioContext = audioContextRef.current || (AudioCtor ? new AudioCtor() : undefined);
          if (!audioContext) {
            console.error('No AudioContext support in this browser');
            return;
          }
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
              'You are Ti-Sang, a professional and efficient voice assistant focused on task completion.',
              '',
              'USER: Terence - Address him as "Terence" when appropriate.',
              '',
              'COMMUNICATION STYLE:',
              '- Professional and concise',
              '- Task-focused and efficient',
              '- Clear and direct responses',
              '- Minimal pleasantries unless specifically requested',
              '- Confirm actions taken, report results briefly',
              '',
              'VOICE COMMANDS:',
              '- "ok bye", "thanks", "goodbye" → Return to wake word mode',
              '- "shut down", "stop listening" → Stop all listening',
              '',
              'CORE RESPONSIBILITIES:',
              '1. Execute tasks efficiently',
              '2. Provide accurate information',
              '3. Manage email and calendar effectively',
              '4. Search and retrieve information quickly',
              '5. Minimize conversation, maximize action',
              '',
              'When handling tasks:',
              '- Confirm understanding briefly',
              '- Execute immediately',
              '- Report completion status',
              '- Ask for clarification only when necessary'
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
              },
              {
                type: "function",
                name: "setup_gmail",
                description: "Set up Gmail authentication for the user",
                parameters: {
                  type: "object",
                  properties: {},
                  required: []
                }
              },
              {
                type: "function",
                name: "send_email",
                description: "Send an email via Gmail",
                parameters: {
                  type: "object",
                  properties: {
                    to: { type: "string", description: "Recipient email address" },
                    subject: { type: "string", description: "Email subject" },
                    text: { type: "string", description: "Plain text body" },
                    cc: { type: "string", description: "CC recipients (optional)" },
                    bcc: { type: "string", description: "BCC recipients (optional)" }
                  },
                  required: ["to", "subject", "text"]
                }
              },
              {
                type: "function",
                name: "create_calendar_event",
                description: "Create a Google Calendar event",
                parameters: {
                  type: "object",
                  properties: {
                    summary: { type: "string", description: "Event title" },
                    description: { type: "string", description: "Event description" },
                    start: {
                      type: "object",
                      description: "Start time/date. Provide either date (YYYY-MM-DD) or dateTime (ISO).",
                      properties: {
                        date: { type: "string" },
                        dateTime: { type: "string" }
                      }
                    },
                    end: {
                      type: "object",
                      description: "End time/date. Provide either date (YYYY-MM-DD) or dateTime (ISO).",
                      properties: {
                        date: { type: "string" },
                        dateTime: { type: "string" }
                      }
                    },
                    timezone: { type: "string", description: "IANA timezone, e.g., America/New_York" }
                  },
                  required: ["summary", "start", "end"]
                }
              },
              {
                type: "function",
                name: "get_email_details",
                description: "Get full details of a specific email by ID",
                parameters: {
                  type: "object",
                  properties: {
                    emailId: { type: "string", description: "The email ID to retrieve" }
                  },
                  required: ["emailId"]
                }
              },
              {
                type: "function",
                name: "delete_email",
                description: "Delete an email (moves to trash by default, or permanently deletes)",
                parameters: {
                  type: "object",
                  properties: {
                    emailId: { type: "string", description: "The email ID to delete" },
                    permanent: { type: "boolean", description: "If true, permanently delete; otherwise move to trash (default: false)" }
                  },
                  required: ["emailId"]
                }
              },
              {
                type: "function",
                name: "reply_to_email",
                description: "Reply to an email",
                parameters: {
                  type: "object",
                  properties: {
                    emailId: { type: "string", description: "The email ID to reply to" },
                    text: { type: "string", description: "Plain text reply message" }
                  },
                  required: ["emailId", "text"]
                }
              },
              {
                type: "function",
                name: "summarize_emails",
                description: "Get a summary of recent emails including total count, senders, and important metrics",
                parameters: {
                  type: "object",
                  properties: {
                    maxResults: { type: "number", description: "Maximum number of emails to analyze (default: 10)" }
                  }
                }
              },
              {
                type: "function",
                name: "list_calendar_events",
                description: "List upcoming calendar events",
                parameters: {
                  type: "object",
                  properties: {
                    maxResults: { type: "number", description: "Maximum number of events to retrieve (default: 10)" },
                    timeMin: { type: "string", description: "Start time in ISO format (default: now)" },
                    timeMax: { type: "string", description: "End time in ISO format (optional)" },
                    query: { type: "string", description: "Search query to filter events (optional)" }
                  }
                }
              },
              {
                type: "function",
                name: "add_action_item",
                description: "Add an action item to the calendar with reminders",
                parameters: {
                  type: "object",
                  properties: {
                    actionItem: { type: "string", description: "Description of the action item" },
                    dueDate: { type: "string", description: "Due date/time in ISO format" },
                    priority: { type: "string", description: "Priority level: low, medium, or high (default: medium)" }
                  },
                  required: ["actionItem", "dueDate"]
                }
              },
              {
                type: "function",
                name: "get_weather",
                description: "Get current weather and forecast for a location",
                parameters: {
                  type: "object",
                  properties: {
                    location: { type: "string", description: "City name or zip code" },
                    units: { type: "string", description: "Temperature units: celsius, fahrenheit (default: fahrenheit)" }
                  },
                  required: ["location"]
                }
              },
              {
                type: "function",
                name: "calculate",
                description: "Perform mathematical calculations and evaluate expressions",
                parameters: {
                  type: "object",
                  properties: {
                    expression: { type: "string", description: "Mathematical expression to evaluate (e.g., '2 + 2', 'sqrt(16)', 'sin(45)')" }
                  },
                  required: ["expression"]
                }
              },
              {
                type: "function",
                name: "convert_units",
                description: "Convert between different units of measurement",
                parameters: {
                  type: "object",
                  properties: {
                    value: { type: "number", description: "The value to convert" },
                    from: { type: "string", description: "Source unit (e.g., 'miles', 'kg', 'celsius')" },
                    to: { type: "string", description: "Target unit (e.g., 'km', 'lbs', 'fahrenheit')" }
                  },
                  required: ["value", "from", "to"]
                }
              },
              {
                type: "function",
                name: "translate_text",
                description: "Translate text between languages",
                parameters: {
                  type: "object",
                  properties: {
                    text: { type: "string", description: "Text to translate" },
                    targetLanguage: { type: "string", description: "Target language code (e.g., 'es', 'fr', 'de', 'ja')" },
                    sourceLanguage: { type: "string", description: "Source language code (optional, auto-detect if not provided)" }
                  },
                  required: ["text", "targetLanguage"]
                }
              },
              {
                type: "function",
                name: "get_definition",
                description: "Get dictionary definition and information about a word",
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
                description: "Search Wikipedia and get article summaries",
                parameters: {
                  type: "object",
                  properties: {
                    query: { type: "string", description: "Search query" },
                    sentences: { type: "number", description: "Number of sentences in summary (default: 3)" }
                  },
                  required: ["query"]
                }
              },
              {
                type: "function",
                name: "get_stock_price",
                description: "Get current stock price and market data",
                parameters: {
                  type: "object",
                  properties: {
                    symbol: { type: "string", description: "Stock ticker symbol (e.g., 'AAPL', 'GOOGL')" }
                  },
                  required: ["symbol"]
                }
              },
              {
                type: "function",
                name: "get_crypto_price",
                description: "Get cryptocurrency prices and market data",
                parameters: {
                  type: "object",
                  properties: {
                    symbol: { type: "string", description: "Crypto symbol (e.g., 'BTC', 'ETH', 'SOL')" },
                    currency: { type: "string", description: "Target currency (default: 'USD')" }
                  },
                  required: ["symbol"]
                }
              },
              {
                type: "function",
                name: "get_time",
                description: "Get current time in a specific timezone or location",
                parameters: {
                  type: "object",
                  properties: {
                    timezone: { type: "string", description: "IANA timezone (e.g., 'America/New_York') or city name" }
                  },
                  required: ["timezone"]
                }
              },
              {
                type: "function",
                name: "search_images",
                description: "Search for images on the web",
                parameters: {
                  type: "object",
                  properties: {
                    query: { type: "string", description: "Image search query" },
                    maxResults: { type: "number", description: "Maximum number of results (default: 5)" }
                  },
                  required: ["query"]
                }
              },
              {
                type: "function",
                name: "search_videos",
                description: "Search for videos on the web",
                parameters: {
                  type: "object",
                  properties: {
                    query: { type: "string", description: "Video search query" },
                    maxResults: { type: "number", description: "Maximum number of results (default: 5)" }
                  },
                  required: ["query"]
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
          } else if (data.type === 'conversation.item.input_audio_transcription.completed') {
            // Check user's speech for commands
            const transcript = data.transcript || '';
            if (transcript) {
              console.log('🎤 User transcript:', transcript);
              const command = detectVoiceCommands(transcript);
              if (command === 'wake_mode') {
                console.log('🔄 Returning to wake word mode');
                setTimeout(() => {
                  handleStopListening();
                  setWakeWordEnabled(true);
                }, 1000);
              } else if (command === 'shutdown') {
                console.log('🛑 Shutting down');
                setTimeout(() => {
                  handleStopListening();
                  setWakeWordEnabled(false);
                }, 1000);
              }
            }
          } else if (data.type === 'input_audio_buffer.committed') {
            // Also check when audio buffer is committed - this happens after speech
            // This provides an additional detection point for commands
            console.log('🎤 Audio buffer committed - checking for commands');
          } else if (data.type === 'conversation.item.created' && data.item?.type === 'message' && data.item?.role === 'user') {
            // Check user messages for commands
            const content = data.item?.content?.[0]?.text || '';
            if (content) {
              console.log('💬 User message:', content);
              const command = detectVoiceCommands(content);
              if (command === 'wake_mode') {
                console.log('🔄 Returning to wake word mode (from message)');
                setTimeout(() => {
                  handleStopListening();
                  setWakeWordEnabled(true);
                }, 1000);
              } else if (command === 'shutdown') {
                console.log('🛑 Shutting down (from message)');
                setTimeout(() => {
                  handleStopListening();
                  setWakeWordEnabled(false);
                }, 1000);
              }
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
                  case 'send_email':
                    result = await handleSendEmail(parsedArgs);
                    break;
                  case 'create_calendar_event':
                    result = await handleCreateCalendarEvent(parsedArgs);
                    break;
                  case 'get_email_details':
                    result = await handleGetEmailDetails(parsedArgs);
                    break;
                  case 'delete_email':
                    result = await handleDeleteEmail(parsedArgs);
                    break;
                  case 'reply_to_email':
                    result = await handleReplyToEmail(parsedArgs);
                    break;
                  case 'summarize_emails':
                    result = await handleSummarizeEmails(parsedArgs);
                    break;
                  case 'list_calendar_events':
                    result = await handleListCalendarEvents(parsedArgs);
                    break;
                  case 'add_action_item':
                    result = await handleAddActionItem(parsedArgs);
                    break;
                  case 'web_search':
                    result = await handleWebSearch(parsedArgs.query, parsedArgs.maxResults || 5);
                    break;
                  case 'get_news':
                    result = await handleNewsSearch(parsedArgs.topic, parsedArgs.maxResults || 3);
                    break;
                  case 'setup_gmail':
                    result = await handleGmailSetup();
                    break;
                  case 'get_weather':
                    result = await handleGetWeather(parsedArgs);
                    break;
                  case 'calculate':
                    result = await handleCalculate(parsedArgs);
                    break;
                  case 'convert_units':
                    result = await handleConvertUnits(parsedArgs);
                    break;
                  case 'translate_text':
                    result = await handleTranslateText(parsedArgs);
                    break;
                  case 'get_definition':
                    result = await handleGetDefinition(parsedArgs);
                    break;
                  case 'wikipedia_search':
                    result = await handleWikipediaSearch(parsedArgs);
                    break;
                  case 'get_stock_price':
                    result = await handleGetStockPrice(parsedArgs);
                    break;
                  case 'get_crypto_price':
                    result = await handleGetCryptoPrice(parsedArgs);
                    break;
                  case 'get_time':
                    result = await handleGetTime(parsedArgs);
                    break;
                  case 'search_images':
                    result = await handleSearchImages(parsedArgs);
                    break;
                  case 'search_videos':
                    result = await handleSearchVideos(parsedArgs);
                    break;
                  case 'advanced_web_search':
                    result = await handleAdvancedWebSearch(parsedArgs);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, loading, fetchEphemeralToken, stopWakeRecognition, handleGmailCheck, handleGmailSearch, handleWebSearch, handleNewsSearch, handleGmailSetup, detectVoiceCommands]);  // Stop listening and disconnect
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
      try {
        // Check if returning from OAuth in standalone mode
        const oauthInProgress = sessionStorage.getItem('oauth-in-progress');

        if (oauthInProgress === 'true') {
          // Clear OAuth flags
          sessionStorage.removeItem('oauth-in-progress');
          sessionStorage.removeItem('oauth-return-url');

          // Wait a moment for backend to process the OAuth callback
          await new Promise(resolve => setTimeout(resolve, 1500));
        }

        await fetchEphemeralToken();
        await checkGmailStatus();
      } catch { /* noop */ }
    })();
  }, [fetchEphemeralToken, checkGmailStatus]);

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

      <TiSangAvatar speaking={speaking} mouthScale={mouthScale} blink={blink} shape={mouthShape} />
      
      <div style={{ marginTop: 20 }}>
        <div style={{ marginBottom: 16 }}>
          <button
            onClick={() => {
              const next = !wakeWordEnabled;
              setWakeWordEnabled(next);
              if (next && !listening) startWakeRecognition(); 
              else stopWakeRecognition();
            }}
            style={{ 
              backgroundColor: wakeWordEnabled ? '#CC5500' : '#aaa',
              color: '#fff',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: 'pointer',
              marginRight: '10px'
            }}
          >
            {wakeWordEnabled ? '🎤 Wake Word: ON' : '⏸️ Wake Word: OFF'}
          </button>
          
          {wakeWordEnabled && !listening && (
            <span style={{ 
              fontSize: '14px', 
              color: '#666',
              fontStyle: 'italic'
            }}>
              Say "Ti-sang" to start conversation
            </span>
          )}
        </div>
        
        {!listening ? (
          <button
            onClick={handleStartListening}
            disabled={loading}
            style={{
              backgroundColor: loading ? '#ccc' : '#CC5500',
              color: '#fff',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Connecting...' : '🔗 Start Direct Chat'}
          </button>
        ) : (
          <div>
            <button
              onClick={handleStopListening}
              style={{ 
                backgroundColor: '#CC5500', 
                color: '#fff',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: 'pointer',
                marginRight: '10px'
              }}
            >
              🛑 Stop Listening
            </button>
            <div style={{ 
              marginTop: '10px',
              fontSize: '14px', 
              color: '#666',
              fontStyle: 'italic'
            }}>
              Say "ok bye" to return to wake word mode, or "shut down" to stop completely
            </div>
          </div>
        )}
      </div>

      {/* Gmail Setup Section */}
      <div style={{ 
        marginTop: 30, 
        padding: 20, 
        backgroundColor: '#f8f8f8', 
        borderRadius: 10,
        maxWidth: 400,
        margin: '30px auto 0'
      }}>
        <h3 style={{ color: '#CC5500', margin: '0 0 15px 0', textAlign: 'center' }}>
          📧 Gmail Integration
        </h3>
        
        <div style={{ textAlign: 'center' }}>
          {gmailStatus === 'available' ? (
            <div style={{ color: '#28a745' }}>
              ✅ Gmail is connected and ready!
              <br />
              <small style={{ color: '#666', fontSize: '12px' }}>
                Try saying "Check my Gmail" or "Any new emails?"
              </small>
            </div>
          ) : gmailStatus === 'unavailable' ? (
            <div>
              <div style={{ color: '#666', marginBottom: 10 }}>
                Gmail not set up yet
              </div>
              <button
                onClick={triggerGmailSetup}
                style={{
                  backgroundColor: '#1a73e8',
                  color: '#fff',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '5px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  marginRight: '10px'
                }}
              >
                🔗 Set Up Gmail
              </button>
              <button
                onClick={() => window.open('/gmail-setup', 'gmail-setup', 'width=900,height=700,scrollbars=yes,resizable=yes')}
                style={{
                  backgroundColor: '#6c757d',
                  color: '#fff',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '5px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                📖 Setup Guide
              </button>
            </div>
          ) : (
            <div style={{ color: '#666' }}>
              Checking Gmail status...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WebRTCApp;
