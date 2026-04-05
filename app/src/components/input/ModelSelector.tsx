import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ── Types ───────────────────────────────────────────────────

interface ModelSelectorProps {
  currentModel: string;
  onModelChange: (model: string) => void;
  compact?: boolean;
}

interface ModelDef {
  id: string;
  shortName: string;
  label: string;
  description: string;
  badge?: { text: string; color: string };
  qualityDots: number; // 1-5
  speedDots: number;   // 1-5
  tooltip: {
    context: string;
    pricing: string;
    bestFor: string;
  };
}

interface ModelGroup {
  header: string;
  models: ModelDef[];
}

// ── Model data ──────────────────────────────────────────────

const MODEL_GROUPS: ModelGroup[] = [
  {
    header: "Claude 4.6",
    models: [
      {
        id: "claude-opus-4-6",
        shortName: "Opus 4.6",
        label: "claude-opus-4-6",
        description: "Most capable",
        badge: { text: "Most capable", color: "var(--accent)" },
        qualityDots: 5,
        speedDots: 2,
        tooltip: {
          context: "200k tokens",
          pricing: "Tier 4 -- $15 / $75 per 1M tokens",
          bestFor: "Complex reasoning, long code generation, architecture decisions",
        },
      },
      {
        id: "claude-sonnet-4-6",
        shortName: "Sonnet 4.6",
        label: "claude-sonnet-4-6",
        description: "Balanced",
        qualityDots: 4,
        speedDots: 4,
        tooltip: {
          context: "200k tokens",
          pricing: "Tier 3 -- $3 / $15 per 1M tokens",
          bestFor: "General coding, refactoring, balanced speed and quality",
        },
      },
    ],
  },
  {
    header: "Claude 4.5",
    models: [
      {
        id: "claude-haiku-4-5",
        shortName: "Haiku 4.5",
        label: "claude-haiku-4-5",
        description: "Fastest",
        qualityDots: 3,
        speedDots: 5,
        tooltip: {
          context: "200k tokens",
          pricing: "Tier 1 -- $0.25 / $1.25 per 1M tokens",
          bestFor: "Quick edits, simple tasks, high-throughput batch work",
        },
      },
    ],
  },
  {
    header: "Gemma 4 (Local)",
    models: [
      {
        id: "gemma4:31b",
        shortName: "Gemma 31B",
        label: "gemma4:31b",
        description: "Highest quality local model",
        badge: { text: "Local", color: "var(--success)" },
        qualityDots: 4,
        speedDots: 2,
        tooltip: {
          context: "256k tokens",
          pricing: "Free -- runs locally via Ollama",
          bestFor: "Complex reasoning, code gen, privacy-sensitive work",
        },
      },
      {
        id: "gemma4:26b",
        shortName: "Gemma 26B MoE",
        label: "gemma4:26b",
        description: "Best quality/speed ratio",
        badge: { text: "Recommended", color: "var(--cyan)" },
        qualityDots: 4,
        speedDots: 3,
        tooltip: {
          context: "256k tokens",
          pricing: "Free -- runs locally via Ollama",
          bestFor: "MoE architecture, near-31B quality at 4B speed (~22GB RAM)",
        },
      },
      {
        id: "gemma4:e4b",
        shortName: "Gemma E4B",
        label: "gemma4:e4b",
        description: "Balanced edge model",
        qualityDots: 3,
        speedDots: 4,
        tooltip: {
          context: "128k tokens",
          pricing: "Free -- runs locally via Ollama",
          bestFor: "General tasks on 16GB Macs, supports audio input (~12GB RAM)",
        },
      },
      {
        id: "gemma4:e2b",
        shortName: "Gemma E2B",
        label: "gemma4:e2b",
        description: "Lightest local model",
        qualityDots: 2,
        speedDots: 5,
        tooltip: {
          context: "128k tokens",
          pricing: "Free -- runs locally via Ollama",
          bestFor: "Quick tasks on any Mac, minimal resource usage (~10GB RAM)",
        },
      },
    ],
  },
];

const ALL_MODELS = MODEL_GROUPS.flatMap((g) => g.models);

// ── Helpers ─────────────────────────────────────────────────

function shortenModelName(id: string): string {
  for (const m of ALL_MODELS) {
    if (m.id === id) return m.shortName;
  }
  // Fallback for gemma tags like "gemma4:26b"
  if (id.startsWith("gemma")) {
    return id.replace("gemma4:", "Gemma ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  // Fallback: strip "claude-" and convert version dashes to dots
  let s = id.replace(/^claude-/, "");
  s = s.replace(/-(\d+)-(\d+)$/, " $1.$2");
  s = s.replace(/-(\d+)$/, " $1");
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function dots(filled: number, total: number = 5): string {
  return "\u25CF".repeat(filled) + "\u25CB".repeat(total - filled);
}

// ── Styles ──────────────────────────────────────────────────

const STYLES = `
.model-sel-trigger {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 6px; border: 1px solid var(--border); border-radius: var(--radius-sm);
  background: transparent; color: var(--text-secondary);
  font: 500 11px/1.2 var(--font-mono); cursor: pointer;
  transition: color .15s, border-color .15s, background .15s;
  white-space: nowrap; user-select: none;
}
.model-sel-trigger:hover { color: var(--text-primary); border-color: var(--border-hover); background: var(--bg-hover); }
.model-sel-trigger[data-open="true"] { color: var(--accent); border-color: var(--accent-dim); }
.model-sel-trigger-compact { padding: 1px 4px; border: none; font-size: 10px; font-weight: 400; }
.model-sel-chevron { font-size: 8px; opacity: 0.6; transition: transform .15s; }
.model-sel-trigger[data-open="true"] .model-sel-chevron { transform: rotate(180deg); }

.model-sel-dropdown {
  position: absolute; bottom: calc(100% + 6px); left: 0;
  min-width: 280px; max-width: 320px;
  background: var(--bg-secondary); border: 1px solid var(--border-hover);
  border-radius: var(--radius-md); box-shadow: 0 -4px 20px rgba(0,0,0,.4), 0 0 1px rgba(255,255,255,.05);
  z-index: 1000; overflow: hidden; animation: fadeIn .12s ease-out;
}
.model-sel-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 10px 4px; border-bottom: 1px solid var(--border);
}
.model-sel-header-label { font-size: 10px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: .5px; }
.model-sel-header-shortcut { font-size: 9px; color: var(--text-dim); background: var(--bg-tertiary); padding: 1px 5px; border-radius: 3px; border: 1px solid var(--border); font-family: var(--font-mono); }
.model-sel-group-label { padding: 8px 10px 3px; font-size: 10px; color: var(--text-muted); font-weight: 500; letter-spacing: .3px; }

.model-sel-item {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 6px 10px; border: none; background: transparent;
  cursor: pointer; text-align: left; font-family: var(--font-mono);
  transition: background .1s; position: relative;
}
.model-sel-item:hover, .model-sel-item[data-focused="true"] { background: var(--bg-hover); }
.model-sel-item[data-active="true"] { background: var(--bg-active); }
.model-sel-item-body { flex: 1; min-width: 0; }
.model-sel-item-name { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 500; color: var(--text-primary); }
.model-sel-item-desc { font-size: 10px; color: var(--text-muted); margin-top: 1px; }
.model-sel-badge { font-size: 9px; font-weight: 600; padding: 1px 5px; border-radius: 3px; letter-spacing: .2px; }
.model-sel-dots { display: flex; align-items: center; gap: 2px; font-size: 10px; color: var(--text-muted); white-space: nowrap; }
.model-sel-dots-label { font-size: 9px; color: var(--text-dim); margin-right: 2px; min-width: 18px; }
.model-sel-check { color: var(--accent); font-size: 12px; flex-shrink: 0; width: 16px; text-align: center; }
.model-sel-divider { height: 1px; background: var(--border); margin: 4px 10px; }

.model-sel-custom-section { padding: 6px 10px 8px; }
.model-sel-custom-input {
  width: 100%; padding: 4px 8px; background: var(--bg-tertiary);
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  color: var(--text-primary); font: 11px var(--font-mono); outline: none;
  transition: border-color .15s;
}
.model-sel-custom-input:focus { border-color: var(--accent-dim); }
.model-sel-custom-input::placeholder { color: var(--text-dim); }

.model-sel-tooltip {
  position: absolute; left: calc(100% + 8px); top: 50%; transform: translateY(-50%);
  min-width: 220px; padding: 8px 10px; background: var(--bg-primary);
  border: 1px solid var(--border-hover); border-radius: var(--radius-sm);
  box-shadow: 0 2px 12px rgba(0,0,0,.4); z-index: 1001; pointer-events: none;
  animation: fadeIn .1s ease-out;
}
.model-sel-tooltip-row { display: flex; align-items: baseline; gap: 6px; padding: 2px 0; font-size: 10px; }
.model-sel-tooltip-key { color: var(--text-muted); min-width: 48px; flex-shrink: 0; }
.model-sel-tooltip-val { color: var(--text-secondary); }
`;

// ── Component ───────────────────────────────────────────────

function ModelSelector({ currentModel, onModelChange, compact = false }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const [hoveredModel, setHoveredModel] = useState<string | null>(null);
  const [customValue, setCustomValue] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);

  const shortName = useMemo(() => shortenModelName(currentModel), [currentModel]);

  // Flat list of selectable model IDs for keyboard nav
  const flatModels = useMemo(() => ALL_MODELS.map((m) => m.id), []);

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

  // Ctrl+M to cycle models
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "m") {
        e.preventDefault();
        const currentIdx = flatModels.indexOf(currentModel);
        const nextIdx = (currentIdx + 1) % flatModels.length;
        onModelChange(flatModels[nextIdx]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentModel, flatModels, onModelChange]);

  // Keyboard nav inside dropdown
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIdx((i) => Math.min(i + 1, flatModels.length - 1));
      } else if (e.key === "Enter" && focusedIdx >= 0) {
        e.preventDefault();
        onModelChange(flatModels[focusedIdx]);
        setOpen(false);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, focusedIdx, flatModels, onModelChange]);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      const idx = flatModels.indexOf(currentModel);
      setFocusedIdx(idx >= 0 ? idx : 0);
      setHoveredModel(null);
      setCustomValue("");
    }
  }, [open, currentModel, flatModels]);

  const handleSelect = useCallback(
    (modelId: string) => {
      onModelChange(modelId);
      setOpen(false);
    },
    [onModelChange],
  );

  const handleCustomSubmit = useCallback(() => {
    const trimmed = customValue.trim();
    if (trimmed) {
      onModelChange(trimmed);
      setOpen(false);
    }
  }, [customValue, onModelChange]);

  // Track flat index across groups for keyboard nav
  let flatIdx = 0;

  return (
    <>
      <style>{STYLES}</style>
      <div ref={containerRef} style={{ position: "relative", display: "inline-block" }}>
        {/* Trigger button */}
        <button
          type="button"
          className={`model-sel-trigger${compact ? " model-sel-trigger-compact" : ""}`}
          data-open={open}
          onClick={() => setOpen((p) => !p)}
          title={currentModel}
        >
          <span>{shortName}</span>
          <span className="model-sel-chevron">{"\u25B2"}</span>
        </button>

        {/* Dropdown */}
        {open && (
          <div className="model-sel-dropdown">
            {/* Top header */}
            <div className="model-sel-header">
              <span className="model-sel-header-label">Model</span>
              <span className="model-sel-header-shortcut">Ctrl+M</span>
            </div>

            {/* Model groups */}
            {MODEL_GROUPS.map((group) => {
              const items = group.models.map((model) => {
                const thisIdx = flatIdx;
                flatIdx++;
                const isActive = model.id === currentModel;
                const isFocused = thisIdx === focusedIdx;

                return (
                  <button
                    key={model.id}
                    type="button"
                    className="model-sel-item"
                    data-active={isActive}
                    data-focused={isFocused}
                    onClick={() => handleSelect(model.id)}
                    onMouseEnter={() => {
                      setFocusedIdx(thisIdx);
                      setHoveredModel(model.id);
                    }}
                    onMouseLeave={() => setHoveredModel(null)}
                  >
                    {/* Check column */}
                    <span className="model-sel-check">
                      {isActive ? "\u2713" : ""}
                    </span>

                    {/* Name + description */}
                    <div className="model-sel-item-body">
                      <div className="model-sel-item-name">
                        <span>{model.label}</span>
                        {model.badge && (
                          <span
                            className="model-sel-badge"
                            style={{
                              color: model.badge.color,
                              background: `color-mix(in srgb, ${model.badge.color} 12%, transparent)`,
                            }}
                          >
                            {model.badge.text}
                          </span>
                        )}
                      </div>
                      <div className="model-sel-item-desc">{model.description}</div>
                    </div>

                    {/* Speed/quality dots */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}>
                      <div className="model-sel-dots">
                        <span className="model-sel-dots-label">Qlty</span>
                        <span>{dots(model.qualityDots)}</span>
                      </div>
                      <div className="model-sel-dots">
                        <span className="model-sel-dots-label">Spd</span>
                        <span>{dots(model.speedDots)}</span>
                      </div>
                    </div>

                    {/* Tooltip on hover */}
                    {hoveredModel === model.id && (
                      <div className="model-sel-tooltip">
                        <div className="model-sel-tooltip-row">
                          <span className="model-sel-tooltip-key">Context</span>
                          <span className="model-sel-tooltip-val">{model.tooltip.context}</span>
                        </div>
                        <div className="model-sel-tooltip-row">
                          <span className="model-sel-tooltip-key">Pricing</span>
                          <span className="model-sel-tooltip-val">{model.tooltip.pricing}</span>
                        </div>
                        <div className="model-sel-tooltip-row">
                          <span className="model-sel-tooltip-key">Best for</span>
                          <span className="model-sel-tooltip-val">{model.tooltip.bestFor}</span>
                        </div>
                      </div>
                    )}
                  </button>
                );
              });

              return (
                <div key={group.header}>
                  <div className="model-sel-group-label">{group.header}</div>
                  {items}
                </div>
              );
            })}

            {/* Divider */}
            <div className="model-sel-divider" />

            {/* Custom model input */}
            <div className="model-sel-group-label">Custom</div>
            <div className="model-sel-custom-section">
              <input
                ref={customInputRef}
                type="text"
                className="model-sel-custom-input"
                placeholder="Enter custom model ID..."
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    handleCustomSubmit();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setOpen(false);
                  }
                }}
                onFocus={() => setFocusedIdx(-1)}
                spellCheck={false}
                autoComplete="off"
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default ModelSelector;
