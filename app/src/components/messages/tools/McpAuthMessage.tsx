import { useState, useCallback, type ReactNode } from "react";
import { CopyIcon, CheckIcon } from "../../icons/Icons";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface McpAuthMessageProps {
  /** "use" = tool_use (initiating), "result" = tool_result (completed) */
  mode: "use" | "result";
  /** Auth action */
  action: "authenticate" | "status" | "refresh" | "reauthenticate";
  /** MCP server name */
  serverName: string;
  /** Result status (result mode only) */
  authStatus?: "success" | "failure" | "pending";
  /** Credential type for status action */
  credentialType?: string;
  /** Expiry timestamp or string for status action */
  expiry?: string;
  /** Error message if failure */
  errorMessage?: string;
  /** Whether the action is currently running */
  isRunning?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
// Constants
// ---------------------------------------------------------------------------

const ACTION_LABELS: Record<string, string> = {
  authenticate: "Authenticate",
  status: "Check Status",
  refresh: "Refresh Token",
  reauthenticate: "Re-authenticate",
};

const ACTION_ICONS: Record<string, string> = {
  authenticate: "\uD83D\uDD11",  // key
  status: "\uD83D\uDD0D",        // magnifying glass
  refresh: "\uD83D\uDD04",       // counterclockwise arrows
  reauthenticate: "\uD83D\uDD10", // closed lock with key
};

const STATUS_COLORS: Record<string, string> = {
  success: "var(--success, #98c379)",
  failure: "var(--error, #e06c75)",
  pending: "var(--warning, #e5c07b)",
};

const STATUS_LABELS: Record<string, string> = {
  success: "Authenticated",
  failure: "Failed",
  pending: "Pending",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function McpAuthMessage({
  mode, action, serverName, authStatus, credentialType, expiry, errorMessage, isRunning,
}: McpAuthMessageProps) {
  const active = mode === "use" || isRunning;
  const statusColor = authStatus ? STATUS_COLORS[authStatus] || "var(--text-dim, #5c6370)" : undefined;

  return (
    <div style={{ ...S.container, borderLeftColor: statusColor || "var(--tool-web, #6366f1)" }}>
      {/* Header row */}
      <div style={S.header}>
        <span style={S.headerIcon}>{ACTION_ICONS[action] || "\uD83D\uDD11"}</span>
        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
          {ACTION_LABELS[action] || action}
        </span>

        {/* Server name badge */}
        <Badge color="var(--tool-web, #6366f1)">{serverName}</Badge>

        {/* Status badge (result only) */}
        {!active && authStatus && (
          <Badge color={statusColor}>
            {STATUS_LABELS[authStatus] || authStatus}
          </Badge>
        )}

        {/* Running spinner */}
        {active && (
          <span className="tool-item-spinner" />
        )}

        <span style={{ flex: 1 }} />
        <CopyButton text={`${action} ${serverName}${authStatus ? ` - ${authStatus}` : ""}`} />
      </div>

      {/* Detail rows for status action */}
      {!active && action === "status" && (credentialType || expiry) && (
        <div style={S.details}>
          {credentialType && (
            <div style={S.detailRow}>
              <span style={S.detailLabel}>Credential:</span>
              <span style={S.detailValue}>{credentialType}</span>
            </div>
          )}
          {expiry && (
            <div style={S.detailRow}>
              <span style={S.detailLabel}>Expires:</span>
              <span style={S.detailValue}>{expiry}</span>
            </div>
          )}
        </div>
      )}

      {/* Error message */}
      {!active && authStatus === "failure" && errorMessage && (
        <div style={S.details}>
          <div style={{ ...S.detailRow, color: "var(--error, #e06c75)" }}>
            {errorMessage}
          </div>
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
    borderLeft: "3px solid var(--tool-web, #6366f1)",
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
    cursor: "default",
    minHeight: 32,
    flexWrap: "wrap" as const,
  },
  headerIcon: {
    display: "inline-flex",
    alignItems: "center",
    marginRight: 2,
    fontSize: 14,
  },
  details: {
    padding: "4px 10px 6px",
    borderTop: "1px solid var(--border, #2e2e3e)",
  },
  detailRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "2px 0",
    fontFamily: "var(--font-mono, 'SF Mono', Monaco, Consolas, monospace)",
    fontSize: 11,
    color: "var(--text-secondary, #abb2bf)",
  },
  detailLabel: {
    color: "var(--text-dim, #5c6370)",
    fontWeight: 500,
    minWidth: 80,
  },
  detailValue: {
    color: "var(--text-primary, #abb2bf)",
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
