import { useState, useEffect, useCallback, useRef, memo } from "react";

// ── Types ───────────────────────────────────────────────────

export type WorkerStatus = "idle" | "working" | "completed" | "failed";
export type SwarmSessionStatus = "pending" | "running" | "completed" | "failed" | "stopped";
export type Priority = "critical" | "high" | "normal" | "low";

export interface SwarmWorker {
  id: string;
  role: string;
  taskAssignment: string | null;
  status: WorkerStatus;
  progress: number;
  startTime: number;
}

export interface WorkQueueItem {
  id: string;
  label: string;
  priority: Priority;
  status: "pending" | "in_progress" | "completed" | "failed";
  blockedBy: string[];
}

export interface SwarmResult {
  id: string;
  workerId: string;
  workerRole: string;
  summary: string;
  timestamp: number;
  success: boolean;
}

export interface SwarmEvent {
  id: string;
  timestamp: number;
  level: "info" | "warn" | "error";
  message: string;
}

export interface SwarmSession {
  objective: string;
  createdTime: number;
  status: SwarmSessionStatus;
}

export interface SwarmPanelProps {
  isOpen: boolean;
  onClose: () => void;
  session: SwarmSession | null;
  workers: SwarmWorker[];
  queue: WorkQueueItem[];
  scratchpad: string;
  results: SwarmResult[];
  events: SwarmEvent[];
  concurrencyLimit: number;
  onLaunchSwarm?: (objective: string, concurrency: number) => void;
  onStopAll?: () => void;
  onSetConcurrency?: (limit: number) => void;
}

// ── Helpers ─────────────────────────────────────────────────

function formatDuration(startTime: number, now: number): string {
  const seconds = Math.floor((now - startTime) / 1000);
  if (seconds < 0) return "0s";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remaining}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

const WORKER_STATUS_COLORS: Record<WorkerStatus, string> = {
  idle: "var(--text-dim, #666)",
  working: "var(--accent, #58a6ff)",
  completed: "#4ade80",
  failed: "#f87171",
};

const WORKER_STATUS_ICONS: Record<WorkerStatus, string> = {
  idle: "\u25CB",       // ○
  working: "\u25CF",    // ●
  completed: "\u2713",  // ✓
  failed: "\u2717",     // ✗
};

const SESSION_STATUS_COLORS: Record<SwarmSessionStatus, string> = {
  pending: "var(--text-dim, #666)",
  running: "var(--accent, #58a6ff)",
  completed: "#4ade80",
  failed: "#f87171",
  stopped: "#facc15",
};

const PRIORITY_COLORS: Record<Priority, string> = {
  critical: "#f87171",
  high: "#fb923c",
  normal: "var(--accent, #58a6ff)",
  low: "var(--text-dim, #666)",
};

const EVENT_LEVEL_COLORS: Record<string, string> = {
  info: "var(--text-dim, #888)",
  warn: "#facc15",
  error: "#f87171",
};

// ── Styles ──────────────────────────────────────────────────

const CSS = `
/* Overlay & panel */
.swarm-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  z-index: 1000;
  animation: swarmFadeIn 0.2s ease-out;
}
.swarm-overlay--closing {
  animation: swarmFadeOut 0.2s ease-out forwards;
}
.swarm-panel {
  position: fixed;
  top: 0; right: 0; bottom: 0;
  width: 480px; max-width: 100vw;
  background: var(--bg-secondary, #1e1e1e);
  border-left: 1px solid var(--border, #333);
  z-index: 1001;
  display: flex; flex-direction: column;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.4);
  animation: swarmSlideIn 0.25s ease-out;
}
.swarm-panel--closing {
  animation: swarmSlideOut 0.2s ease-out forwards;
}
@keyframes swarmFadeIn  { from { opacity: 0; } to { opacity: 1; } }
@keyframes swarmFadeOut { from { opacity: 1; } to { opacity: 0; } }
@keyframes swarmSlideIn  { from { transform: translateX(100%); } to { transform: translateX(0); } }
@keyframes swarmSlideOut { from { transform: translateX(0); } to { transform: translateX(100%); } }
@keyframes swarmPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
@keyframes swarmProgressPulse { 0%, 100% { opacity: 0.8; } 50% { opacity: 1; } }

/* Header */
.swarm-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border, #333);
  flex-shrink: 0;
}
.swarm-header-title {
  font-family: var(--font-mono, monospace);
  font-size: 14px; font-weight: 600;
  color: var(--text-primary, #e0e0e0);
  display: flex; align-items: center; gap: 8px;
}
.swarm-close-btn {
  background: none; border: none;
  color: var(--text-dim, #666);
  cursor: pointer; padding: 4px; border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  transition: color 0.15s, background 0.15s;
}
.swarm-close-btn:hover {
  color: var(--text-secondary, #aaa);
  background: var(--bg-hover, #2a2a2a);
}

/* Body */
.swarm-body {
  flex: 1; overflow-y: auto; min-height: 0;
}
.swarm-body::-webkit-scrollbar { width: 5px; }
.swarm-body::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.06); border-radius: 3px;
}

/* Sections */
.swarm-section {
  border-bottom: 1px solid var(--border, #333);
}
.swarm-section:last-child { border-bottom: none; }
.swarm-section-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 20px;
  cursor: pointer; user-select: none;
  transition: background 0.1s;
}
.swarm-section-header:hover {
  background: var(--bg-hover, #2a2a2a);
}
.swarm-section-label {
  font-family: var(--font-mono, monospace);
  font-size: 11px; font-weight: 500;
  color: var(--text-dim, #666);
  text-transform: uppercase; letter-spacing: 0.05em;
  display: flex; align-items: center; gap: 8px;
}
.swarm-section-count {
  font-size: 10px;
  color: var(--text-dim, #666);
  background: var(--bg-tertiary, #2a2a2a);
  padding: 1px 6px;
  border-radius: 9999px;
}
.swarm-section-chevron {
  font-size: 10px;
  color: var(--text-dim, #666);
  transition: transform 0.15s ease;
}
.swarm-section-chevron--open {
  transform: rotate(90deg);
}
.swarm-section-content {
  overflow: hidden;
  transition: max-height 0.25s ease;
}
.swarm-section-content--collapsed {
  max-height: 0 !important;
}

/* Session info */
.swarm-session-info {
  padding: 12px 20px;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  color: var(--text-secondary, #aaa);
  display: flex; flex-direction: column; gap: 6px;
  border-bottom: 1px solid var(--border, #333);
}
.swarm-session-row {
  display: flex; align-items: center; gap: 8px;
}
.swarm-session-label {
  color: var(--text-dim, #666);
  font-size: 11px; text-transform: uppercase;
  letter-spacing: 0.04em; min-width: 60px;
  flex-shrink: 0;
}
.swarm-session-value {
  color: var(--text-primary, #e0e0e0);
  flex: 1; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap;
}
.swarm-session-status {
  display: inline-flex; align-items: center; gap: 6px;
}
.swarm-session-dot {
  width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
}
.swarm-session-dot--running {
  animation: swarmPulse 1.5s ease-in-out infinite;
}

/* Overall progress bar */
.swarm-progress {
  padding: 8px 20px 12px;
}
.swarm-progress-label {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--text-dim, #666);
  display: flex; justify-content: space-between;
  margin-bottom: 4px;
}
.swarm-progress-track {
  height: 4px;
  background: var(--bg-hover, #333);
  border-radius: 2px;
  overflow: hidden;
}
.swarm-progress-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.4s ease;
}
.swarm-progress-fill--active {
  animation: swarmProgressPulse 1.5s ease-in-out infinite;
}

/* Worker cards */
.swarm-worker-card {
  margin: 0 12px 8px;
  padding: 10px 14px;
  background: var(--bg-tertiary, #252525);
  border: 1px solid var(--border, #333);
  border-radius: var(--radius-sm, 6px);
  transition: border-color 0.15s;
}
.swarm-worker-card:hover {
  border-color: var(--text-dim, #555);
}
.swarm-worker-card:last-child {
  margin-bottom: 12px;
}
.swarm-worker-top {
  display: flex; align-items: center; gap: 8px; margin-bottom: 4px;
}
.swarm-worker-dot {
  width: 8px; height: 8px;
  border-radius: 50%; flex-shrink: 0;
}
.swarm-worker-dot--working {
  animation: swarmPulse 1.5s ease-in-out infinite;
}
.swarm-worker-name {
  font-family: var(--font-mono, monospace);
  font-size: 13px; font-weight: 600;
  color: var(--text-primary, #e0e0e0);
  flex: 1; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap;
}
.swarm-worker-role {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--text-dim, #666);
  flex-shrink: 0;
}
.swarm-worker-task {
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  color: var(--text-secondary, #aaa);
  margin-bottom: 6px;
  line-height: 1.4;
  overflow: hidden; text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
.swarm-worker-progress-track {
  height: 3px;
  background: var(--bg-hover, #333);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 6px;
}
.swarm-worker-progress-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.4s ease;
}
.swarm-worker-progress-fill--working {
  animation: swarmProgressPulse 1.5s ease-in-out infinite;
}
.swarm-worker-meta {
  display: flex; align-items: center; gap: 8px;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--text-dim, #666);
}
.swarm-worker-meta-sep {
  color: var(--text-dim, #444);
}

/* Queue items */
.swarm-queue-item {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 8px 20px;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  transition: background 0.1s;
}
.swarm-queue-item:hover {
  background: var(--bg-hover, #2a2a2a);
}
.swarm-queue-content {
  flex: 1; min-width: 0;
  color: var(--text-secondary, #aaa);
  line-height: 1.4;
}
.swarm-queue-content--completed {
  text-decoration: line-through; opacity: 0.6;
}
.swarm-priority-badge {
  font-family: var(--font-mono, monospace);
  font-size: 9px; font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 1px 6px;
  border-radius: 3px;
  flex-shrink: 0;
  white-space: nowrap;
}
.swarm-queue-deps {
  font-size: 10px;
  color: var(--text-dim, #555);
  margin-top: 2px;
}
.swarm-queue-status-icon {
  flex-shrink: 0; font-size: 14px; line-height: 1.3;
}

/* Scratchpad */
.swarm-scratchpad {
  margin: 0 12px 12px;
  padding: 10px 14px;
  background: var(--bg-tertiary, #252525);
  border: 1px solid var(--border, #333);
  border-radius: var(--radius-sm, 6px);
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  color: var(--text-secondary, #aaa);
  line-height: 1.5;
  max-height: 200px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
.swarm-scratchpad::-webkit-scrollbar { width: 4px; }
.swarm-scratchpad::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.06); border-radius: 2px;
}

/* Results */
.swarm-result-item {
  margin: 0 12px 8px;
  padding: 10px 14px;
  background: var(--bg-tertiary, #252525);
  border: 1px solid var(--border, #333);
  border-radius: var(--radius-sm, 6px);
  transition: border-color 0.15s;
}
.swarm-result-item:last-child { margin-bottom: 12px; }
.swarm-result-item:hover { border-color: var(--text-dim, #555); }
.swarm-result-header {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 4px;
}
.swarm-result-icon {
  font-size: 12px; flex-shrink: 0;
}
.swarm-result-worker {
  font-family: var(--font-mono, monospace);
  font-size: 12px; font-weight: 600;
  color: var(--text-primary, #e0e0e0);
  flex: 1; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap;
}
.swarm-result-time {
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  color: var(--text-dim, #666);
  flex-shrink: 0;
}
.swarm-result-summary {
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  color: var(--text-secondary, #aaa);
  line-height: 1.4;
}

/* Event log */
.swarm-event-log {
  max-height: 220px;
  overflow-y: auto;
}
.swarm-event-log::-webkit-scrollbar { width: 4px; }
.swarm-event-log::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.06); border-radius: 2px;
}
.swarm-event-row {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 4px 20px;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  line-height: 1.4;
  transition: background 0.1s;
}
.swarm-event-row:hover {
  background: var(--bg-hover, #2a2a2a);
}
.swarm-event-time {
  color: var(--text-dim, #555);
  flex-shrink: 0;
  font-size: 10px;
  min-width: 56px;
}
.swarm-event-level {
  font-size: 10px; font-weight: 700;
  text-transform: uppercase;
  flex-shrink: 0;
  min-width: 36px;
}
.swarm-event-msg {
  flex: 1; min-width: 0;
  color: var(--text-secondary, #aaa);
  word-break: break-word;
}

/* Controls */
.swarm-controls {
  padding: 12px 20px 16px;
  border-top: 1px solid var(--border, #333);
  flex-shrink: 0;
  display: flex; flex-direction: column; gap: 10px;
}
.swarm-controls-row {
  display: flex; align-items: center; gap: 8px;
}
.swarm-btn {
  flex: 1;
  padding: 8px 12px;
  border-radius: var(--radius-sm, 6px);
  border: 1px solid;
  background: transparent;
  font-family: var(--font-mono, monospace);
  font-size: 12px; font-weight: 500;
  cursor: pointer;
  text-align: center;
  transition: background 0.15s, color 0.15s;
}
.swarm-btn:disabled {
  opacity: 0.4; cursor: not-allowed;
}
.swarm-btn--launch {
  color: var(--accent, #58a6ff);
  border-color: var(--accent, #58a6ff);
}
.swarm-btn--launch:hover:not(:disabled) {
  background: rgba(88, 166, 255, 0.12);
}
.swarm-btn--stop {
  color: #f87171;
  border-color: #f8717133;
}
.swarm-btn--stop:hover:not(:disabled) {
  background: rgba(248, 113, 113, 0.1);
}
.swarm-btn--stop-confirm {
  background: #dc2626;
  border-color: #dc2626;
  color: #fff;
}
.swarm-btn--stop-confirm:hover:not(:disabled) {
  background: #b91c1c;
}
.swarm-concurrency-row {
  display: flex; align-items: center; gap: 10px;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--text-dim, #666);
}
.swarm-concurrency-label {
  text-transform: uppercase;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}
.swarm-concurrency-slider {
  -webkit-appearance: none; appearance: none;
  flex: 1; height: 4px;
  border-radius: 2px;
  background: rgba(255,255,255,0.08);
  outline: none; cursor: pointer;
}
.swarm-concurrency-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px; height: 14px;
  border-radius: 50%;
  background: var(--accent, #58a6ff);
  cursor: pointer; border: none;
}
.swarm-concurrency-value {
  min-width: 20px;
  text-align: right;
  color: var(--text-primary, #e0e0e0);
  font-weight: 600;
}

/* Launch form */
.swarm-launch-form {
  padding: 12px 20px 16px;
}
.swarm-launch-row {
  margin-bottom: 10px;
}
.swarm-launch-label {
  display: block;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--text-dim, #666);
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.swarm-launch-input {
  width: 100%;
  padding: 8px 10px;
  background: var(--bg-tertiary, #252525);
  border: 1px solid var(--border, #333);
  border-radius: var(--radius-sm, 4px);
  color: var(--text-primary, #e0e0e0);
  font-family: var(--font-mono, monospace);
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s;
  resize: vertical;
}
.swarm-launch-input:focus {
  border-color: var(--accent, #58a6ff);
}

/* Empty state */
.swarm-empty {
  padding: 24px 20px;
  text-align: center;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  color: var(--text-dim, #666);
}
`;

// ── Icons ───────────────────────────────────────────────────

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SwarmIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: "var(--accent, #58a6ff)" }}>
      <circle cx="12" cy="5" r="2" />
      <circle cx="5" cy="19" r="2" />
      <circle cx="19" cy="19" r="2" />
      <line x1="12" y1="7" x2="5" y2="17" />
      <line x1="12" y1="7" x2="19" y2="17" />
      <line x1="5" y1="19" x2="19" y2="19" />
    </svg>
  );
}

// ── Subcomponents ───────────────────────────────────────────

function CollapsibleSection({
  label,
  count,
  defaultOpen = true,
  children,
  actions,
}: {
  label: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="swarm-section">
      <div className="swarm-section-header" onClick={() => setOpen((o) => !o)}>
        <span className="swarm-section-label">
          <span className={`swarm-section-chevron ${open ? "swarm-section-chevron--open" : ""}`}>
            {"\u25B8"}
          </span>
          {label}
          <span className="swarm-section-count">{count}</span>
        </span>
        {actions && (
          <span onClick={(e) => e.stopPropagation()}>
            {actions}
          </span>
        )}
      </div>
      <div
        className={`swarm-section-content ${!open ? "swarm-section-content--collapsed" : ""}`}
        style={open ? { maxHeight: "9999px" } : undefined}
      >
        {children}
      </div>
    </div>
  );
}

function SessionInfo({
  session,
  now,
}: {
  session: SwarmSession;
  now: number;
}) {
  const isRunning = session.status === "running";

  return (
    <div className="swarm-session-info">
      <div className="swarm-session-row">
        <span className="swarm-session-label">Goal</span>
        <span className="swarm-session-value" title={session.objective}>
          {session.objective}
        </span>
      </div>
      <div className="swarm-session-row">
        <span className="swarm-session-label">Status</span>
        <span className="swarm-session-value">
          <span className="swarm-session-status">
            <span
              className={`swarm-session-dot ${isRunning ? "swarm-session-dot--running" : ""}`}
              style={{ backgroundColor: SESSION_STATUS_COLORS[session.status] }}
            />
            {session.status}
          </span>
        </span>
      </div>
      <div className="swarm-session-row">
        <span className="swarm-session-label">Uptime</span>
        <span className="swarm-session-value">
          {formatDuration(session.createdTime, now)}
        </span>
      </div>
    </div>
  );
}

function OverallProgress({
  queue,
}: {
  queue: WorkQueueItem[];
}) {
  const total = queue.length;
  const completed = queue.filter((q) => q.status === "completed").length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const allDone = completed === total && total > 0;
  const isActive = total > 0 && !allDone;

  return (
    <div className="swarm-progress">
      <div className="swarm-progress-label">
        <span>Overall Progress</span>
        <span>{completed}/{total} ({pct}%)</span>
      </div>
      <div className="swarm-progress-track">
        <div
          className={`swarm-progress-fill ${isActive ? "swarm-progress-fill--active" : ""}`}
          style={{
            width: `${pct}%`,
            backgroundColor: allDone ? "#4ade80" : "var(--accent, #58a6ff)",
          }}
        />
      </div>
    </div>
  );
}

function WorkerCard({
  worker,
  now,
}: {
  worker: SwarmWorker;
  now: number;
}) {
  const isWorking = worker.status === "working";

  return (
    <div className="swarm-worker-card">
      <div className="swarm-worker-top">
        <span
          className={`swarm-worker-dot ${isWorking ? "swarm-worker-dot--working" : ""}`}
          style={{ backgroundColor: WORKER_STATUS_COLORS[worker.status] }}
        />
        <span className="swarm-worker-name">{worker.id}</span>
        <span className="swarm-worker-role">{worker.role}</span>
      </div>

      <div className="swarm-worker-task">
        {worker.taskAssignment || "No task assigned"}
      </div>

      <div className="swarm-worker-progress-track">
        <div
          className={`swarm-worker-progress-fill ${isWorking ? "swarm-worker-progress-fill--working" : ""}`}
          style={{
            width: `${Math.min(100, Math.max(0, worker.progress))}%`,
            backgroundColor:
              worker.status === "completed"
                ? "#4ade80"
                : worker.status === "failed"
                  ? "#f87171"
                  : "var(--accent, #58a6ff)",
          }}
        />
      </div>

      <div className="swarm-worker-meta">
        <span>{WORKER_STATUS_ICONS[worker.status]} {worker.status}</span>
        <span className="swarm-worker-meta-sep">{"\u00B7"}</span>
        <span>{formatDuration(worker.startTime, now)}</span>
      </div>
    </div>
  );
}

const QUEUE_ICONS: Record<string, string> = {
  pending: "\u2610",      // ☐
  in_progress: "\u25D0",  // ◐
  completed: "\u2611",    // ☑
  failed: "\u2717",       // ✗
};

function QueueItem({ item }: { item: WorkQueueItem }) {
  const isCompleted = item.status === "completed";
  const hasDeps = item.blockedBy.length > 0;

  return (
    <div className="swarm-queue-item">
      <span
        className="swarm-queue-status-icon"
        style={{
          color:
            item.status === "completed"
              ? "#4ade80"
              : item.status === "failed"
                ? "#f87171"
                : item.status === "in_progress"
                  ? "var(--accent, #58a6ff)"
                  : "var(--text-dim, #666)",
        }}
      >
        {QUEUE_ICONS[item.status] || QUEUE_ICONS.pending}
      </span>
      <div
        className={`swarm-queue-content ${isCompleted ? "swarm-queue-content--completed" : ""}`}
      >
        {item.label}
        {hasDeps && (
          <div className="swarm-queue-deps">
            blocked by: {item.blockedBy.join(", ")}
          </div>
        )}
      </div>
      <span
        className="swarm-priority-badge"
        style={{
          color: PRIORITY_COLORS[item.priority],
          backgroundColor:
            item.priority === "critical"
              ? "rgba(248, 113, 113, 0.12)"
              : item.priority === "high"
                ? "rgba(251, 146, 60, 0.12)"
                : item.priority === "normal"
                  ? "rgba(88, 166, 255, 0.10)"
                  : "rgba(102, 102, 102, 0.10)",
        }}
      >
        {item.priority}
      </span>
    </div>
  );
}

function ResultCard({ result }: { result: SwarmResult }) {
  return (
    <div className="swarm-result-item">
      <div className="swarm-result-header">
        <span
          className="swarm-result-icon"
          style={{ color: result.success ? "#4ade80" : "#f87171" }}
        >
          {result.success ? "\u2713" : "\u2717"}
        </span>
        <span className="swarm-result-worker">
          {result.workerRole} ({result.workerId})
        </span>
        <span className="swarm-result-time">
          {formatTime(result.timestamp)}
        </span>
      </div>
      <div className="swarm-result-summary">{result.summary}</div>
    </div>
  );
}

function LaunchForm({
  onLaunch,
  concurrencyLimit,
  onSetConcurrency,
}: {
  onLaunch: (objective: string, concurrency: number) => void;
  concurrencyLimit: number;
  onSetConcurrency?: (limit: number) => void;
}) {
  const [objective, setObjective] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = objective.trim();
    if (!trimmed) return;
    onLaunch(trimmed, concurrencyLimit);
    setObjective("");
  }, [objective, concurrencyLimit, onLaunch]);

  return (
    <div className="swarm-launch-form">
      <div className="swarm-launch-row">
        <label className="swarm-launch-label">Objective</label>
        <textarea
          ref={inputRef}
          className="swarm-launch-input"
          rows={3}
          placeholder="Describe the objective for the swarm..."
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
      </div>
      <div className="swarm-concurrency-row" style={{ marginBottom: 10 }}>
        <span className="swarm-concurrency-label">Concurrency</span>
        <input
          type="range"
          className="swarm-concurrency-slider"
          min={1}
          max={10}
          value={concurrencyLimit}
          onChange={(e) => onSetConcurrency?.(Number(e.target.value))}
        />
        <span className="swarm-concurrency-value">{concurrencyLimit}</span>
      </div>
      <button
        className="swarm-btn swarm-btn--launch"
        onClick={handleSubmit}
        disabled={!objective.trim()}
        style={{ width: "100%" }}
      >
        Launch Swarm
      </button>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────

function SwarmPanel({
  isOpen,
  onClose,
  session,
  workers,
  queue,
  scratchpad,
  results,
  events,
  concurrencyLimit,
  onLaunchSwarm,
  onStopAll,
  onSetConcurrency,
}: SwarmPanelProps) {
  const [now, setNow] = useState(Date.now());
  const [closing, setClosing] = useState(false);
  const [stopPending, setStopPending] = useState(false);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventLogRef = useRef<HTMLDivElement>(null);

  // Live timer tick
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Stop-all confirmation timeout
  useEffect(() => {
    if (stopPending) {
      stopTimerRef.current = setTimeout(() => {
        setStopPending(false);
      }, 3000);
      return () => {
        if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      };
    }
  }, [stopPending]);

  // Reset state when closing
  useEffect(() => {
    if (!isOpen) {
      setStopPending(false);
    }
  }, [isOpen]);

  // Auto-scroll event log
  useEffect(() => {
    if (eventLogRef.current) {
      eventLogRef.current.scrollTop = eventLogRef.current.scrollHeight;
    }
  }, [events]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen]);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      onClose();
    }, 200);
  }, [onClose]);

  const handleStopAll = useCallback(() => {
    if (!stopPending) {
      setStopPending(true);
    } else {
      onStopAll?.();
      setStopPending(false);
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    }
  }, [stopPending, onStopAll]);

  if (!isOpen && !closing) return null;

  const isSessionActive =
    session?.status === "running" || session?.status === "pending";
  const workingWorkers = workers.filter((w) => w.status === "working");
  const sortedWorkers = [
    ...workingWorkers,
    ...workers.filter((w) => w.status !== "working"),
  ];
  const sortedResults = [...results].sort(
    (a, b) => b.timestamp - a.timestamp,
  );

  return (
    <>
      <style>{CSS}</style>

      {/* Overlay */}
      <div
        className={`swarm-overlay ${closing ? "swarm-overlay--closing" : ""}`}
        onClick={handleClose}
      />

      {/* Panel */}
      <div
        className={`swarm-panel ${closing ? "swarm-panel--closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Swarm Orchestration Dashboard"
      >
        {/* Header */}
        <div className="swarm-header">
          <span className="swarm-header-title">
            <SwarmIcon />
            Swarm
          </span>
          <button
            className="swarm-close-btn"
            onClick={handleClose}
            aria-label="Close panel"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div className="swarm-body">
          {/* Session info */}
          {session && <SessionInfo session={session} now={now} />}

          {/* Overall progress */}
          {queue.length > 0 && <OverallProgress queue={queue} />}

          {/* Workers section */}
          <CollapsibleSection label="Workers" count={workers.length}>
            {workers.length === 0 ? (
              <div className="swarm-empty">No workers active</div>
            ) : (
              sortedWorkers.map((worker) => (
                <WorkerCard key={worker.id} worker={worker} now={now} />
              ))
            )}
          </CollapsibleSection>

          {/* Work Queue section */}
          <CollapsibleSection label="Work Queue" count={queue.length}>
            {queue.length === 0 ? (
              <div className="swarm-empty">Queue is empty</div>
            ) : (
              queue.map((item) => (
                <QueueItem key={item.id} item={item} />
              ))
            )}
          </CollapsibleSection>

          {/* Scratchpad section */}
          <CollapsibleSection label="Scratchpad" count={scratchpad ? 1 : 0} defaultOpen={false}>
            {scratchpad ? (
              <div className="swarm-scratchpad">{scratchpad}</div>
            ) : (
              <div className="swarm-empty">Scratchpad is empty</div>
            )}
          </CollapsibleSection>

          {/* Results section */}
          <CollapsibleSection label="Results" count={results.length} defaultOpen={false}>
            {results.length === 0 ? (
              <div className="swarm-empty">No results yet</div>
            ) : (
              sortedResults.map((result) => (
                <ResultCard key={result.id} result={result} />
              ))
            )}
          </CollapsibleSection>

          {/* Event Log section */}
          <CollapsibleSection label="Event Log" count={events.length}>
            {events.length === 0 ? (
              <div className="swarm-empty">No events recorded</div>
            ) : (
              <div className="swarm-event-log" ref={eventLogRef}>
                {events.map((evt) => (
                  <div key={evt.id} className="swarm-event-row">
                    <span className="swarm-event-time">
                      {formatTime(evt.timestamp)}
                    </span>
                    <span
                      className="swarm-event-level"
                      style={{ color: EVENT_LEVEL_COLORS[evt.level] }}
                    >
                      {evt.level}
                    </span>
                    <span className="swarm-event-msg">{evt.message}</span>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>

          {/* Launch form (when no session) */}
          {!session && onLaunchSwarm && (
            <LaunchForm
              onLaunch={onLaunchSwarm}
              concurrencyLimit={concurrencyLimit}
              onSetConcurrency={onSetConcurrency}
            />
          )}
        </div>

        {/* Controls (when session active) */}
        {session && (
          <div className="swarm-controls">
            <div className="swarm-concurrency-row">
              <span className="swarm-concurrency-label">Concurrency</span>
              <input
                type="range"
                className="swarm-concurrency-slider"
                min={1}
                max={10}
                value={concurrencyLimit}
                onChange={(e) => onSetConcurrency?.(Number(e.target.value))}
              />
              <span className="swarm-concurrency-value">{concurrencyLimit}</span>
            </div>
            <div className="swarm-controls-row">
              {onLaunchSwarm && !isSessionActive && (
                <button
                  className="swarm-btn swarm-btn--launch"
                  onClick={() => onLaunchSwarm(session.objective, concurrencyLimit)}
                >
                  Relaunch
                </button>
              )}
              {onStopAll && isSessionActive && (
                <button
                  className={`swarm-btn ${stopPending ? "swarm-btn--stop-confirm" : "swarm-btn--stop"}`}
                  onClick={handleStopAll}
                >
                  {stopPending ? "Confirm Stop All?" : "Stop All"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default memo(SwarmPanel);
