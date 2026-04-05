import { useState, useMemo, useEffect, useRef } from "react";
import type { UIMessage } from "../shell/AppShell";

interface ToolGroupProps {
  messages: UIMessage[];
}

function shortPath(p: string): string {
  return p.replace(/^\/Users\/[^/]+/, "~");
}

function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/** Format number like CLI — 1500 → "1.5k", 850 → "850" */
function formatNumber(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  if (k < 10) return `${k.toFixed(1)}k`;
  if (k < 1000) return `${Math.round(k)}k`;
  const m = k / 1000;
  return `${m.toFixed(1)}m`;
}

/** Format duration like CLI — 500 → "0.5s", 5000 → "5s", 90000 → "1m 30s" */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${(ms / 1000).toFixed(1)}s`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (rs === 0) return `${m}m`;
  return `${m}m ${rs}s`;
}

function parseInput(msg: UIMessage): Record<string, unknown> {
  try {
    return JSON.parse(msg.toolInput || msg.text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Canonical display name — matches CLI userFacingName */
function displayName(toolName: string): string {
  const MAP: Record<string, string> = {
    run_bash: "Bash", edit_file: "Edit", write_file: "Write",
    read_file: "Read", search_files: "Glob", search_content: "Grep",
    list_files: "Read", create_task: "TodoWrite", list_tasks: "TodoWrite",
    SleepTool: "Sleep",
    SyntheticOutputTool: "SyntheticOutput",
    McpAuthTool: "McpAuth",
    TeamTool: "TeamCreate", TeamCreate: "TeamCreate", TeamDelete: "TeamDelete",
    SwarmTool: "Swarm", SwarmDispatch: "Swarm",
  };
  return MAP[toolName] || toolName;
}

type ToolCat = "bash" | "edit" | "read" | "grep" | "glob" | "agent" | "sleep" | "synth" | "mcpauth" | "team" | "swarm" | "other";
function toolCategory(name: string): ToolCat {
  const n = displayName(name);
  if (n === "Bash") return "bash";
  if (n === "Edit" || n === "Write") return "edit";
  if (n === "Read") return "read";
  if (n === "Grep") return "grep";
  if (n === "Glob") return "glob";
  if (n === "Agent") return "agent";
  if (n === "Sleep") return "sleep";
  if (n === "SyntheticOutput") return "synth";
  if (n === "McpAuth") return "mcpauth";
  if (n === "TeamCreate" || n === "TeamDelete") return "team";
  if (n === "Swarm") return "swarm";
  return "other";
}

/** Whether a tool is collapsible (read/search/glob — like CLI's isSearchOrRead) */
function isCollapsible(cat: ToolCat): boolean {
  return cat === "read" || cat === "grep" || cat === "glob";
}

/** Summary text in parens after tool name — like CLI's renderToolUseMessage */
function toolSummary(toolName: string, use: UIMessage): string {
  const p = parseInput(use);
  const cat = toolCategory(toolName);
  if (cat === "bash") return `$ ${trunc(String(p.command || ""), 80)}`;
  if (cat === "edit" || cat === "read") return shortPath(String(p.file_path || p.path || ""));
  if (cat === "grep") {
    const pat = trunc(String(p.pattern || ""), 40);
    const dir = p.path ? ` in ${shortPath(String(p.path))}` : "";
    return `"${pat}"${dir}`;
  }
  if (cat === "glob") {
    const pat = trunc(String(p.pattern || ""), 40);
    const dir = p.path ? ` in ${shortPath(String(p.path))}` : "";
    return `"${pat}"${dir}`;
  }
  if (cat === "agent") {
    // CLI format: subagent_type(description) — e.g. "claude-code-guide(Explain how it works)"
    const desc = trunc(String(p.description || p.prompt || ""), 60);
    return desc;
  }
  if (cat === "sleep") {
    return `${trunc(String(p.duration || p.durationMs || ""), 20)}ms`;
  }
  if (cat === "synth") {
    const fmt = String(p.format || "text").toUpperCase();
    const title = p.title ? ` - ${trunc(String(p.title), 30)}` : "";
    return `${fmt}${title}`;
  }
  if (cat === "mcpauth") {
    const server = String(p.server || p.serverName || "");
    return server ? trunc(server, 40) : trunc(String(p.action || "authenticate"), 40);
  }
  if (cat === "team") {
    return trunc(String(p.teamName || p.name || "team"), 40);
  }
  if (cat === "swarm") {
    return trunc(String(p.action || "dispatch"), 40);
  }
  const val = p.command || p.file_path || p.path || p.pattern || p.query || p.description || "";
  return trunc(String(val || ""), 60);
}

/** Agent display name — CLI shows subagent_type(description) */
function agentDisplayName(use: UIMessage): string {
  const p = parseInput(use);
  const subagentType = String(p.subagent_type || "Agent");
  return subagentType;
}

/** Result text for ⎿ line */
function resultText(toolName: string, use: UIMessage, result: UIMessage): string {
  const p = parseInput(use);
  const cat = toolCategory(toolName);
  if (cat === "bash") {
    if (result.exitCode && result.exitCode !== 0) return `exit ${result.exitCode}`;
    const text = result.stdout || result.text || "";
    const lines = text.split("\n").filter((l) => l.trim()).length;
    return lines === 0 ? "(no output)" : `${lines} lines`;
  }
  if (cat === "read") {
    const lines = (result.text || "").split("\n").length;
    return `Read ${lines} ${lines === 1 ? "line" : "lines"}`;
  }
  if (cat === "edit") {
    if (result.diff) {
      let add = 0, del = 0;
      for (const ln of result.diff.split("\n")) {
        if (ln.startsWith("+") && !ln.startsWith("+++")) add++;
        if (ln.startsWith("-") && !ln.startsWith("---")) del++;
      }
      return `+${add}/-${del}`;
    }
    if (displayName(toolName) === "Write") {
      return `${String(p.content || "").split("\n").length} lines written`;
    }
    return "done";
  }
  if (cat === "grep") {
    if (result.matchCount !== undefined) return `Found ${result.matchCount} matches across ${result.fileCount || 0} files`;
    const count = (result.text || "").split("\n").filter((l) => l.trim()).length;
    return `Found ${count} ${count === 1 ? "result" : "results"}`;
  }
  if (cat === "glob") {
    const count = result.fileCount ?? (result.text || "").split("\n").filter((l) => l.trim()).length;
    return `Found ${count} ${count === 1 ? "file" : "files"}`;
  }
  if (cat === "agent") {
    // CLI format: "Done (X tool uses · Yk tokens · Zs)"
    const durationMs = result.durationMs || use.durationMs || 0;
    // Estimate tokens from result text length (chars / 4)
    const resultLen = (result.text || "").length;
    const estimatedTokens = Math.round(resultLen / 4);
    // Count tool uses mentioned in the result text (heuristic)
    const toolUseMatch = (result.text || "").match(/tool use/gi);
    const toolUseCount = toolUseMatch ? toolUseMatch.length : 0;
    const parts: string[] = [];
    parts.push(toolUseCount === 1 ? "1 tool use" : `${toolUseCount} tool uses`);
    if (estimatedTokens > 0) parts.push(`${formatNumber(estimatedTokens)} tokens`);
    if (durationMs > 0) parts.push(formatDuration(durationMs));
    return `Done (${parts.join(" · ")})`;
  }
  if (cat === "sleep") {
    let rp: Record<string, unknown> = {};
    try { rp = JSON.parse(result.text || "{}"); } catch { /* ok */ }
    const actual = rp.actual || rp.actualMs || rp.duration || rp.durationMs;
    const interrupted = rp.interrupted === true;
    if (actual) return `Slept ${formatDuration(Number(actual))}${interrupted ? " (interrupted)" : ""}`;
    return interrupted ? "Interrupted" : "done";
  }
  if (cat === "synth") {
    let rp: Record<string, unknown> = {};
    try { rp = JSON.parse(result.text || "{}"); } catch { /* ok */ }
    const fmt = String(rp.format || "text").toUpperCase();
    return fmt;
  }
  if (cat === "mcpauth") {
    let rp: Record<string, unknown> = {};
    try { rp = JSON.parse(result.text || "{}"); } catch { /* ok */ }
    const st = String(rp.status || "done");
    return st;
  }
  if (cat === "team") {
    return displayName(toolName) === "TeamDelete" ? "deleted" : "created";
  }
  if (cat === "swarm") {
    let rp: Record<string, unknown> = {};
    try { rp = JSON.parse(result.text || "{}"); } catch { /* ok */ }
    const completed = rp.completedTasks;
    const total = rp.totalTasks;
    if (typeof completed === "number" && typeof total === "number") return `${completed}/${total} tasks`;
    return "done";
  }
  if (result.isError) return "error";
  return "done";
}

/** Blinking dot — matches CLI ToolUseLoader */
function BlinkingDot() {
  const [visible, setVisible] = useState(true);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    ref.current = setInterval(() => setVisible((v) => !v), 500);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, []);
  return <span className="cc-dot cc-dot-pending">{visible ? "●" : "\u00A0"}</span>;
}

/** Ticking elapsed counter — starts from startMs, updates every second */
function ElapsedTimer({ startMs }: { startMs: number }) {
  const [elapsed, setElapsed] = useState(() => Math.max(0, Date.now() - startMs));
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    ref.current = setInterval(() => setElapsed(Date.now() - startMs), 1000);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [startMs]);
  return <span className="cc-elapsed">{formatDuration(elapsed)}</span>;
}

/** Try to extract a useful summary from partial (streaming) tool input JSON */
function partialSummary(toolName: string, partialJson: string): string {
  if (!partialJson) return "";
  const cat = toolCategory(toolName);
  // Extract a string value from partial JSON by field name
  const extract = (field: string): string => {
    const m = new RegExp(`"${field}"\\s*:\\s*"([^"]*)`).exec(partialJson);
    return m ? m[1] : "";
  };
  if (cat === "bash") {
    const cmd = extract("command");
    return cmd ? `$ ${trunc(cmd, 80)}` : "";
  }
  if (cat === "edit" || cat === "read") {
    const p = extract("file_path") || extract("path");
    return p ? shortPath(p) : "";
  }
  if (cat === "grep") {
    const p = extract("pattern");
    return p ? `"${trunc(p, 40)}"` : "";
  }
  if (cat === "glob") {
    const p = extract("pattern");
    return p ? `"${trunc(p, 40)}"` : "";
  }
  if (cat === "agent") {
    const d = extract("description") || extract("prompt");
    return d ? trunc(d, 60) : "";
  }
  if (cat === "sleep") {
    const d = extract("duration") || extract("durationMs");
    return d ? `${d}ms` : "";
  }
  if (cat === "synth") {
    const f = extract("format");
    return f ? f.toUpperCase() : "";
  }
  if (cat === "mcpauth") {
    const s = extract("server") || extract("serverName");
    return s ? trunc(s, 40) : "";
  }
  if (cat === "team") {
    const n = extract("teamName") || extract("name");
    return n ? trunc(n, 40) : "";
  }
  if (cat === "swarm") {
    const a = extract("action");
    return a ? trunc(a, 40) : "";
  }
  return "";
}

/* ── Types for grouped rendering ── */

type ToolPair = { use: UIMessage; result?: UIMessage };

/** A collapsed group of read/search/glob operations — like CLI CollapsedReadSearchGroup */
interface CollapsedGroup {
  type: "collapsed";
  pairs: ToolPair[];
  searchCount: number;
  readCount: number;
  globCount: number;
  isActive: boolean; // any still running
  latestHint?: string; // file path or pattern currently being processed
}

/** A single non-collapsible tool */
interface SingleTool {
  type: "single";
  pair: ToolPair;
}

type RenderItem = CollapsedGroup | SingleTool;

/** Build collapsed summary text — matches CLI CollapsedReadSearchContent */
function collapsedSummary(group: CollapsedGroup): string {
  const parts: string[] = [];
  const { searchCount, readCount, globCount, isActive } = group;

  if (searchCount > 0) {
    const verb = isActive ? "Searching for" : "Searched for";
    parts.push(`${verb} ${searchCount} ${searchCount === 1 ? "pattern" : "patterns"}`);
  }
  if (readCount > 0) {
    const verb = parts.length === 0
      ? (isActive ? "Reading" : "Read")
      : (isActive ? "reading" : "read");
    parts.push(`${verb} ${readCount} ${readCount === 1 ? "file" : "files"}`);
  }
  if (globCount > 0) {
    const verb = parts.length === 0
      ? (isActive ? "Listing" : "Listed")
      : (isActive ? "listing" : "listed");
    parts.push(`${verb} ${globCount} ${globCount === 1 ? "pattern" : "patterns"}`);
  }

  return parts.join(", ") + (isActive ? "…" : "");
}

export default function ToolGroup({ messages }: ToolGroupProps) {
  const [expanded, setExpanded] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Pair tool_use with tool_result
  const pairs = useMemo(() => {
    const result: ToolPair[] = [];
    const resultsByToolId = new Map<string, UIMessage>();
    for (const msg of messages) {
      if (msg.type === "tool_result" && msg.toolId) resultsByToolId.set(msg.toolId, msg);
    }
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.type === "tool_use") {
        const next = messages[i + 1];
        if (next?.type === "tool_result") { result.push({ use: msg, result: next }); i++; }
        else if (msg.toolId && resultsByToolId.has(msg.toolId)) result.push({ use: msg, result: resultsByToolId.get(msg.toolId)! });
        else result.push({ use: msg });
      }
    }
    return result;
  }, [messages]);

  // Group consecutive collapsible tools — like CLI collapseReadSearch
  const items = useMemo((): RenderItem[] => {
    const result: RenderItem[] = [];
    let i = 0;
    while (i < pairs.length) {
      const pair = pairs[i];
      const cat = toolCategory(pair.use.toolName || "");
      if (isCollapsible(cat)) {
        // Collect consecutive collapsible tools
        const group: ToolPair[] = [];
        let searchCount = 0, readCount = 0, globCount = 0;
        let isActive = false;
        let latestHint: string | undefined;
        while (i < pairs.length) {
          const p = pairs[i];
          const c = toolCategory(p.use.toolName || "");
          if (!isCollapsible(c)) break;
          group.push(p);
          if (c === "grep") { searchCount++; latestHint = toolSummary(p.use.toolName || "", p.use); }
          if (c === "read") { readCount++; latestHint = toolSummary(p.use.toolName || "", p.use); }
          if (c === "glob") { globCount++; latestHint = toolSummary(p.use.toolName || "", p.use); }
          if (!!p.use.isRunning && !p.result) isActive = true;
          i++;
        }
        // If only 1 collapsible tool, show it as single
        if (group.length === 1) {
          result.push({ type: "single", pair: group[0] });
        } else {
          result.push({ type: "collapsed", pairs: group, searchCount, readCount, globCount, isActive, latestHint });
        }
      } else {
        result.push({ type: "single", pair });
        i++;
      }
    }
    return result;
  }, [pairs]);

  if (items.length === 0) return null;

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="cc-tool-group">
      {items.map((item, idx) => {
        if (item.type === "collapsed") {
          // Collapsed read/search group — like CLI
          const key = item.pairs[0].use.id;
          return (
            <div key={key} className="cc-tool-entry">
              {/* Summary line with dot */}
              <div className="cc-tool-call" onClick={() => setExpanded(!expanded)} style={{ cursor: "pointer" }}>
                {item.isActive ? (
                  <BlinkingDot />
                ) : (
                  <span className="cc-dot cc-dot-ok">●</span>
                )}
                <span className="cc-collapsed-summary">{collapsedSummary(item)}</span>
              </div>
              {/* Active hint — shows current file/pattern under ⎿ */}
              {item.isActive && item.latestHint && (
                <div className="cc-tool-result">
                  <span className="cc-connector">{"  ⎿  "}</span>
                  <span className="cc-result-text">{item.latestHint}</span>
                </div>
              )}
              {/* Expanded: show individual tools */}
              {expanded && (
                <div className="cc-collapsed-expanded">
                  {item.pairs.map((pair) => (
                    <SingleToolLine key={pair.use.id} pair={pair} expandedIds={expandedIds} toggleExpand={toggleExpand} nested />
                  ))}
                </div>
              )}
              {/* "+N more tool uses" when collapsed */}
              {!expanded && item.pairs.length > 0 && (
                <div className="cc-tool-result" onClick={() => setExpanded(true)} style={{ cursor: "pointer" }}>
                  <span className="cc-connector">{"  ⎿  "}</span>
                  <span className="cc-more-hint">
                    +{item.pairs.length} tool {item.pairs.length === 1 ? "use" : "uses"} (click to expand)
                  </span>
                </div>
              )}
            </div>
          );
        }

        // Single non-collapsible tool
        return <SingleToolLine key={item.pair.use.id} pair={item.pair} expandedIds={expandedIds} toggleExpand={toggleExpand} />;
      })}
    </div>
  );
}

/** Renders a single tool call + result — used for both standalone and nested-in-collapsed */
function SingleToolLine({ pair, expandedIds, toggleExpand, nested }: {
  pair: ToolPair;
  expandedIds: Set<string>;
  toggleExpand: (id: string) => void;
  nested?: boolean;
}) {
  const { use, result } = pair;
  const toolName = use.toolName || "Tool";
  const cat = toolCategory(toolName);
  const hasResult = !!result;
  const isError = result?.isError;
  const isRunning = !!use.isRunning && !hasResult;
  const isExpanded = expandedIds.has(use.id);

  // Agent tools: CLI shows "subagent_type(description)" as the name
  const isAgent = cat === "agent";
  const name = isAgent ? agentDisplayName(use) : displayName(toolName);
  // While tool input is streaming in, try to show a partial summary; fall back to full summary
  const summary = useMemo(() => {
    const full = toolSummary(toolName, use);
    if (full) return full;
    if (isRunning && use.toolInput) return partialSummary(toolName, use.toolInput);
    return "";
  }, [toolName, use, isRunning]);

  // Expandable: bash, edit, AND agent results
  const expandable = (cat === "bash" || cat === "edit" || isAgent) && hasResult;

  return (
    <div className={`cc-tool-entry${nested ? " cc-nested" : ""}`}>
      {/* Tool call: ● ToolName(summary) or ● subagent_type(description) */}
      <div className="cc-tool-call">
        {isRunning ? (
          <BlinkingDot />
        ) : isError ? (
          <span className="cc-dot cc-dot-error">●</span>
        ) : (
          <span className="cc-dot cc-dot-ok">●</span>
        )}
        {isAgent ? (
          /* CLI format: claude-code-guide(Explain how Tensor Code works) */
          <>
            <span className="cc-tool-name">{name}</span>
            {summary && <span className="cc-tool-summary">({summary})</span>}
          </>
        ) : (
          <>
            <span className="cc-tool-name">{name}</span>
            {summary && <span className="cc-tool-summary">({summary})</span>}
          </>
        )}
      </div>

      {/* Result:   ⎿  text */}
      {hasResult && result && (
        <div
          className={`cc-tool-result${expandable ? " cc-tool-expandable" : ""}`}
          onClick={expandable ? () => toggleExpand(use.id) : undefined}
          style={expandable ? { cursor: "pointer" } : undefined}
        >
          <span className="cc-connector">{"  ⎿  "}</span>
          <span className={`cc-result-text${isError ? " cc-result-error" : ""}`}>
            {resultText(toolName, use, result)}
          </span>
        </div>
      )}

      {/* Agent: "(click to expand)" hint — like CLI's (ctrl+o to expand) */}
      {isAgent && hasResult && !isExpanded && (
        <div className="cc-tool-result" onClick={() => toggleExpand(use.id)} style={{ cursor: "pointer" }}>
          <span className="cc-connector">{"  "}</span>
          <span className="cc-more-hint">(click to expand)</span>
        </div>
      )}

      {/* Running: show live streaming output if available, otherwise elapsed timer */}
      {isRunning && (
        <>
          {use.text ? (
            <div className="cc-tool-result cc-tool-live-output">
              <span className="cc-connector">{"  ⎿  "}</span>
              <pre className="cc-live-pre">{use.text}<span className="cc-cursor" /></pre>
              {use.timestamp && (
                <span className="cc-elapsed-inline"> · <ElapsedTimer startMs={use.timestamp} /></span>
              )}
            </div>
          ) : (
            <div className="cc-tool-result">
              <span className="cc-connector">{"  ⎿  "}</span>
              <span className="cc-result-text cc-running-text">Running…</span>
              {use.timestamp && (
                <> <ElapsedTimer startMs={use.timestamp} /></>
              )}
            </div>
          )}
        </>
      )}

      {/* Expanded bash output */}
      {isExpanded && cat === "bash" && result && (
        <div className="cc-tool-expanded">
          <pre>{result.stdout || result.text}</pre>
        </div>
      )}

      {/* Expanded edit diff */}
      {isExpanded && cat === "edit" && result?.diff && (
        <div className="cc-tool-expanded">
          {result.diff.split("\n").map((line, i) => (
            <div key={i} className={
              line.startsWith("+") && !line.startsWith("+++") ? "cc-diff-add"
                : line.startsWith("-") && !line.startsWith("---") ? "cc-diff-del"
                : line.startsWith("@@") ? "cc-diff-hunk" : "cc-diff-ctx"
            }>{line}</div>
          ))}
        </div>
      )}

      {/* Expanded agent output — full response text */}
      {isExpanded && isAgent && result && (
        <div className="cc-tool-expanded">
          <pre>{result.text}</pre>
        </div>
      )}
    </div>
  );
}
