import { useState, useCallback, useMemo, type ReactNode } from "react";
import { CopyIcon, CheckIcon } from "../../icons/Icons";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TeamMember {
  name: string;
  role: string;
}

interface TeamToolMessageProps {
  /** "use" = tool_use, "result" = tool_result */
  mode: "use" | "result";
  /** TeamCreate or TeamDelete */
  action: "create" | "delete";
  /** Team name */
  teamName: string;
  /** Member roles (create only) */
  members?: TeamMember[];
  /** Scratchpad path (create only) */
  scratchpadPath?: string;
  /** Whether still running */
  isRunning?: boolean;
  /** Whether the operation succeeded */
  isError?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shortPath(p: string): string {
  return p.replace(/^\/Users\/[^/]+/, "~");
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

function Badge({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span style={{
      ...S.badge,
      ...(color ? { background: color + "18", color, borderColor: color + "40" } : {}),
    }}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TeamToolMessage({
  mode, action, teamName, members, scratchpadPath, isRunning, isError,
}: TeamToolMessageProps) {
  const [expanded, setExpanded] = useState(action === "create");
  const active = mode === "use" || isRunning;
  const isCreate = action === "create";

  const borderColor = isError
    ? "var(--error, #e06c75)"
    : "var(--tool-agent, #f97316)";

  const copyText = useMemo(() => {
    if (!isCreate) return `Delete team: ${teamName}`;
    const lines = [`Team: ${teamName}`];
    if (members) {
      for (const m of members) lines.push(`  ${m.name} (${m.role})`);
    }
    if (scratchpadPath) lines.push(`Scratchpad: ${scratchpadPath}`);
    return lines.join("\n");
  }, [isCreate, teamName, members, scratchpadPath]);

  // ── Delete ──
  if (!isCreate) {
    return (
      <div style={{ ...S.container, borderLeftColor: borderColor }}>
        <div style={S.header}>
          <span style={S.headerIcon}>{"\uD83D\uDDD1\uFE0F"}</span>
          <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>Delete Team</span>
          <Badge color="var(--tool-agent, #f97316)">{teamName}</Badge>
          {active && <span className="tool-item-spinner" />}
          {!active && !isError && (
            <span style={{ color: "var(--success, #98c379)", display: "inline-flex" }}><CheckIcon /></span>
          )}
          <span style={{ flex: 1 }} />
          <CopyButton text={copyText} />
        </div>
      </div>
    );
  }

  // ── Create ──
  return (
    <div style={{ ...S.container, borderLeftColor: borderColor }}>
      {/* Header */}
      <div
        style={{ ...S.header, cursor: members && members.length > 0 ? "pointer" : "default" }}
        onClick={() => members && members.length > 0 && setExpanded(!expanded)}
      >
        <span style={S.headerIcon}>{"\uD83D\uDC65"}</span>
        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>Create Team</span>
        <Badge color="var(--tool-agent, #f97316)">{teamName}</Badge>
        {members && <Badge>{members.length} member{members.length !== 1 ? "s" : ""}</Badge>}
        {active && <span className="tool-item-spinner" />}
        {!active && !isError && (
          <span style={{ color: "var(--success, #98c379)", display: "inline-flex" }}><CheckIcon /></span>
        )}
        <span style={{ flex: 1 }} />
        <CopyButton text={copyText} />
        {members && members.length > 0 && (
          <span style={{ color: "var(--text-dim)", fontSize: 10 }}>{expanded ? "\u25BE" : "\u25B8"}</span>
        )}
      </div>

      {/* Members list */}
      {expanded && members && members.length > 0 && (
        <div style={S.memberList}>
          {members.map((m, i) => (
            <div key={i} style={S.memberRow}>
              <span style={S.memberName}>{m.name}</span>
              <Badge color="var(--text-dim, #5c6370)">{m.role}</Badge>
            </div>
          ))}
        </div>
      )}

      {/* Scratchpad path */}
      {scratchpadPath && (
        <div style={S.scratchpad}>
          <span style={S.scratchpadLabel}>Scratchpad:</span>
          <span style={S.scratchpadPath}>{shortPath(scratchpadPath)}</span>
        </div>
      )}
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
    borderLeft: "3px solid var(--tool-agent, #f97316)",
    borderRadius: 6,
    marginTop: 4,
    marginBottom: 4,
    overflow: "hidden",
    fontSize: 13,
    lineHeight: 1.5,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    background: "var(--bg-tertiary, rgba(255,255,255,0.02))",
    minHeight: 32,
    flexWrap: "wrap" as const,
  },
  headerIcon: {
    display: "inline-flex",
    alignItems: "center",
    marginRight: 2,
    fontSize: 14,
  },
  memberList: {
    borderTop: "1px solid var(--border, #2e2e3e)",
    padding: "4px 0",
  },
  memberRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "3px 10px 3px 28px",
    fontSize: 12,
  },
  memberName: {
    fontFamily: "var(--font-mono, 'SF Mono', Monaco, Consolas, monospace)",
    fontSize: 11,
    color: "var(--text-primary, #abb2bf)",
    fontWeight: 500,
  },
  scratchpad: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "4px 10px 6px",
    borderTop: "1px solid var(--border, #2e2e3e)",
    fontSize: 11,
    fontFamily: "var(--font-mono, 'SF Mono', Monaco, Consolas, monospace)",
  },
  scratchpadLabel: {
    color: "var(--text-dim, #5c6370)",
    fontWeight: 500,
  },
  scratchpadPath: {
    color: "var(--text-secondary, #abb2bf)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    fontSize: 10,
    fontWeight: 500,
    padding: "1px 6px",
    borderRadius: 4,
    border: "1px solid var(--border, #2e2e3e)",
    background: "var(--bg-tertiary, rgba(255,255,255,0.04))",
    color: "var(--text-dim, #5c6370)",
    whiteSpace: "nowrap" as const,
    lineHeight: 1.4,
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
