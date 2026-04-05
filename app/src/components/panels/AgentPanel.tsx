import { useState, useEffect, useCallback, useRef, memo } from "react";

// ── Types ───────────────────────────────────────────────────

export interface Agent {
  id: string;
  name: string;
  description: string;
  model: string;
  status: "idle" | "running" | "completed" | "failed";
  progress?: number;
  startTime: number;
  messages?: Array<{ type: string; text: string }>;
}

export interface Task {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm?: string;
}

export interface AgentPanelProps {
  isOpen: boolean;
  onClose: () => void;
  agents: Agent[];
  tasks: Task[];
  onKillAgent?: (id: string) => void;
  onKillAllAgents?: () => void;
  onCreateAgent?: (description: string, model: string) => void;
  onKillTask?: (id: string) => void;
  apiBase?: string;
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

const STATUS_COLORS: Record<string, string> = {
  idle: "var(--text-dim, #666)",
  running: "var(--accent, #58a6ff)",
  completed: "#4ade80",
  failed: "#f87171",
};

const STATUS_ICONS: Record<string, string> = {
  idle: "\u25CB",       // ○
  running: "\u25CF",    // ●
  completed: "\u2713",  // ✓
  failed: "\u2717",     // ✗
};

const TASK_ICONS: Record<string, string> = {
  pending: "\u2610",      // ☐
  in_progress: "\u25D0",  // ◐
  completed: "\u2611",    // ☑
};

const AVAILABLE_MODELS = [
  "claude-sonnet-4-20250514",
  "claude-opus-4-20250514",
  "claude-haiku-4-20250414",
];

// ── Injected Styles ─────────────────────────────────────────

const STYLE_ID = "agent-panel-styles";

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes agentPanelSlideIn {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }
    @keyframes agentPanelSlideOut {
      from { transform: translateX(0); }
      to { transform: translateX(100%); }
    }
    @keyframes agentPanelFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes agentPanelFadeOut {
      from { opacity: 1; }
      to { opacity: 0; }
    }
    @keyframes agentPulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    @keyframes agentSpin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    @keyframes agentProgressPulse {
      0%, 100% { opacity: 0.8; }
      50% { opacity: 1; }
    }

    .agent-panel-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(2px);
      -webkit-backdrop-filter: blur(2px);
      z-index: 1000;
      animation: agentPanelFadeIn 0.2s ease-out;
    }
    .agent-panel-overlay--closing {
      animation: agentPanelFadeOut 0.2s ease-out forwards;
    }

    .agent-panel {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: 480px;
      max-width: 100vw;
      background: var(--bg-secondary, #1e1e1e);
      border-left: 1px solid var(--border, #333);
      z-index: 1001;
      display: flex;
      flex-direction: column;
      box-shadow: -8px 0 32px rgba(0, 0, 0, 0.4);
      animation: agentPanelSlideIn 0.25s ease-out;
    }
    .agent-panel--closing {
      animation: agentPanelSlideOut 0.2s ease-out forwards;
    }

    .agent-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border, #333);
      flex-shrink: 0;
    }
    .agent-panel-header-title {
      font-family: var(--font-mono, monospace);
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary, #e0e0e0);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .agent-panel-close-btn {
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
    .agent-panel-close-btn:hover {
      color: var(--text-secondary, #aaa);
      background: var(--bg-hover, #2a2a2a);
    }

    .agent-panel-body {
      flex: 1;
      overflow-y: auto;
      min-height: 0;
    }

    /* Sections */
    .agent-section {
      border-bottom: 1px solid var(--border, #333);
    }
    .agent-section:last-child {
      border-bottom: none;
    }
    .agent-section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 20px;
      cursor: pointer;
      user-select: none;
      transition: background 0.1s;
    }
    .agent-section-header:hover {
      background: var(--bg-hover, #2a2a2a);
    }
    .agent-section-label {
      font-family: var(--font-mono, monospace);
      font-size: 11px;
      font-weight: 500;
      color: var(--text-dim, #666);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .agent-section-count {
      font-size: 10px;
      color: var(--text-dim, #666);
      background: var(--bg-tertiary, #2a2a2a);
      padding: 1px 6px;
      border-radius: 9999px;
    }
    .agent-section-chevron {
      font-size: 10px;
      color: var(--text-dim, #666);
      transition: transform 0.15s ease;
    }
    .agent-section-chevron--open {
      transform: rotate(90deg);
    }
    .agent-section-content {
      overflow: hidden;
      transition: max-height 0.25s ease;
    }
    .agent-section-content--collapsed {
      max-height: 0 !important;
    }

    /* Agent cards */
    .agent-card {
      margin: 0 12px 8px;
      padding: 12px 14px;
      background: var(--bg-tertiary, #252525);
      border: 1px solid var(--border, #333);
      border-radius: var(--radius-sm, 6px);
      transition: border-color 0.15s;
    }
    .agent-card:hover {
      border-color: var(--text-dim, #555);
    }
    .agent-card:last-child {
      margin-bottom: 12px;
    }
    .agent-card-top {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    .agent-card-status {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .agent-card-status--running {
      animation: agentPulse 1.5s ease-in-out infinite;
    }
    .agent-card-name {
      font-family: var(--font-mono, monospace);
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary, #e0e0e0);
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .agent-card-model {
      font-family: var(--font-mono, monospace);
      font-size: 11px;
      color: var(--text-dim, #666);
      flex-shrink: 0;
    }
    .agent-card-desc {
      font-family: var(--font-mono, monospace);
      font-size: 12px;
      color: var(--text-secondary, #aaa);
      margin-bottom: 8px;
      line-height: 1.4;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .agent-card-progress-track {
      height: 3px;
      background: var(--bg-hover, #333);
      border-radius: 2px;
      overflow: hidden;
      margin-bottom: 8px;
    }
    .agent-card-progress-fill {
      height: 100%;
      border-radius: 2px;
      transition: width 0.4s ease;
    }
    .agent-card-progress-fill--running {
      animation: agentProgressPulse 1.5s ease-in-out infinite;
    }
    .agent-card-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: var(--font-mono, monospace);
      font-size: 11px;
      color: var(--text-dim, #666);
    }
    .agent-card-meta-sep {
      color: var(--text-dim, #444);
    }
    .agent-card-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-left: auto;
    }
    .agent-card-btn {
      padding: 2px 8px;
      border-radius: 4px;
      border: 1px solid var(--border, #444);
      background: transparent;
      font-family: var(--font-mono, monospace);
      font-size: 11px;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }
    .agent-card-btn--expand {
      color: var(--text-dim, #888);
    }
    .agent-card-btn--expand:hover {
      background: var(--bg-hover, #2a2a2a);
      color: var(--text-secondary, #aaa);
    }
    .agent-card-btn--kill {
      color: #f87171;
      border-color: #f8717133;
    }
    .agent-card-btn--kill:hover {
      background: rgba(248, 113, 113, 0.12);
    }
    .agent-card-messages {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--border, #333);
      max-height: 200px;
      overflow-y: auto;
    }
    .agent-card-msg {
      font-family: var(--font-mono, monospace);
      font-size: 11px;
      color: var(--text-secondary, #aaa);
      padding: 3px 0;
      line-height: 1.4;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .agent-card-msg-type {
      color: var(--text-dim, #666);
      margin-right: 6px;
      font-size: 10px;
    }

    /* Kill All button */
    .agent-kill-all-btn {
      display: block;
      width: calc(100% - 24px);
      margin: 4px 12px 12px;
      padding: 8px 12px;
      border: 1px solid #f8717133;
      border-radius: var(--radius-sm, 6px);
      background: transparent;
      color: #f87171;
      font-family: var(--font-mono, monospace);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      text-align: center;
      transition: background 0.15s, color 0.15s;
    }
    .agent-kill-all-btn:hover {
      background: rgba(248, 113, 113, 0.1);
    }
    .agent-kill-all-btn--confirm {
      background: #dc2626;
      border-color: #dc2626;
      color: #fff;
    }
    .agent-kill-all-btn--confirm:hover {
      background: #b91c1c;
    }

    /* Task items */
    .agent-task-item {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 8px 20px;
      font-family: var(--font-mono, monospace);
      font-size: 12px;
      transition: background 0.1s;
    }
    .agent-task-item:hover {
      background: var(--bg-hover, #2a2a2a);
    }
    .agent-task-icon {
      flex-shrink: 0;
      font-size: 14px;
      line-height: 1.3;
    }
    .agent-task-icon--pending {
      color: var(--text-dim, #666);
    }
    .agent-task-icon--in_progress {
      color: var(--accent, #58a6ff);
      display: inline-block;
      animation: agentSpin 2s linear infinite;
    }
    .agent-task-icon--completed {
      color: #4ade80;
    }
    .agent-task-content {
      flex: 1;
      color: var(--text-secondary, #aaa);
      line-height: 1.4;
      min-width: 0;
    }
    .agent-task-content--completed {
      text-decoration: line-through;
      opacity: 0.6;
    }
    .agent-task-progress {
      padding: 4px 20px 12px;
    }
    .agent-task-progress-track {
      height: 3px;
      background: var(--bg-hover, #333);
      border-radius: 2px;
      overflow: hidden;
    }
    .agent-task-progress-fill {
      height: 100%;
      background: var(--accent, #58a6ff);
      border-radius: 2px;
      transition: width 0.4s ease;
    }
    .agent-task-progress-fill--done {
      background: #4ade80;
    }

    /* New Agent form */
    .agent-create-form {
      padding: 12px 20px 16px;
    }
    .agent-create-row {
      margin-bottom: 10px;
    }
    .agent-create-label {
      display: block;
      font-family: var(--font-mono, monospace);
      font-size: 11px;
      color: var(--text-dim, #666);
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .agent-create-input {
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
    }
    .agent-create-input:focus {
      border-color: var(--accent, #58a6ff);
    }
    .agent-create-select {
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
      cursor: pointer;
      -webkit-appearance: none;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6' fill='%23666'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 10px center;
      padding-right: 28px;
    }
    .agent-create-select:focus {
      border-color: var(--accent, #58a6ff);
    }
    .agent-create-submit {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid var(--accent, #58a6ff);
      border-radius: var(--radius-sm, 6px);
      background: transparent;
      color: var(--accent, #58a6ff);
      font-family: var(--font-mono, monospace);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }
    .agent-create-submit:hover {
      background: rgba(88, 166, 255, 0.12);
    }
    .agent-create-submit:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    /* Empty state */
    .agent-empty {
      padding: 24px 20px;
      text-align: center;
      font-family: var(--font-mono, monospace);
      font-size: 12px;
      color: var(--text-dim, #666);
    }
  `;
  document.head.appendChild(style);
}

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

function AgentIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: "var(--accent, #58a6ff)" }}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
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
    <div className="agent-section">
      <div className="agent-section-header" onClick={() => setOpen((o) => !o)}>
        <span className="agent-section-label">
          <span className={`agent-section-chevron ${open ? "agent-section-chevron--open" : ""}`}>
            {"\u25B8"}
          </span>
          {label}
          <span className="agent-section-count">{count}</span>
        </span>
        {actions && (
          <span onClick={(e) => e.stopPropagation()}>
            {actions}
          </span>
        )}
      </div>
      <div
        className={`agent-section-content ${!open ? "agent-section-content--collapsed" : ""}`}
        style={open ? { maxHeight: "9999px" } : undefined}
      >
        {children}
      </div>
    </div>
  );
}

function AgentCard({
  agent,
  now,
  onKill,
}: {
  agent: Agent;
  now: number;
  onKill?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasMessages = agent.messages && agent.messages.length > 0;
  const isActive = agent.status === "running" || agent.status === "idle";

  return (
    <div className="agent-card">
      <div className="agent-card-top">
        <span
          className={`agent-card-status ${agent.status === "running" ? "agent-card-status--running" : ""}`}
          style={{ backgroundColor: STATUS_COLORS[agent.status] }}
        />
        <span className="agent-card-name">{agent.name}</span>
        <span className="agent-card-model">{agent.model.split("-").slice(0, 2).join("-")}</span>
      </div>

      <div className="agent-card-desc">{agent.description}</div>

      {agent.progress != null && (
        <div className="agent-card-progress-track">
          <div
            className={`agent-card-progress-fill ${agent.status === "running" ? "agent-card-progress-fill--running" : ""}`}
            style={{
              width: `${Math.min(100, Math.max(0, agent.progress))}%`,
              backgroundColor:
                agent.status === "completed"
                  ? "#4ade80"
                  : agent.status === "failed"
                    ? "#f87171"
                    : "var(--accent, #58a6ff)",
            }}
          />
        </div>
      )}

      <div className="agent-card-meta">
        <span>{STATUS_ICONS[agent.status]} {agent.status}</span>
        <span className="agent-card-meta-sep">{"\u00B7"}</span>
        <span>{formatDuration(agent.startTime, now)}</span>
        <div className="agent-card-actions">
          {hasMessages && (
            <button
              className="agent-card-btn agent-card-btn--expand"
              onClick={() => setExpanded((e) => !e)}
            >
              {expanded ? "Hide" : "Msgs"}
            </button>
          )}
          {isActive && onKill && (
            <button
              className="agent-card-btn agent-card-btn--kill"
              onClick={() => onKill(agent.id)}
            >
              Kill
            </button>
          )}
        </div>
      </div>

      {expanded && hasMessages && (
        <div className="agent-card-messages">
          {agent.messages!.map((msg, i) => (
            <div key={i} className="agent-card-msg">
              <span className="agent-card-msg-type">[{msg.type}]</span>
              {msg.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TaskSection({
  tasks,
  onKillTask,
}: {
  tasks: Task[];
  onKillTask?: (id: string) => void;
}) {
  const completed = tasks.filter((t) => t.status === "completed").length;
  const total = tasks.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const allDone = completed === total && total > 0;

  return (
    <CollapsibleSection label="Tasks" count={total}>
      {total === 0 ? (
        <div className="agent-empty">No tasks defined</div>
      ) : (
        <>
          <div className="agent-task-progress">
            <div className="agent-task-progress-track">
              <div
                className={`agent-task-progress-fill ${allDone ? "agent-task-progress-fill--done" : ""}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          {tasks.map((task) => (
            <div key={task.id} className="agent-task-item">
              <span
                className={`agent-task-icon agent-task-icon--${task.status}`}
              >
                {TASK_ICONS[task.status] || TASK_ICONS.pending}
              </span>
              <span
                className={`agent-task-content ${task.status === "completed" ? "agent-task-content--completed" : ""}`}
              >
                {task.status === "in_progress" && task.activeForm
                  ? task.activeForm
                  : task.content}
              </span>
              {onKillTask && task.status === "in_progress" && (
                <button
                  className="agent-card-btn agent-card-btn--kill"
                  onClick={() => onKillTask(task.id)}
                  style={{ flexShrink: 0 }}
                >
                  Stop
                </button>
              )}
            </div>
          ))}
        </>
      )}
    </CollapsibleSection>
  );
}

function AgentCreationForm({
  onCreateAgent,
}: {
  onCreateAgent?: (description: string, model: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [desc, setDesc] = useState("");
  const [model, setModel] = useState(AVAILABLE_MODELS[0]);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (showForm) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [showForm]);

  const handleSubmit = useCallback(() => {
    const trimmed = desc.trim();
    if (!trimmed || !onCreateAgent) return;
    onCreateAgent(trimmed, model);
    setDesc("");
    setShowForm(false);
  }, [desc, model, onCreateAgent]);

  if (!onCreateAgent) return null;

  if (!showForm) {
    return (
      <div style={{ padding: "8px 12px 12px" }}>
        <button
          className="agent-create-submit"
          onClick={() => setShowForm(true)}
        >
          + New Agent
        </button>
      </div>
    );
  }

  return (
    <div className="agent-create-form">
      <div className="agent-create-row">
        <label className="agent-create-label">Description</label>
        <textarea
          ref={inputRef}
          className="agent-create-input"
          rows={3}
          placeholder="Describe the task for this agent..."
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSubmit();
            }
            if (e.key === "Escape") {
              setShowForm(false);
            }
          }}
          style={{ resize: "vertical" }}
        />
      </div>
      <div className="agent-create-row">
        <label className="agent-create-label">Model</label>
        <select
          className="agent-create-select"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        >
          {AVAILABLE_MODELS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="agent-create-submit"
          onClick={handleSubmit}
          disabled={!desc.trim()}
          style={{ flex: 1 }}
        >
          Launch Agent
        </button>
        <button
          className="agent-card-btn agent-card-btn--expand"
          onClick={() => setShowForm(false)}
          style={{ padding: "8px 14px" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────

function AgentPanel({
  isOpen,
  onClose,
  agents,
  tasks,
  onKillAgent,
  onKillAllAgents,
  onCreateAgent,
  onKillTask,
}: AgentPanelProps) {
  const [now, setNow] = useState(Date.now());
  const [closing, setClosing] = useState(false);
  const [killAllPending, setKillAllPending] = useState(false);
  const killAllTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Inject styles on mount
  useEffect(() => {
    ensureStyles();
  }, []);

  // Live timer tick
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Kill-all confirmation timeout
  useEffect(() => {
    if (killAllPending) {
      killAllTimerRef.current = setTimeout(() => {
        setKillAllPending(false);
      }, 3000);
      return () => {
        if (killAllTimerRef.current) clearTimeout(killAllTimerRef.current);
      };
    }
  }, [killAllPending]);

  // Reset state when closing
  useEffect(() => {
    if (!isOpen) {
      setKillAllPending(false);
    }
  }, [isOpen]);

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

  const handleKillAll = useCallback(() => {
    if (!killAllPending) {
      setKillAllPending(true);
    } else {
      onKillAllAgents?.();
      setKillAllPending(false);
      if (killAllTimerRef.current) clearTimeout(killAllTimerRef.current);
    }
  }, [killAllPending, onKillAllAgents]);

  if (!isOpen && !closing) return null;

  const runningAgents = agents.filter((a) => a.status === "running");
  const otherAgents = agents.filter((a) => a.status !== "running");
  const sortedAgents = [...runningAgents, ...otherAgents];
  const hasActiveAgents = agents.some(
    (a) => a.status === "running" || a.status === "idle"
  );

  return (
    <>
      {/* Overlay */}
      <div
        className={`agent-panel-overlay ${closing ? "agent-panel-overlay--closing" : ""}`}
        onClick={handleClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`agent-panel ${closing ? "agent-panel--closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Agent and Task Management"
      >
        {/* Header */}
        <div className="agent-panel-header">
          <span className="agent-panel-header-title">
            <AgentIcon />
            Agents &amp; Tasks
          </span>
          <button
            className="agent-panel-close-btn"
            onClick={handleClose}
            aria-label="Close panel"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div className="agent-panel-body">
          {/* Agents section */}
          <CollapsibleSection
            label="Agents"
            count={agents.length}
            actions={
              hasActiveAgents && onKillAllAgents ? (
                <button
                  className={`agent-kill-all-btn ${killAllPending ? "agent-kill-all-btn--confirm" : ""}`}
                  onClick={handleKillAll}
                  style={{
                    display: "inline",
                    width: "auto",
                    margin: 0,
                    padding: "2px 10px",
                    fontSize: "11px",
                  }}
                >
                  {killAllPending ? "Confirm?" : "Kill All"}
                </button>
              ) : undefined
            }
          >
            {agents.length === 0 ? (
              <div className="agent-empty">No active agents</div>
            ) : (
              sortedAgents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  now={now}
                  onKill={onKillAgent}
                />
              ))
            )}
            <AgentCreationForm onCreateAgent={onCreateAgent} />
          </CollapsibleSection>

          {/* Tasks section */}
          <TaskSection tasks={tasks} onKillTask={onKillTask} />

          {/* Background Tasks section */}
          <CollapsibleSection label="Background" count={runningAgents.length}>
            {runningAgents.length === 0 ? (
              <div className="agent-empty">No background tasks</div>
            ) : (
              runningAgents.map((agent) => (
                <div key={`bg-${agent.id}`} className="agent-card">
                  <div className="agent-card-top">
                    <span
                      className="agent-card-status agent-card-status--running"
                      style={{ backgroundColor: STATUS_COLORS.running }}
                    />
                    <span className="agent-card-name">{agent.name}</span>
                    <span className="agent-card-model">
                      {formatDuration(agent.startTime, now)}
                    </span>
                  </div>
                  <div className="agent-card-desc">{agent.description}</div>
                  {agent.messages && agent.messages.length > 0 && (
                    <div
                      className="agent-card-msg"
                      style={{
                        marginTop: 4,
                        opacity: 0.7,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {agent.messages[agent.messages.length - 1].text}
                    </div>
                  )}
                  <div className="agent-card-meta" style={{ marginTop: 8 }}>
                    <span>{"\u25CF"} running</span>
                    <div className="agent-card-actions">
                      {onKillAgent && (
                        <button
                          className="agent-card-btn agent-card-btn--kill"
                          onClick={() => onKillAgent(agent.id)}
                        >
                          Kill
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </CollapsibleSection>
        </div>
      </div>
    </>
  );
}

export default memo(AgentPanel);
