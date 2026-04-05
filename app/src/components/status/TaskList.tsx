import { memo, useState, useEffect, useCallback } from "react";

export interface TaskItem {
  id: string;
  description: string;
  status: "pending" | "in_progress" | "completed";
  activeForm?: string;
}

const STATUS_ICONS: Record<string, string> = {
  pending: "☐",
  in_progress: "◐",
  completed: "☑",
};

function TaskList({ tasks }: { tasks: TaskItem[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const [visible, setVisible] = useState(false);

  const completed = tasks.filter((t) => t.status === "completed").length;
  const total = tasks.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const allDone = pct === 100;

  // Animate in on mount
  useEffect(() => {
    if (tasks.length > 0) {
      requestAnimationFrame(() => setVisible(true));
    }
  }, [tasks.length]);

  // Ctrl+T toggle
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "t") {
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    },
    []
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (total === 0) return null;

  return (
    <div className={`task-panel ${visible ? "task-panel--visible" : ""}`}>
      {/* Header */}
      <div className="task-panel-header" onClick={() => setCollapsed((c) => !c)}>
        <span className="task-panel-title">
          /todo
          <span className="task-panel-count">
            ({completed} of {total})
          </span>
        </span>
        <div className="task-panel-right">
          <span className="task-panel-hint">Ctrl+T</span>
          <span className={`task-panel-chevron ${collapsed ? "" : "task-panel-chevron--open"}`}>
            ▸
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="task-progress-track">
        <div
          className={`task-progress-fill ${allDone ? "task-progress-fill--done" : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Task items */}
      <div className={`task-panel-body ${collapsed ? "task-panel-body--collapsed" : ""}`}>
        {tasks.map((task) => (
          <div
            key={task.id}
            className={`task-item ${task.status === "in_progress" ? "task-item--active" : ""}`}
          >
            <span className={`task-icon ${task.status}`}>
              {task.status === "in_progress" ? (
                <span className="task-icon-spin">{STATUS_ICONS.in_progress}</span>
              ) : (
                STATUS_ICONS[task.status] || "☐"
              )}
            </span>
            <span className={`task-text ${task.status}`}>
              {task.status === "in_progress" && task.activeForm
                ? task.activeForm
                : task.description}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(TaskList);
