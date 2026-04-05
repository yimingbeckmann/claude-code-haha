import { useState, useCallback } from "react";

interface SystemMessageProps {
  text: string;
  subtype?: "error" | "warning" | "info" | "success" | "rate_limit" | "compact" | "api_error";
  detail?: string;
  retryable?: boolean;
  onRetry?: () => void;
}

const SUBTYPE_CONFIG: Record<
  string,
  { icon: string; label?: string; borderColor: string; bgClass: string; textClass: string }
> = {
  error: {
    icon: "\u2715",
    borderColor: "#ef4444",
    bgClass: "system-bg-red",
    textClass: "system-text-red",
  },
  api_error: {
    icon: "\u2715",
    label: "API Error",
    borderColor: "#ef4444",
    bgClass: "system-bg-red",
    textClass: "system-text-red",
  },
  warning: {
    icon: "\u26A0",
    borderColor: "#f59e0b",
    bgClass: "system-bg-yellow",
    textClass: "system-text-yellow",
  },
  rate_limit: {
    icon: "\u23F1",
    label: "Rate limited",
    borderColor: "#f97316",
    bgClass: "system-bg-orange",
    textClass: "system-text-orange",
  },
  success: {
    icon: "\u2713",
    borderColor: "#22c55e",
    bgClass: "system-bg-green",
    textClass: "system-text-green",
  },
  compact: {
    icon: "",
    label: "Context compacted",
    borderColor: "transparent",
    bgClass: "",
    textClass: "system-text-muted",
  },
  info: {
    icon: "\u2139",
    borderColor: "#3b82f6",
    bgClass: "system-bg-blue",
    textClass: "system-text-blue",
  },
};

export default function SystemMessage({
  text,
  subtype,
  detail,
  retryable,
  onRetry,
}: SystemMessageProps) {
  const [detailExpanded, setDetailExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);

  const config = subtype ? SUBTYPE_CONFIG[subtype] : undefined;
  const isError = subtype === "error" || subtype === "api_error";
  const isCompact = subtype === "compact";

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text + (detail ? "\n" + detail : "")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text, detail]);

  const borderStyle = config?.borderColor
    ? { borderLeft: `3px solid ${config.borderColor}` }
    : undefined;

  return (
    <div
      className={`message message-system animate-fade-in ${config?.bgClass ?? ""} ${isCompact ? "system-compact" : ""}`}
      style={borderStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="system-content">
        {config?.icon && (
          <span className={`system-icon ${config.textClass}`}>{config.icon}</span>
        )}

        {config?.label && (
          <span className={`system-badge ${config.textClass}`}>{config.label}</span>
        )}

        {subtype && !config?.label && (
          <span className={`system-badge ${config?.textClass ?? ""}`}>{subtype}</span>
        )}

        <span className={`system-text ${isCompact ? "system-text-compact" : ""}`}>{text}</span>

        {retryable && onRetry && (
          <button className="system-retry-btn" onClick={onRetry} title="Retry">
            Retry
          </button>
        )}

        {isError && hovered && (
          <button className="system-copy-btn" onClick={handleCopy} title="Copy error text">
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>

      {detail && (
        <div className="system-detail-section">
          <button
            className="system-detail-toggle"
            onClick={() => setDetailExpanded(!detailExpanded)}
          >
            {detailExpanded ? "\u25B2 Hide detail" : "\u25BC Show detail"}
          </button>
          {detailExpanded && (
            <pre className="system-detail-body">{detail}</pre>
          )}
        </div>
      )}
    </div>
  );
}
