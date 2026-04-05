import { useState, useEffect, useRef, useCallback } from "react";

type PermissionMode = "ask" | "auto-accept" | "plan" | "auto" | "bypass";

interface ModeConfig {
  key: PermissionMode;
  label: string;
  shortLabel: string;
  description: string;
}

const MODES: ModeConfig[] = [
  { key: "ask", label: "Ask", shortLabel: "ask", description: "Confirm before every tool use" },
  { key: "auto-accept", label: "Auto-accept", shortLabel: "auto-accept", description: "Accept tool calls automatically" },
  { key: "plan", label: "Plan", shortLabel: "plan", description: "Plan first, then execute with approval" },
  { key: "auto", label: "Auto", shortLabel: "auto", description: "Fully autonomous execution" },
  { key: "bypass", label: "Bypass", shortLabel: "bypass", description: "Skip all permission checks" },
];

interface Props {
  mode: PermissionMode;
  onModeChange: (mode: PermissionMode) => void;
}

function PermissionModeSelector({ mode, onModeChange }: Props) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const current = MODES.find((m) => m.key === mode) ?? MODES[0];

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Shift+Tab shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Tab" && e.shiftKey) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleSelect = useCallback(
    (m: PermissionMode) => {
      onModeChange(m);
      setOpen(false);
    },
    [onModeChange],
  );

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-block", marginLeft: "auto" }}>
      {/* Tiny text label */}
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "inline-block",
          padding: 0,
          border: "none",
          background: "none",
          color: hovered ? "#999" : "#666",
          fontSize: 10,
          fontFamily: "inherit",
          fontWeight: 400,
          cursor: "pointer",
          transition: "color 0.15s ease",
          lineHeight: 1,
          letterSpacing: 0.2,
        }}
      >
        {current.shortLabel}
      </button>

      {/* Dropdown (opens upward) */}
      {open && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 4px)",
            left: 0,
            minWidth: 200,
            background: "#1a1a2e",
            border: "1px solid #ffffff12",
            borderRadius: 6,
            boxShadow: "0 -2px 12px rgba(0,0,0,0.3)",
            zIndex: 1000,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "5px 8px",
              borderBottom: "1px solid #ffffff0a",
            }}
          >
            <span style={{ fontSize: 10, color: "#666", fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.4 }}>
              Mode
            </span>
            <kbd
              style={{
                fontSize: 9,
                color: "#555",
                background: "#ffffff08",
                padding: "1px 4px",
                borderRadius: 3,
                border: "1px solid #ffffff0a",
                fontFamily: "inherit",
              }}
            >
              Shift+Tab
            </kbd>
          </div>

          {/* Mode options */}
          {MODES.map((m) => {
            const active = m.key === mode;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => handleSelect(m.key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  width: "100%",
                  padding: "5px 8px",
                  border: "none",
                  background: active ? "#ffffff08" : "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.15s ease",
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = "#ffffff06";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = active ? "#ffffff08" : "transparent";
                }}
              >
                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: active ? 500 : 400, color: active ? "#bbb" : "#888" }}>{m.label}</div>
                  <div style={{ fontSize: 10, color: "#555", marginTop: 1 }}>{m.description}</div>
                </div>

                {/* Checkmark */}
                {active && (
                  <span style={{ color: "#777", fontSize: 11, flexShrink: 0 }}>{"\u2713"}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default PermissionModeSelector;
