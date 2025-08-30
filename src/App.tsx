import React, { useState, useRef, useEffect, useCallback } from 'react';
import { RealtimeAgent, RealtimeSession } from '@openai/agents-realtime';
import './App.css';

// Type declarations for WebRTC interception
declare global {
  interface Window {
    RTCPeerConnection: typeof RTCPeerConnection;
    SpeechRecognition?: SRConstructor;
    webkitSpeechRecognition?: SRConstructor;
  }
}

// Minimal SpeechRecognition types
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

// --- Module-level string helpers for similarity ---
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

const WAKE_WORD = 'tisang';
const wakeThreshold = 0.5; // 50%
const sanitize = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
const PRIMARY_USER_NAME = 'Atticus';
const WAKE_GREETING = `Hi ${PRIMARY_USER_NAME}, I'm ti-sang. How can I help?`;

// Minimalist avatar: only white and burnt orange (#CC5500)
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
        {/* Head */}
        <circle cx="140" cy="140" r="100" fill="#FFFFFF" stroke={ORANGE} strokeWidth="6" />

        {/* Eyes */}
        <g className={`eyes ${blink ? 'blink' : ''}`}> 
          <circle cx="110" cy="125" r="6" fill={ORANGE} />
          <circle cx="170" cy="125" r="6" fill={ORANGE} />
        </g>

        {/* Mouth (discrete shapes + dynamic scale) */}
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

const App: React.FC = () => {
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
  const sessionRef = useRef<RealtimeSession | null>(null);
  const mouthScaleRef = useRef(1);
  const rafRef = useRef<number | null>(null);
  const blinkIntervalRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  // Additional analyzers for viseme estimation
  const lowAnalyserRef = useRef<AnalyserNode | null>(null);
  const midAnalyserRef = useRef<AnalyserNode | null>(null);
  const highAnalyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const connectedAudioNodesRef = useRef<Set<EventTarget>>(new Set());
  const recognizerRef = useRef<SpeechRecognition | null>(null);
  const wakeRestartTimeoutRef = useRef<number | null>(null);
  const wakeStartingRef = useRef<boolean>(false);
  const wakeRunningRef = useRef<boolean>(false);
  const wakeShouldRunRef = useRef<boolean>(false);
  const lastWakeTimeRef = useRef<number>(0);
  const tokenRef = useRef<{ value: string; expiresAt?: number } | null>(null);
  const shouldGreetOnConnectRef = useRef<boolean>(false);
  const mouthShapeRef = useRef<MouthShape>('mid');
  const visemeDecayTimerRef = useRef<number | null>(null);

  // Test animation function
  const testAnimation = useCallback(() => {
    let scale = 1;
    const animate = () => {
      scale = scale === 1 ? 2.2 : 1;
      setMouthScale(scale);
      if (scale === 1) return;
      setTimeout(animate, 500);
    };
    animate();
  }, []);

  // --- Wake word detection utilities (Levenshtein) ---
  const detectWakeWord = useCallback((text: string) => {
    const cleaned = sanitize(text);
    // Compare full string
    let best = similarity(cleaned, WAKE_WORD);
    // Compare sliding windows of size len±1 around wake word length for robustness
    const len = WAKE_WORD.length;
    for (let w = Math.max(2, len - 2); w <= len + 2; w++) {
      for (let i = 0; i + w <= cleaned.length; i++) {
        const chunk = cleaned.slice(i, i + w);
        best = Math.max(best, similarity(chunk, WAKE_WORD));
      }
    }
    setLastSimilarity(Number(best.toFixed(2)));
    return best >= wakeThreshold;
  }, []);

  // --- Web Speech API setup for wake word (runs locally in browser) ---
  const startWakeRecognition = useCallback(() => {
    try {
      const SpeechRec: SRConstructor | undefined = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRec) {
        console.warn('SpeechRecognition not supported in this browser.');
        return;
      }
      if (wakeStartingRef.current || wakeRunningRef.current) {
        // Prevent duplicate starts
        return;
      }
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
        // Only evaluate on final results or reasonably confident interim
        if (results[idx].isFinal || (confidence ?? 0) > 0.7) {
          const now = Date.now();
          const onCooldown = now - lastWakeTimeRef.current < 3000; // 3s cooldown
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
        // Controlled restart only for benign errors if still desired and not listening
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
        // Auto-restart with small backoff if still desired & not listening
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
        if (wakeRestartTimeoutRef.current) { window.clearTimeout(wakeRestartTimeoutRef.current); wakeRestartTimeoutRef.current = null; }
  rec.onresult = null; rec.onend = null; rec.onerror = null; (rec as { onstart?: ((ev: Event) => unknown) | null }).onstart = null;
        rec.stop();
      } catch { /* noop */ }
      recognizerRef.current = null;
      wakeRunningRef.current = false;
      wakeStartingRef.current = false;
      console.log('Wake word recognition stopped');
    }
  }, []);


  // Manage wake recognition lifecycle
  useEffect(() => {
    if (wakeWordEnabled && !listening && !recognizerRef.current) {
  startWakeRecognition();
    }
    if ((!wakeWordEnabled || listening) && recognizerRef.current) {
      stopWakeRecognition();
    }
    // Cleanup on unmount
    return () => {
      stopWakeRecognition();
    };
  }, [wakeWordEnabled, listening, startWakeRecognition, stopWakeRecognition]);

  // Fetch ephemeral token from backend
  const fetchEphemeralToken = useCallback(async (): Promise<string> => {
    // Use cached token if not expired (buffer 15s)
    const now = Date.now() / 1000;
    const cached = tokenRef.current;
    if (cached && (!cached.expiresAt || cached.expiresAt - now > 15)) {
      return cached.value;
    }
    const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const base = isLocal ? 'http://localhost:3001' : '';
    const response = await fetch(`${base}/api/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to fetch token');
    }

    const data = await response.json();
    // Support both { token } and { client_secret: { value } }
    const value: string = data.token ?? data?.client_secret?.value;
    const expiresAt: number | undefined = data.expires_at ?? data?.client_secret?.expires_at;
    tokenRef.current = { value, expiresAt };
    return value;
  }, []);

  // Prefetch token on mount to cut start latency
  useEffect(() => {
    (async () => {
  try { await fetchEphemeralToken(); } catch { /* noop */ }
    })();
  }, [fetchEphemeralToken]);

  // (moved below handleStartListening)

  // Set up WebAudio to capture SDK audio playback
  const setupAudioCapture = useCallback(() => {
    try {
      const audioContext = new (window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 128; // smaller FFT for lower CPU
      analyser.smoothingTimeConstant = 0.6;

      // Create band-specific analyzers for a simple viseme estimator
      const makeAnalyser = () => {
        const a = audioContext.createAnalyser();
        a.fftSize = 256;
        a.smoothingTimeConstant = 0.6;
        return a;
      };

      const lowFilter = audioContext.createBiquadFilter();
      lowFilter.type = 'lowpass';
      lowFilter.frequency.value = 300; // vowels/low energy
      const lowAnalyser = makeAnalyser();

      const midFilter = audioContext.createBiquadFilter();
      midFilter.type = 'bandpass';
      midFilter.frequency.value = 1000; // mid band
      midFilter.Q.value = 0.707;
      const midAnalyser = makeAnalyser();

      const highFilter = audioContext.createBiquadFilter();
      highFilter.type = 'highpass';
      highFilter.frequency.value = 4000; // sibilants/fricatives
      const highAnalyser = makeAnalyser();

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      lowAnalyserRef.current = lowAnalyser;
      midAnalyserRef.current = midAnalyser;
      highAnalyserRef.current = highAnalyser;

      // Find audio elements created by the SDK
      const checkForAudio = () => {
        const audioElements = document.querySelectorAll('audio');
        console.log('Found', audioElements.length, 'audio elements');
        for (const audio of audioElements) {
          console.log('Audio element:', audio.src, audio.srcObject);
          if ((audio.src || audio.srcObject) && !connectedAudioNodesRef.current.has(audio)) {
            try {
              const source = audioContext.createMediaElementSource(audio);
              source.connect(analyser);
              // Also connect to band analyzers in parallel
              source.connect(lowFilter); lowFilter.connect(lowAnalyser);
              source.connect(midFilter); midFilter.connect(midAnalyser);
              source.connect(highFilter); highFilter.connect(highAnalyser);
              connectedAudioNodesRef.current.add(audio);
              console.log('✅ Connected to audio element for analysis');
              return true;
            } catch (e) {
              console.warn('❌ Failed to connect to audio element:', e);
            }
          }
        }

        // Also try to find WebRTC audio tracks
        const findWebRTCAudio = () => {
          // Look for any audio media streams
          const allMediaElements = document.querySelectorAll('video, audio');
          for (const elem of allMediaElements) {
            const htmlElem = elem as HTMLMediaElement & {
              captureStream?: () => MediaStream;
              mozCaptureStream?: () => MediaStream;
            };
            if (htmlElem.captureStream || htmlElem.mozCaptureStream) {
              try {
                const stream = htmlElem.captureStream ? htmlElem.captureStream() : htmlElem.mozCaptureStream!();
                if (stream.getAudioTracks().length > 0) {
                  const source = audioContext.createMediaStreamSource(stream);
                  source.connect(analyser);
                  // Connect to band analyzers as well
                  source.connect(lowFilter); lowFilter.connect(lowAnalyser);
                  source.connect(midFilter); midFilter.connect(midAnalyser);
                  source.connect(highFilter); highFilter.connect(highAnalyser);
                  connectedAudioNodesRef.current.add(stream);
                  console.log('✅ Connected to WebRTC audio track');
                  return true;
                }
              } catch (e) {
                console.warn('❌ Failed WebRTC capture:', e);
              }
            }
          }
          return false;
        };

        return findWebRTCAudio();
      };

      // Check for existing RTCPeerConnection instances
      const checkExistingConnections = () => {
        // Look for any existing RTCPeerConnection objects
        if (typeof window.RTCPeerConnection !== 'undefined') {
          // This is a best-effort attempt to find existing connections
          console.log('🔍 Checking for existing RTCPeerConnection instances...');
          // The SDK might have already created connections, try to find them
          return false; // For now, rely on interception
        }
        return false;
      };

      // Enhanced WebRTC interception with better timing and coverage
      const interceptWebRTC = () => {
        if (typeof window.RTCPeerConnection !== 'undefined') {
          // Store original methods for restoration if needed
          const originalAddTrack = RTCPeerConnection.prototype.addTrack;

          // Override addTrack to capture audio tracks
          RTCPeerConnection.prototype.addTrack = function(track: MediaStreamTrack, ...streams: MediaStream[]) {
            if (track.kind === 'audio') {
              console.log('🎵 Found audio track in RTCPeerConnection - this should be assistant audio');
              try {
                const stream = new MediaStream([track]);
                const source = audioContext.createMediaStreamSource(stream);
                source.connect(analyser);
                // Connect to band analyzers as well
                const lowFilter = audioContext.createBiquadFilter();
                lowFilter.type = 'lowpass';
                lowFilter.frequency.value = 300;
                const midFilter = audioContext.createBiquadFilter();
                midFilter.type = 'bandpass';
                midFilter.frequency.value = 1000;
                midFilter.Q.value = 0.707;
                const highFilter = audioContext.createBiquadFilter();
                highFilter.type = 'highpass';
                highFilter.frequency.value = 4000;
                if (lowAnalyserRef.current && midAnalyserRef.current && highAnalyserRef.current) {
                  source.connect(lowFilter); lowFilter.connect(lowAnalyserRef.current);
                  source.connect(midFilter); midFilter.connect(midAnalyserRef.current);
                  source.connect(highFilter); highFilter.connect(highAnalyserRef.current);
                }
                connectedAudioNodesRef.current.add(stream);
                console.log('✅ Connected to RTCPeerConnection audio track for lip-sync');
              } catch (e) {
                console.warn('❌ Failed to connect to RTCPeerConnection track:', e);
              }
            }
            return originalAddTrack.call(this, track, ...streams);
          };

          // Override ontrack event handler
          Object.defineProperty(RTCPeerConnection.prototype, 'ontrack', {
            get: function() { return (this as { _ontrack?: ((event: RTCTrackEvent) => void) | null })._ontrack; },
            set: function(handler: ((event: RTCTrackEvent) => void) | null) {
              (this as { _ontrack?: ((event: RTCTrackEvent) => void) | null })._ontrack = function(event: RTCTrackEvent) {
                if (event.track.kind === 'audio') {
                  console.log('🎵 RTCPeerConnection ontrack fired for audio - assistant audio detected');
                  try {
                    const stream = new MediaStream([event.track]);
                    const source = audioContext.createMediaStreamSource(stream);
                    source.connect(analyser);
                    // Connect to band analyzers as well
                    const lowFilter = audioContext.createBiquadFilter();
                    lowFilter.type = 'lowpass';
                    lowFilter.frequency.value = 300;
                    const midFilter = audioContext.createBiquadFilter();
                    midFilter.type = 'bandpass';
                    midFilter.frequency.value = 1000;
                    midFilter.Q.value = 0.707;
                    const highFilter = audioContext.createBiquadFilter();
                    highFilter.type = 'highpass';
                    highFilter.frequency.value = 4000;
                    if (lowAnalyserRef.current && midAnalyserRef.current && highAnalyserRef.current) {
                      source.connect(lowFilter); lowFilter.connect(lowAnalyserRef.current);
                      source.connect(midFilter); midFilter.connect(midAnalyserRef.current);
                      source.connect(highFilter); highFilter.connect(highAnalyserRef.current);
                    }
                    connectedAudioNodesRef.current.add(stream);
                    console.log('✅ Connected via ontrack event for lip-sync');
                  } catch (e) {
                    console.warn('❌ Failed to connect via ontrack:', e);
                  }
                }
                if (handler) {
                  return handler.call(this, event);
                }
              };
            }
          });

          console.log('🔧 Enhanced RTCPeerConnection interception enabled');
        } else {
          console.log('❌ RTCPeerConnection not available');
        }
      };

      // Enable all detection methods
      interceptWebRTC();
      checkExistingConnections();

      // Check immediately and then periodically
      if (!checkForAudio()) {
        const interval = setInterval(() => {
          if (checkForAudio()) {
            clearInterval(interval);
          }
        }, 500);
        setTimeout(() => clearInterval(interval), 10000); // Stop after 10s

        // Also watch for new audio elements
        const observer = new MutationObserver(() => {
          if (checkForAudio()) {
            observer.disconnect();
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => observer.disconnect(), 10000);
      }

      // Helper to compute RMS from a time-domain analyser
      const analyserRMS = (an: AnalyserNode) => {
        const len = an.fftSize;
        const arr = new Uint8Array(len);
        an.getByteTimeDomainData(arr);
        let sum = 0;
        for (let i = 0; i < len; i++) {
          const centered = (arr[i] - 128) / 128; // -1..1
          sum += centered * centered;
        }
        return Math.sqrt(sum / len);
      };

      // Start analyzing audio
      const analyzeAudio = () => {
        if (!analyserRef.current) return;

        // Base energy from full-band analyser
        const baseRms = analyserRMS(analyserRef.current);

        // Band energies (if available)
        const lowR = lowAnalyserRef.current ? analyserRMS(lowAnalyserRef.current) : baseRms;
        const midR = midAnalyserRef.current ? analyserRMS(midAnalyserRef.current) : baseRms * 0.8;
        const highR = highAnalyserRef.current ? analyserRMS(highAnalyserRef.current) : baseRms * 0.6;

        const sum = lowR + midR + highR + 1e-6;
        const rLow = lowR / sum;
        const rHigh = highR / sum;

        // Fallback: infer shape from band dominance if no recent transcript delta
        // If high band dominates, prefer narrow; if low dominates strongly, prefer open
        if (mouthShapeRef.current === 'mid') {
          if (rHigh > 0.6 && baseRms > 0.03) {
            mouthShapeRef.current = 'narrow';
            setMouthShape('narrow');
          } else if (rLow > 0.55 && baseRms > 0.03) {
            mouthShapeRef.current = 'open';
            setMouthShape('open');
          }
        }

        // Target scale prioritizes current mouth shape, with energy fallback
        let targetScale = 1.0;
        const energy = baseRms;
        const silence = energy < 0.02;
        const shapeNow = mouthShapeRef.current;
        if (silence) {
          targetScale = 1.0;
        } else if (shapeNow === 'open') {
          targetScale = 2.2;
        } else if (shapeNow === 'narrow') {
          targetScale = 1.2;
        } else if (shapeNow === 'closed') {
          targetScale = 1.0;
        } else {
          // mid: let energy influence openness and bias with band hints
          targetScale = 1.2 + Math.min(1.0, energy * 14);
          if (rLow > 0.5) targetScale = Math.max(targetScale, 1.8);
          if (rHigh > 0.55) targetScale = Math.min(targetScale, 1.3);
        }

        // Attack/release smoothing
        const current = mouthScaleRef.current;
  const attack = 0.55;
  const release = 0.15;
        const next = targetScale > current
          ? current * (1 - attack) + targetScale * attack
          : current * (1 - release) + targetScale * release;
        mouthScaleRef.current = Math.max(0.9, Math.min(2.4, next));

        // Debug logging
        if (Math.random() < 0.05) { // Log ~5% of frames to avoid spam
          console.log('🎤 E(base/low/mid/high):', baseRms.toFixed(3), lowR.toFixed(3), midR.toFixed(3), highR.toFixed(3), 'Scale:', mouthScaleRef.current.toFixed(2));
        }

        if (rafRef.current == null) {
          rafRef.current = requestAnimationFrame(() => {
            setMouthScale(mouthScaleRef.current);
            rafRef.current = null;
          });
        }

        animationFrameRef.current = requestAnimationFrame(analyzeAudio);
      };

      analyzeAudio();
      console.log('WebAudio capture setup complete');
    } catch (e) {
      console.warn('WebAudio setup failed:', e);
    }
  }, []);

  // Connect to the agent and start listening
  const handleStartListening = useCallback(async () => {
    if (connected || loading) return;

    setLoading(true);
    setError('');

    try {
      // Get ephemeral token from backend
      const token = await fetchEphemeralToken();

  const agent = new RealtimeAgent({
        name: 'ti-sang',
        instructions:
          [
    'You are a friendly, encouraging voice assistant named ti-sang for Atticus, age 12.',
            'Style: use kid-safe Gen Z slang lightly and naturally; keep sentences short and positive.',
            'Never use profanity, explicit or adult content. Avoid sexualized slang. Do not use "Gyat".',
            'Be inclusive and kind. If the topic is serious or sensitive, switch to clear, supportive, age-appropriate language.',
    'Primary user: Atticus (12). Use the name "Atticus" naturally in greetings or when it helps clarity; do not ask for their age.',
            'Glossary to optionally sprinkle in (when it fits):',
            '- rizz = charisma/charm (use in friendly, non-romantic ways).',
            '- bet = OK/for sure.',
            '- cap/no cap = lie / for real.',
            '- bussin\' = very good (esp. food).',
            '- drip = cool outfit/style.',
            "- it's giving ... = the vibe is ...",
            '- slay / ate that up = did great.',
            '- finna = going to (use sparingly).',
            '- based = confidently yourself (kind and respectful).',
            '- delulu = playful, unrealistic thinking (avoid being mean).',
            '- let him/her cook = let them focus/do their thing.',
            '- NPC = acting generic (avoid labeling people directly).',
            '- Fanum tax = taking a bite from a friend (playful).',
            '- looksmaxxing/mewing = self-care/growth; keep neutral, healthy framing.',
            '- skibidi = silly/cringe (avoid bullying).',
            'Examples:',
            'Formal: “Okay, that plan sounds good.” → Slang: “Bet, that plan works.”',
            'Formal: “You did an amazing job.” → “You slayed that. Ate it up, no cap.”',
            'Formal: “Those shoes look nice.” → “The drip is clean. It\'s giving main character.”',
            'Identity: Always refer to yourself as ti-sang.',
          ].join('\n'),
      });

      const session = new RealtimeSession(agent, { model: 'gpt-realtime' });
      sessionRef.current = session;

      session.on('audio_start', () => {
        setSpeaking(true);
        mouthShapeRef.current = 'mid';
        setMouthShape('mid');
        // start subtle blink rhythm when speaking
        if (blinkIntervalRef.current == null) {
          blinkIntervalRef.current = window.setInterval(() => {
            setBlink(true);
            setTimeout(() => setBlink(false), 120);
          }, 3200);
        }
      });
      session.on('audio_stopped', () => {
        setSpeaking(false);
        // decay mouth scale back to neutral
        mouthScaleRef.current = 1;
        mouthShapeRef.current = 'closed';
        setMouthShape('closed');
        if (blinkIntervalRef.current != null) {
          clearInterval(blinkIntervalRef.current);
          blinkIntervalRef.current = null;
        }
      });

      // Use transport events to adjust mouth shape from transcript deltas (support multiple event types)
      type TransportDeltaEvt = { type?: string; delta?: string } | Record<string, unknown>;
      session.on('transport_event', (evt: TransportDeltaEvt) => {
        try {
          if (!evt || typeof evt !== 'object') return;
          const et = (evt as { type?: string }).type;
          const ed = (evt as { delta?: unknown }).delta;
          const delta = (et === 'audio_transcript_delta' && typeof ed === 'string' && ed)
            || (et === 'response.delta' && typeof ed === 'string' && ed)
            || (et === 'response.output_delta' && typeof ed === 'string' && ed)
            || (et === 'response.output_text.delta' && typeof ed === 'string' && ed)
            || (et === 'response.output_audio_transcript.delta' && typeof ed === 'string' && ed)
            || '';
          if (delta) {
            const d: string = String(delta);
            const last = (d.match(/[a-z]+/gi)?.pop() || '').toLowerCase();
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
        } catch { /* ignore */ }
      });

  await session.connect({ apiKey: token });
      setListening(true);
      setConnected(true);

      // Stop wake recognition while actively engaged (prevents mic conflicts)
      stopWakeRecognition();

      // If initiated by wake word, greet the user immediately
      if (shouldGreetOnConnectRef.current) {
        shouldGreetOnConnectRef.current = false;
        try { session.sendMessage(WAKE_GREETING); } catch { /* noop */ }
      }

      // Set up audio capture for lip-sync
      setupAudioCapture();
      console.log('Audio capture setup initiated for lip-sync');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start listening');
    } finally {
      setLoading(false);
    }
  }, [connected, loading, fetchEphemeralToken, stopWakeRecognition, setupAudioCapture]);

  // Stop listening and disconnect
  const handleStopListening = useCallback(() => {
    if (sessionRef.current) {
      // Use close() if disconnect() is not available
      if (typeof sessionRef.current.close === 'function') {
        sessionRef.current.close();
      }
      sessionRef.current = null;
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

  // Trigger start when a wake word was detected
  useEffect(() => {
    if (pendingWakeStart && !listening && !loading) {
      setPendingWakeStart(false);
      void handleStartListening();
    }
  }, [pendingWakeStart, listening, loading, handleStartListening]);

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

      {/* Pass mouthScale and discrete shape into avatar */}
      <TiSangAvatar speaking={speaking} mouthScale={mouthScale} blink={blink} shape={mouthShape} />
      <div style={{ marginTop: 20 }}>
        <div style={{ marginBottom: 12 }}>
          <button
            onClick={() => {
              const next = !wakeWordEnabled;
              setWakeWordEnabled(next);
              if (next && !listening) startWakeRecognition(); else stopWakeRecognition();
            }}
            style={{ backgroundColor: wakeWordEnabled ? '#CC5500' : '#aaa' }}
          >
            Wake Word (Ti-sang): {wakeWordEnabled ? 'On' : 'Off'}
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
          <div>
            <button
              onClick={handleStopListening}
              style={{ backgroundColor: '#CC5500', color: '#fff' }}
            >
              Stop Listening
            </button>
            <button
              onClick={testAnimation}
              style={{ marginLeft: 10, backgroundColor: '#fff', color: '#CC5500', border: '2px solid #CC5500' }}
            >
              Test Animation
            </button>
          </div>
        )}
      </div>

    </div>
  );
};

export default App;
