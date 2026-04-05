import { useState, useCallback } from "react";

// ==========================================================================
// BriefModeBadge — compact toggle for brief/concise AI response mode
//
// Renders as an sl-badge in the StatusLine.
// Active:   highlighted "BRIEF" text
// Inactive: dimmed "..." icon
// ==========================================================================

interface BriefModeBadgeProps {
  active?: boolean;
  onToggle?: (active: boolean) => void;
}

const ACTIVE_COLOR = "#60a5fa"; // blue accent

function BriefModeBadge({ active: controlledActive, onToggle }: BriefModeBadgeProps) {
  const [internalActive, setInternalActive] = useState(false);
  const active = controlledActive ?? internalActive;

  const handleClick = useCallback(() => {
    const next = !active;
    if (onToggle) {
      onToggle(next);
    } else {
      setInternalActive(next);
    }
  }, [active, onToggle]);

  return (
    <span
      className="sl-badge sl-tooltip"
      data-tip="Brief Mode: Concise AI responses"
      style={{
        color: active ? ACTIVE_COLOR : "var(--text-dim)",
        border: `1px solid ${active ? `${ACTIVE_COLOR}40` : "var(--border)"}`,
        background: active ? `${ACTIVE_COLOR}10` : "transparent",
      }}
      onClick={handleClick}
    >
      {active ? "BRIEF" : "\u2026"}
    </span>
  );
}

export default BriefModeBadge;
export type { BriefModeBadgeProps };
