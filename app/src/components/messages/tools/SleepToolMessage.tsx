import { useState, useEffect, useRef, useCallback } from "react";
import { CopyIcon, CheckIcon } from "../../icons/Icons";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SleepToolMessageProps {
  /** "use" = tool_use (sleeping), "result" = tool_result (done) */
  mode: "use" | "result";
  /** Requested sleep duration in ms */
  durationMs: number;
  /** Actual duration slept (result only) */
  actualMs?: number;
  /** Whether the sleep was interrupted early */
  interrupted?: boolean;
  /** Whether currently running */
  isRunning?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m${s}s`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);

  return (
    <button
      style={S.copyBtn}
      onClick={(e) => { e.stopPropagation(); handleCopy(); }}
      title="Copy"
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Animated timer frames
// ---------------------------------------------------------------------------

const TIMER_FRAMES = ["\u23F3", "\u231B"]; // hourglass_flowing, hourglass_done

function AnimatedHourglass() {
  const [frame, setFrame] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    ref.current = setInterval(() => setFrame((f) => (f + 1) % TIMER_FRAMES.length), 600);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, []);
  return <span style={{ display: "inline-block", width: 16, textAlign: "center" }}>{TIMER_FRAMES[frame]}</span>;
}

// ---------------------------------------------------------------------------
// Elapsed bar
// ---------------------------------------------------------------------------

function ElapsedBar({ targetMs }: { targetMs: number }) {
  const startRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed(Date.now() - startRef.current), 200);
    return () => clearInterval(t);
  }, []);
  const pct = Math.min(100, (elapsed / targetMs) * 100);
  return (
    <div style={S.barOuter}>
      <div style={{ ...S.barInner, width: `${pct}%` }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SleepToolMessage({
  mode, durationMs, actualMs, interrupted, isRunning,
}: SleepToolMessageProps) {
  const sleeping = mode === "use" || isRunning;

  if (sleeping) {
    // Active: "Sleeping for Xms..." with animated hourglass and progress bar
    return (
      <div style={S.container}>
        <div style={S.row}>
          <AnimatedHourglass />
          <span style={S.label}>Sleeping for {fmtDuration(durationMs)}...</span>
          <ElapsedBar targetMs={durationMs} />
        </div>
      </div>
    );
  }

  // Completed: "Slept for Xms" with optional interrupted indicator
  const actual = actualMs ?? durationMs;
  return (
    <div style={S.container}>
      <div style={S.row}>
        <span style={{ display: "inline-block", width: 16, textAlign: "center" }}>{"\u231B"}</span>
        <span style={S.label}>
          Slept for {fmtDuration(actual)}
          {interrupted && (
            <span style={S.interrupted}> (interrupted)</span>
          )}
        </span>
        <CopyButton text={`Slept for ${fmtDuration(actual)}${interrupted ? " (interrupted)" : ""}`} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const S: Record<string, React.CSSProperties> = {
  container: {
    background: "var(--bg-secondary, #1e1e2e)",
    border: "1px solid var(--border, #2e2e3e)",
    borderLeft: "3px solid var(--tool-default, #6b7280)",
    borderRadius: 6,
    marginTop: 4,
    marginBottom: 4,
    padding: "6px 10px",
    fontSize: 13,
    lineHeight: 1.5,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  label: {
    color: "var(--text-secondary, #abb2bf)",
    fontFamily: "var(--font-mono, 'SF Mono', Monaco, Consolas, monospace)",
    fontSize: 12,
    whiteSpace: "nowrap" as const,
  },
  interrupted: {
    color: "var(--warning, #e5c07b)",
    fontWeight: 500,
  },
  barOuter: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    background: "var(--bg-tertiary, rgba(255,255,255,0.04))",
    overflow: "hidden",
    minWidth: 40,
    maxWidth: 120,
  },
  barInner: {
    height: "100%",
    borderRadius: 2,
    background: "var(--text-dim, #5c6370)",
    transition: "width 0.2s linear",
  },
  copyBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "none",
    border: "none",
    color: "var(--text-dim, #5c6370)",
    cursor: "pointer",
    padding: 2,
    borderRadius: 3,
    width: 22,
    height: 22,
    opacity: 0.6,
    transition: "opacity 0.15s",
  },
};
