import { useState, useEffect, useCallback } from "react";

// ==========================================================================
// KairosStatusBadge — compact toggle for KAIROS proactive assistant mode
//
// Renders as an sl-badge in the StatusLine.
// Active:   green "KAIROS" with pulse animation
// Inactive: dimmed gray badge
// ==========================================================================

interface KairosStatusBadgeProps {
  active?: boolean;
  onToggle?: (active: boolean) => void;
}

const ACTIVE_COLOR = "#4ade80"; // green accent
const INACTIVE_COLOR = "var(--text-dim)";

const STYLE_ID = "kairos-badge-styles";

function ensureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes kairos-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.4); }
      50% { box-shadow: 0 0 6px 2px rgba(74, 222, 128, 0.25); }
    }
    .kairos-active {
      animation: kairos-pulse 2s ease-in-out infinite;
    }
  `;
  document.head.appendChild(style);
}

function KairosStatusBadge({ active: controlledActive, onToggle }: KairosStatusBadgeProps) {
  const [internalActive, setInternalActive] = useState(false);
  const active = controlledActive ?? internalActive;

  useEffect(() => ensureStyles(), []);

  const handleClick = useCallback(() => {
    const next = !active;
    if (onToggle) {
      onToggle(next);
    } else {
      setInternalActive(next);
    }
  }, [active, onToggle]);

  const color = active ? ACTIVE_COLOR : INACTIVE_COLOR;

  return (
    <span
      className={`sl-badge sl-tooltip${active ? " kairos-active" : ""}`}
      data-tip="KAIROS: Always-on proactive assistant"
      style={{
        color,
        border: `1px solid ${active ? `${ACTIVE_COLOR}40` : "var(--border)"}`,
        background: active ? `${ACTIVE_COLOR}10` : "transparent",
      }}
      onClick={handleClick}
    >
      <span
        className="sl-dot"
        style={{
          background: color,
          boxShadow: active ? `0 0 4px ${ACTIVE_COLOR}` : "none",
        }}
      />
      KAIROS
    </span>
  );
}

export default KairosStatusBadge;
export type { KairosStatusBadgeProps };
