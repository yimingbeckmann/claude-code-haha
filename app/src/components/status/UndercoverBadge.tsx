import { useState, useEffect, useRef, type CSSProperties } from "react";

interface UndercoverBadgeProps {
  active: boolean;
  onToggle: () => void;
}

const pulseKeyframes = `
@keyframes undercoverPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
`;

/**
 * UndercoverBadge -- compact status-line indicator for Undercover Mode.
 *
 * Shows a lock/spy icon. Gray when inactive, amber/yellow when active.
 * Click toggles on/off.  Tooltip on hover.
 */
function UndercoverBadge({ active, onToggle }: UndercoverBadgeProps) {
  const [hovered, setHovered] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Show tooltip after a short hover delay
  useEffect(() => {
    if (hovered) {
      hoverTimerRef.current = setTimeout(() => setTooltipVisible(true), 350);
    } else {
      setTooltipVisible(false);
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
    }
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, [hovered]);

  const activeColor = "#f59e0b"; // amber
  const inactiveColor = "#6a6a82"; // gray / muted

  const badgeStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "0 5px",
    borderRadius: 3,
    fontSize: 10,
    fontWeight: 600,
    lineHeight: "16px",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    cursor: "pointer",
    userSelect: "none",
    position: "relative",
    color: active ? activeColor : inactiveColor,
    border: `1px solid ${active ? activeColor + "60" : "var(--border, #2a2a3e)"}`,
    background: active ? activeColor + "15" : "transparent",
    animation: active ? "undercoverPulse 3s ease-in-out infinite" : "none",
    transition: "color 0.2s, border-color 0.2s, background 0.2s, filter 0.15s",
    filter: hovered ? "brightness(1.3)" : "none",
  };

  const tooltipStyle: CSSProperties = {
    position: "absolute",
    bottom: "calc(100% + 8px)",
    left: "50%",
    transform: "translateX(-50%)",
    background: "var(--bg-primary, #0a0a12)",
    border: "1px solid var(--border, #2a2a3e)",
    borderRadius: 4,
    padding: "4px 8px",
    fontSize: 10,
    fontFamily: "var(--font-mono)",
    color: "var(--text-secondary, #c0c0d0)",
    whiteSpace: "nowrap",
    zIndex: 9999,
    pointerEvents: "none",
    boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
    opacity: tooltipVisible ? 1 : 0,
    transition: "opacity 0.15s",
  };

  // Lock icon (active) or spy/eye icon (inactive) rendered as inline SVG
  const iconSize = 11;
  const lockIcon = (
    <svg
      width={iconSize}
      height={iconSize}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0 }}
    >
      <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11" r="1" fill="currentColor" />
    </svg>
  );

  const eyeIcon = (
    <svg
      width={iconSize}
      height={iconSize}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0 }}
    >
      <path d="M1.5 8s2.5-4 6.5-4 6.5 4 6.5 4-2.5 4-6.5 4S1.5 8 1.5 8z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );

  return (
    <>
      <style>{pulseKeyframes}</style>
      <span
        style={badgeStyle}
        onClick={onToggle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        role="button"
        tabIndex={0}
        aria-label={active ? "Undercover Mode active — click to disable" : "Undercover Mode inactive — click to enable"}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        {active ? lockIcon : eyeIcon}
        <span style={{ fontSize: 9 }}>{active ? "UC" : "UC"}</span>

        {/* Tooltip */}
        <span style={tooltipStyle}>
          {active
            ? "Undercover Mode: Internal codenames hidden"
            : "Undercover Mode: Click to enable"}
        </span>
      </span>
    </>
  );
}

export default UndercoverBadge;
