import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ── Types ───────────────────────────────────────────────────
type Mode = "code" | "chat" | "plan";
interface ModeSelectorProps {
  currentMode: Mode;
  onModeChange: (mode: Mode) => void;
}
interface ModeDef {
  key: Mode;
  label: string;
  icon: string;
  description: string;
  toolAccess: string;
  enabledTools: string[];
  accentColor: string;
}

// ── Mode definitions ────────────────────────────────────────
const MODES: ModeDef[] = [
  {
    key: "code", label: "Code", icon: "\u276F_",
    description: "Full tool access -- edit files, run commands, search code",
    toolAccess: "All tools enabled",
    enabledTools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep"],
    accentColor: "var(--accent)",
  },
  {
    key: "chat", label: "Chat", icon: "\u2026",
    description: "Text-only conversation, no tool use",
    toolAccess: "No tools",
    enabledTools: [],
    accentColor: "var(--text-secondary)",
  },
  {
    key: "plan", label: "Plan", icon: "\u2630",
    description: "Create a structured plan before executing",
    toolAccess: "Read-only tools, then full on execute",
    enabledTools: ["Read", "Glob", "Grep"],
    accentColor: "#48968C",
  },
];
const MODE_KEYS: Mode[] = MODES.map((m) => m.key);

// ── Styles ──────────────────────────────────────────────────
const STYLES = `
.mode-sel-trigger {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 2px 8px; border: 1px solid var(--border); border-radius: var(--radius-sm);
  background: transparent; color: var(--text-secondary);
  font-family: var(--font-mono); font-size: 11px; font-weight: 500;
  cursor: pointer; transition: color 0.15s, border-color 0.15s, background 0.15s;
  line-height: 1.3; white-space: nowrap; user-select: none;
}
.mode-sel-trigger:hover { color: var(--text-primary); border-color: var(--border-hover); background: var(--bg-hover); }
.mode-sel-trigger[data-open="true"] { border-color: var(--accent-dim); }
.mode-sel-chevron { font-size: 8px; opacity: 0.6; transition: transform 0.15s; }
.mode-sel-trigger[data-open="true"] .mode-sel-chevron { transform: rotate(180deg); }
.mode-sel-dropdown {
  position: absolute; bottom: calc(100% + 6px); left: 0;
  min-width: 260px; max-width: 300px;
  background: var(--bg-secondary); border: 1px solid var(--border-hover);
  border-radius: var(--radius-md);
  box-shadow: 0 -4px 20px rgba(0,0,0,0.4), 0 0 1px rgba(255,255,255,0.05);
  z-index: 1000; overflow: hidden; animation: mode-sel-fade 0.12s ease-out;
}
@keyframes mode-sel-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
.mode-sel-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 10px 4px; border-bottom: 1px solid var(--border);
}
.mode-sel-header-label { font-size: 10px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
.mode-sel-header-shortcut {
  font-size: 9px; color: var(--text-dim); background: var(--bg-tertiary);
  padding: 1px 5px; border-radius: 3px; border: 1px solid var(--border); font-family: var(--font-mono);
}
.mode-sel-item {
  display: flex; align-items: flex-start; gap: 10px; width: 100%;
  padding: 8px 10px; border: none; background: transparent; cursor: pointer;
  text-align: left; font-family: var(--font-mono); transition: background 0.1s;
}
.mode-sel-item:hover, .mode-sel-item[data-focused="true"] { background: var(--bg-hover); }
.mode-sel-item[data-active="true"] { background: var(--bg-active); }
.mode-sel-item-icon {
  width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-sm); font-size: 13px; flex-shrink: 0;
  border: 1px solid var(--border); background: var(--bg-tertiary);
}
.mode-sel-item-body { flex: 1; min-width: 0; }
.mode-sel-item-name { font-size: 12px; font-weight: 500; color: var(--text-primary); }
.mode-sel-item-desc { font-size: 10px; color: var(--text-muted); margin-top: 2px; line-height: 1.3; }
.mode-sel-item-tools { font-size: 9px; color: var(--text-dim); margin-top: 3px; }
.mode-sel-check { color: var(--accent); font-size: 12px; flex-shrink: 0; width: 16px; text-align: center; margin-top: 4px; }
.mode-sel-divider { height: 1px; background: var(--border); margin: 2px 10px; }
.mode-sel-indicator { display: inline-block; width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
`;

// ── Component ───────────────────────────────────────────────
function ModeSelector({ currentMode, onModeChange }: ModeSelectorProps) {
  const [open, setOpen] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const current = useMemo(() => MODES.find((m) => m.key === currentMode) ?? MODES[0], [currentMode]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Shift+Tab to cycle modes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Tab" && e.shiftKey) {
        e.preventDefault();
        const idx = MODE_KEYS.indexOf(currentMode);
        onModeChange(MODE_KEYS[(idx + 1) % MODE_KEYS.length]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentMode, onModeChange]);

  // Keyboard nav inside dropdown
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") { e.preventDefault(); setFocusedIdx((i) => Math.max(i - 1, 0)); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setFocusedIdx((i) => Math.min(i + 1, MODES.length - 1)); }
      else if (e.key === "Enter" && focusedIdx >= 0) { e.preventDefault(); onModeChange(MODES[focusedIdx].key); setOpen(false); }
      else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, focusedIdx, onModeChange]);

  // Reset focus when opening
  useEffect(() => {
    if (open) { setFocusedIdx(Math.max(MODE_KEYS.indexOf(currentMode), 0)); }
  }, [open, currentMode]);

  const handleSelect = useCallback((mode: Mode) => { onModeChange(mode); setOpen(false); }, [onModeChange]);

  return (
    <>
      <style>{STYLES}</style>
      <div ref={containerRef} style={{ position: "relative", display: "inline-block" }}>
        <button
          type="button" className="mode-sel-trigger" data-open={open}
          onClick={() => setOpen((p) => !p)}
          title={`Mode: ${current.label} (Shift+Tab to cycle)`}
          style={{ color: open ? current.accentColor : undefined, borderColor: open ? current.accentColor : undefined }}
        >
          <span className="mode-sel-indicator" style={{ backgroundColor: current.accentColor }} />
          <span style={{ fontSize: 12, lineHeight: 1 }}>{current.icon}</span>
          <span>{current.label}</span>
          <span className="mode-sel-chevron">{"\u25B2"}</span>
        </button>

        {open && (
          <div className="mode-sel-dropdown">
            <div className="mode-sel-header">
              <span className="mode-sel-header-label">Mode</span>
              <span className="mode-sel-header-shortcut">Shift+Tab</span>
            </div>
            {MODES.map((m, idx) => {
              const isActive = m.key === currentMode;
              return (
                <button
                  key={m.key} type="button" className="mode-sel-item"
                  data-active={isActive} data-focused={idx === focusedIdx}
                  onClick={() => handleSelect(m.key)} onMouseEnter={() => setFocusedIdx(idx)}
                >
                  <div className="mode-sel-item-icon"
                    style={{ color: isActive ? m.accentColor : "var(--text-muted)", borderColor: isActive ? m.accentColor : undefined }}>
                    {m.icon}
                  </div>
                  <div className="mode-sel-item-body">
                    <div className="mode-sel-item-name">{m.label}</div>
                    <div className="mode-sel-item-desc">{m.description}</div>
                    <div className="mode-sel-item-tools">{m.toolAccess}</div>
                  </div>
                  <span className="mode-sel-check">{isActive ? "\u2713" : ""}</span>
                </button>
              );
            })}
            <div className="mode-sel-divider" />
            <div style={{ padding: "4px 10px 6px", fontSize: 9, color: "var(--text-dim)", display: "flex", justifyContent: "space-between" }}>
              <span>{"\u2191\u2193"} navigate</span>
              <span>{"\u21B5"} select</span>
              <span>esc close</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default ModeSelector;
export type { ModeSelectorProps, Mode, ModeDef };
