import { useState, useMemo } from "react";

interface TokenBreakdown {
  system: number;
  messages: number;
  tools: number;
  free: number;
}

interface ContextBarProps {
  usedTokens: number;
  totalTokens: number;
  modelName: string;
  breakdown: TokenBreakdown;
}

function getBarColor(percent: number): string {
  if (percent >= 90) return "var(--error, #ef4444)";
  if (percent >= 70) return "var(--warning, #f59e0b)";
  return "var(--success, #22c55e)";
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

export default function ContextBar({
  usedTokens,
  totalTokens,
  modelName,
  breakdown,
}: ContextBarProps) {
  const [expanded, setExpanded] = useState(false);

  const percent = useMemo(
    () => Math.min(100, Math.round((usedTokens / totalTokens) * 100)),
    [usedTokens, totalTokens],
  );

  const barColor = getBarColor(percent);
  const showCompactWarning = percent >= 90;

  const breakdownItems: { label: string; value: number; color: string }[] = [
    { label: "System", value: breakdown.system, color: "var(--accent, #f97316)" },
    { label: "Messages", value: breakdown.messages, color: "#60a5fa" },
    { label: "Tools", value: breakdown.tools, color: "#a78bfa" },
    { label: "Free", value: breakdown.free, color: "var(--success, #22c55e)" },
  ];

  return (
    <div
      style={{
        fontFamily: "inherit",
        fontSize: 12,
        userSelect: "none",
        width: "100%",
      }}
    >
      {/* Compact bar - always visible */}
      <div
        onClick={() => setExpanded((e) => !e)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: 24,
          cursor: "pointer",
          padding: "0 4px",
          borderRadius: 4,
          transition: "background 0.15s ease",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.background =
            "rgba(255,255,255,0.04)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.background = "transparent";
        }}
        title="Click to expand token breakdown"
      >
        {/* Model name */}
        <span
          style={{
            color: "var(--accent, #f97316)",
            fontWeight: 600,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {modelName}
        </span>

        {/* Progress bar */}
        <div
          style={{
            flex: 1,
            height: 4,
            background: "rgba(255,255,255,0.08)",
            borderRadius: 2,
            overflow: "hidden",
            minWidth: 60,
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${percent}%`,
              background: barColor,
              borderRadius: 2,
              transition: "width 0.4s ease, background 0.4s ease",
            }}
          />
        </div>

        {/* Context label */}
        <span
          style={{
            color: barColor,
            fontWeight: 500,
            whiteSpace: "nowrap",
            flexShrink: 0,
            transition: "color 0.4s ease",
          }}
        >
          Context: {percent}%
        </span>

        {/* Expand chevron */}
        <span
          style={{
            color: "rgba(255,255,255,0.35)",
            fontSize: 10,
            transition: "transform 0.2s ease",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            display: "inline-block",
          }}
        >
          ▼
        </span>
      </div>

      {/* Expanded breakdown */}
      <div
        style={{
          overflow: "hidden",
          maxHeight: expanded ? 200 : 0,
          opacity: expanded ? 1 : 0,
          transition: "max-height 0.3s ease, opacity 0.25s ease",
        }}
      >
        <div
          style={{
            padding: "8px 4px 4px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {/* Stacked breakdown bars */}
          <div
            style={{
              height: 6,
              display: "flex",
              borderRadius: 3,
              overflow: "hidden",
              background: "rgba(255,255,255,0.06)",
            }}
          >
            {breakdownItems
              .filter((item) => item.value > 0)
              .map((item) => {
                const itemPercent = (item.value / totalTokens) * 100;
                return (
                  <div
                    key={item.label}
                    style={{
                      width: `${itemPercent}%`,
                      height: "100%",
                      background: item.color,
                      transition: "width 0.4s ease",
                    }}
                  />
                );
              })}
          </div>

          {/* Labels */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "4px 12px",
            }}
          >
            {breakdownItems.map((item) => (
              <div
                key={item.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: item.color,
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: "rgba(255,255,255,0.55)" }}>
                  {item.label}:
                </span>
                <span style={{ color: "rgba(255,255,255,0.85)", fontWeight: 500 }}>
                  {formatTokens(item.value)}
                </span>
              </div>
            ))}
          </div>

          {/* Total */}
          <div
            style={{
              color: "rgba(255,255,255,0.45)",
              fontSize: 11,
              paddingTop: 2,
              borderTop: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {formatTokens(usedTokens)} / {formatTokens(totalTokens)} tokens used
          </div>

          {/* Auto-compact warning */}
          {showCompactWarning && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                color: "var(--error, #ef4444)",
                fontSize: 11,
                fontWeight: 500,
                animation: "pulse-opacity 2s ease-in-out infinite",
              }}
            >
              <span>!</span>
              <span>Auto-compact soon</span>
              <style>{`
                @keyframes pulse-opacity {
                  0%, 100% { opacity: 1; }
                  50% { opacity: 0.6; }
                }
              `}</style>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
