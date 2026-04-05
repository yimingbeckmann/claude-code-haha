import { useState, useEffect, useCallback, useRef, type CSSProperties } from "react";

export interface BackgroundTask {
  id: string;
  name: string;
  status: "running" | "completed";
  startedAt: number;
  tokens?: number;
}

interface BackgroundTaskBadgeProps {
  tasks: BackgroundTask[];
  onKillTask: (taskId: string) => void;
  onKillAll: () => void;
}

const FADE_DELAY = 5000;
const KILL_ALL_CONFIRM_TIMEOUT = 3000;

function formatDuration(startedAt: number, now: number): string {
  const seconds = Math.floor((now - startedAt) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remaining}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

const pulseKeyframes = `
@keyframes bgTaskPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
`;

function BackgroundTaskBadge({ tasks, onKillTask, onKillAll }: BackgroundTaskBadgeProps) {
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [killAllPending, setKillAllPending] = useState(false);
  const [fadingTasks, setFadingTasks] = useState<Set<string>>(new Set());
  const killAllTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const dropdownRef = useRef<HTMLDivElement>(null);

  const runningTasks = tasks.filter((t) => t.status === "running");
  const completedTasks = tasks.filter((t) => t.status === "completed");
  const visibleTasks = [
    ...runningTasks,
    ...completedTasks.filter((t) => !fadingTasks.has(t.id)),
  ];

  // Live timer tick
  useEffect(() => {
    if (runningTasks.length === 0 && !expanded) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [runningTasks.length, expanded]);

  // Fade completed tasks after 5s
  useEffect(() => {
    for (const task of completedTasks) {
      if (!fadeTimersRef.current.has(task.id) && !fadingTasks.has(task.id)) {
        const timer = setTimeout(() => {
          setFadingTasks((prev) => new Set(prev).add(task.id));
          fadeTimersRef.current.delete(task.id);
        }, FADE_DELAY);
        fadeTimersRef.current.set(task.id, timer);
      }
    }
    return () => {
      // Cleanup timers for tasks that no longer exist
      for (const [id, timer] of fadeTimersRef.current) {
        if (!tasks.find((t) => t.id === id)) {
          clearTimeout(timer);
          fadeTimersRef.current.delete(id);
        }
      }
    };
  }, [completedTasks, fadingTasks, tasks]);

  // Reset kill-all confirmation after timeout
  useEffect(() => {
    if (killAllPending) {
      killAllTimerRef.current = setTimeout(() => {
        setKillAllPending(false);
      }, KILL_ALL_CONFIRM_TIMEOUT);
      return () => {
        if (killAllTimerRef.current) clearTimeout(killAllTimerRef.current);
      };
    }
  }, [killAllPending]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!expanded) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setExpanded(false);
        setKillAllPending(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [expanded]);

  const handleKillAll = useCallback(() => {
    if (!killAllPending) {
      setKillAllPending(true);
    } else {
      onKillAll();
      setKillAllPending(false);
      if (killAllTimerRef.current) clearTimeout(killAllTimerRef.current);
    }
  }, [killAllPending, onKillAll]);

  const runningCount = runningTasks.length;

  if (runningCount === 0 && visibleTasks.length === 0) return null;

  const hasRunning = runningCount > 0;

  const badgeStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "4px 12px",
    borderRadius: "9999px",
    backgroundColor: "#FFC107",
    color: "#1a1a1a",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    userSelect: "none",
    position: "relative",
    animation: hasRunning ? "bgTaskPulse 2s ease-in-out infinite" : "none",
    transition: "opacity 0.3s ease",
  };

  const containerStyle: CSSProperties = {
    position: "relative",
    display: "inline-block",
  };

  const dropdownStyle: CSSProperties = {
    position: "absolute",
    top: "calc(100% + 6px)",
    right: 0,
    minWidth: "320px",
    backgroundColor: "#1e1e1e",
    border: "1px solid #333",
    borderRadius: "8px",
    boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
    zIndex: 1000,
    overflow: "hidden",
  };

  const taskRowStyle = (isCompleted: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 14px",
    borderBottom: "1px solid #2a2a2a",
    opacity: isCompleted ? 0.5 : 1,
    transition: "opacity 0.5s ease",
  });

  const taskNameStyle: CSSProperties = {
    color: "#e0e0e0",
    fontSize: "13px",
    fontWeight: 500,
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  const metaStyle: CSSProperties = {
    color: "#888",
    fontSize: "11px",
    marginLeft: "8px",
    whiteSpace: "nowrap",
  };

  const killBtnStyle: CSSProperties = {
    marginLeft: "8px",
    padding: "2px 8px",
    borderRadius: "4px",
    border: "1px solid #555",
    backgroundColor: "transparent",
    color: "#f97316",
    fontSize: "11px",
    cursor: "pointer",
    flexShrink: 0,
    transition: "background-color 0.15s ease",
  };

  const killAllBtnStyle: CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    border: "none",
    backgroundColor: killAllPending ? "#dc2626" : "transparent",
    color: killAllPending ? "#fff" : "#f59e0b",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "center",
    transition: "background-color 0.2s ease, color 0.2s ease",
  };

  const dotStyle: CSSProperties = {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    backgroundColor: "#1a1a1a",
    flexShrink: 0,
  };

  return (
    <>
      <style>{pulseKeyframes}</style>
      <div style={containerStyle} ref={dropdownRef}>
        <div
          style={badgeStyle}
          onClick={() => {
            setExpanded((prev) => !prev);
            setKillAllPending(false);
          }}
          role="button"
          tabIndex={0}
          aria-label={`${runningCount} background task${runningCount !== 1 ? "s" : ""} running`}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setExpanded((prev) => !prev);
            }
          }}
        >
          {hasRunning && <span style={dotStyle} />}
          <span>{runningCount}</span>
        </div>

        {expanded && visibleTasks.length > 0 && (
          <div style={dropdownStyle}>
            <div style={{ maxHeight: "300px", overflowY: "auto" }}>
              {visibleTasks.map((task) => {
                const isCompleted = task.status === "completed";
                return (
                  <div key={task.id} style={taskRowStyle(isCompleted)}>
                    <span
                      style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        backgroundColor: isCompleted ? "#4ade80" : "#FFC107",
                        flexShrink: 0,
                        marginRight: "10px",
                      }}
                    />
                    <span style={taskNameStyle}>{task.name}</span>
                    <span style={metaStyle}>
                      {formatDuration(task.startedAt, now)}
                    </span>
                    {task.tokens != null && (
                      <span style={metaStyle}>
                        {task.tokens.toLocaleString()} tok
                      </span>
                    )}
                    {!isCompleted && (
                      <button
                        style={killBtnStyle}
                        onClick={(e) => {
                          e.stopPropagation();
                          onKillTask(task.id);
                        }}
                        onMouseEnter={(e) => {
                          (e.target as HTMLButtonElement).style.backgroundColor = "rgba(249,115,22,0.15)";
                        }}
                        onMouseLeave={(e) => {
                          (e.target as HTMLButtonElement).style.backgroundColor = "transparent";
                        }}
                        aria-label={`Kill task ${task.name}`}
                      >
                        Kill
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {runningCount > 0 && (
              <button
                style={killAllBtnStyle}
                onClick={(e) => {
                  e.stopPropagation();
                  handleKillAll();
                }}
                onMouseEnter={(e) => {
                  if (!killAllPending) {
                    (e.target as HTMLButtonElement).style.backgroundColor = "rgba(245,158,11,0.1)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!killAllPending) {
                    (e.target as HTMLButtonElement).style.backgroundColor = "transparent";
                  }
                }}
              >
                {killAllPending ? "Press again to confirm" : "Kill All"}
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export default BackgroundTaskBadge;
