import { useState, useEffect, useRef, memo } from "react";

interface StreamingToolOutputProps {
  toolName: string;
  command?: string;
  output: string;
  isRunning: boolean;
  exitCode?: number;
  durationMs?: number;
  onKill?: () => void;
}

const STYLES = `
.sto-wrap { margin: 4px 0; border-radius: 6px; overflow: hidden; border: 1px solid var(--border); background: var(--bg-secondary); font-family: var(--font-mono); font-size: 12px; }
.sto-header { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: var(--bg-tertiary); border-bottom: 1px solid var(--border); }
.sto-tool-badge { display: inline-flex; align-items: center; gap: 4px; padding: 1px 6px; border-radius: 3px; font-size: 11px; font-weight: 600; color: #fff; }
.sto-tool-badge.bash { background: var(--tool-bash, #22c55e); }
.sto-tool-badge.read { background: var(--tool-read, #06b6d4); }
.sto-tool-badge.write { background: var(--tool-write, #a855f7); }
.sto-tool-badge.edit { background: var(--tool-edit, #3b82f6); }
.sto-tool-badge.grep { background: var(--tool-grep, #14b8a6); }
.sto-tool-badge.glob { background: var(--tool-glob, #eab308); }
.sto-tool-badge.agent { background: var(--tool-agent, #f97316); }
.sto-tool-badge.default { background: var(--accent, #e84520); }
.sto-cmd { flex: 1; color: var(--text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sto-status { font-size: 10px; color: var(--text-muted); display: flex; align-items: center; gap: 4px; }
.sto-status.running { color: var(--accent, #e84520); }
.sto-status.success { color: var(--success, #22c55e); }
.sto-status.error { color: var(--error, #ef4444); }
.sto-kill { background: none; border: 1px solid var(--border); color: var(--text-dim); border-radius: 3px; padding: 1px 6px; font-size: 10px; cursor: pointer; font-family: var(--font-mono); }
.sto-kill:hover { color: var(--error); border-color: var(--error); }
.sto-output { max-height: 300px; overflow-y: auto; padding: 8px 10px; white-space: pre-wrap; word-break: break-all; color: var(--text-secondary); line-height: 1.5; }
.sto-output::-webkit-scrollbar { width: 4px; }
.sto-output::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
.sto-cursor { display: inline-block; width: 6px; height: 13px; background: var(--accent, #e84520); animation: sto-blink 0.8s step-end infinite; vertical-align: text-bottom; margin-left: 1px; }
@keyframes sto-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
.sto-empty { color: var(--text-muted); font-style: italic; }
.sto-duration { font-size: 10px; color: var(--text-muted); margin-left: auto; }
.sto-live-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent, #e84520); animation: sto-pulse 1.2s ease-in-out infinite; }
@keyframes sto-pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
`;

function getToolClass(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("bash") || n.includes("run")) return "bash";
  if (n.includes("read")) return "read";
  if (n.includes("write")) return "write";
  if (n.includes("edit")) return "edit";
  if (n.includes("grep") || n.includes("search")) return "grep";
  if (n.includes("glob") || n.includes("find")) return "glob";
  if (n.includes("agent")) return "agent";
  return "default";
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function StreamingToolOutput({
  toolName,
  command,
  output,
  isRunning,
  exitCode,
  durationMs,
  onKill,
}: StreamingToolOutputProps) {
  const outputRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    if (autoScroll && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output, autoScroll]);

  // Detect manual scroll to disable auto-scroll
  const handleScroll = () => {
    if (!outputRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = outputRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 40);
  };

  const toolClass = getToolClass(toolName);
  const statusClass = isRunning ? "running" : exitCode === 0 ? "success" : exitCode != null ? "error" : "success";

  return (
    <>
      <style>{STYLES}</style>
      <div className="sto-wrap">
        <div className="sto-header">
          <span className={`sto-tool-badge ${toolClass}`}>{toolName}</span>
          {command && <span className="sto-cmd">{command}</span>}
          <span className={`sto-status ${statusClass}`}>
            {isRunning && <span className="sto-live-dot" />}
            {isRunning
              ? "Running"
              : exitCode != null
                ? exitCode === 0 ? "Done" : `Exit ${exitCode}`
                : "Done"
            }
          </span>
          {durationMs != null && <span className="sto-duration">{formatDuration(durationMs)}</span>}
          {isRunning && onKill && (
            <button className="sto-kill" onClick={onKill} title="Kill process">
              Kill
            </button>
          )}
        </div>
        <div className="sto-output" ref={outputRef} onScroll={handleScroll}>
          {output ? (
            <>
              {output}
              {isRunning && <span className="sto-cursor" />}
            </>
          ) : (
            <span className="sto-empty">
              {isRunning ? "Waiting for output..." : "No output"}
            </span>
          )}
        </div>
      </div>
    </>
  );
}

export default memo(StreamingToolOutput);
