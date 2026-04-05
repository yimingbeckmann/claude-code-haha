import { useState, useEffect, useCallback, useRef } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface KairosSuggestion {
  id: string;
  timestamp: number;
  type: "file-change" | "git-status" | "build-error" | "test-failure" | "general";
  title: string;
  detail: string;
  dismissed: boolean;
}

export interface KairosLogSummary {
  entryCount: number;
  lastActivity: number | null;
}

export interface KairosConfig {
  enabled: boolean;
  blockingBudget: number;
  watchFileChanges: boolean;
  watchGitStatus: boolean;
  watchBuildErrors: boolean;
  watchTestFailures: boolean;
  pollInterval: number;
}

export interface KairosPanelProps {
  isOpen: boolean;
  onClose: () => void;
  config?: KairosConfig;
  onConfigChange?: (config: KairosConfig) => void;
  suggestions?: KairosSuggestion[];
  onDismissSuggestion?: (id: string) => void;
  logSummary?: KairosLogSummary;
  onViewFullLog?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "tensor-kairos-config";

const DEFAULT_CONFIG: KairosConfig = {
  enabled: false,
  blockingBudget: 15,
  watchFileChanges: true,
  watchGitStatus: true,
  watchBuildErrors: true,
  watchTestFailures: true,
  pollInterval: 30,
};

const SUGGESTION_TYPE_LABELS: Record<KairosSuggestion["type"], string> = {
  "file-change": "File Change",
  "git-status": "Git Status",
  "build-error": "Build Error",
  "test-failure": "Test Failure",
  general: "General",
};

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const CSS = `
.kairos-panel-overlay { position:fixed; inset:0; background:rgba(0,0,0,.6); display:flex; justify-content:flex-end; z-index:9998; backdrop-filter:blur(3px); }
.kairos-panel { display:flex; flex-direction:column; width:480px; max-width:96vw; height:100vh; background:var(--bg-primary,#0a0a12); border-left:1px solid var(--border,#2a2a3e); box-shadow:-8px 0 30px rgba(0,0,0,.4); color:#e4e4ed; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; overflow:hidden; animation:kairos-slide .2s ease-out; }
@keyframes kairos-slide { from{transform:translateX(100%);opacity:.8} to{transform:translateX(0);opacity:1} }
.kairos-panel-header { display:flex; align-items:center; justify-content:space-between; padding:14px 20px; border-bottom:1px solid #2a2a3e; flex-shrink:0; }
.kairos-panel-header-left { display:flex; align-items:center; gap:10px; }
.kairos-panel-header h2 { margin:0; font-size:15px; font-weight:600; color:#e4e4ed; }
.kairos-close-btn { background:none; border:none; cursor:pointer; color:#6a6a82; padding:4px; display:flex; align-items:center; border-radius:4px; transition:color .15s; }
.kairos-close-btn:hover { color:#e4e4ed; }
.kairos-body { flex:1; overflow-y:auto; padding:0; }
.kairos-body::-webkit-scrollbar { width:5px; }
.kairos-body::-webkit-scrollbar-track { background:transparent; }
.kairos-body::-webkit-scrollbar-thumb { background:#2a2a3e; border-radius:3px; }

/* Status indicator */
.kairos-status-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
.kairos-status-dot--active { background:#22c55e; box-shadow:0 0 6px rgba(34,197,94,.4); }
.kairos-status-dot--inactive { background:#6a6a82; }

/* Sections */
.kairos-section { border-bottom:1px solid #1e1e32; }
.kairos-section:last-child { border-bottom:none; }
.kairos-section-header { display:flex; align-items:center; justify-content:space-between; padding:12px 20px; cursor:pointer; user-select:none; transition:background .1s; }
.kairos-section-header:hover { background:rgba(255,255,255,.03); }
.kairos-section-label { font-size:11px; font-weight:700; color:#6a6a82; text-transform:uppercase; letter-spacing:1px; display:flex; align-items:center; gap:8px; }
.kairos-section-count { font-size:10px; color:#6a6a82; background:#1a1a2e; padding:1px 6px; border-radius:9999px; }
.kairos-section-chevron { font-size:10px; color:#6a6a82; transition:transform .15s ease; }
.kairos-section-chevron--open { transform:rotate(90deg); }
.kairos-section-content { overflow:hidden; transition:max-height .25s ease; }
.kairos-section-content--collapsed { max-height:0 !important; }

/* Mode toggle row */
.kairos-mode-row { display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid #1e1e32; }
.kairos-mode-info { display:flex; align-items:center; gap:10px; }
.kairos-mode-label { font-size:14px; font-weight:600; color:#e4e4ed; }
.kairos-mode-desc { font-size:12px; color:#7a7a96; margin-top:2px; }

/* Toggle switch */
.kairos-toggle-track { position:relative; width:38px; height:22px; border-radius:11px; cursor:pointer; transition:all .2s; flex-shrink:0; }
.kairos-toggle-track--on { background:#22c55e; border:1px solid #22c55e; }
.kairos-toggle-track--off { background:#1a1a2e; border:1px solid #2a2a3e; }
.kairos-toggle-thumb { position:absolute; top:3px; width:14px; height:14px; border-radius:50%; transition:all .2s; }
.kairos-toggle-thumb--on { left:20px; background:#fff; }
.kairos-toggle-thumb--off { left:3px; background:#6a6a82; }

/* Config rows */
.kairos-config-row { display:flex; justify-content:space-between; align-items:center; padding:10px 20px; gap:16px; }
.kairos-config-row + .kairos-config-row { border-top:1px solid #141422; }
.kairos-config-info { flex:1; min-width:0; }
.kairos-config-label { font-size:13px; font-weight:500; color:#e4e4ed; }
.kairos-config-desc { font-size:11.5px; color:#7a7a96; margin-top:2px; line-height:1.4; }
.kairos-config-control { flex-shrink:0; }

/* Slider */
.kairos-slider-wrap { display:flex; align-items:center; gap:10px; }
.kairos-slider { -webkit-appearance:none; appearance:none; width:120px; height:4px; border-radius:2px; background:#2a2a3e; outline:none; cursor:pointer; }
.kairos-slider::-webkit-slider-thumb { -webkit-appearance:none; width:14px; height:14px; border-radius:50%; background:#22c55e; cursor:pointer; border:2px solid #0a0a12; }
.kairos-slider::-moz-range-thumb { width:14px; height:14px; border-radius:50%; background:#22c55e; cursor:pointer; border:2px solid #0a0a12; }
.kairos-slider-value { font-size:12px; color:#9898b0; font-family:"JetBrains Mono","Fira Code",monospace; min-width:40px; text-align:right; }

/* Suggestion list */
.kairos-suggestion-list { display:flex; flex-direction:column; }
.kairos-suggestion-item { display:flex; align-items:flex-start; gap:10px; padding:10px 20px; transition:background .1s; }
.kairos-suggestion-item:hover { background:rgba(255,255,255,.03); }
.kairos-suggestion-item + .kairos-suggestion-item { border-top:1px solid #141422; }
.kairos-suggestion-icon { width:6px; height:6px; border-radius:50%; margin-top:6px; flex-shrink:0; }
.kairos-suggestion-icon--file-change { background:#3b82f6; }
.kairos-suggestion-icon--git-status { background:#f97316; }
.kairos-suggestion-icon--build-error { background:#ef4444; }
.kairos-suggestion-icon--test-failure { background:#eab308; }
.kairos-suggestion-icon--general { background:#8b5cf6; }
.kairos-suggestion-body { flex:1; min-width:0; }
.kairos-suggestion-title { font-size:13px; font-weight:500; color:#e4e4ed; line-height:1.3; }
.kairos-suggestion-detail { font-size:12px; color:#7a7a96; margin-top:2px; line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.kairos-suggestion-meta { display:flex; align-items:center; gap:8px; margin-top:4px; }
.kairos-suggestion-badge { font-size:10px; font-weight:600; padding:1px 6px; border-radius:3px; text-transform:uppercase; letter-spacing:.4px; background:rgba(34,197,94,.12); color:#4ade80; }
.kairos-suggestion-time { font-size:11px; color:#6a6a82; }
.kairos-suggestion-dismiss { background:none; border:none; color:#6a6a82; cursor:pointer; padding:2px; border-radius:3px; display:flex; align-items:center; flex-shrink:0; transition:color .15s; }
.kairos-suggestion-dismiss:hover { color:#ef4444; }

/* Log summary */
.kairos-log-summary { padding:16px 20px; }
.kairos-log-stats { display:flex; gap:24px; margin-bottom:14px; }
.kairos-log-stat { display:flex; flex-direction:column; }
.kairos-log-stat-value { font-size:20px; font-weight:700; color:#e4e4ed; font-family:"JetBrains Mono","Fira Code",monospace; }
.kairos-log-stat-label { font-size:11px; color:#6a6a82; text-transform:uppercase; letter-spacing:.5px; margin-top:2px; }
.kairos-log-btn { display:block; width:100%; padding:8px 12px; border:1px solid #2a2a3e; border-radius:6px; background:#1a1a2e; color:#9898b0; font-size:12px; font-weight:500; font-family:inherit; cursor:pointer; text-align:center; transition:all .15s; }
.kairos-log-btn:hover { border-color:#3a3a52; background:#22223a; color:#e4e4ed; }

/* Empty state */
.kairos-empty { text-align:center; padding:24px 20px; color:#6a6a82; font-size:13px; }
`;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function loadConfig(): KairosConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_CONFIG };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(config: KairosConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function formatTimestamp(ts: number): string {
  const now = Date.now();
  const diff = now - ts;

  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;

  const d = new Date(ts);
  const month = d.toLocaleString("default", { month: "short" });
  const day = d.getDate();
  const time = d.toLocaleTimeString("default", { hour: "2-digit", minute: "2-digit" });
  return `${month} ${day}, ${time}`;
}

/* ------------------------------------------------------------------ */
/*  SVG Icons                                                          */
/* ------------------------------------------------------------------ */

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

const KairosIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#22c55e" }}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
    <path d="M16.24 7.76l1.42-1.42M7.76 16.24l-1.42 1.42" />
  </svg>
);

const DismissIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M3 3l6 6M9 3l-6 6" />
  </svg>
);

/* ------------------------------------------------------------------ */
/*  Subcomponents                                                      */
/* ------------------------------------------------------------------ */

function CollapsibleSection({
  label,
  count,
  defaultOpen = true,
  children,
}: {
  label: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="kairos-section">
      <div className="kairos-section-header" onClick={() => setOpen((o) => !o)}>
        <span className="kairos-section-label">
          <span className={`kairos-section-chevron ${open ? "kairos-section-chevron--open" : ""}`}>
            {"\u25B8"}
          </span>
          {label}
          {count != null && <span className="kairos-section-count">{count}</span>}
        </span>
      </div>
      <div
        className={`kairos-section-content ${!open ? "kairos-section-content--collapsed" : ""}`}
        style={open ? { maxHeight: "9999px" } : undefined}
      >
        {children}
      </div>
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div
      className={`kairos-toggle-track ${checked ? "kairos-toggle-track--on" : "kairos-toggle-track--off"}`}
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
    >
      <div className={`kairos-toggle-thumb ${checked ? "kairos-toggle-thumb--on" : "kairos-toggle-thumb--off"}`} />
    </div>
  );
}

function ConfigToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="kairos-config-row">
      <div className="kairos-config-info">
        <div className="kairos-config-label">{label}</div>
        <div className="kairos-config-desc">{desc}</div>
      </div>
      <div className="kairos-config-control">
        <ToggleSwitch checked={checked} onChange={onChange} />
      </div>
    </div>
  );
}

function ConfigSliderRow({
  label,
  desc,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  desc: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="kairos-config-row">
      <div className="kairos-config-info">
        <div className="kairos-config-label">{label}</div>
        <div className="kairos-config-desc">{desc}</div>
      </div>
      <div className="kairos-config-control">
        <div className="kairos-slider-wrap">
          <input
            className="kairos-slider"
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(+e.target.value)}
          />
          <span className="kairos-slider-value">{value}{unit}</span>
        </div>
      </div>
    </div>
  );
}

function SuggestionItem({
  suggestion,
  onDismiss,
}: {
  suggestion: KairosSuggestion;
  onDismiss?: (id: string) => void;
}) {
  return (
    <div className="kairos-suggestion-item">
      <div className={`kairos-suggestion-icon kairos-suggestion-icon--${suggestion.type}`} />
      <div className="kairos-suggestion-body">
        <div className="kairos-suggestion-title">{suggestion.title}</div>
        <div className="kairos-suggestion-detail">{suggestion.detail}</div>
        <div className="kairos-suggestion-meta">
          <span className="kairos-suggestion-badge">{SUGGESTION_TYPE_LABELS[suggestion.type]}</span>
          <span className="kairos-suggestion-time">{formatTimestamp(suggestion.timestamp)}</span>
        </div>
      </div>
      {onDismiss && (
        <button
          className="kairos-suggestion-dismiss"
          onClick={() => onDismiss(suggestion.id)}
          aria-label="Dismiss suggestion"
        >
          <DismissIcon />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function KairosPanel({
  isOpen,
  onClose,
  config: externalConfig,
  onConfigChange,
  suggestions = [],
  onDismissSuggestion,
  logSummary,
  onViewFullLog,
}: KairosPanelProps) {
  const [localConfig, setLocalConfig] = useState<KairosConfig>(loadConfig);
  const panelRef = useRef<HTMLDivElement>(null);

  const config = externalConfig ?? localConfig;

  const updateConfig = useCallback(
    (patch: Partial<KairosConfig>) => {
      const updated = { ...config, ...patch };
      if (onConfigChange) {
        onConfigChange(updated);
      } else {
        setLocalConfig(updated);
        saveConfig(updated);
      }
    },
    [config, onConfigChange],
  );

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Focus panel on open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => { prev?.focus(); };
  }, [isOpen]);

  if (!isOpen) return null;

  const activeSuggestions = suggestions.filter((s) => !s.dismissed);
  const summary = logSummary ?? { entryCount: 0, lastActivity: null };

  return (
    <>
      <style>{CSS}</style>
      <div className="kairos-panel-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="kairos-panel" ref={panelRef} tabIndex={-1} role="dialog" aria-label="KAIROS Proactive Assistant">

          {/* Header */}
          <div className="kairos-panel-header">
            <div className="kairos-panel-header-left">
              <KairosIcon />
              <h2>KAIROS</h2>
              <div className={`kairos-status-dot ${config.enabled ? "kairos-status-dot--active" : "kairos-status-dot--inactive"}`} />
            </div>
            <button className="kairos-close-btn" onClick={onClose} aria-label="Close panel">
              <CloseIcon />
            </button>
          </div>

          {/* Body */}
          <div className="kairos-body">

            {/* Mode toggle */}
            <div className="kairos-mode-row">
              <div className="kairos-mode-info">
                <div className="kairos-mode-label">Proactive Assistant</div>
                <div className="kairos-mode-desc">
                  {config.enabled ? "KAIROS is actively monitoring your workspace" : "Enable to start proactive monitoring"}
                </div>
              </div>
              <ToggleSwitch
                checked={config.enabled}
                onChange={(v) => updateConfig({ enabled: v })}
              />
            </div>

            {/* Configuration */}
            <CollapsibleSection label="Configuration" defaultOpen={true}>
              <ConfigSliderRow
                label="Blocking budget"
                desc="Max seconds KAIROS may block before yielding"
                value={config.blockingBudget}
                min={5}
                max={60}
                step={5}
                unit="s"
                onChange={(v) => updateConfig({ blockingBudget: v })}
              />
              <ConfigToggleRow
                label="Watch file changes"
                desc="Monitor file system modifications in your project"
                checked={config.watchFileChanges}
                onChange={(v) => updateConfig({ watchFileChanges: v })}
              />
              <ConfigToggleRow
                label="Watch git status"
                desc="Track uncommitted changes, branch status, and diffs"
                checked={config.watchGitStatus}
                onChange={(v) => updateConfig({ watchGitStatus: v })}
              />
              <ConfigToggleRow
                label="Watch build errors"
                desc="Detect compilation and build failures automatically"
                checked={config.watchBuildErrors}
                onChange={(v) => updateConfig({ watchBuildErrors: v })}
              />
              <ConfigToggleRow
                label="Watch test failures"
                desc="Monitor test suite results for regressions"
                checked={config.watchTestFailures}
                onChange={(v) => updateConfig({ watchTestFailures: v })}
              />
              <ConfigSliderRow
                label="Poll interval"
                desc="How frequently KAIROS checks for changes"
                value={config.pollInterval}
                min={10}
                max={120}
                step={5}
                unit="s"
                onChange={(v) => updateConfig({ pollInterval: v })}
              />
            </CollapsibleSection>

            {/* Recent suggestions */}
            <CollapsibleSection label="Recent Suggestions" count={activeSuggestions.length} defaultOpen={true}>
              {activeSuggestions.length === 0 ? (
                <div className="kairos-empty">
                  {config.enabled ? "No suggestions yet \u2014 KAIROS is watching" : "Enable KAIROS to receive proactive suggestions"}
                </div>
              ) : (
                <div className="kairos-suggestion-list">
                  {activeSuggestions.map((s) => (
                    <SuggestionItem
                      key={s.id}
                      suggestion={s}
                      onDismiss={onDismissSuggestion}
                    />
                  ))}
                </div>
              )}
            </CollapsibleSection>

            {/* Log summary */}
            <CollapsibleSection label="Today's Log" defaultOpen={true}>
              <div className="kairos-log-summary">
                <div className="kairos-log-stats">
                  <div className="kairos-log-stat">
                    <span className="kairos-log-stat-value">{summary.entryCount}</span>
                    <span className="kairos-log-stat-label">Entries</span>
                  </div>
                  <div className="kairos-log-stat">
                    <span className="kairos-log-stat-value">
                      {summary.lastActivity ? formatTimestamp(summary.lastActivity) : "\u2014"}
                    </span>
                    <span className="kairos-log-stat-label">Last Activity</span>
                  </div>
                </div>
                {onViewFullLog && (
                  <button className="kairos-log-btn" onClick={onViewFullLog}>
                    View Full Log
                  </button>
                )}
              </div>
            </CollapsibleSection>

          </div>
        </div>
      </div>
    </>
  );
}
