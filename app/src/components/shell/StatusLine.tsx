import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import BriefModeBadge from "../status/BriefModeBadge";
import KairosStatusBadge from "../status/KairosStatusBadge";

// ==========================================================================
// StatusLine — full CLI-style status bar for Tensor Code
//
// Layout:  LEFT  |  CENTER  |  RIGHT
//   Left:   model badge, permission mode badge, editor mode, effort level
//   Center: current tool activity, agent progress, streaming indicator
//   Right:  git branch, diff stats, tokens, cost, context bar, duration,
//           connection dot
// ==========================================================================

interface StatusLineProps {
  model: string;
  permissionMode: string;
  cwd: string;
  contextPercent: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  sessionId?: string;
  gitBranch?: string;
  messageCount?: number;
  linesAdded?: number;
  linesRemoved?: number;
  connected?: boolean;
  sessionStartTime?: number;
  streaming?: boolean;
  currentTool?: string | null;
  editorMode?: string;
  effortLevel?: string;
  agentCount?: number;
  activeAgents?: number;
  onModelClick?: () => void;
  onPermissionClick?: () => void;
  onEffortClick?: () => void;
  onEditorModeClick?: () => void;
  briefMode?: boolean;
  onBriefModeToggle?: (active: boolean) => void;
  kairosMode?: boolean;
  onKairosModeToggle?: (active: boolean) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** "claude-sonnet-4-6" -> "sonnet-4.6" */
function shortenModel(m: string): string {
  let s = m.replace(/^claude-/, "");
  s = s
    .replace(/-(\d+)-(\d+)$/, "-$1.$2")
    .replace(/-(\d+)$/, "-$1")
    .replace(/--/g, "-");
  return s;
}

/** 800 -> "800", 12345 -> "12.3k", 120000 -> "120k" */
function fmtTokens(n: number): string {
  if (n < 1000) return String(n);
  return n < 100_000
    ? (n / 1000).toFixed(1) + "k"
    : (n / 1000).toFixed(0) + "k";
}

/** "2m 34s" or "1h 23m" */
function fmtDuration(startMs: number, nowMs: number): string {
  const totalSec = Math.max(0, Math.floor((nowMs - startMs) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Model family -> accent color */
function modelColor(model: string): string {
  const m = model.toLowerCase();
  if (m.includes("opus")) return "#e0a0ff";
  if (m.includes("sonnet")) return "#80b0ff";
  if (m.includes("haiku")) return "#80e0a0";
  if (m.includes("gpt")) return "#74aa9c";
  if (m.includes("gemini")) return "#ffa040";
  return "var(--accent)";
}

/** Permission mode -> color */
function permColor(mode: string): string {
  switch (mode) {
    case "bypass":
      return "var(--warning)";
    case "auto":
      return "var(--success)";
    case "ask":
    default:
      return "var(--text-dim)";
  }
}

/** Effort level -> colored dot */
function effortDot(level: string): { color: string; label: string } {
  switch (level) {
    case "low":
      return { color: "#6ec76e", label: "Low effort" };
    case "high":
      return { color: "#ff8040", label: "High effort" };
    case "medium":
    default:
      return { color: "#e0c040", label: "Medium effort" };
  }
}

/** Context bar: [####------] */
function ctxBar(pct: number): string {
  const f = Math.round((Math.min(pct, 100) / 100) * 10);
  return "[" + "#".repeat(f) + "\u2500".repeat(10 - f) + "]";
}

/** Context bar color by threshold */
function ctxColor(pct: number): string {
  if (pct < 50) return "var(--success)";
  if (pct < 75) return "#e0c040";
  if (pct < 90) return "var(--warning)";
  return "var(--error)";
}

// ---------------------------------------------------------------------------
// Inject CSS for animations & hover states (once)
// ---------------------------------------------------------------------------

const STYLE_ID = "statusline-styles";

function ensureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes sl-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    @keyframes sl-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .sl-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 10px;
      height: 22px;
      font-size: 11px;
      font-family: var(--font-mono);
      color: var(--text-dim);
      border-top: 1px solid var(--border);
      background: var(--bg-secondary);
      white-space: nowrap;
      overflow: hidden;
      flex-shrink: 0;
      line-height: 22px;
      user-select: none;
      gap: 0;
    }
    .sl-section {
      display: inline-flex;
      align-items: center;
      gap: 0;
      white-space: nowrap;
      overflow: hidden;
      min-width: 0;
    }
    .sl-sep {
      color: var(--text-dim);
      opacity: 0.2;
      font-size: 10px;
      margin: 0 6px;
      user-select: none;
      flex-shrink: 0;
    }
    .sl-badge {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 0 5px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 600;
      line-height: 16px;
      letter-spacing: 0.3px;
      text-transform: uppercase;
      cursor: pointer;
      transition: filter 0.15s, background 0.15s;
    }
    .sl-badge:hover {
      filter: brightness(1.3);
      background: rgba(255,255,255,0.06);
    }
    .sl-item {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      cursor: default;
      padding: 0 2px;
      border-radius: 2px;
      transition: background 0.15s;
    }
    .sl-item:hover {
      background: rgba(255,255,255,0.04);
    }
    .sl-clickable {
      cursor: pointer;
    }
    .sl-clickable:hover {
      background: rgba(255,255,255,0.06);
    }
    .sl-dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .sl-tool-spinner {
      display: inline-block;
      width: 10px;
      height: 10px;
      border: 1.5px solid var(--accent);
      border-top-color: transparent;
      border-radius: 50%;
      animation: sl-spin 0.8s linear infinite;
      flex-shrink: 0;
    }
    .sl-stream-dots {
      animation: sl-pulse 1.2s ease-in-out infinite;
    }
    .sl-tooltip {
      position: relative;
    }
    .sl-tooltip::after {
      content: attr(data-tip);
      position: absolute;
      bottom: calc(100% + 6px);
      left: 50%;
      transform: translateX(-50%);
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 10px;
      font-family: var(--font-mono);
      color: var(--text-secondary);
      white-space: pre;
      z-index: 9999;
      pointer-events: none;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      opacity: 0;
      transition: opacity 0.15s;
    }
    .sl-tooltip:hover::after {
      opacity: 1;
    }
    /* Responsive: hide lower-priority items on narrow widths */
    @media (max-width: 900px) {
      .sl-hide-narrow { display: none !important; }
    }
    @media (max-width: 700px) {
      .sl-hide-medium { display: none !important; }
    }
    @media (max-width: 550px) {
      .sl-hide-wide { display: none !important; }
    }
  `;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Sep() {
  return <span className="sl-sep">|</span>;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function StatusLine({
  model,
  permissionMode,
  cwd: _cwd,
  contextPercent,
  inputTokens,
  outputTokens,
  costUsd,
  sessionId: _sessionId,
  gitBranch,
  messageCount: _messageCount,
  linesAdded = 0,
  linesRemoved = 0,
  connected = true,
  sessionStartTime,
  streaming = false,
  currentTool = null,
  editorMode = "normal",
  effortLevel = "medium",
  agentCount = 0,
  activeAgents = 0,
  onModelClick,
  onPermissionClick,
  onEffortClick,
  onEditorModeClick,
  briefMode,
  onBriefModeToggle,
  kairosMode,
  onKairosModeToggle,
}: StatusLineProps) {
  // Inject styles once
  useEffect(() => ensureStyles(), []);

  // -- Derived --
  const shortModel = useMemo(() => shortenModel(model), [model]);
  const mColor = useMemo(() => modelColor(model), [model]);
  const pColor = useMemo(() => permColor(permissionMode), [permissionMode]);
  const effort = useMemo(() => effortDot(effortLevel), [effortLevel]);

  // Session timer — ticks every second
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsed = sessionStartTime ? fmtDuration(sessionStartTime, now) : "";

  // Streaming dot animation
  const [dotCount, setDotCount] = useState(1);
  useEffect(() => {
    if (!streaming) {
      setDotCount(1);
      return;
    }
    const id = setInterval(() => setDotCount((c) => (c % 3) + 1), 400);
    return () => clearInterval(id);
  }, [streaming]);

  const streamDots = ".".repeat(dotCount);

  // Cost formatting
  const costStr =
    costUsd < 0.001
      ? "$0.00"
      : costUsd < 0.01
        ? `$${costUsd.toFixed(4)}`
        : costUsd < 1
          ? `$${costUsd.toFixed(3)}`
          : `$${costUsd.toFixed(2)}`;

  // Token cost breakdown for tooltip
  const inCost = (inputTokens / 1_000_000) * 3;
  const outCost = (outputTokens / 1_000_000) * 15;
  const costTip = `Input:  ${fmtTokens(inputTokens)} ($${inCost.toFixed(4)})\nOutput: ${fmtTokens(outputTokens)} ($${outCost.toFixed(4)})\nTotal:  ${costStr}`;

  // Context bar
  const cPct = Math.round(contextPercent);
  const cColor = ctxColor(contextPercent);

  // =======================================================================
  return (
    <div className="sl-bar status-line">
      {/* ── LEFT SECTION ── */}
      <div className="sl-section">
        {/* Model badge (clickable) */}
        <span
          className="sl-badge sl-tooltip"
          data-tip={`Model: ${model}\nClick to change`}
          style={{
            color: mColor,
            border: `1px solid ${mColor}40`,
            background: `${mColor}10`,
          }}
          onClick={onModelClick}
        >
          {shortModel}
        </span>

        <Sep />

        {/* Permission mode badge (clickable) */}
        <span
          className="sl-badge sl-tooltip"
          data-tip={`Permission mode: ${permissionMode}\nClick to cycle`}
          style={{
            color: pColor,
            border: `1px solid ${pColor}`,
          }}
          onClick={onPermissionClick}
        >
          {permissionMode}
        </span>

        <Sep />

        {/* Editor mode badge (clickable) */}
        <span
          className="sl-badge sl-tooltip sl-hide-medium"
          data-tip={`Editor mode: ${editorMode}\nClick to toggle`}
          style={{
            color:
              editorMode === "vim" ? "#80e0a0" : "var(--text-dim)",
            border: `1px solid ${editorMode === "vim" ? "#80e0a040" : "var(--border)"}`,
          }}
          onClick={onEditorModeClick}
        >
          {editorMode === "vim" ? "VIM" : "NRM"}
        </span>

        <Sep />

        {/* Effort level indicator (clickable) */}
        <span
          className="sl-item sl-clickable sl-tooltip sl-hide-narrow"
          data-tip={`${effort.label}\nClick to cycle`}
          onClick={onEffortClick}
        >
          <span
            className="sl-dot"
            style={{ background: effort.color }}
          />
          <span style={{ color: effort.color, fontSize: 10 }}>
            {effortLevel}
          </span>
        </span>

        <Sep />

        {/* Brief mode toggle */}
        <BriefModeBadge
          active={briefMode}
          onToggle={onBriefModeToggle}
        />

        <Sep />

        {/* KAIROS mode toggle */}
        <span className="sl-hide-narrow" style={{ display: "inline-flex" }}>
          <KairosStatusBadge
            active={kairosMode}
            onToggle={onKairosModeToggle}
          />
        </span>
      </div>

      {/* ── CENTER SECTION ── */}
      <div
        className="sl-section"
        style={{ flex: "0 1 auto", justifyContent: "center" }}
      >
        {/* Current tool activity */}
        {currentTool && (
          <>
            <span className="sl-tool-spinner" />
            <span
              className="sl-item sl-tooltip"
              data-tip={`Running: ${currentTool}`}
              style={{ color: "var(--accent)", fontWeight: 500, marginLeft: 4 }}
            >
              {currentTool}
            </span>
          </>
        )}

        {/* Agent progress */}
        {agentCount > 0 && (
          <>
            {currentTool && <Sep />}
            <span
              className="sl-item sl-tooltip sl-hide-medium"
              data-tip={`${activeAgents} of ${agentCount} agents active`}
              style={{ color: "var(--accent)" }}
            >
              {activeAgents}/{agentCount} agents
            </span>
          </>
        )}

        {/* Streaming indicator */}
        {streaming && !currentTool && (
          <span
            className="sl-item"
            style={{ color: "var(--accent)", fontWeight: 500 }}
          >
            Thinking
            <span className="sl-stream-dots" style={{ opacity: 0.7 }}>
              {streamDots}
            </span>
          </span>
        )}

        {/* Streaming dots alongside tool */}
        {streaming && currentTool && (
          <span className="sl-stream-dots" style={{ color: "var(--accent)", opacity: 0.6, marginLeft: 2 }}>
            {streamDots}
          </span>
        )}
      </div>

      {/* ── RIGHT SECTION ── */}
      <div className="sl-section" style={{ justifyContent: "flex-end" }}>
        {/* Git branch */}
        {gitBranch && (
          <>
            <span
              className="sl-item sl-tooltip sl-hide-narrow"
              data-tip={`Branch: ${gitBranch}`}
              style={{ color: "var(--success)" }}
            >
              <span style={{ opacity: 0.6 }}>{"\u2387"}</span>
              <span
                style={{
                  maxWidth: 100,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {gitBranch}
              </span>
            </span>
            <Sep />
          </>
        )}


        {/* Connection status dot */}
        <span
          className="sl-tooltip"
          data-tip={connected ? "Connected" : "Disconnected"}
          style={{ display: "inline-flex", alignItems: "center" }}
        >
          <span
            className="sl-dot"
            style={{
              background: connected ? "var(--success)" : "var(--error)",
              boxShadow: connected
                ? "0 0 4px var(--success)"
                : "0 0 4px var(--error)",
            }}
          />
        </span>
      </div>
    </div>
  );
}
