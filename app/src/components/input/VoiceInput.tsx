import { useState, useEffect, useRef, useCallback, memo } from "react";

interface VoiceInputProps {
  onTranscript: (text: string, isFinal: boolean) => void;
  disabled?: boolean;
}

type VoiceState = "idle" | "recording";

const SpeechRecognition =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const SUPPORTED = !!SpeechRecognition;

const NUM_BARS = 7;

const STYLES = `
.voice-btn { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border:none; border-radius:50%; background:transparent; color:var(--text-dim); cursor:pointer; padding:0; flex-shrink:0; position:relative; transition:color .15s,background .15s; }
.voice-btn:hover:not(:disabled) { color:var(--text-muted); background:var(--bg-hover); }
.voice-btn:disabled { opacity:.25; cursor:default; }
.voice-btn--recording { color:#ff6a00; background:rgba(255,106,0,.12); }
.voice-btn--recording:hover { color:#ff6a00; background:rgba(255,106,0,.2); }
.voice-pulse-dot { position:absolute; top:2px; right:2px; width:6px; height:6px; border-radius:50%; background:#ff6a00; animation:voice-pulse 1.2s ease-in-out infinite; }
.voice-row { display:flex; align-items:center; gap:6px; margin-right:4px; }
.voice-label { font-size:11px; font-family:var(--font-mono); color:#ff6a00; white-space:nowrap; }
.voice-label--err { color:#ff3500; opacity:0.8; }
.voice-viz { display:flex; align-items:flex-end; gap:1.5px; height:16px; }
.voice-bar-live { width:3px; border-radius:1.5px; background:linear-gradient(to top, #ff3500, #ffa500); transition:height 60ms ease-out; min-height:2px; }
.voice-tip-wrap { position:relative; }
.voice-tip { display:none; position:absolute; bottom:calc(100% + 6px); left:50%; transform:translateX(-50%); white-space:nowrap; font-size:10px; font-family:var(--font-mono); color:var(--text-secondary); background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-sm); padding:3px 8px; pointer-events:none; z-index:100; }
.voice-tip-wrap:hover .voice-tip { display:block; }
@keyframes voice-pulse { 0%,100%{opacity:.4;transform:scale(.8)} 50%{opacity:1;transform:scale(1.1)} }
`;

function VoiceInput({ onTranscript, disabled = false }: VoiceInputProps) {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState("");
  const [barHeights, setBarHeights] = useState<number[]>(new Array(NUM_BARS).fill(2));

  const recRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const committedRef = useRef(""); // finalized text so far in this session
  const injected = useRef(false);

  useEffect(() => {
    if (injected.current) return;
    injected.current = true;
    const el = document.createElement("style");
    el.textContent = STYLES;
    document.head.appendChild(el);
    return () => { el.remove(); injected.current = false; };
  }, []);

  // ── Audio analyser for live loudness bars ───────────────────
  const startAnalyser = useCallback((stream: MediaStream) => {
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        const binStep = Math.max(1, Math.floor(dataArray.length / NUM_BARS));
        const heights: number[] = [];
        for (let i = 0; i < NUM_BARS; i++) {
          const binIdx = Math.min(i * binStep, dataArray.length - 1);
          heights.push(2 + (dataArray[binIdx] / 255) * 14);
        }
        setBarHeights(heights);
        animFrameRef.current = requestAnimationFrame(tick);
      };
      animFrameRef.current = requestAnimationFrame(tick);
    } catch { /* ignore */ }
  }, []);

  const stopAnalyser = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = 0;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    setBarHeights(new Array(NUM_BARS).fill(2));
  }, []);

  // ── Cleanup ─────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    if (recRef.current) {
      try { recRef.current.abort(); } catch { /* ignore */ }
      recRef.current = null;
    }
    stopAnalyser();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setState("idle");
  }, [stopAnalyser]);

  // ── Toggle ──────────────────────────────────────────────────
  const toggle = useCallback(async () => {
    if (!SUPPORTED || disabled) return;

    // Stop recording
    if (state === "recording") {
      if (recRef.current) {
        try { recRef.current.stop(); } catch { /* ignore */ }
      }
      cleanup();
      // Finalize whatever we have
      onTranscript("", true);
      committedRef.current = "";
      return;
    }

    setError("");
    committedRef.current = "";

    // Get mic stream for visualizer
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
    } catch (err: any) {
      if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
        setError("Microphone permission denied");
      } else if (err?.name === "NotFoundError") {
        setError("No microphone found");
      } else {
        setError("Mic error: " + (err?.message || "unknown"));
      }
      setTimeout(() => setError(""), 6000);
      return;
    }

    // Start speech recognition
    try {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";
      rec.maxAlternatives = 1;

      rec.onresult = (event: any) => {
        let allFinal = "";
        let interimText = "";

        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            allFinal += result[0].transcript;
          } else {
            interimText += result[0].transcript;
          }
        }

        // Only send NEW finalized words (delta from what we already committed)
        if (allFinal.length > committedRef.current.length) {
          const delta = allFinal.slice(committedRef.current.length);
          committedRef.current = allFinal;
          onTranscript(delta, false);
        }
      };

      rec.onerror = (e: any) => {
        console.error("SpeechRecognition error:", e.error);
        cleanup();
        committedRef.current = "";
        if (e.error === "not-allowed") {
          setError("Microphone permission denied");
        } else if (e.error === "network") {
          setError("Speech recognition unavailable offline");
        } else if (e.error === "service-not-allowed") {
          setError("Speech recognition not available in this app");
        } else if (e.error === "no-speech") {
          // Not an error - just silence
          return;
        } else {
          setError("Speech recognition error: " + e.error);
        }
        setTimeout(() => setError(""), 5000);
      };

      rec.onend = () => {
        // If still recording, restart (speech recognition auto-stops after silence)
        if (recRef.current === rec && state === "recording") {
          try { rec.start(); } catch { cleanup(); }
        }
      };

      recRef.current = rec;
      rec.start();
      setState("recording");
      startAnalyser(stream);
    } catch (err: any) {
      console.error("SpeechRecognition start failed:", err);
      cleanup();
      setError("Speech recognition failed to start");
      setTimeout(() => setError(""), 5000);
    }
  }, [state, disabled, cleanup, onTranscript, startAnalyser]);

  useEffect(() => () => { cleanup(); }, [cleanup]);

  if (!SUPPORTED) {
    return (
      <span className="voice-tip-wrap">
        <button type="button" className="voice-btn" disabled title="Speech recognition not supported">
          <MicIcon />
        </button>
        <span className="voice-tip">Speech recognition not supported</span>
      </span>
    );
  }

  const recording = state === "recording";

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      {recording && (
        <span className="voice-row">
          <span className="voice-viz">
            {barHeights.map((h, i) => (
              <span key={i} className="voice-bar-live" style={{ height: `${h}px` }} />
            ))}
          </span>
        </span>
      )}
      {error && !recording && (
        <span className="voice-row">
          <span className="voice-label voice-label--err">{error}</span>
        </span>
      )}
      <button
        type="button"
        className={`voice-btn${recording ? " voice-btn--recording" : ""}`}
        onClick={toggle}
        disabled={disabled}
        title={recording ? "Stop recording" : "Voice input"}
      >
        <MicIcon />
        {recording && <span className="voice-pulse-dot" />}
      </button>
    </span>
  );
}

function MicIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="1" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0014 0" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="8" y1="21" x2="16" y2="21" />
    </svg>
  );
}

export default memo(VoiceInput);
