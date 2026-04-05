import { useState, useEffect, useRef, useCallback, memo } from "react";
import "./AgentTeamView.css";

export interface ToolCall {
  id: string;
  name: string;
  status: "running" | "completed" | "failed";
  duration?: number;
}

export interface AgentNode {
  id: string;
  type: string;
  description: string;
  status: "running" | "completed" | "failed";
  tokens: number;
  duration: number;
  toolCalls?: ToolCall[];
  children?: AgentNode[];
}

export interface TeamMember {
  id: string;
  agentId: string;
  role: string;
  description: string;
  status: "active" | "idle" | "completed";
  currentTask?: string;
}

export interface ScratchpadEntry {
  id: string;
  author: string;
  content: string;
  timestamp: number;
}

interface AgentTeamViewProps {
  agents: AgentNode[];
  totalCost: number;
  viewMode: "tree" | "list";
  onToggleView: () => void;
  teamName?: string;
  teamId?: string;
  createdAt?: number;
  members?: TeamMember[];
  scratchpad?: ScratchpadEntry[];
  onAddMember?: (role: string, description: string) => void;
  onRemoveMember?: (memberId: string) => void;
  onDeleteTeam?: () => void;
  onSendMessage?: (message: string) => void;
  onWriteScratchpad?: (content: string) => void;
  onRefreshScratchpad?: () => void;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.floor(s % 60);
  return `${m}m ${rem}s`;
}

function formatTokens(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function formatElapsed(startMs: number): string {
  const elapsed = Date.now() - startMs;
  if (elapsed < 1000) return "just now";
  const s = Math.floor(elapsed / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}m ${rem}s`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return `${h}h ${remM}m`;
}

function countAgents(agents: AgentNode[]): number {
  return agents.reduce(
    (sum, a) => sum + 1 + (a.children ? countAgents(a.children) : 0),
    0,
  );
}

function sumTokens(agents: AgentNode[]): number {
  return agents.reduce(
    (sum, a) => sum + a.tokens + (a.children ? sumTokens(a.children) : 0),
    0,
  );
}

const STATUS_ICON: Record<string, string> = {
  running: "\u25CB",
  completed: "\u2713",
  failed: "\u2717",
};

const MEMBER_STATUS_ICON: Record<string, string> = {
  active: "\u25CF",
  idle: "\u25CB",
  completed: "\u2713",
};

/* ---- ToolCall row ---- */

function ToolCallRow({ tool }: { tool: ToolCall }) {
  return (
    <div className={`atv-tool-call atv-tool-call--${tool.status}`}>
      <span className="atv-tool-icon">
        {tool.status === "running" ? "\u25AA" : tool.status === "completed" ? "\u2713" : "\u2717"}
      </span>
      <span className="atv-tool-name">{tool.name}</span>
      {tool.duration !== undefined && (
        <span className="atv-tool-duration">{formatDuration(tool.duration)}</span>
      )}
    </div>
  );
}

/* ---- Single agent node ---- */

interface AgentNodeCardProps {
  agent: AgentNode;
  depth: number;
  isTree: boolean;
}

function AgentNodeCard({ agent, depth, isTree }: AgentNodeCardProps) {
  const [expanded, setExpanded] = useState(false);
  const nodeRef = useRef<HTMLDivElement>(null);

  // Auto-scroll running agent into view
  useEffect(() => {
    if (agent.status === "running" && nodeRef.current) {
      nodeRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [agent.status]);

  const hasTools = agent.toolCalls && agent.toolCalls.length > 0;

  return (
    <div
      className={`atv-node-wrapper ${isTree ? "atv-node-wrapper--tree" : ""}`}
      style={isTree ? { "--depth": depth } as React.CSSProperties : undefined}
    >
      {/* Connector line (tree mode, non-root) */}
      {isTree && depth > 0 && <div className="atv-connector" />}

      <div
        ref={nodeRef}
        className={`atv-node atv-node--${agent.status} ${hasTools ? "atv-node--clickable" : ""}`}
        onClick={hasTools ? () => setExpanded((e) => !e) : undefined}
        role={hasTools ? "button" : undefined}
        tabIndex={hasTools ? 0 : undefined}
        onKeyDown={
          hasTools
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setExpanded((prev) => !prev);
                }
              }
            : undefined
        }
      >
        <div className="atv-node-header">
          <span className={`atv-status-icon atv-status-icon--${agent.status}`}>
            {STATUS_ICON[agent.status]}
          </span>
          <span className="atv-node-type">{agent.type}</span>
          {hasTools && (
            <span className="atv-expand-hint">{expanded ? "\u25BE" : "\u25B8"}</span>
          )}
        </div>

        <div className="atv-node-desc">{agent.description}</div>

        <div className="atv-node-meta">
          <span className="atv-meta-item">{formatTokens(agent.tokens)} tok</span>
          <span className="atv-meta-sep">{"\u00B7"}</span>
          <span className="atv-meta-item">{formatDuration(agent.duration)}</span>
        </div>
      </div>

      {/* Expanded tool calls */}
      {expanded && hasTools && (
        <div className="atv-tool-list">
          {agent.toolCalls!.map((tc) => (
            <ToolCallRow key={tc.id} tool={tc} />
          ))}
        </div>
      )}

      {/* Children (tree mode only) */}
      {isTree && agent.children && agent.children.length > 0 && (
        <div className="atv-children">
          {agent.children.map((child) => (
            <AgentNodeCard key={child.id} agent={child} depth={depth + 1} isTree />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---- Flatten tree for list view ---- */

function flattenAgents(agents: AgentNode[]): AgentNode[] {
  const result: AgentNode[] = [];
  function walk(nodes: AgentNode[]) {
    for (const n of nodes) {
      result.push(n);
      if (n.children) walk(n.children);
    }
  }
  walk(agents);
  return result;
}

/* ---- Team member card ---- */

interface MemberCardProps {
  member: TeamMember;
  onRemove?: (id: string) => void;
}

function MemberCard({ member, onRemove }: MemberCardProps) {
  return (
    <div className={`atv-member atv-member--${member.status}`}>
      <div className="atv-member-header">
        <span className={`atv-member-status atv-member-status--${member.status}`}>
          {MEMBER_STATUS_ICON[member.status]}
        </span>
        <span className="atv-member-role">{member.role}</span>
        {onRemove && (
          <button
            className="atv-member-remove"
            onClick={() => onRemove(member.id)}
            type="button"
            title="Remove member"
          >
            {"\u00D7"}
          </button>
        )}
      </div>
      <div className="atv-member-desc">{member.description}</div>
      <div className="atv-member-meta">
        <span className="atv-member-agent-id" title={member.agentId}>
          {member.agentId.length > 12 ? member.agentId.slice(0, 12) + "..." : member.agentId}
        </span>
        {member.currentTask && (
          <>
            <span className="atv-meta-sep">{"\u00B7"}</span>
            <span className="atv-member-task" title={member.currentTask}>
              {member.currentTask}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/* ---- Scratchpad viewer ---- */

interface ScratchpadViewerProps {
  entries: ScratchpadEntry[];
  onWrite?: (content: string) => void;
  onRefresh?: () => void;
}

function ScratchpadViewer({ entries, onWrite, onRefresh }: ScratchpadViewerProps) {
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [entries.length]);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    if (!onRefresh) return;
    const id = setInterval(onRefresh, 5000);
    return () => clearInterval(id);
  }, [onRefresh]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = input.trim();
      if (trimmed && onWrite) {
        onWrite(trimmed);
        setInput("");
      }
    },
    [input, onWrite],
  );

  return (
    <div className="atv-scratchpad">
      <div className="atv-scratchpad-header">
        <span className="atv-scratchpad-title">Shared Scratchpad</span>
        {onRefresh && (
          <button className="atv-scratchpad-refresh" onClick={onRefresh} type="button" title="Refresh">
            {"\u21BB"}
          </button>
        )}
      </div>
      <div className="atv-scratchpad-list" ref={listRef}>
        {entries.length === 0 ? (
          <div className="atv-scratchpad-empty">No entries yet</div>
        ) : (
          entries.map((entry) => (
            <div className="atv-scratchpad-entry" key={entry.id}>
              <div className="atv-scratchpad-entry-header">
                <span className="atv-scratchpad-author">{entry.author}</span>
                <span className="atv-scratchpad-time">{formatTimestamp(entry.timestamp)}</span>
              </div>
              <div className="atv-scratchpad-content">{entry.content}</div>
            </div>
          ))
        )}
      </div>
      {onWrite && (
        <form className="atv-scratchpad-form" onSubmit={handleSubmit}>
          <input
            className="atv-scratchpad-input"
            type="text"
            placeholder="Write to scratchpad..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button className="atv-scratchpad-send" type="submit" disabled={!input.trim()}>
            {"\u23CE"}
          </button>
        </form>
      )}
    </div>
  );
}

/* ---- Add member form ---- */

interface AddMemberFormProps {
  onAdd: (role: string, description: string) => void;
  onCancel: () => void;
}

function AddMemberForm({ onAdd, onCancel }: AddMemberFormProps) {
  const [role, setRole] = useState("");
  const [desc, setDesc] = useState("");
  const roleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    roleRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimRole = role.trim();
      const trimDesc = desc.trim();
      if (trimRole && trimDesc) {
        onAdd(trimRole, trimDesc);
      }
    },
    [role, desc, onAdd],
  );

  return (
    <form className="atv-add-member-form" onSubmit={handleSubmit}>
      <input
        ref={roleRef}
        className="atv-add-member-input"
        type="text"
        placeholder="Role (e.g. Researcher)"
        value={role}
        onChange={(e) => setRole(e.target.value)}
      />
      <input
        className="atv-add-member-input"
        type="text"
        placeholder="Description"
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
      />
      <div className="atv-add-member-actions">
        <button className="atv-btn atv-btn--primary" type="submit" disabled={!role.trim() || !desc.trim()}>
          Add
        </button>
        <button className="atv-btn atv-btn--ghost" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ---- Team stats bar ---- */

interface TeamStatsProps {
  members: TeamMember[];
  createdAt?: number;
}

function TeamStats({ members, createdAt }: TeamStatsProps) {
  const [, setTick] = useState(0);

  // Tick every second to update elapsed time
  useEffect(() => {
    if (!createdAt) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [createdAt]);

  const active = members.filter((m) => m.status === "active").length;
  const completed = members.filter((m) => m.status === "completed").length;

  return (
    <div className="atv-stats">
      <div className="atv-stat">
        <span className="atv-stat-value atv-stat-value--active">{active}</span>
        <span className="atv-stat-label">Active</span>
      </div>
      <div className="atv-stat">
        <span className="atv-stat-value atv-stat-value--completed">{completed}</span>
        <span className="atv-stat-label">Completed</span>
      </div>
      <div className="atv-stat">
        <span className="atv-stat-value">{members.length}</span>
        <span className="atv-stat-label">Total</span>
      </div>
      {createdAt && (
        <div className="atv-stat">
          <span className="atv-stat-value atv-stat-value--elapsed">{formatElapsed(createdAt)}</span>
          <span className="atv-stat-label">Elapsed</span>
        </div>
      )}
    </div>
  );
}

/* ---- Main component ---- */

function AgentTeamView({
  agents,
  totalCost,
  viewMode,
  onToggleView,
  teamName,
  teamId,
  createdAt,
  members = [],
  scratchpad = [],
  onAddMember,
  onRemoveMember,
  onDeleteTeam,
  onSendMessage,
  onWriteScratchpad,
  onRefreshScratchpad,
}: AgentTeamViewProps) {
  const totalAgents = countAgents(agents);
  const totalTokens = sumTokens(agents);

  const [showAddMember, setShowAddMember] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [activeTab, setActiveTab] = useState<"agents" | "members" | "scratchpad">("agents");

  const handleToggle = useCallback(() => {
    onToggleView();
  }, [onToggleView]);

  const handleAddMember = useCallback(
    (role: string, description: string) => {
      onAddMember?.(role, description);
      setShowAddMember(false);
    },
    [onAddMember],
  );

  const handleDeleteTeam = useCallback(() => {
    onDeleteTeam?.();
    setShowDeleteConfirm(false);
  }, [onDeleteTeam]);

  const handleSendMessage = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = messageInput.trim();
      if (trimmed && onSendMessage) {
        onSendMessage(trimmed);
        setMessageInput("");
      }
    },
    [messageInput, onSendMessage],
  );

  const flat = viewMode === "list" ? flattenAgents(agents) : null;

  return (
    <div className="atv-root">
      {/* Team header */}
      <div className="atv-team-header">
        <div className="atv-team-title-row">
          <span className="atv-team-name">{teamName || "Agent Team"}</span>
          {teamId && <span className="atv-team-id">{teamId}</span>}
        </div>
        <div className="atv-summary">
          <span className="atv-summary-count">
            {members.length} member{members.length !== 1 ? "s" : ""}
          </span>
          <span className="atv-summary-sep">{"\u00B7"}</span>
          <span className="atv-summary-count">
            {totalAgents} agent{totalAgents !== 1 ? "s" : ""}
          </span>
          <span className="atv-summary-sep">{"\u00B7"}</span>
          <span className="atv-summary-tokens">{formatTokens(totalTokens)} tokens</span>
          <span className="atv-summary-sep">{"\u00B7"}</span>
          <span className="atv-summary-cost">${totalCost.toFixed(4)}</span>
          {createdAt && (
            <>
              <span className="atv-summary-sep">{"\u00B7"}</span>
              <span className="atv-summary-time">
                Created {formatTimestamp(createdAt)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Team stats */}
      {members.length > 0 && <TeamStats members={members} createdAt={createdAt} />}

      {/* Tabs */}
      <div className="atv-tabs">
        <button
          className={`atv-tab ${activeTab === "agents" ? "atv-tab--active" : ""}`}
          onClick={() => setActiveTab("agents")}
          type="button"
        >
          Agents
        </button>
        <button
          className={`atv-tab ${activeTab === "members" ? "atv-tab--active" : ""}`}
          onClick={() => setActiveTab("members")}
          type="button"
        >
          Members{members.length > 0 ? ` (${members.length})` : ""}
        </button>
        <button
          className={`atv-tab ${activeTab === "scratchpad" ? "atv-tab--active" : ""}`}
          onClick={() => setActiveTab("scratchpad")}
          type="button"
        >
          Scratchpad{scratchpad.length > 0 ? ` (${scratchpad.length})` : ""}
        </button>
        <div className="atv-tab-spacer" />
        {activeTab === "agents" && (
          <button className="atv-toggle-btn" onClick={handleToggle} type="button">
            {viewMode === "tree" ? "List" : "Tree"}
          </button>
        )}
      </div>

      {/* Tab content */}
      <div className="atv-body">
        {/* Agents tab */}
        {activeTab === "agents" && (
          viewMode === "tree" ? (
            agents.map((agent) => (
              <AgentNodeCard key={agent.id} agent={agent} depth={0} isTree />
            ))
          ) : (
            flat!.map((agent) => (
              <AgentNodeCard key={agent.id} agent={agent} depth={0} isTree={false} />
            ))
          )
        )}

        {/* Members tab */}
        {activeTab === "members" && (
          <div className="atv-members-tab">
            {members.length === 0 ? (
              <div className="atv-empty">No team members</div>
            ) : (
              members.map((member) => (
                <MemberCard
                  key={member.id}
                  member={member}
                  onRemove={onRemoveMember}
                />
              ))
            )}
            {showAddMember ? (
              <AddMemberForm
                onAdd={handleAddMember}
                onCancel={() => setShowAddMember(false)}
              />
            ) : (
              onAddMember && (
                <button
                  className="atv-btn atv-btn--primary atv-btn--full"
                  onClick={() => setShowAddMember(true)}
                  type="button"
                >
                  + Add Member
                </button>
              )
            )}
          </div>
        )}

        {/* Scratchpad tab */}
        {activeTab === "scratchpad" && (
          <ScratchpadViewer
            entries={scratchpad}
            onWrite={onWriteScratchpad}
            onRefresh={onRefreshScratchpad}
          />
        )}
      </div>

      {/* Team controls footer */}
      <div className="atv-controls">
        {onSendMessage && (
          <form className="atv-message-form" onSubmit={handleSendMessage}>
            <input
              className="atv-message-input"
              type="text"
              placeholder="Send message to team..."
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
            />
            <button className="atv-btn atv-btn--primary" type="submit" disabled={!messageInput.trim()}>
              Send
            </button>
          </form>
        )}
        {onDeleteTeam && (
          <div className="atv-delete-section">
            {showDeleteConfirm ? (
              <div className="atv-delete-confirm">
                <span className="atv-delete-confirm-text">Delete this team?</span>
                <button className="atv-btn atv-btn--danger" onClick={handleDeleteTeam} type="button">
                  Confirm
                </button>
                <button
                  className="atv-btn atv-btn--ghost"
                  onClick={() => setShowDeleteConfirm(false)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="atv-btn atv-btn--danger-outline"
                onClick={() => setShowDeleteConfirm(true)}
                type="button"
              >
                Delete Team
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(AgentTeamView);
