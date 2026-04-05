import { useEffect, useMemo, useRef, useCallback, useState, type CSSProperties } from "react";

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

export interface PermissionDialogProps {
  isOpen: boolean;
  toolName: string;
  toolId?: string;
  input: string; // JSON string of tool input
  detail?: string;
  filePath?: string;
  diff?: string;
  onAllow: () => void;
  onDeny: () => void;
  onAllowAlways: () => void;
  onAllowSession?: () => void;
  permissionMode: string;
}

type RiskLevel = "safe" | "caution" | "dangerous";

// ══════════════════════════════════════════════════════════════
// Tool color mapping (mirrors TOOL_COLORS from ToolGroup.tsx)
// ══════════════════════════════════════════════════════════════

const TOOL_COLORS: Record<string, { color: string; dim: string }> = {
  Bash:       { color: "var(--tool-bash)",    dim: "var(--tool-bash-dim)" },
  run_bash:   { color: "var(--tool-bash)",    dim: "var(--tool-bash-dim)" },
  Edit:       { color: "var(--tool-edit)",    dim: "var(--tool-edit-dim)" },
  edit_file:  { color: "var(--tool-edit)",    dim: "var(--tool-edit-dim)" },
  Write:      { color: "var(--tool-write)",   dim: "var(--tool-write-dim)" },
  write_file: { color: "var(--tool-write)",   dim: "var(--tool-write-dim)" },
  Read:       { color: "var(--tool-read)",    dim: "var(--tool-read-dim)" },
  read_file:  { color: "var(--tool-read)",    dim: "var(--tool-read-dim)" },
  Glob:       { color: "var(--tool-search)",  dim: "var(--tool-search-dim)" },
  Grep:       { color: "var(--tool-search)",  dim: "var(--tool-search-dim)" },
  WebFetch:   { color: "var(--tool-web)",     dim: "var(--tool-web-dim)" },
  WebSearch:  { color: "var(--tool-web)",     dim: "var(--tool-web-dim)" },
  Agent:      { color: "var(--tool-agent)",   dim: "var(--tool-agent-dim)" },
  Skill:      { color: "var(--tool-agent)",   dim: "var(--tool-agent-dim)" },
};

function getToolColor(toolName: string): { color: string; dim: string } {
  if (TOOL_COLORS[toolName]) return TOOL_COLORS[toolName];
  const name = toolName.toLowerCase();
  if (name.includes("bash") || name.includes("shell") || name.includes("exec"))
    return { color: "var(--tool-bash)", dim: "var(--tool-bash-dim)" };
  if (name.includes("edit"))
    return { color: "var(--tool-edit)", dim: "var(--tool-edit-dim)" };
  if (name.includes("write"))
    return { color: "var(--tool-write)", dim: "var(--tool-write-dim)" };
  if (name.includes("read"))
    return { color: "var(--tool-read)", dim: "var(--tool-read-dim)" };
  if (name.includes("glob") || name.includes("grep") || name.includes("search"))
    return { color: "var(--tool-search)", dim: "var(--tool-search-dim)" };
  if (name.includes("web") || name.includes("fetch"))
    return { color: "var(--tool-web)", dim: "var(--tool-web-dim)" };
  if (name.includes("agent"))
    return { color: "var(--tool-agent)", dim: "var(--tool-agent-dim)" };
  return { color: "var(--tool-default)", dim: "var(--tool-default-dim)" };
}

// ══════════════════════════════════════════════════════════════
// Risk assessment
// ══════════════════════════════════════════════════════════════

const DANGEROUS_PATTERNS = [
  /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|(-[a-zA-Z]*f[a-zA-Z]*r))\b/,
  /\brm\s+-rf\b/,
  /\bsudo\b/,
  /\b(curl|wget)\b.*\|\s*(bash|sh|zsh)/,
  /\bchmod\s+[0-7]*7[0-7]*/,
  /\bdd\s+/,
  /\bmkfs\b/,
  /\bgit\s+(push\s+--force|reset\s+--hard|clean\s+-f)/,
  /\b>\s*\/dev\/sd/,
  /\b:()\s*\{\s*:\|:\s*&\s*\}/,
];

const CAUTION_PATTERNS = [
  /\brm\b/,
  /\bgit\s+(reset|checkout\s+--)/,
  /\bnpm\s+publish/,
  /\bdocker\s+rm/,
  /\bkill\b/,
  /\bpkill\b/,
  /\breboot\b/,
  /\bshutdown\b/,
];

const SENSITIVE_PATH_PATTERNS = [
  /\.(env|pem|key|secret|credential)/,
  /\/etc\//,
  /\/usr\/bin\//,
  /node_modules/,
  /\.ssh\//,
  /\.gnupg\//,
];

function getRiskLevel(toolName: string, input: string): RiskLevel {
  const name = toolName.toLowerCase();
  const inp = input.toLowerCase();

  if (name.includes("bash") || name.includes("shell") || name.includes("exec")) {
    for (const p of DANGEROUS_PATTERNS) if (p.test(inp)) return "dangerous";
    for (const p of CAUTION_PATTERNS) if (p.test(inp)) return "caution";
    return "caution";
  }
  if (name.includes("write") || name.includes("edit")) {
    for (const p of SENSITIVE_PATH_PATTERNS) if (p.test(inp)) return "dangerous";
    return "caution";
  }
  if (name.includes("read") || name.includes("glob") || name.includes("grep") || name.includes("search"))
    return "safe";
  if (name.includes("web") || name.includes("fetch"))
    return "caution";
  return "caution";
}

function getRiskInfo(level: RiskLevel): { color: string; symbol: string; label: string } {
  switch (level) {
    case "safe":
      return { color: "var(--success)", symbol: "\u2713", label: "Safe" };
    case "caution":
      return { color: "var(--warning)", symbol: "\u26A0", label: "Caution" };
    case "dangerous":
      return { color: "var(--error)", symbol: "\u2716", label: "Dangerous" };
  }
}

function getPermissionReason(toolName: string, riskLevel: RiskLevel): string {
  const name = toolName.toLowerCase();
  if (name.includes("bash") || name.includes("shell") || name.includes("exec")) {
    if (riskLevel === "dangerous") return "This shell command may perform destructive or irreversible operations.";
    return "Shell commands can modify your system. Review the command before allowing.";
  }
  if (name.includes("edit"))
    return "This tool will modify an existing file on disk.";
  if (name.includes("write"))
    return "This tool will create or overwrite a file on disk.";
  if (name.includes("web") || name.includes("fetch"))
    return "This tool will make a network request to an external URL.";
  if (name.includes("agent"))
    return "This tool will spawn a sub-agent that can use other tools.";
  return "This tool requires explicit permission before execution.";
}

// ══════════════════════════════════════════════════════════════
// Input parsing helpers
// ══════════════════════════════════════════════════════════════

function safeParse(input: string): Record<string, unknown> | null {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function fileName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

function truncateLines(text: string, maxLines: number): string {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  return lines.slice(0, maxLines).join("\n") + `\n... (+${lines.length - maxLines} more lines)`;
}

// ══════════════════════════════════════════════════════════════
// Word-level diff computation
// ══════════════════════════════════════════════════════════════

interface DiffSegment {
  text: string;
  type: "same" | "added" | "removed";
}

/**
 * Compute a simple word-level diff between two strings.
 * Uses a longest-common-subsequence approach on words.
 */
function computeWordDiff(oldStr: string, newStr: string): DiffSegment[] {
  const oldWords = oldStr.split(/(\s+)/);
  const newWords = newStr.split(/(\s+)/);

  // LCS table
  const m = oldWords.length;
  const n = newWords.length;

  // For very large inputs, fall back to line-level
  if (m * n > 50000) {
    return computeLineDiff(oldStr, newStr);
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldWords[i - 1] === newWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack
  const segments: DiffSegment[] = [];
  let i = m, j = n;
  const stack: DiffSegment[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      stack.push({ text: oldWords[i - 1], type: "same" });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ text: newWords[j - 1], type: "added" });
      j--;
    } else {
      stack.push({ text: oldWords[i - 1], type: "removed" });
      i--;
    }
  }

  stack.reverse();

  // Merge consecutive segments of the same type
  for (const seg of stack) {
    if (segments.length > 0 && segments[segments.length - 1].type === seg.type) {
      segments[segments.length - 1].text += seg.text;
    } else {
      segments.push({ ...seg });
    }
  }

  return segments;
}

function computeLineDiff(oldStr: string, newStr: string): DiffSegment[] {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");
  const segments: DiffSegment[] = [];

  // Simple line-by-line comparison
  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    const oldLine = i < oldLines.length ? oldLines[i] : undefined;
    const newLine = i < newLines.length ? newLines[i] : undefined;

    if (oldLine === newLine) {
      segments.push({ text: (oldLine ?? "") + "\n", type: "same" });
    } else {
      if (oldLine !== undefined) {
        segments.push({ text: oldLine + "\n", type: "removed" });
      }
      if (newLine !== undefined) {
        segments.push({ text: newLine + "\n", type: "added" });
      }
    }
  }

  return segments;
}

// ══════════════════════════════════════════════════════════════
// Inline Styles
// ══════════════════════════════════════════════════════════════

const S = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0, 0, 0, 0.65)",
    backdropFilter: "blur(4px)",
    animation: "permOverlayIn 150ms ease-out",
  } as CSSProperties,

  dialog: (borderColor: string): CSSProperties => ({
    position: "relative",
    width: "min(600px, 90vw)",
    maxHeight: "80vh",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-primary, #0d1117)",
    border: `1px solid color-mix(in srgb, ${borderColor} 40%, var(--border, #30363d))`,
    borderLeft: `3px solid ${borderColor}`,
    borderRadius: "8px",
    boxShadow: `0 16px 48px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.04)`,
    color: "var(--text-primary, #e6edf3)",
    fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
    fontSize: "13px",
    lineHeight: "1.5",
    animation: "permDialogIn 200ms cubic-bezier(0.16, 1, 0.3, 1)",
  }),

  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px 12px",
    borderBottom: "1px solid var(--border, #30363d)",
    background: "rgba(255,255,255,0.02)",
  } as CSSProperties,

  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  } as CSSProperties,

  title: {
    fontSize: "14px",
    fontWeight: 600,
    color: "var(--text-primary, #e6edf3)",
    letterSpacing: "-0.01em",
  } as CSSProperties,

  toolBadge: (color: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    padding: "3px 10px",
    borderRadius: "12px",
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.02em",
    textTransform: "uppercase" as const,
    background: color,
    color: "#fff",
    whiteSpace: "nowrap",
  }),

  riskBadge: (color: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "2px 8px",
    borderRadius: "10px",
    fontSize: "10px",
    fontWeight: 600,
    background: `color-mix(in srgb, ${color} 15%, transparent)`,
    color: color,
    border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
  }),

  body: {
    flex: 1,
    overflow: "auto",
    padding: "16px",
  } as CSSProperties,

  section: {
    marginBottom: "14px",
  } as CSSProperties,

  sectionLast: {
    marginBottom: 0,
  } as CSSProperties,

  label: {
    display: "block",
    fontSize: "10px",
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    color: "var(--text-dim, #8b949e)",
    marginBottom: "6px",
  } as CSSProperties,

  bashBlock: {
    display: "flex",
    alignItems: "flex-start",
    gap: "8px",
    padding: "10px 12px",
    borderRadius: "6px",
    background: "var(--tool-bash-dim, rgba(34, 197, 94, 0.08))",
    border: "1px solid color-mix(in srgb, var(--tool-bash) 20%, transparent)",
    overflow: "auto",
    maxHeight: "200px",
  } as CSSProperties,

  bashPrompt: {
    color: "var(--tool-bash, #22c55e)",
    fontWeight: 700,
    userSelect: "none" as const,
    flexShrink: 0,
  } as CSSProperties,

  bashCmd: {
    color: "var(--text-primary, #e6edf3)",
    fontFamily: "inherit",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-all" as const,
  } as CSSProperties,

  filePathBlock: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 12px",
    borderRadius: "6px",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid var(--border, #30363d)",
    fontSize: "12px",
    wordBreak: "break-all" as const,
  } as CSSProperties,

  fileIcon: {
    flexShrink: 0,
    color: "var(--text-dim, #8b949e)",
    fontSize: "14px",
  } as CSSProperties,

  diffContainer: {
    borderRadius: "6px",
    overflow: "hidden",
    border: "1px solid var(--border, #30363d)",
    maxHeight: "280px",
    overflowY: "auto" as const,
  } as CSSProperties,

  diffHeader: (color: string): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "6px 12px",
    fontSize: "11px",
    fontWeight: 600,
    color: color,
    background: `color-mix(in srgb, ${color} 8%, transparent)`,
    borderBottom: "1px solid var(--border, #30363d)",
  }),

  diffContent: {
    padding: "8px 0",
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    fontSize: "12px",
    lineHeight: "1.6",
    background: "rgba(0,0,0,0.15)",
  } as CSSProperties,

  diffLine: (type: "same" | "added" | "removed"): CSSProperties => ({
    padding: "0 12px",
    display: "flex",
    background:
      type === "added" ? "rgba(34, 197, 94, 0.08)" :
      type === "removed" ? "rgba(248, 81, 73, 0.08)" :
      "transparent",
  }),

  diffSign: (type: "same" | "added" | "removed"): CSSProperties => ({
    width: "16px",
    flexShrink: 0,
    textAlign: "center" as const,
    userSelect: "none" as const,
    color:
      type === "added" ? "var(--success, #3fb950)" :
      type === "removed" ? "var(--error, #f85149)" :
      "var(--text-dim, #8b949e)",
    fontWeight: 600,
  }),

  diffText: {
    flex: 1,
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-all" as const,
  } as CSSProperties,

  wordHighlightAdded: {
    background: "rgba(34, 197, 94, 0.25)",
    borderRadius: "2px",
    padding: "0 1px",
  } as CSSProperties,

  wordHighlightRemoved: {
    background: "rgba(248, 81, 73, 0.25)",
    borderRadius: "2px",
    padding: "0 1px",
    textDecoration: "line-through",
  } as CSSProperties,

  urlBlock: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 12px",
    borderRadius: "6px",
    background: "var(--tool-web-dim, rgba(99, 102, 241, 0.08))",
    border: "1px solid color-mix(in srgb, var(--tool-web) 20%, transparent)",
    color: "var(--tool-web, #6366f1)",
    wordBreak: "break-all" as const,
  } as CSSProperties,

  agentBlock: {
    padding: "10px 12px",
    borderRadius: "6px",
    background: "var(--tool-agent-dim, rgba(249, 115, 22, 0.08))",
    border: "1px solid color-mix(in srgb, var(--tool-agent) 20%, transparent)",
    color: "var(--text-primary, #e6edf3)",
    whiteSpace: "pre-wrap" as const,
  } as CSSProperties,

  reasonBox: {
    display: "flex",
    alignItems: "flex-start",
    gap: "8px",
    margin: "0 16px 12px",
    padding: "8px 12px",
    borderRadius: "6px",
    background: "rgba(255,255,255,0.02)",
    border: "1px solid var(--border, #30363d)",
    fontSize: "11px",
    color: "var(--text-dim, #8b949e)",
    lineHeight: "1.5",
  } as CSSProperties,

  reasonIcon: {
    flexShrink: 0,
    fontSize: "13px",
    marginTop: "1px",
  } as CSSProperties,

  detailBox: {
    margin: "0 16px 12px",
    padding: "8px 12px",
    borderRadius: "6px",
    background: "rgba(255,255,255,0.02)",
    border: "1px solid var(--border, #30363d)",
    fontSize: "12px",
    color: "var(--text-secondary, #b1bac4)",
    lineHeight: "1.5",
  } as CSSProperties,

  modeHint: {
    padding: "0 16px",
    marginBottom: "8px",
    fontSize: "10px",
    color: "var(--text-dim, #8b949e)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
  } as CSSProperties,

  actions: {
    display: "flex",
    gap: "8px",
    padding: "12px 16px",
    borderTop: "1px solid var(--border, #30363d)",
    background: "rgba(255,255,255,0.02)",
  } as CSSProperties,

  btn: (variant: "deny" | "allow" | "always" | "session"): CSSProperties => {
    const base: CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      padding: "7px 14px",
      borderRadius: "6px",
      border: "1px solid transparent",
      fontSize: "12px",
      fontWeight: 600,
      fontFamily: "inherit",
      cursor: "pointer",
      transition: "all 120ms ease",
      whiteSpace: "nowrap",
    };
    switch (variant) {
      case "deny":
        return {
          ...base,
          background: "rgba(248, 81, 73, 0.1)",
          border: "1px solid rgba(248, 81, 73, 0.3)",
          color: "var(--error, #f85149)",
        };
      case "allow":
        return {
          ...base,
          background: "rgba(34, 197, 94, 0.15)",
          border: "1px solid rgba(34, 197, 94, 0.3)",
          color: "var(--success, #3fb950)",
          flex: 1,
        };
      case "always":
        return {
          ...base,
          background: "rgba(99, 102, 241, 0.1)",
          border: "1px solid rgba(99, 102, 241, 0.3)",
          color: "#818cf8",
        };
      case "session":
        return {
          ...base,
          background: "rgba(234, 179, 8, 0.1)",
          border: "1px solid rgba(234, 179, 8, 0.3)",
          color: "#eab308",
        };
    }
  },

  kbd: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "18px",
    height: "18px",
    padding: "0 4px",
    borderRadius: "3px",
    fontSize: "10px",
    fontWeight: 700,
    fontFamily: "inherit",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "inherit",
    lineHeight: 1,
  } as CSSProperties,

  keyboardHints: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "16px",
    padding: "8px 16px",
    fontSize: "10px",
    color: "var(--text-dim, #8b949e)",
    borderTop: "1px solid rgba(255,255,255,0.04)",
    background: "rgba(0,0,0,0.1)",
    letterSpacing: "0.03em",
  } as CSSProperties,

  hintItem: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
  } as CSSProperties,

  contentPreview: {
    padding: "10px 12px",
    borderRadius: "6px",
    background: "rgba(0,0,0,0.15)",
    border: "1px solid var(--border, #30363d)",
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    fontSize: "12px",
    lineHeight: "1.5",
    color: "var(--text-secondary, #b1bac4)",
    whiteSpace: "pre-wrap" as const,
    overflow: "auto",
    maxHeight: "200px",
    margin: 0,
  } as CSSProperties,
};

// Inject keyframe animations once
let animationsInjected = false;
function injectAnimations() {
  if (animationsInjected) return;
  animationsInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    @keyframes permOverlayIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes permDialogIn {
      from { opacity: 0; transform: scale(0.95) translateY(8px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
  `;
  document.head.appendChild(style);
}

// ══════════════════════════════════════════════════════════════
// Sub-components
// ══════════════════════════════════════════════════════════════

/** Render a word-level diff between old and new strings */
function DiffPreview({ oldStr, newStr }: { oldStr: string; newStr: string }) {
  const segments = useMemo(() => computeWordDiff(oldStr, newStr), [oldStr, newStr]);

  // Split segments into lines for display
  const lines = useMemo(() => {
    const result: { segments: DiffSegment[]; type: "same" | "added" | "removed" | "mixed" }[] = [];
    let currentLine: DiffSegment[] = [];
    let lineTypes = new Set<string>();

    function flushLine() {
      if (currentLine.length === 0) return;
      const types = lineTypes;
      let lineType: "same" | "added" | "removed" | "mixed" = "same";
      if (types.has("added") && types.has("removed")) lineType = "mixed";
      else if (types.has("added")) lineType = "added";
      else if (types.has("removed")) lineType = "removed";
      result.push({ segments: [...currentLine], type: lineType });
      currentLine = [];
      lineTypes = new Set();
    }

    for (const seg of segments) {
      const parts = seg.text.split("\n");
      for (let pi = 0; pi < parts.length; pi++) {
        if (pi > 0) flushLine();
        if (parts[pi]) {
          currentLine.push({ text: parts[pi], type: seg.type });
          if (seg.type !== "same") lineTypes.add(seg.type);
        }
      }
    }
    flushLine();
    return result;
  }, [segments]);

  // Limit display lines
  const maxLines = 20;
  const displayLines = lines.slice(0, maxLines);
  const hasMore = lines.length > maxLines;

  return (
    <div style={S.diffContainer}>
      <div style={S.diffHeader("var(--tool-edit, #3b82f6)")}>
        Changes
      </div>
      <div style={S.diffContent}>
        {displayLines.map((line, i) => {
          const lineType =
            line.type === "added" ? "added" :
            line.type === "removed" ? "removed" :
            line.type === "mixed" ? "removed" : // mixed lines get neutral bg
            "same";
          const sign =
            line.type === "added" ? "+" :
            line.type === "removed" ? "-" :
            line.type === "mixed" ? "~" :
            " ";

          return (
            <div key={i} style={S.diffLine(lineType === "removed" ? "removed" : lineType === "added" ? "added" : "same")}>
              <span style={S.diffSign(lineType === "removed" ? "removed" : lineType === "added" ? "added" : "same")}>
                {sign}
              </span>
              <span style={S.diffText}>
                {line.segments.map((seg, si) => {
                  if (seg.type === "added") {
                    return <span key={si} style={S.wordHighlightAdded}>{seg.text}</span>;
                  }
                  if (seg.type === "removed") {
                    return <span key={si} style={S.wordHighlightRemoved}>{seg.text}</span>;
                  }
                  return <span key={si}>{seg.text}</span>;
                })}
              </span>
            </div>
          );
        })}
        {hasMore && (
          <div style={{ ...S.diffLine("same"), color: "var(--text-dim)", fontStyle: "italic", padding: "4px 12px" }}>
            ... +{lines.length - maxLines} more lines
          </div>
        )}
      </div>
    </div>
  );
}

/** Render a line-level diff (old lines then new lines) */
function LineDiffPreview({ oldStr, newStr }: { oldStr: string; newStr: string }) {
  const oldLines = truncateLines(oldStr, 10).split("\n");
  const newLines = truncateLines(newStr, 10).split("\n");

  return (
    <div style={S.diffContainer}>
      <div style={S.diffHeader("var(--error, #f85149)")}>Removed</div>
      <div style={S.diffContent}>
        {oldLines.map((line, i) => (
          <div key={`r${i}`} style={S.diffLine("removed")}>
            <span style={S.diffSign("removed")}>-</span>
            <span style={S.diffText}>{line}</span>
          </div>
        ))}
      </div>
      <div style={S.diffHeader("var(--success, #3fb950)")}>Added</div>
      <div style={S.diffContent}>
        {newLines.map((line, i) => (
          <div key={`a${i}`} style={S.diffLine("added")}>
            <span style={S.diffSign("added")}>+</span>
            <span style={S.diffText}>{line}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════════════════

export default function PermissionDialog({
  isOpen,
  toolName,
  toolId,
  input,
  detail,
  filePath,
  diff,
  onAllow,
  onDeny,
  onAllowAlways,
  onAllowSession,
  permissionMode,
}: PermissionDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);

  const toolColor = useMemo(() => getToolColor(toolName), [toolName]);
  const risk = useMemo(() => getRiskLevel(toolName, input), [toolName, input]);
  const riskInfo = useMemo(() => getRiskInfo(risk), [risk]);
  const reason = useMemo(() => getPermissionReason(toolName, risk), [toolName, risk]);
  const parsed = useMemo(() => safeParse(input), [input]);

  const nameLower = toolName.toLowerCase();
  const isBash = nameLower.includes("bash") || nameLower.includes("shell") || nameLower.includes("exec");
  const isEdit = nameLower.includes("edit");
  const isWrite = nameLower.includes("write") && !nameLower.includes("todo");
  const isRead = nameLower.includes("read");
  const isWeb = nameLower.includes("web") || nameLower.includes("fetch");
  const isAgent = nameLower.includes("agent");

  // Extract tool-specific data
  const bashCommand = isBash && parsed ? (parsed.command || parsed.cmd || null) as string | null : null;
  const editInfo = isEdit && parsed ? (() => {
    if (parsed.old_string != null && parsed.new_string != null) {
      return {
        file: (filePath || parsed.file_path || parsed.path || "") as string,
        oldStr: parsed.old_string as string,
        newStr: parsed.new_string as string,
      };
    }
    return null;
  })() : null;
  const writeFile = isWrite && parsed ? (filePath || parsed.file_path || parsed.path || null) as string | null : null;
  const writeContent = isWrite && parsed ? (parsed.content || "") as string : null;
  const readFile = isRead && parsed ? (filePath || parsed.file_path || parsed.path || null) as string | null : null;
  const webUrl = isWeb && parsed ? (parsed.url || parsed.href || null) as string | null : null;
  const agentDesc = isAgent && parsed ? (parsed.description || parsed.prompt || parsed.task || null) as string | null : null;

  // Fallback display for unrecognized tools
  const fallbackDisplay = useMemo(() => {
    if (bashCommand || editInfo || writeFile || readFile || webUrl || agentDesc) return null;
    if (parsed) return JSON.stringify(parsed, null, 2);
    return input;
  }, [input, parsed, bashCommand, editInfo, writeFile, readFile, webUrl, agentDesc]);

  // Stable callbacks
  const stableAllow = useCallback(() => onAllow(), [onAllow]);
  const stableDeny = useCallback(() => onDeny(), [onDeny]);
  const stableAlways = useCallback(() => onAllowAlways(), [onAllowAlways]);
  const stableSession = useCallback(() => onAllowSession?.(), [onAllowSession]);

  // Inject CSS animations
  useEffect(() => { injectAnimations(); }, []);

  // Auto-focus
  useEffect(() => {
    if (isOpen && dialogRef.current) {
      dialogRef.current.focus();
    }
  }, [isOpen]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toLowerCase();
      if (key === "y" || key === "enter") {
        e.preventDefault();
        stableAllow();
      } else if (key === "n" || key === "escape") {
        e.preventDefault();
        stableDeny();
      } else if (key === "a") {
        e.preventDefault();
        stableAlways();
      } else if (key === "s" && onAllowSession) {
        e.preventDefault();
        stableSession();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, stableAllow, stableDeny, stableAlways, stableSession, onAllowSession]);

  if (!isOpen) return null;

  const resolvedFilePath = editInfo?.file || writeFile || readFile || filePath;

  return (
    <div style={S.overlay} onClick={onDeny}>
      <div
        ref={dialogRef}
        style={S.dialog(toolColor.color)}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div style={S.header}>
          <div style={S.headerLeft}>
            <span style={S.title}>Permission Required</span>
            <span style={S.riskBadge(riskInfo.color)}>
              {riskInfo.symbol} {riskInfo.label}
            </span>
          </div>
          <span style={S.toolBadge(toolColor.color)}>
            {toolName}
          </span>
        </div>

        {/* ── Body ── */}
        <div style={S.body}>
          {/* Bash command */}
          {bashCommand && (
            <div style={S.section}>
              <span style={S.label}>Command</span>
              <div style={S.bashBlock}>
                <span style={S.bashPrompt}>$</span>
                <code style={S.bashCmd}>{bashCommand}</code>
              </div>
            </div>
          )}

          {/* Edit: file path + word-level diff */}
          {editInfo && (
            <div style={S.section}>
              <span style={S.label}>File</span>
              <div style={{ ...S.filePathBlock, marginBottom: "10px" }}>
                <span style={S.fileIcon}>{"\uD83D\uDCC4"}</span>
                <span>{editInfo.file}</span>
              </div>
              {(editInfo.oldStr || editInfo.newStr) && (
                editInfo.oldStr.length + editInfo.newStr.length < 2000
                  ? <DiffPreview oldStr={editInfo.oldStr} newStr={editInfo.newStr} />
                  : <LineDiffPreview oldStr={editInfo.oldStr} newStr={editInfo.newStr} />
              )}
            </div>
          )}

          {/* Write: file path + content preview */}
          {writeFile && (
            <div style={S.section}>
              <span style={S.label}>File</span>
              <div style={{ ...S.filePathBlock, marginBottom: writeContent ? "10px" : 0 }}>
                <span style={S.fileIcon}>{"\uD83D\uDCC4"}</span>
                <span>{writeFile}</span>
              </div>
              {writeContent && (
                <>
                  <span style={{ ...S.label, marginTop: "10px" }}>Content Preview</span>
                  <pre style={S.contentPreview}>{truncateLines(writeContent, 12)}</pre>
                </>
              )}
            </div>
          )}

          {/* Read: file path */}
          {readFile && !editInfo && !writeFile && (
            <div style={S.section}>
              <span style={S.label}>File</span>
              <div style={S.filePathBlock}>
                <span style={S.fileIcon}>{"\uD83D\uDCC4"}</span>
                <span>{readFile}</span>
              </div>
            </div>
          )}

          {/* WebFetch: URL */}
          {webUrl && (
            <div style={S.section}>
              <span style={S.label}>URL</span>
              <div style={S.urlBlock}>
                <span style={{ flexShrink: 0 }}>{"\uD83C\uDF10"}</span>
                <span>{webUrl}</span>
              </div>
            </div>
          )}

          {/* Agent: description */}
          {agentDesc && (
            <div style={S.section}>
              <span style={S.label}>Agent Task</span>
              <div style={S.agentBlock}>{agentDesc}</div>
            </div>
          )}

          {/* External diff prop */}
          {diff && !editInfo && (
            <div style={S.section}>
              <span style={S.label}>Diff</span>
              <pre style={S.contentPreview}>{truncateLines(diff, 20)}</pre>
            </div>
          )}

          {/* Fallback: raw JSON */}
          {fallbackDisplay && (
            <div style={S.section}>
              <span style={S.label}>Input</span>
              <pre style={S.contentPreview}>{truncateLines(fallbackDisplay, 12)}</pre>
            </div>
          )}
        </div>

        {/* ── Permission reason ── */}
        <div style={S.reasonBox}>
          <span style={S.reasonIcon}>{"\u2139\uFE0F"}</span>
          <span>{reason}</span>
        </div>

        {/* ── Detail ── */}
        {detail && <div style={S.detailBox}>{detail}</div>}

        {/* ── Permission mode ── */}
        {permissionMode && (
          <div style={S.modeHint}>
            Mode: {permissionMode}
            {toolId && <span style={{ marginLeft: "12px", opacity: 0.6 }}>ID: {toolId}</span>}
          </div>
        )}

        {/* ── Action buttons ── */}
        <div style={S.actions}>
          <button
            style={{
              ...S.btn("deny"),
              ...(hoveredBtn === "deny" ? { background: "rgba(248, 81, 73, 0.2)" } : {}),
            }}
            onClick={onDeny}
            onMouseEnter={() => setHoveredBtn("deny")}
            onMouseLeave={() => setHoveredBtn(null)}
          >
            Deny <span style={S.kbd}>N</span>
          </button>

          <button
            style={{
              ...S.btn("allow"),
              ...(hoveredBtn === "allow" ? { background: "rgba(34, 197, 94, 0.25)" } : {}),
            }}
            onClick={onAllow}
            onMouseEnter={() => setHoveredBtn("allow")}
            onMouseLeave={() => setHoveredBtn(null)}
          >
            Allow <span style={S.kbd}>Y</span>
          </button>

          {onAllowSession && (
            <button
              style={{
                ...S.btn("session"),
                ...(hoveredBtn === "session" ? { background: "rgba(234, 179, 8, 0.2)" } : {}),
              }}
              onClick={onAllowSession}
              onMouseEnter={() => setHoveredBtn("session")}
              onMouseLeave={() => setHoveredBtn(null)}
            >
              Session <span style={S.kbd}>S</span>
            </button>
          )}

          <button
            style={{
              ...S.btn("always"),
              ...(hoveredBtn === "always" ? { background: "rgba(99, 102, 241, 0.2)" } : {}),
            }}
            onClick={onAllowAlways}
            onMouseEnter={() => setHoveredBtn("always")}
            onMouseLeave={() => setHoveredBtn(null)}
          >
            Always <span style={S.kbd}>A</span>
          </button>
        </div>

        {/* ── Keyboard hints ── */}
        <div style={S.keyboardHints}>
          <span style={S.hintItem}><span style={S.kbd}>Y</span> Allow</span>
          <span style={S.hintItem}><span style={S.kbd}>N</span> Deny</span>
          {onAllowSession && <span style={S.hintItem}><span style={S.kbd}>S</span> Session</span>}
          <span style={S.hintItem}><span style={S.kbd}>A</span> Always</span>
          <span style={S.hintItem}><span style={S.kbd}>Esc</span> Deny</span>
          <span style={S.hintItem}><span style={S.kbd}>Enter</span> Allow</span>
        </div>
      </div>
    </div>
  );
}
