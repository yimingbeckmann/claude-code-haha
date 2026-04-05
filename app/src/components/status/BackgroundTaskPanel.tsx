import { useState, useEffect, useCallback, memo } from "react";
import TaskDetailView from "./TaskDetailView";

export interface BGTask {
  id: string;
  type: "pull" | "build" | "test" | "deploy" | "agent" | "custom";
  description: string;
  status: "running" | "completed" | "failed" | "cancelled";
  progress?: number; // 0-100
  startTime: number;
  endTime?: number;
  output?: string;
  error?: string;
}

interface BackgroundTaskPanelProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: BGTask[];
  onKillTask: (id: string) => void;
  onClearCompleted: () => void;
  onRetryTask?: (id: string) => void;
  onFetchOutput?: (taskId: string, offset: number, limit: number) => Promise<{ text: string; totalBytes: number }>;
}

const STYLES = `
.bgt-panel { position: fixed; bottom: 32px; right: 16px; width: 380px; max-height: 480px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 10px; z-index: 200; display: flex; flex-direction: column; font-family: var(--font-mono); box-shadow: 0 8px 32px rgba(0,0,0,0.4); animation: bgt-pop 0.2s ease-out; }
@keyframes bgt-pop { from { transform: translateY(10px) scale(0.97); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }
.bgt-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid var(--border); }
.bgt-title { font-size: 12px; font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 6px; }
.bgt-count { background: var(--accent, #e84520); color: #fff; font-size: 10px; padding: 1px 5px; border-radius: 8px; font-weight: 600; }
.bgt-actions { display: flex; gap: 4px; }
.bgt-btn { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 11px; padding: 2px 6px; border-radius: 3px; font-family: var(--font-mono); }
.bgt-btn:hover { color: var(--text-primary); background: var(--bg-hover); }
.bgt-close { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 16px; padding: 2px; }
.bgt-list { flex: 1; overflow-y: auto; padding: 6px; }
.bgt-list::-webkit-scrollbar { width: 4px; }
.bgt-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
.bgt-task { padding: 8px 10px; border-radius: 6px; margin-bottom: 4px; border: 1px solid var(--border); background: var(--bg-secondary); transition: border-color 0.15s; }
.bgt-task:hover { border-color: var(--text-muted); }
.bgt-task-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.bgt-task-type { font-size: 10px; text-transform: uppercase; font-weight: 600; padding: 1px 4px; border-radius: 2px; }
.bgt-task-type.pull { color: #a855f7; background: rgba(168, 85, 247, 0.1); }
.bgt-task-type.build { color: #3b82f6; background: rgba(59, 130, 246, 0.1); }
.bgt-task-type.test { color: #22c55e; background: rgba(34, 197, 94, 0.1); }
.bgt-task-type.deploy { color: #f97316; background: rgba(249, 115, 22, 0.1); }
.bgt-task-type.agent { color: var(--accent, #e84520); background: rgba(232, 69, 32, 0.1); }
.bgt-task-type.custom { color: var(--text-secondary); background: var(--bg-tertiary); }
.bgt-task-desc { font-size: 12px; color: var(--text-primary); margin-bottom: 4px; }
.bgt-task-meta { display: flex; align-items: center; gap: 8px; font-size: 10px; color: var(--text-muted); }
.bgt-progress-bar { flex: 1; height: 3px; background: var(--bg-tertiary); border-radius: 2px; overflow: hidden; }
.bgt-progress-fill { height: 100%; border-radius: 2px; transition: width 0.3s ease; }
.bgt-progress-fill.running { background: var(--accent, #e84520); }
.bgt-progress-fill.completed { background: var(--success, #22c55e); }
.bgt-progress-fill.failed { background: var(--error, #ef4444); }
.bgt-task-btn { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 10px; padding: 1px 4px; border-radius: 2px; font-family: var(--font-mono); }
.bgt-task-btn:hover { color: var(--text-primary); }
.bgt-task-btn.kill:hover { color: var(--error); }
.bgt-task-btn.view { color: var(--accent, #e84520); }
.bgt-task-btn.view:hover { color: var(--text-primary); }
.bgt-empty { text-align: center; padding: 30px; color: var(--text-muted); font-size: 12px; }
.bgt-notification { position: fixed; bottom: 40px; right: 16px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; padding: 10px 14px; font-family: var(--font-mono); font-size: 12px; color: var(--text-primary); z-index: 300; box-shadow: 0 4px 16px rgba(0,0,0,0.3); animation: bgt-notif-in 0.3s ease-out; display: flex; align-items: center; gap: 8px; }
@keyframes bgt-notif-in { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
.bgt-notif-icon { font-size: 16px; }
.bgt-notif-text { flex: 1; }
.bgt-notif-dismiss { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 14px; }
`;

function formatElapsed(start: number, end?: number): string {
  const ms = (end || Date.now()) - start;
  if (ms < 1000) return "just now";
  if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m`;
  return `${Math.floor(ms / 3600000)}h`;
}

function BackgroundTaskPanel({
  isOpen,
  onClose,
  tasks,
  onKillTask,
  onClearCompleted,
  onRetryTask,
  onFetchOutput,
}: BackgroundTaskPanelProps) {
  const [notifications, setNotifications] = useState<BGTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [, setTick] = useState(0);

  // Tick for elapsed time updates
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Show notification when task completes
  useEffect(() => {
    const completed = tasks.filter(t =>
      (t.status === "completed" || t.status === "failed") &&
      t.endTime && Date.now() - t.endTime < 3000
    );
    if (completed.length > 0) {
      setNotifications(completed);
      const timer = setTimeout(() => setNotifications([]), 4000);
      return () => clearTimeout(timer);
    }
  }, [tasks]);

  const runningCount = tasks.filter(t => t.status === "running").length;
  const selectedTask = selectedTaskId ? tasks.find(t => t.id === selectedTaskId) : null;

  const handleBackFromDetail = useCallback(() => setSelectedTaskId(null), []);

  // Clear selection if the selected task no longer exists
  useEffect(() => {
    if (selectedTaskId && !tasks.find(t => t.id === selectedTaskId)) {
      setSelectedTaskId(null);
    }
  }, [tasks, selectedTaskId]);

  if (!isOpen) {
    // Show floating notifications even when panel is closed
    return (
      <>
        <style>{STYLES}</style>
        {notifications.map(n => (
          <div key={n.id} className="bgt-notification">
            <span className="bgt-notif-icon">{n.status === "completed" ? "✓" : "✗"}</span>
            <span className="bgt-notif-text">
              {n.description} — {n.status === "completed" ? "Done" : "Failed"}
            </span>
            <button className="bgt-notif-dismiss" onClick={() => setNotifications([])}>×</button>
          </div>
        ))}
      </>
    );
  }

  return (
    <>
      <style>{STYLES}</style>
      {selectedTask && (
        <TaskDetailView
          task={selectedTask}
          onBack={handleBackFromDetail}
          onKillTask={onKillTask}
          onRetryTask={onRetryTask}
          onFetchOutput={onFetchOutput}
        />
      )}
      <div className="bgt-panel">
        <div className="bgt-header">
          <span className="bgt-title">
            Background Tasks
            {runningCount > 0 && <span className="bgt-count">{runningCount}</span>}
          </span>
          <div className="bgt-actions">
            <button className="bgt-btn" onClick={onClearCompleted}>Clear done</button>
            <button className="bgt-close" onClick={onClose}>×</button>
          </div>
        </div>
        <div className="bgt-list">
          {tasks.length === 0 ? (
            <div className="bgt-empty">No background tasks</div>
          ) : (
            tasks.map(task => (
              <div className="bgt-task" key={task.id}>
                <div className="bgt-task-top">
                  <span className={`bgt-task-type ${task.type}`}>{task.type}</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button className="bgt-task-btn view" onClick={() => setSelectedTaskId(task.id)}>View</button>
                    {task.status === "running" && (
                      <button className="bgt-task-btn kill" onClick={() => onKillTask(task.id)}>Kill</button>
                    )}
                    {task.status === "failed" && onRetryTask && (
                      <button className="bgt-task-btn" onClick={() => onRetryTask(task.id)}>Retry</button>
                    )}
                  </div>
                </div>
                <div className="bgt-task-desc">{task.description}</div>
                <div className="bgt-task-meta">
                  <span>{formatElapsed(task.startTime, task.endTime)}</span>
                  {task.progress != null && (
                    <div className="bgt-progress-bar">
                      <div
                        className={`bgt-progress-fill ${task.status}`}
                        style={{ width: `${task.progress}%` }}
                      />
                    </div>
                  )}
                  <span>
                    {task.status === "running" && task.progress != null
                      ? `${Math.round(task.progress)}%`
                      : task.status
                    }
                  </span>
                </div>
                {task.error && (
                  <div style={{ fontSize: 10, color: "var(--error)", marginTop: 4 }}>{task.error}</div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

export default memo(BackgroundTaskPanel);
