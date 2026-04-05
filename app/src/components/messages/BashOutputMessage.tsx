import { useState, useCallback, useMemo, type ReactNode } from "react";
import { CopyIcon, CheckIcon } from "../icons/Icons";

interface BashOutputMessageProps {
  command: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  timestamp?: number; // accepted but not displayed
  durationMs?: number;
  isRunning?: boolean;
}

const ANSI_COLORS: Record<string, string> = {
  "30": "#1e1e1e", "31": "#e06c75", "32": "#98c379", "33": "#e5c07b",
  "34": "#61afef", "35": "#c678dd", "36": "#56b6c2", "37": "#abb2bf",
  "90": "#5c6370", "91": "#e06c75", "92": "#98c379", "93": "#e5c07b",
  "94": "#61afef", "95": "#c678dd", "96": "#56b6c2", "97": "#ffffff",
};

const ANSI_BG_COLORS: Record<string, string> = {
  "40": "#1e1e1e", "41": "#e06c75", "42": "#98c379", "43": "#e5c07b",
  "44": "#61afef", "45": "#c678dd", "46": "#56b6c2", "47": "#abb2bf",
  "100": "#5c6370", "101": "#e06c75", "102": "#98c379", "103": "#e5c07b",
  "104": "#61afef", "105": "#c678dd", "106": "#56b6c2", "107": "#ffffff",
};

function parseAnsi(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  // eslint-disable-next-line no-control-regex
  const re = /\x1b\[([0-9;]*)m/g;
  let lastIndex = 0;
  let fg: string | undefined;
  let bg: string | undefined;
  let bold = false;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const chunk = text.slice(lastIndex, match.index);
      if (fg || bg || bold) {
        const style: React.CSSProperties = {};
        if (fg) style.color = fg;
        if (bg) style.backgroundColor = bg;
        if (bold) style.fontWeight = "bold";
        parts.push(<span key={lastIndex} style={style}>{chunk}</span>);
      } else {
        parts.push(chunk);
      }
    }
    const codes = match[1].split(";").filter(Boolean);
    for (const code of codes) {
      if (code === "0" || code === "") { fg = undefined; bg = undefined; bold = false; }
      else if (code === "1") bold = true;
      else if (code === "22") bold = false;
      else if (ANSI_COLORS[code]) fg = ANSI_COLORS[code];
      else if (ANSI_BG_COLORS[code]) bg = ANSI_BG_COLORS[code];
      else if (code === "39") fg = undefined;
      else if (code === "49") bg = undefined;
    }
    lastIndex = re.lastIndex;
  }

  if (lastIndex < text.length) {
    const chunk = text.slice(lastIndex);
    if (fg || bg || bold) {
      const style: React.CSSProperties = {};
      if (fg) style.color = fg;
      if (bg) style.backgroundColor = bg;
      if (bold) style.fontWeight = "bold";
      parts.push(<span key={lastIndex} style={style}>{chunk}</span>);
    } else {
      parts.push(chunk);
    }
  }
  return parts;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m${s}s`;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);

  return (
    <button
      className="bash-copy-btn"
      onClick={(e) => { e.stopPropagation(); handleCopy(); }}
      title={`Copy ${label}`}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

const COLLAPSE_THRESHOLD = 20;

export default function BashOutputMessage({
  command, stdout, stderr, exitCode, durationMs, isRunning,
}: BashOutputMessageProps) {
  const stdoutLines = useMemo(() => (stdout || "").split("\n"), [stdout]);
  const stderrLines = useMemo(() => (stderr || "").split("\n"), [stderr]);
  const totalLines = stdoutLines.length + stderrLines.length;
  const isLong = totalLines > COLLAPSE_THRESHOLD;

  const [outputExpanded, setOutputExpanded] = useState(!isLong);

  const parsedStdout = useMemo(() => stdout ? parseAnsi(stdout) : null, [stdout]);
  const parsedStderr = useMemo(() => stderr ? parseAnsi(stderr) : null, [stderr]);

  const hiddenCount = isLong && !outputExpanded
    ? totalLines - COLLAPSE_THRESHOLD
    : 0;

  const collapsedStdout = useMemo(() => {
    if (!stdout || outputExpanded) return parsedStdout;
    const lines = stdout.split("\n").slice(0, COLLAPSE_THRESHOLD);
    return parseAnsi(lines.join("\n"));
  }, [stdout, outputExpanded, parsedStdout]);

  const hasOutput = !!(stdout || stderr);

  return (
    <div className={`bash-msg animate-fade-in${isRunning ? " bash-msg--running" : ""}`}>
      {/* Header: pulsing-dot/$ command  copy  exit-code  duration */}
      <div className="bash-header">
        <span className="bash-header-left">
          {isRunning ? (
            <span className="bash-pulse-dot" />
          ) : (
            <span className="bash-prompt">$</span>
          )}
          <span className="bash-command">{command}</span>
          <CopyButton text={command} label="command" />
        </span>
        <span className="bash-header-right">
          {exitCode !== undefined && exitCode !== 0 && (
            <span className="bash-exit-code">exit {exitCode}</span>
          )}
          {durationMs !== undefined && !isRunning && (
            <span className="bash-duration">{formatDuration(durationMs)}</span>
          )}
        </span>
      </div>

      {/* Running hint */}
      {isRunning && (
        <div className="bash-bg-hint">Ctrl+B to background</div>
      )}

      {/* Output area */}
      {hasOutput && (
        <div className="bash-output">
          {/* Stdout */}
          {stdout && (
            <div className="bash-stdout">
              <CopyButton text={stdout} label="output" />
              <pre>{outputExpanded ? parsedStdout : collapsedStdout}</pre>
            </div>
          )}

          {/* Stderr */}
          {stderr && (
            <div className="bash-stderr">
              <CopyButton text={stderr} label="stderr" />
              <pre>{parsedStderr}</pre>
            </div>
          )}

          {/* Expand button when collapsed */}
          {!outputExpanded && hiddenCount > 0 && (
            <button className="bash-expand-btn" onClick={() => setOutputExpanded(true)}>
              +{hiddenCount} lines
            </button>
          )}
        </div>
      )}
    </div>
  );
}
