import { useState, useRef, useEffect } from "react";

interface ToolUseMessageProps {
  toolName: string;
  input: string;
  timestamp?: number;
  status?: "queued" | "running" | "done" | "error";
  durationMs?: number;
}

const TOOL_COLORS: Record<string, string> = {
  Bash: "var(--tool-bash)", run_bash: "var(--tool-bash)",
  Edit: "var(--tool-edit)", edit_file: "var(--tool-edit)", FileEditTool: "var(--tool-edit)",
  Write: "var(--tool-write)", write_file: "var(--tool-write)", FileWriteTool: "var(--tool-write)",
  Read: "var(--tool-read)", read_file: "var(--tool-read)", FileReadTool: "var(--tool-read)",
  Glob: "var(--tool-glob)", GlobTool: "var(--tool-glob)", search_files: "var(--tool-glob)",
  Grep: "var(--tool-grep)", GrepTool: "var(--tool-grep)", search_content: "var(--tool-grep)",
  list_files: "var(--tool-read)",
  WebFetch: "var(--tool-web)", WebFetchTool: "var(--tool-web)",
  WebSearch: "var(--tool-web)", WebSearchTool: "var(--tool-web)",
  Agent: "var(--tool-agent)", AgentTool: "var(--tool-agent)", AskUserQuestion: "var(--tool-agent)",
  TodoWrite: "var(--tool-todo)", create_task: "var(--tool-todo)", list_tasks: "var(--tool-todo)",
  git_status: "var(--tool-read)", git_diff: "var(--tool-read)", git_commit: "var(--tool-edit)",
  Skill: "var(--tool-agent)", ToolSearch: "var(--tool-grep)",
  Sleep: "var(--tool-default)", SleepTool: "var(--tool-default)",
  SyntheticOutput: "var(--tool-read)", SyntheticOutputTool: "var(--tool-read)",
  McpAuth: "var(--tool-web)", McpAuthTool: "var(--tool-web)",
  TeamCreate: "var(--tool-agent)", TeamDelete: "var(--tool-agent)", TeamTool: "var(--tool-agent)",
  Swarm: "var(--tool-agent)", SwarmTool: "var(--tool-agent)", SwarmDispatch: "var(--tool-agent)",
};

function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "\u2026" : s;
}

function shortPath(p: string): string {
  return p.replace(/^\/Users\/[^/]+/, "~");
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`;
}

function getSummary(toolName: string, input: string): string {
  let p: Record<string, unknown> = {};
  try { p = JSON.parse(input); } catch { return input.slice(0, 80); }

  if (toolName === "Bash" || toolName === "run_bash") {
    return `$ ${trunc(String(p.command || ""), 80)}`;
  }
  if (toolName === "Read" || toolName === "read_file" || toolName === "FileReadTool") {
    return shortPath(String(p.file_path || p.path || ""));
  }
  if (toolName === "Edit" || toolName === "edit_file" || toolName === "FileEditTool") {
    return shortPath(String(p.file_path || p.path || ""));
  }
  if (toolName === "Write" || toolName === "write_file" || toolName === "FileWriteTool") {
    return shortPath(String(p.file_path || p.path || ""));
  }
  if (toolName === "Glob" || toolName === "GlobTool" || toolName === "search_files") {
    const pat = String(p.pattern || "");
    const dir = p.path ? ` in ${shortPath(String(p.path))}` : "";
    return `${pat}${dir}`;
  }
  if (toolName === "Grep" || toolName === "GrepTool" || toolName === "search_content") {
    const pat = String(p.pattern || "");
    const dir = p.path ? ` in ${shortPath(String(p.path))}` : "";
    return `${pat}${dir}`;
  }
  if (toolName === "Agent" || toolName === "AgentTool") {
    return trunc(String(p.description || p.prompt || "sub-task"), 70);
  }
  if (toolName === "WebFetch" || toolName === "WebFetchTool") {
    return trunc(String(p.url || ""), 70);
  }
  if (toolName === "WebSearch" || toolName === "WebSearchTool") {
    return trunc(String(p.query || p.search_query || ""), 70);
  }
  if (toolName === "TodoWrite") return "Updating tasks";
  if (toolName === "Sleep" || toolName === "SleepTool") {
    return `${trunc(String(p.duration || p.durationMs || ""), 20)}ms`;
  }
  if (toolName === "SyntheticOutput" || toolName === "SyntheticOutputTool") {
    const fmt = String(p.format || "text");
    const title = p.title ? ` - ${trunc(String(p.title), 40)}` : "";
    return `${fmt.toUpperCase()}${title}`;
  }
  if (toolName === "McpAuth" || toolName === "McpAuthTool") {
    const act = String(p.action || "authenticate");
    const server = String(p.server || p.serverName || "");
    return `${act} ${server}`;
  }
  if (toolName === "TeamCreate") {
    return trunc(String(p.teamName || p.name || "team"), 40);
  }
  if (toolName === "TeamDelete") {
    return `delete ${trunc(String(p.teamName || p.name || "team"), 40)}`;
  }
  if (toolName === "Swarm" || toolName === "SwarmTool" || toolName === "SwarmDispatch") {
    const act = String(p.action || "dispatch");
    return trunc(act, 40);
  }
  if (toolName.startsWith("mcp__")) {
    const parts = toolName.split("__");
    return parts.length >= 3 ? `${parts[1]}: ${parts.slice(2).join(" ")}` : toolName;
  }
  const val = p.command || p.file_path || p.path || p.pattern || p.query || p.description || "";
  return trunc(String(val || toolName), 70);
}

export default function ToolUseMessage({ toolName, input, timestamp: _ts, status = "done", durationMs }: ToolUseMessageProps) {
  const [expanded, setExpanded] = useState(false);
  const startRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  const color = TOOL_COLORS[toolName] || "var(--tool-default, var(--text-dim))";
  const shortName = toolName.replace(/Tool$/, "").replace(/_/g, " ");
  const summary = getSummary(toolName, input);

  useEffect(() => {
    if (status !== "running") return;
    startRef.current = Date.now();
    const t = setInterval(() => setElapsed(Date.now() - startRef.current), 200);
    return () => clearInterval(t);
  }, [status]);

  const dur = durationMs || (status !== "running" && elapsed > 100 ? elapsed : 0);

  const statusIcon = status === "running"
    ? <span className="tool-item-spinner" />
    : status === "error"
      ? <span style={{ color: "var(--error)" }}>{"\u2717"}</span>
      : <span style={{ color: "var(--success, #98c379)" }}>{"\u2713"}</span>;

  return (
    <div
      className={`tool-item-compact${status === "running" ? " tool-running-glow" : ""}`}
      style={{ borderLeftColor: color }}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Status indicator */}
      <span className="tool-item-dot" style={{ color }}>
        {statusIcon}
      </span>

      {/* Tool name badge */}
      <span className="tool-item-name" style={{ background: color + "18", color, borderColor: color + "30" }}>
        {shortName}
      </span>

      {/* One-line summary */}
      <span className="tool-item-summary">{summary}</span>

      {/* Duration on the right */}
      {dur > 0 && <span className="tool-item-dur">{fmtDuration(dur)}</span>}

      {/* Expand caret */}
      <span className="tool-item-caret">{expanded ? "\u25BE" : "\u25B8"}</span>

      {/* Expanded: tool input JSON */}
      {expanded && (
        <div className="tool-item-detail" onClick={(e) => e.stopPropagation()}>
          <pre>{(() => {
            try { return JSON.stringify(JSON.parse(input), null, 2); }
            catch { return input; }
          })()}</pre>
        </div>
      )}
    </div>
  );
}
