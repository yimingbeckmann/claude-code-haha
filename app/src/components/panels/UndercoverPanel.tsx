import { useState, useEffect, useCallback, useMemo } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface BlocklistEntry {
  term: string;
  category: "project-codenames" | "model-versions" | "infrastructure" | "api-endpoints";
  custom?: boolean;
}

export interface FilterEvent {
  term: string;
  count: number;
  lastSeen: number;
}

interface UndercoverPanelProps {
  isOpen: boolean;
  onClose: () => void;
  apiBase: string;
  active: boolean;
  onToggle: () => void;
  autoDetect: boolean;
  onAutoDetectChange: (value: boolean) => void;
  isPublicRepo: boolean | null;
  blocklist: BlocklistEntry[];
  onBlocklistChange: (blocklist: BlocklistEntry[]) => void;
  activityLog: FilterEvent[];
}

type CategoryId = BlocklistEntry["category"];

const CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: "project-codenames", label: "Project Codenames" },
  { id: "model-versions", label: "Model Versions" },
  { id: "infrastructure", label: "Infrastructure" },
  { id: "api-endpoints", label: "API Endpoints" },
];

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const CSS = `
.uc-panel { position: fixed; top: 0; right: 0; width: 420px; max-width: 96vw; height: 100vh; background: var(--bg-primary, #0a0a12); border-left: 1px solid var(--border, #2a2a3e); z-index: 200; display: flex; flex-direction: column; font-family: var(--font-mono); animation: uc-slide-in 0.2s ease-out; }
@keyframes uc-slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }
.uc-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--border, #2a2a3e); flex-shrink: 0; }
.uc-title { font-size: 14px; font-weight: 600; color: var(--text-primary, #e4e4ed); display: flex; align-items: center; gap: 8px; }
.uc-close { background: none; border: none; color: var(--text-muted, #6a6a82); cursor: pointer; font-size: 16px; padding: 4px; border-radius: 4px; }
.uc-close:hover { color: var(--text-primary, #e4e4ed); background: var(--bg-hover, rgba(255,255,255,0.04)); }
.uc-body { flex: 1; overflow-y: auto; padding: 16px; }
.uc-body::-webkit-scrollbar { width: 5px; }
.uc-body::-webkit-scrollbar-track { background: transparent; }
.uc-body::-webkit-scrollbar-thumb { background: #2a2a3e; border-radius: 3px; }
.uc-section { margin-bottom: 20px; }
.uc-section-title { font-size: 11px; font-weight: 700; color: var(--text-muted, #6a6a82); text-transform: uppercase; letter-spacing: 1px; margin: 0 0 10px; }
.uc-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; }
.uc-row-label { font-size: 13px; color: var(--text-primary, #e4e4ed); font-weight: 500; }
.uc-row-desc { font-size: 11px; color: var(--text-dim, #7a7a96); margin-top: 2px; }
.uc-toggle { position: relative; width: 36px; height: 20px; border-radius: 10px; background: var(--bg-tertiary, #1a1a2e); border: 1px solid var(--border, #2a2a3e); cursor: pointer; transition: background 0.2s, border-color 0.2s; flex-shrink: 0; }
.uc-toggle.on { background: #f59e0b; border-color: #f59e0b; }
.uc-toggle-knob { position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: transform 0.2s; }
.uc-toggle.on .uc-toggle-knob { transform: translateX(16px); }
.uc-detect-status { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; padding: 2px 8px; border-radius: 9999px; font-weight: 500; }
.uc-detect-public { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
.uc-detect-private { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
.uc-detect-unknown { background: rgba(107, 114, 128, 0.15); color: #9ca3af; }
.uc-category-tab { display: inline-block; padding: 4px 10px; font-size: 10px; font-weight: 600; border-radius: 4px; border: 1px solid var(--border, #2a2a3e); background: transparent; color: var(--text-muted, #6a6a82); cursor: pointer; transition: all 0.15s; text-transform: uppercase; letter-spacing: 0.3px; }
.uc-category-tab:hover { color: var(--text-primary, #e4e4ed); border-color: var(--text-muted, #6a6a82); }
.uc-category-tab.active { color: #f59e0b; border-color: #f59e0b; background: rgba(245, 158, 11, 0.1); }
.uc-term-list { max-height: 200px; overflow-y: auto; border: 1px solid var(--border, #2a2a3e); border-radius: 6px; background: var(--bg-secondary, #111122); margin-top: 8px; }
.uc-term-list::-webkit-scrollbar { width: 4px; }
.uc-term-list::-webkit-scrollbar-thumb { background: #2a2a3e; border-radius: 2px; }
.uc-term-item { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; border-bottom: 1px solid var(--border, #2a2a3e); font-size: 12px; color: var(--text-primary, #e4e4ed); }
.uc-term-item:last-child { border-bottom: none; }
.uc-term-item.custom { color: #f59e0b; }
.uc-term-remove { background: none; border: none; color: var(--text-muted, #6a6a82); cursor: pointer; font-size: 12px; padding: 0 4px; border-radius: 2px; transition: color 0.15s; }
.uc-term-remove:hover { color: var(--error, #ef4444); }
.uc-input-row { display: flex; gap: 6px; margin-top: 8px; }
.uc-input { flex: 1; background: var(--bg-tertiary, #1a1a2e); border: 1px solid var(--border, #2a2a3e); border-radius: 4px; padding: 6px 8px; font-size: 12px; color: var(--text-primary, #e4e4ed); font-family: var(--font-mono); box-sizing: border-box; }
.uc-input:focus { outline: none; border-color: #f59e0b; }
.uc-input::placeholder { color: var(--text-muted, #6a6a82); }
.uc-btn { background: none; border: 1px solid var(--border, #2a2a3e); color: var(--text-secondary, #c0c0d0); border-radius: 4px; padding: 5px 12px; font-size: 11px; cursor: pointer; font-family: var(--font-mono); transition: all 0.15s; font-weight: 500; }
.uc-btn:hover { color: var(--text-primary, #e4e4ed); border-color: var(--text-muted, #6a6a82); }
.uc-btn.accent { background: #f59e0b; color: #1a1a1a; border-color: #f59e0b; font-weight: 600; }
.uc-btn.accent:hover { opacity: 0.9; }
.uc-activity-list { max-height: 180px; overflow-y: auto; border: 1px solid var(--border, #2a2a3e); border-radius: 6px; background: var(--bg-secondary, #111122); }
.uc-activity-list::-webkit-scrollbar { width: 4px; }
.uc-activity-list::-webkit-scrollbar-thumb { background: #2a2a3e; border-radius: 2px; }
.uc-activity-item { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; border-bottom: 1px solid var(--border, #2a2a3e); font-size: 12px; }
.uc-activity-item:last-child { border-bottom: none; }
.uc-activity-term { color: #f59e0b; font-weight: 500; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uc-activity-count { background: rgba(245, 158, 11, 0.15); color: #f59e0b; font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 9999px; margin-left: 8px; flex-shrink: 0; }
.uc-activity-time { color: var(--text-muted, #6a6a82); font-size: 10px; margin-left: 8px; flex-shrink: 0; }
.uc-empty { text-align: center; padding: 24px 16px; color: var(--text-muted, #6a6a82); font-size: 12px; }
.uc-empty-icon { font-size: 24px; margin-bottom: 6px; opacity: 0.3; }
.uc-divider { height: 1px; background: var(--border, #2a2a3e); margin: 16px 0; }
`;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function UndercoverPanel({
  isOpen,
  onClose,
  apiBase: _apiBase,
  active,
  onToggle,
  autoDetect,
  onAutoDetectChange,
  isPublicRepo,
  blocklist,
  onBlocklistChange,
  activityLog,
}: UndercoverPanelProps) {
  const [selectedCategory, setSelectedCategory] = useState<CategoryId>("project-codenames");
  const [newTerm, setNewTerm] = useState("");
  const [now, setNow] = useState(Date.now());

  // Tick for relative timestamps in activity log
  useEffect(() => {
    if (!isOpen || activityLog.length === 0) return;
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, [isOpen, activityLog.length]);

  // Force re-render when `now` changes so formatTimeAgo picks it up
  void now;

  const filteredTerms = useMemo(
    () => blocklist.filter((e) => e.category === selectedCategory),
    [blocklist, selectedCategory],
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<CategoryId, number> = {
      "project-codenames": 0,
      "model-versions": 0,
      infrastructure: 0,
      "api-endpoints": 0,
    };
    for (const entry of blocklist) {
      counts[entry.category]++;
    }
    return counts;
  }, [blocklist]);

  const handleAddTerm = useCallback(() => {
    const trimmed = newTerm.trim();
    if (!trimmed) return;
    if (blocklist.some((e) => e.term.toLowerCase() === trimmed.toLowerCase())) return;
    const entry: BlocklistEntry = {
      term: trimmed,
      category: selectedCategory,
      custom: true,
    };
    onBlocklistChange([...blocklist, entry]);
    setNewTerm("");
  }, [newTerm, selectedCategory, blocklist, onBlocklistChange]);

  const handleRemoveTerm = useCallback(
    (term: string) => {
      onBlocklistChange(blocklist.filter((e) => e.term !== term));
    },
    [blocklist, onBlocklistChange],
  );

  if (!isOpen) return null;

  const detectLabel =
    isPublicRepo === true
      ? "Public"
      : isPublicRepo === false
        ? "Private"
        : "Unknown";
  const detectClass =
    isPublicRepo === true
      ? "uc-detect-public"
      : isPublicRepo === false
        ? "uc-detect-private"
        : "uc-detect-unknown";

  return (
    <>
      <style>{CSS}</style>
      <div className="uc-panel">
        {/* Header */}
        <div className="uc-header">
          <span className="uc-title">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="8" cy="11" r="1" fill="currentColor" />
            </svg>
            Undercover Mode
          </span>
          <button className="uc-close" onClick={onClose}>&times;</button>
        </div>

        {/* Body */}
        <div className="uc-body">
          {/* ── Enable / Disable toggle ── */}
          <div className="uc-section">
            <div className="uc-section-title">Status</div>
            <div className="uc-row">
              <div>
                <div className="uc-row-label">Undercover Mode</div>
                <div className="uc-row-desc">
                  {active
                    ? "Active — internal codenames are being filtered"
                    : "Inactive — all terms pass through unfiltered"}
                </div>
              </div>
              <div
                className={`uc-toggle ${active ? "on" : ""}`}
                onClick={onToggle}
                role="switch"
                aria-checked={active}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onToggle();
                  }
                }}
              >
                <div className="uc-toggle-knob" />
              </div>
            </div>
          </div>

          <div className="uc-divider" />

          {/* ── Auto-detect ── */}
          <div className="uc-section">
            <div className="uc-section-title">Repository Detection</div>
            <div className="uc-row">
              <div>
                <div className="uc-row-label">Auto-detect public repo</div>
                <div className="uc-row-desc" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                  Current status:{" "}
                  <span className={`uc-detect-status ${detectClass}`}>
                    <span
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        background: "currentColor",
                        display: "inline-block",
                        flexShrink: 0,
                      }}
                    />
                    {detectLabel}
                  </span>
                </div>
              </div>
              <div
                className={`uc-toggle ${autoDetect ? "on" : ""}`}
                onClick={() => onAutoDetectChange(!autoDetect)}
                role="switch"
                aria-checked={autoDetect}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onAutoDetectChange(!autoDetect);
                  }
                }}
              >
                <div className="uc-toggle-knob" />
              </div>
            </div>
          </div>

          <div className="uc-divider" />

          {/* ── Blocklist ── */}
          <div className="uc-section">
            <div className="uc-section-title">Filtered Terms</div>

            {/* Category tabs */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 4 }}>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  className={`uc-category-tab ${selectedCategory === cat.id ? "active" : ""}`}
                  onClick={() => setSelectedCategory(cat.id)}
                >
                  {cat.label}
                  <span style={{ marginLeft: 4, opacity: 0.6 }}>
                    {categoryCounts[cat.id]}
                  </span>
                </button>
              ))}
            </div>

            {/* Term list */}
            {filteredTerms.length === 0 ? (
              <div className="uc-empty">
                <div className="uc-empty-icon">---</div>
                <div>No terms in this category</div>
              </div>
            ) : (
              <div className="uc-term-list">
                {filteredTerms.map((entry) => (
                  <div
                    key={entry.term}
                    className={`uc-term-item ${entry.custom ? "custom" : ""}`}
                  >
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {entry.term}
                      {entry.custom && (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 9,
                            opacity: 0.5,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                          }}
                        >
                          custom
                        </span>
                      )}
                    </span>
                    {entry.custom && (
                      <button
                        className="uc-term-remove"
                        onClick={() => handleRemoveTerm(entry.term)}
                        aria-label={`Remove ${entry.term}`}
                      >
                        &times;
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add custom term */}
            <div className="uc-input-row">
              <input
                className="uc-input"
                placeholder="Add custom term..."
                value={newTerm}
                onChange={(e) => setNewTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTerm();
                  }
                }}
              />
              <button
                className="uc-btn accent"
                onClick={handleAddTerm}
                disabled={!newTerm.trim()}
              >
                Add
              </button>
            </div>
          </div>

          <div className="uc-divider" />

          {/* ── Activity log ── */}
          <div className="uc-section">
            <div className="uc-section-title">Activity Log</div>

            {activityLog.length === 0 ? (
              <div className="uc-empty">
                <div className="uc-empty-icon">---</div>
                <div>No filtered terms yet</div>
                <div style={{ marginTop: 4, fontSize: 11, opacity: 0.6 }}>
                  Terms will appear here once Undercover Mode filters them
                </div>
              </div>
            ) : (
              <div className="uc-activity-list">
                {activityLog.map((event, idx) => (
                  <div key={`${event.term}-${idx}`} className="uc-activity-item">
                    <span className="uc-activity-term">{event.term}</span>
                    <span className="uc-activity-count">{event.count}x</span>
                    <span className="uc-activity-time">
                      {formatTimeAgo(event.lastSeen)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
