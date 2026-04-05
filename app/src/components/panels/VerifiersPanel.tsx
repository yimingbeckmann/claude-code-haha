import { useState, useEffect, useCallback, useRef } from "react";

// ── Types ───────────────────────────────────────────────────

export type VerifierType = "lint" | "typecheck" | "test" | "build" | "custom";
export type VerifierStage = "pre-commit" | "pre-push" | "manual";
export type RunStatus = "pass" | "fail" | "never";

export interface Verifier {
  id: string;
  name: string;
  type: VerifierType;
  command: string;
  stage: VerifierStage;
  enabled: boolean;
  lastRun?: {
    status: RunStatus;
    durationMs: number;
    output?: string;
    timestamp: number;
  };
}

export interface RunResult {
  verifierId: string;
  name: string;
  status: "pass" | "fail" | "running";
  durationMs: number;
  output?: string;
}

export interface VerifiersPanelProps {
  isOpen: boolean;
  onClose: () => void;
  apiBase: string;
}

// ── Helpers ─────────────────────────────────────────────────

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

const TYPE_LABELS: Record<VerifierType, string> = {
  lint: "Lint",
  typecheck: "Typecheck",
  test: "Test",
  build: "Build",
  custom: "Custom",
};

const TYPE_COLORS: Record<VerifierType, string> = {
  lint: "rgba(96,165,250,0.15)",
  typecheck: "rgba(192,132,252,0.15)",
  test: "rgba(74,222,128,0.15)",
  build: "rgba(251,191,36,0.15)",
  custom: "rgba(148,163,184,0.15)",
};

const TYPE_TEXT_COLORS: Record<VerifierType, string> = {
  lint: "#60a5fa",
  typecheck: "#c084fc",
  test: "#4ade80",
  build: "#fbbf24",
  custom: "#94a3b8",
};

const STAGE_LABELS: Record<VerifierStage, string> = {
  "pre-commit": "Pre-commit",
  "pre-push": "Pre-push",
  manual: "Manual",
};

const STATUS_ICONS: Record<RunStatus, string> = {
  pass: "\u2713",
  fail: "\u2717",
  never: "\u2500",
};

const STATUS_COLORS: Record<RunStatus, string> = {
  pass: "#4ade80",
  fail: "#f87171",
  never: "var(--text-dim, #666)",
};

const VERIFIER_TYPES: VerifierType[] = ["lint", "typecheck", "test", "build", "custom"];
const VERIFIER_STAGES: VerifierStage[] = ["pre-commit", "pre-push", "manual"];

// ── Styles ──────────────────────────────────────────────────

const STYLE_ID = "verifiers-panel-styles";

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes vpSlideIn {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }
    @keyframes vpFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .vp-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(2px);
      -webkit-backdrop-filter: blur(2px);
      z-index: 1000;
      animation: vpFadeIn 0.2s ease-out;
    }

    .vp-panel {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: 520px;
      max-width: 100vw;
      background: var(--bg-secondary, #1e1e1e);
      border-left: 1px solid var(--border, #333);
      z-index: 1001;
      display: flex;
      flex-direction: column;
      box-shadow: -8px 0 32px rgba(0, 0, 0, 0.4);
      animation: vpSlideIn 0.25s ease-out;
      font-family: var(--font-mono, monospace);
    }

    /* Header */
    .vp-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 20px;
      border-bottom: 1px solid var(--border, #333);
      flex-shrink: 0;
    }
    .vp-header-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .vp-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary, #e0e0e0);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .vp-project-badge {
      font-size: 10px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 9999px;
      background: rgba(249, 115, 22, 0.15);
      color: #fb923c;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .vp-close-btn {
      background: none;
      border: none;
      color: var(--text-dim, #666);
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.15s, background 0.15s;
    }
    .vp-close-btn:hover {
      color: var(--text-secondary, #aaa);
      background: var(--bg-hover, #2a2a2a);
    }

    /* Toolbar */
    .vp-toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      border-bottom: 1px solid var(--border, #333);
      flex-shrink: 0;
    }
    .vp-btn {
      padding: 5px 12px;
      border-radius: 4px;
      border: 1px solid var(--border, #444);
      background: transparent;
      color: var(--text-secondary, #aaa);
      font-family: var(--font-mono, monospace);
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
      display: flex;
      align-items: center;
      gap: 5px;
      white-space: nowrap;
    }
    .vp-btn:hover {
      background: var(--bg-hover, #2a2a2a);
      color: var(--text-primary, #e0e0e0);
    }
    .vp-btn:disabled {
      opacity: 0.4;
      cursor: default;
    }
    .vp-btn--accent {
      background: var(--accent, #e84520);
      color: #fff;
      border-color: var(--accent, #e84520);
    }
    .vp-btn--accent:hover {
      opacity: 0.9;
      background: var(--accent, #e84520);
      color: #fff;
    }
    .vp-btn--danger {
      color: #f87171;
      border-color: rgba(248, 113, 113, 0.2);
    }
    .vp-btn--danger:hover {
      background: rgba(248, 113, 113, 0.1);
    }
    .vp-toolbar-spacer {
      flex: 1;
    }

    /* Body */
    .vp-body {
      flex: 1;
      overflow-y: auto;
      min-height: 0;
      padding: 12px;
    }
    .vp-body::-webkit-scrollbar { width: 5px; }
    .vp-body::-webkit-scrollbar-track { background: transparent; }
    .vp-body::-webkit-scrollbar-thumb { background: var(--border, #333); border-radius: 3px; }

    /* Section headers */
    .vp-section-label {
      font-size: 11px;
      font-weight: 500;
      color: var(--text-dim, #666);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 8px 8px 6px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .vp-section-count {
      font-size: 10px;
      color: var(--text-dim, #666);
      background: var(--bg-tertiary, #2a2a2a);
      padding: 1px 6px;
      border-radius: 9999px;
    }

    /* Verifier cards */
    .vp-card {
      margin: 0 0 8px;
      padding: 12px 14px;
      background: var(--bg-tertiary, #252525);
      border: 1px solid var(--border, #333);
      border-radius: var(--radius-sm, 6px);
      transition: border-color 0.15s;
    }
    .vp-card:hover {
      border-color: var(--text-dim, #555);
    }
    .vp-card--disabled {
      opacity: 0.5;
    }
    .vp-card-top {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    .vp-card-status {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .vp-card-name {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary, #e0e0e0);
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .vp-card-badges {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    .vp-type-badge {
      font-size: 10px;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 3px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .vp-stage-badge {
      font-size: 10px;
      color: var(--text-dim, #666);
      padding: 1px 6px;
      border-radius: 3px;
      border: 1px solid var(--border, #444);
    }
    .vp-card-cmd {
      font-size: 11px;
      color: var(--text-dim, #888);
      margin-bottom: 8px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      padding: 4px 6px;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 3px;
    }
    .vp-card-bottom {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .vp-card-last-run {
      font-size: 11px;
      color: var(--text-dim, #666);
      display: flex;
      align-items: center;
      gap: 4px;
      flex: 1;
    }
    .vp-card-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .vp-card-btn {
      padding: 2px 8px;
      border-radius: 4px;
      border: 1px solid var(--border, #444);
      background: transparent;
      font-family: var(--font-mono, monospace);
      font-size: 11px;
      color: var(--text-dim, #888);
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }
    .vp-card-btn:hover {
      background: var(--bg-hover, #2a2a2a);
      color: var(--text-secondary, #aaa);
    }
    .vp-card-btn--danger:hover {
      background: rgba(248, 113, 113, 0.12);
      color: #f87171;
      border-color: rgba(248, 113, 113, 0.3);
    }

    /* Toggle switch */
    .vp-toggle {
      position: relative;
      width: 32px;
      height: 18px;
      border-radius: 9px;
      background: var(--bg-tertiary, #2a2a2a);
      border: 1px solid var(--border, #444);
      cursor: pointer;
      transition: background 0.2s;
      flex-shrink: 0;
    }
    .vp-toggle--on {
      background: var(--accent, #e84520);
      border-color: var(--accent, #e84520);
    }
    .vp-toggle-knob {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #fff;
      transition: transform 0.2s;
    }
    .vp-toggle--on .vp-toggle-knob {
      transform: translateX(14px);
    }

    /* Add form */
    .vp-add-form {
      background: rgba(0, 0, 0, 0.15);
      border: 1px solid var(--border, #333);
      border-radius: 6px;
      padding: 14px;
      margin-top: 4px;
    }
    .vp-add-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary, #aaa);
      margin: 0 0 10px;
    }
    .vp-form-row {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
    }
    .vp-form-group {
      flex: 1;
      min-width: 0;
    }
    .vp-form-label {
      display: block;
      font-size: 10px;
      font-weight: 500;
      color: var(--text-dim, #666);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 4px;
    }
    .vp-input {
      display: block;
      width: 100%;
      box-sizing: border-box;
      background: var(--bg-tertiary, #252525);
      color: var(--text-primary, #e0e0e0);
      border: 1px solid var(--border, #333);
      border-radius: 4px;
      padding: 6px 8px;
      font-size: 12px;
      font-family: var(--font-mono, monospace);
      outline: none;
      transition: border-color 0.15s;
    }
    .vp-input:focus {
      border-color: var(--accent, #e84520);
    }
    .vp-input::placeholder {
      color: var(--text-dim, #555);
    }
    .vp-select {
      display: block;
      width: 100%;
      box-sizing: border-box;
      background: var(--bg-tertiary, #252525);
      color: var(--text-primary, #e0e0e0);
      border: 1px solid var(--border, #333);
      border-radius: 4px;
      padding: 6px 8px;
      font-size: 12px;
      font-family: var(--font-mono, monospace);
      outline: none;
      cursor: pointer;
    }
    .vp-select:focus {
      border-color: var(--accent, #e84520);
    }
    .vp-select option {
      background: var(--bg-tertiary, #252525);
      color: var(--text-primary, #e0e0e0);
    }

    /* Edit inline */
    .vp-edit-row {
      display: flex;
      gap: 6px;
      margin-top: 6px;
    }
    .vp-edit-input {
      flex: 1;
      background: var(--bg-tertiary, #252525);
      color: var(--text-primary, #e0e0e0);
      border: 1px solid var(--accent, #e84520);
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 12px;
      font-family: var(--font-mono, monospace);
      outline: none;
    }

    /* Run results */
    .vp-results {
      margin-top: 12px;
    }
    .vp-result-card {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      background: var(--bg-tertiary, #252525);
      border: 1px solid var(--border, #333);
      border-radius: 4px;
      margin-bottom: 4px;
      font-size: 12px;
      cursor: pointer;
      transition: border-color 0.15s;
    }
    .vp-result-card:hover {
      border-color: var(--text-dim, #555);
    }
    .vp-result-icon {
      font-size: 14px;
      font-weight: 700;
      flex-shrink: 0;
      width: 16px;
      text-align: center;
    }
    .vp-result-name {
      flex: 1;
      color: var(--text-primary, #e0e0e0);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .vp-result-time {
      font-size: 11px;
      color: var(--text-dim, #666);
      flex-shrink: 0;
    }
    .vp-result-output {
      margin: 0 0 4px;
      padding: 8px 10px;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid var(--border, #333);
      border-top: none;
      border-radius: 0 0 4px 4px;
      font-size: 11px;
      color: #f87171;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 200px;
      overflow-y: auto;
      line-height: 1.5;
    }
    @keyframes vpSpin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .vp-spinner {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: 2px solid var(--border, #444);
      border-top-color: var(--accent, #e84520);
      border-radius: 50%;
      animation: vpSpin 0.6s linear infinite;
    }

    /* Empty state */
    .vp-empty {
      text-align: center;
      padding: 40px 20px;
      color: var(--text-dim, #666);
      font-size: 12px;
    }
    .vp-empty-icon {
      font-size: 28px;
      margin-bottom: 8px;
      opacity: 0.3;
    }

    /* Delete confirmation */
    .vp-confirm-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 1100;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .vp-confirm-card {
      background: var(--bg-secondary, #1e1e1e);
      border: 1px solid var(--border, #333);
      border-radius: 8px;
      padding: 20px;
      width: 340px;
      max-width: 90vw;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
      font-family: var(--font-mono, monospace);
    }
    .vp-confirm-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary, #e0e0e0);
      margin: 0 0 8px;
    }
    .vp-confirm-msg {
      font-size: 12px;
      color: var(--text-secondary, #aaa);
      margin: 0 0 16px;
      line-height: 1.5;
    }
    .vp-confirm-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    /* Footer */
    .vp-footer {
      padding: 10px 20px;
      border-top: 1px solid var(--border, #333);
      font-size: 11px;
      color: var(--text-dim, #666);
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .vp-footer-path {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
    }
  `;
  document.head.appendChild(style);
}

// ── Icons ───────────────────────────────────────────────────

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function ScanIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 7V2h5M17 2h5v5M22 17v5h-5M7 22H2v-5" />
      <line x1="7" y1="12" x2="17" y2="12" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      style={{ transition: "transform 0.15s", transform: open ? "rotate(90deg)" : "rotate(0)" }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// ── Component ───────────────────────────────────────────────

export default function VerifiersPanel({ isOpen, onClose, apiBase }: VerifiersPanelProps) {
  const [verifiers, setVerifiers] = useState<Verifier[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectType, setProjectType] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [runningAll, setRunningAll] = useState(false);
  const [runResults, setRunResults] = useState<RunResult[]>([]);
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());

  // Add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<VerifierType>("lint");
  const [newCommand, setNewCommand] = useState("");
  const [newStage, setNewStage] = useState<VerifierStage>("pre-commit");

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCommand, setEditCommand] = useState("");
  const editRef = useRef<HTMLInputElement>(null);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Ensure styles are injected
  useEffect(() => {
    ensureStyles();
  }, []);

  // Load verifiers
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch(`${apiBase}/verifiers`)
      .then((r) => r.json())
      .then((data) => {
        setVerifiers(Array.isArray(data.verifiers) ? data.verifiers : []);
        setProjectType(data.projectType || null);
        setLoading(false);
      })
      .catch(() => {
        setVerifiers([]);
        setLoading(false);
      });
  }, [isOpen, apiBase]);

  // Save verifiers
  const saveVerifiers = useCallback(
    (updated: Verifier[]) => {
      setVerifiers(updated);
      fetch(`${apiBase}/verifiers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verifiers: updated }),
      }).catch(() => {});
    },
    [apiBase],
  );

  // Auto-detect verifiers
  const handleAutoDetect = useCallback(() => {
    setDetecting(true);
    fetch(`${apiBase}/verifiers/detect`, { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        if (data.projectType) setProjectType(data.projectType);
        if (Array.isArray(data.suggested) && data.suggested.length > 0) {
          const existing = new Set(verifiers.map((v) => v.command));
          const toAdd: Verifier[] = data.suggested
            .filter((s: Verifier) => !existing.has(s.command))
            .map((s: Verifier) => ({
              ...s,
              id: s.id || genId(),
              enabled: true,
            }));
          if (toAdd.length > 0) {
            saveVerifiers([...verifiers, ...toAdd]);
          }
        }
        setDetecting(false);
      })
      .catch(() => setDetecting(false));
  }, [apiBase, verifiers, saveVerifiers]);

  // Add verifier
  const handleAdd = useCallback(() => {
    if (!newName.trim() || !newCommand.trim()) return;
    const v: Verifier = {
      id: genId(),
      name: newName.trim(),
      type: newType,
      command: newCommand.trim(),
      stage: newStage,
      enabled: true,
    };
    saveVerifiers([...verifiers, v]);
    setNewName("");
    setNewType("lint");
    setNewCommand("");
    setNewStage("pre-commit");
    setShowAddForm(false);
  }, [newName, newType, newCommand, newStage, verifiers, saveVerifiers]);

  // Toggle verifier
  const handleToggle = useCallback(
    (id: string) => {
      saveVerifiers(verifiers.map((v) => (v.id === id ? { ...v, enabled: !v.enabled } : v)));
    },
    [verifiers, saveVerifiers],
  );

  // Start editing command
  const handleEditStart = useCallback((v: Verifier) => {
    setEditingId(v.id);
    setEditCommand(v.command);
    requestAnimationFrame(() => editRef.current?.focus());
  }, []);

  // Save edit
  const handleEditSave = useCallback(() => {
    if (!editingId || !editCommand.trim()) return;
    saveVerifiers(
      verifiers.map((v) => (v.id === editingId ? { ...v, command: editCommand.trim() } : v)),
    );
    setEditingId(null);
    setEditCommand("");
  }, [editingId, editCommand, verifiers, saveVerifiers]);

  // Delete verifier
  const handleDelete = useCallback(
    (id: string) => {
      saveVerifiers(verifiers.filter((v) => v.id !== id));
      setDeleteConfirm(null);
    },
    [verifiers, saveVerifiers],
  );

  // Run all verifiers
  const handleRunAll = useCallback(() => {
    const enabled = verifiers.filter((v) => v.enabled);
    if (enabled.length === 0) return;

    setRunningAll(true);
    setRunResults(
      enabled.map((v) => ({
        verifierId: v.id,
        name: v.name,
        status: "running" as const,
        durationMs: 0,
      })),
    );
    setExpandedResults(new Set());

    fetch(`${apiBase}/verifiers/run`, { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.results)) {
          setRunResults(data.results);
          // Update verifiers with last run info
          const resultMap = new Map(data.results.map((r: RunResult) => [r.verifierId, r]));
          saveVerifiers(
            verifiers.map((v) => {
              const res = resultMap.get(v.id);
              if (!res) return v;
              return {
                ...v,
                lastRun: {
                  status: res.status === "pass" ? ("pass" as const) : ("fail" as const),
                  durationMs: res.durationMs,
                  output: res.output,
                  timestamp: Date.now(),
                },
              };
            }),
          );
        }
        setRunningAll(false);
      })
      .catch(() => {
        setRunResults((prev) =>
          prev.map((r) =>
            r.status === "running"
              ? { ...r, status: "fail" as const, output: "Network error" }
              : r,
          ),
        );
        setRunningAll(false);
      });
  }, [apiBase, verifiers, saveVerifiers]);

  // Toggle result expansion
  const toggleResultExpand = useCallback((id: string) => {
    setExpandedResults((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (deleteConfirm) {
          setDeleteConfirm(null);
          return;
        }
        if (editingId) {
          setEditingId(null);
          return;
        }
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose, deleteConfirm, editingId]);

  if (!isOpen) return null;

  const enabledCount = verifiers.filter((v) => v.enabled).length;
  const configPath = ".claude/verifiers.json";

  return (
    <>
      {/* Overlay */}
      <div className="vp-overlay" onClick={onClose} />

      {/* Panel */}
      <div className="vp-panel">
        {/* Header */}
        <div className="vp-header">
          <div className="vp-header-left">
            <span className="vp-title">
              <ShieldIcon />
              Verification Pipelines
            </span>
            {projectType && <span className="vp-project-badge">{projectType}</span>}
          </div>
          <button className="vp-close-btn" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        {/* Toolbar */}
        <div className="vp-toolbar">
          <button className="vp-btn" onClick={handleAutoDetect} disabled={detecting}>
            {detecting ? <span className="vp-spinner" /> : <ScanIcon />}
            {detecting ? "Detecting..." : "Auto-detect"}
          </button>
          <button
            className="vp-btn vp-btn--accent"
            onClick={handleRunAll}
            disabled={runningAll || enabledCount === 0}
          >
            {runningAll ? <span className="vp-spinner" /> : <PlayIcon />}
            {runningAll ? "Running..." : `Run All (${enabledCount})`}
          </button>
          <div className="vp-toolbar-spacer" />
          <button className="vp-btn" onClick={() => setShowAddForm(!showAddForm)}>
            {showAddForm ? "\u2212 Cancel" : "+ Add Verifier"}
          </button>
        </div>

        {/* Body */}
        <div className="vp-body">
          {/* Add verifier form */}
          {showAddForm && (
            <div className="vp-add-form" style={{ marginBottom: 12 }}>
              <div className="vp-add-title">New Verifier</div>
              <div className="vp-form-row">
                <div className="vp-form-group">
                  <label className="vp-form-label">Name</label>
                  <input
                    className="vp-input"
                    placeholder="e.g. ESLint"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  />
                </div>
                <div className="vp-form-group" style={{ maxWidth: 130 }}>
                  <label className="vp-form-label">Type</label>
                  <select
                    className="vp-select"
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as VerifierType)}
                  >
                    {VERIFIER_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="vp-form-row">
                <div className="vp-form-group">
                  <label className="vp-form-label">Command</label>
                  <input
                    className="vp-input"
                    placeholder="e.g. npx eslint . --max-warnings 0"
                    value={newCommand}
                    onChange={(e) => setNewCommand(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  />
                </div>
                <div className="vp-form-group" style={{ maxWidth: 130 }}>
                  <label className="vp-form-label">Stage</label>
                  <select
                    className="vp-select"
                    value={newStage}
                    onChange={(e) => setNewStage(e.target.value as VerifierStage)}
                  >
                    {VERIFIER_STAGES.map((s) => (
                      <option key={s} value={s}>
                        {STAGE_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
                <button className="vp-btn" onClick={() => setShowAddForm(false)}>
                  Cancel
                </button>
                <button
                  className="vp-btn vp-btn--accent"
                  onClick={handleAdd}
                  disabled={!newName.trim() || !newCommand.trim()}
                >
                  Add
                </button>
              </div>
            </div>
          )}

          {/* Verifier list */}
          {loading ? (
            <div className="vp-empty">Loading...</div>
          ) : verifiers.length === 0 ? (
            <div className="vp-empty">
              <div className="vp-empty-icon">{"\u2713"}</div>
              <div>No verifiers configured</div>
              <div style={{ marginTop: 4, fontSize: 11 }}>
                Click Auto-detect to scan your project, or add one manually
              </div>
            </div>
          ) : (
            <>
              <div className="vp-section-label">
                Verifiers
                <span className="vp-section-count">
                  {enabledCount}/{verifiers.length}
                </span>
              </div>
              {verifiers.map((v) => (
                <div key={v.id} className={`vp-card${v.enabled ? "" : " vp-card--disabled"}`}>
                  <div className="vp-card-top">
                    <span
                      className="vp-card-status"
                      style={{
                        background: v.lastRun
                          ? STATUS_COLORS[v.lastRun.status]
                          : STATUS_COLORS.never,
                      }}
                    />
                    <span className="vp-card-name">{v.name}</span>
                    <div className="vp-card-badges">
                      <span
                        className="vp-type-badge"
                        style={{
                          background: TYPE_COLORS[v.type],
                          color: TYPE_TEXT_COLORS[v.type],
                        }}
                      >
                        {TYPE_LABELS[v.type]}
                      </span>
                      <span className="vp-stage-badge">{STAGE_LABELS[v.stage]}</span>
                    </div>
                    <div
                      className={`vp-toggle${v.enabled ? " vp-toggle--on" : ""}`}
                      onClick={() => handleToggle(v.id)}
                    >
                      <div className="vp-toggle-knob" />
                    </div>
                  </div>

                  {/* Command display or edit */}
                  {editingId === v.id ? (
                    <div className="vp-edit-row">
                      <input
                        ref={editRef}
                        className="vp-edit-input"
                        value={editCommand}
                        onChange={(e) => setEditCommand(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleEditSave();
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                      <button className="vp-card-btn" onClick={handleEditSave}>
                        Save
                      </button>
                      <button className="vp-card-btn" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="vp-card-cmd" title={v.command}>
                      $ {v.command}
                    </div>
                  )}

                  <div className="vp-card-bottom">
                    <span className="vp-card-last-run">
                      {v.lastRun ? (
                        <>
                          <span style={{ color: STATUS_COLORS[v.lastRun.status] }}>
                            {STATUS_ICONS[v.lastRun.status]}
                          </span>
                          {v.lastRun.status === "pass" ? "Passed" : "Failed"}
                          {" \u00B7 "}
                          {fmtMs(v.lastRun.durationMs)}
                          {" \u00B7 "}
                          {fmtTime(v.lastRun.timestamp)}
                        </>
                      ) : (
                        <>
                          <span style={{ color: STATUS_COLORS.never }}>{STATUS_ICONS.never}</span>
                          Never run
                        </>
                      )}
                    </span>
                    <div className="vp-card-actions">
                      <button className="vp-card-btn" onClick={() => handleEditStart(v)}>
                        Edit
                      </button>
                      <button
                        className="vp-card-btn vp-card-btn--danger"
                        onClick={() => setDeleteConfirm(v.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Run results */}
          {runResults.length > 0 && (
            <div className="vp-results">
              <div className="vp-section-label">
                Run Results
                <span className="vp-section-count">
                  {runResults.filter((r) => r.status === "pass").length}/{runResults.length} passed
                </span>
              </div>
              {runResults.map((r) => {
                const expanded = expandedResults.has(r.verifierId);
                const hasFailed = r.status === "fail" && r.output;
                return (
                  <div key={r.verifierId}>
                    <div
                      className="vp-result-card"
                      onClick={() => hasFailed && toggleResultExpand(r.verifierId)}
                      style={{ cursor: hasFailed ? "pointer" : "default" }}
                    >
                      {r.status === "running" ? (
                        <span className="vp-spinner" />
                      ) : (
                        <span
                          className="vp-result-icon"
                          style={{
                            color: r.status === "pass" ? "#4ade80" : "#f87171",
                          }}
                        >
                          {r.status === "pass" ? "\u2713" : "\u2717"}
                        </span>
                      )}
                      <span className="vp-result-name">{r.name}</span>
                      <span className="vp-result-time">
                        {r.status === "running" ? "..." : fmtMs(r.durationMs)}
                      </span>
                      {hasFailed && <ChevronIcon open={expanded} />}
                    </div>
                    {hasFailed && expanded && (
                      <div className="vp-result-output">{r.output}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer - config path */}
        <div className="vp-footer">
          <FileIcon />
          <span className="vp-footer-path">{configPath}</span>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {deleteConfirm && (
        <div className="vp-confirm-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="vp-confirm-card" onClick={(e) => e.stopPropagation()}>
            <div className="vp-confirm-title">Delete Verifier</div>
            <div className="vp-confirm-msg">
              Are you sure you want to delete{" "}
              <strong>
                {verifiers.find((v) => v.id === deleteConfirm)?.name || "this verifier"}
              </strong>
              ? This cannot be undone.
            </div>
            <div className="vp-confirm-actions">
              <button className="vp-btn" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </button>
              <button
                className="vp-btn vp-btn--danger"
                onClick={() => handleDelete(deleteConfirm)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
