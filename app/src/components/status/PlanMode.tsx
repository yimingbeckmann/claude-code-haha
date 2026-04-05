import { useState, useCallback, useMemo } from "react";

// ── Types ───────────────────────────────────────────────────
interface PlanStep {
  id: string;
  description: string;
  status: "pending" | "in-progress" | "done" | "skipped";
  subSteps?: PlanStep[];
}
interface PlanData {
  title: string;
  steps: PlanStep[];
}
interface PlanModeProps {
  isActive: boolean;
  plan: PlanData | null;
  onExecute: () => void;
  onEdit: (plan: PlanData) => void;
  onExit: () => void;
  onStepAction: (stepId: string, action: "run" | "skip") => void;
}

// ── Constants ───────────────────────────────────────────────
const TEAL = "#48968C";
const GREEN = "#22c55e";
const AMBER = "#f59e0b";
const RED = "#ef4444";
const MUTED = "#71717a";

const STATUS_CFG: Record<PlanStep["status"], { icon: string; color: string; label: string }> = {
  pending:       { icon: "\u25CB", color: MUTED,  label: "Pending" },
  "in-progress": { icon: "\u25D0", color: AMBER,  label: "Running" },
  done:          { icon: "\u25CF", color: GREEN,   label: "Done" },
  skipped:       { icon: "\u2212", color: MUTED,   label: "Skipped" },
};

// ── Helpers ─────────────────────────────────────────────────
function flattenSteps(steps: PlanStep[]): PlanStep[] {
  const out: PlanStep[] = [];
  for (const s of steps) { out.push(s); if (s.subSteps) out.push(...flattenSteps(s.subSteps)); }
  return out;
}
function computeProgress(steps: PlanStep[]) {
  const all = flattenSteps(steps);
  const countable = all.filter((s) => s.status !== "skipped");
  const done = countable.filter((s) => s.status === "done").length;
  const total = countable.length;
  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}
function hasRunning(steps: PlanStep[]): boolean {
  return flattenSteps(steps).some((s) => s.status === "in-progress" || s.status === "done");
}
function hasPending(steps: PlanStep[]): boolean {
  return flattenSteps(steps).some((s) => s.status === "pending");
}

// ── Styles ──────────────────────────────────────────────────
const STYLES = `
.plan-panel { font-family: var(--font-mono, ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace); font-size: 13px; color: var(--text-primary, #e4e4e7); }
.plan-banner {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 12px; background: ${TEAL}; color: #fff; border-radius: 4px; margin-bottom: 8px;
}
.plan-banner-left { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 13px; }
.plan-banner-hint { font-size: 11px; opacity: 0.85; font-weight: 400; }
.plan-title-section { display: flex; align-items: center; gap: 10px; padding: 4px 0 8px; }
.plan-title { font-size: 14px; font-weight: 600; color: var(--text-primary, #e4e4e7); flex: 1; }
.plan-title-input {
  flex: 1; padding: 4px 8px; background: var(--bg-tertiary, #1a1a1e);
  border: 1px solid var(--border, #333); border-radius: 4px;
  color: var(--text-primary, #e4e4e7); font-family: inherit; font-size: 14px; font-weight: 600; outline: none;
}
.plan-title-input:focus { border-color: ${TEAL}; }
.plan-progress-bar { height: 4px; background: var(--bg-tertiary, #333); border-radius: 2px; overflow: hidden; margin-bottom: 4px; }
.plan-progress-fill { height: 100%; border-radius: 2px; transition: width 0.3s ease; }
.plan-progress-text { display: flex; justify-content: space-between; font-size: 10px; color: ${MUTED}; margin-bottom: 10px; }
.plan-step-card {
  border: 1px solid var(--border, #333); border-radius: 6px; padding: 8px 12px;
  margin-bottom: 6px; background: var(--bg-secondary, #1a1a1e); transition: border-color 0.15s;
}
.plan-step-card[data-status="in-progress"] { border-color: ${AMBER}; }
.plan-step-card[data-status="done"] { border-color: ${GREEN}; opacity: 0.8; }
.plan-step-card[data-status="skipped"] { opacity: 0.5; }
.plan-step-header { display: flex; align-items: center; gap: 8px; }
.plan-step-status { font-size: 14px; flex-shrink: 0; width: 18px; text-align: center; }
.plan-step-number {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 50%; background: ${TEAL};
  color: #fff; font-size: 11px; font-weight: 700; flex-shrink: 0;
}
.plan-step-desc { flex: 1; font-size: 13px; font-weight: 500; color: var(--text-primary, #e4e4e7); line-height: 1.4; }
.plan-step-desc[data-done="true"] { text-decoration: line-through; opacity: 0.7; }
.plan-step-actions { display: flex; gap: 4px; flex-shrink: 0; }
.plan-step-action-btn {
  padding: 2px 8px; border: 1px solid var(--border, #333); border-radius: 3px;
  background: transparent; color: var(--text-secondary, #a1a1aa);
  font-family: inherit; font-size: 10px; font-weight: 500; cursor: pointer;
  transition: background 0.1s, color 0.1s, border-color 0.1s;
}
.plan-step-action-btn:hover { background: var(--bg-hover, #ffffff08); color: var(--text-primary, #e4e4e7); border-color: var(--border-hover, #555); }
.plan-step-action-btn[data-variant="run"]:hover { border-color: ${GREEN}; color: ${GREEN}; }
.plan-step-action-btn[data-variant="skip"]:hover { border-color: ${MUTED}; color: ${MUTED}; }
.plan-step-desc-input {
  flex: 1; padding: 2px 6px; background: var(--bg-tertiary, #1a1a1e);
  border: 1px solid var(--border, #333); border-radius: 3px;
  color: var(--text-primary, #e4e4e7); font-family: inherit; font-size: 13px; outline: none;
}
.plan-step-desc-input:focus { border-color: ${TEAL}; }
.plan-substeps { margin-left: 30px; padding-left: 12px; border-left: 1px solid var(--border, #333); margin-top: 6px; }
.plan-substep-item { display: flex; align-items: center; gap: 6px; padding: 3px 0; font-size: 12px; }
.plan-substep-status { font-size: 11px; flex-shrink: 0; width: 14px; text-align: center; }
.plan-substep-desc { color: var(--text-secondary, #a1a1aa); flex: 1; }
.plan-substep-desc[data-done="true"] { text-decoration: line-through; opacity: 0.7; }
.plan-substep-actions { display: flex; gap: 4px; }
.plan-controls { display: flex; gap: 8px; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border, #333); }
.plan-btn {
  padding: 5px 14px; border: none; border-radius: 4px; color: #fff;
  font-weight: 600; font-size: 12px; font-family: inherit; cursor: pointer;
  transition: opacity 0.15s, filter 0.15s;
}
.plan-btn:hover { filter: brightness(1.1); }
.plan-btn:disabled { opacity: 0.4; cursor: not-allowed; filter: none; }
.plan-btn-execute { background: ${GREEN}; }
.plan-btn-edit    { background: #555; }
.plan-btn-exit    { background: ${RED}; }
.plan-empty { padding: 20px 12px; text-align: center; color: ${MUTED}; font-size: 12px; }
.plan-empty-title { font-size: 14px; font-weight: 600; color: var(--text-secondary, #a1a1aa); margin-bottom: 6px; }
`;

// ── Sub-components ──────────────────────────────────────────
function SubStepRow({ sub, editing, onAction }: {
  sub: PlanStep; editing: boolean; onAction: (id: string, action: "run" | "skip") => void;
}) {
  const cfg = STATUS_CFG[sub.status];
  const crossed = sub.status === "done" || sub.status === "skipped";
  return (
    <div className="plan-substep-item">
      <span className="plan-substep-status" style={{ color: cfg.color }} title={cfg.label}>{cfg.icon}</span>
      <span className="plan-substep-desc" data-done={crossed}>{sub.description}</span>
      {!editing && sub.status === "pending" && (
        <div className="plan-substep-actions">
          <button type="button" className="plan-step-action-btn" data-variant="run"
            onClick={() => onAction(sub.id, "run")} title="Run this sub-step">Run</button>
          <button type="button" className="plan-step-action-btn" data-variant="skip"
            onClick={() => onAction(sub.id, "skip")} title="Skip this sub-step">Skip</button>
        </div>
      )}
    </div>
  );
}

function StepCard({ step, index, editing, editedDesc, onEditDesc, onAction }: {
  step: PlanStep; index: number; editing: boolean; editedDesc: string;
  onEditDesc: (v: string) => void; onAction: (id: string, action: "run" | "skip") => void;
}) {
  const cfg = STATUS_CFG[step.status];
  const crossed = step.status === "done" || step.status === "skipped";
  return (
    <div className="plan-step-card" data-status={step.status}>
      <div className="plan-step-header">
        <span className="plan-step-status" style={{ color: cfg.color }} title={cfg.label}>{cfg.icon}</span>
        <span className="plan-step-number"
          style={{ background: step.status === "done" ? GREEN : step.status === "skipped" ? MUTED : TEAL }}>
          {index + 1}
        </span>
        {editing ? (
          <input type="text" className="plan-step-desc-input" value={editedDesc}
            onChange={(e) => onEditDesc(e.target.value)} spellCheck={false} />
        ) : (
          <span className="plan-step-desc" data-done={crossed}>{step.description}</span>
        )}
        {!editing && step.status === "pending" && (
          <div className="plan-step-actions">
            <button type="button" className="plan-step-action-btn" data-variant="run"
              onClick={() => onAction(step.id, "run")} title="Run this step">Run</button>
            <button type="button" className="plan-step-action-btn" data-variant="skip"
              onClick={() => onAction(step.id, "skip")} title="Skip this step">Skip</button>
          </div>
        )}
        {step.status === "in-progress" && (
          <span style={{ fontSize: 10, color: AMBER, fontWeight: 500, flexShrink: 0 }}>running...</span>
        )}
      </div>
      {step.subSteps && step.subSteps.length > 0 && (
        <div className="plan-substeps">
          {step.subSteps.map((sub) => (
            <SubStepRow key={sub.id} sub={sub} editing={editing} onAction={onAction} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────
export default function PlanMode({ isActive, plan, onExecute, onEdit, onExit, onStepAction }: PlanModeProps) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescs, setEditDescs] = useState<Record<string, string>>({});

  const progress = useMemo(() => plan ? computeProgress(plan.steps) : { done: 0, total: 0, pct: 0 }, [plan]);
  const executing = useMemo(() => plan ? hasRunning(plan.steps) : false, [plan]);
  const executable = useMemo(() => plan ? hasPending(plan.steps) : false, [plan]);

  const handleStartEdit = useCallback(() => {
    if (!plan) return;
    setEditTitle(plan.title);
    const descs: Record<string, string> = {};
    for (const s of flattenSteps(plan.steps)) descs[s.id] = s.description;
    setEditDescs(descs);
    setEditing(true);
  }, [plan]);

  const handleSaveEdit = useCallback(() => {
    if (!plan) return;
    function apply(steps: PlanStep[]): PlanStep[] {
      return steps.map((s) => ({
        ...s, description: editDescs[s.id] ?? s.description,
        subSteps: s.subSteps ? apply(s.subSteps) : undefined,
      }));
    }
    onEdit({ title: editTitle, steps: apply(plan.steps) });
    setEditing(false);
  }, [plan, editTitle, editDescs, onEdit]);

  const handleEditDesc = useCallback((id: string, v: string) => {
    setEditDescs((prev) => ({ ...prev, [id]: v }));
  }, []);

  const progressColor = progress.pct === 100 ? GREEN : executing ? AMBER : TEAL;

  if (!isActive) return null;

  return (
    <>
      <style>{STYLES}</style>
      <div className="plan-panel">
        {/* Banner */}
        <div className="plan-banner">
          <span className="plan-banner-left">
            <span>{"\u2630"} plan mode</span>
            {executing && <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.9 }}>-- executing</span>}
          </span>
          <span className="plan-banner-hint">Shift+Tab to cycle modes</span>
        </div>

        {/* Empty state */}
        {!plan && (
          <div className="plan-empty">
            <div className="plan-empty-title">No plan yet</div>
            <div>Describe your task and the assistant will create a structured plan.</div>
          </div>
        )}

        {/* Plan content */}
        {plan && (
          <>
            {/* Title */}
            <div className="plan-title-section">
              {editing ? (
                <input type="text" className="plan-title-input" value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)} spellCheck={false} autoFocus />
              ) : (
                <span className="plan-title">{plan.title}</span>
              )}
            </div>

            {/* Progress */}
            <div className="plan-progress-bar">
              <div className="plan-progress-fill" style={{ width: `${progress.pct}%`, backgroundColor: progressColor }} />
            </div>
            <div className="plan-progress-text">
              <span>{progress.done} of {progress.total} steps complete</span>
              <span>{progress.pct}%</span>
            </div>

            {/* Steps */}
            {plan.steps.map((step, idx) => (
              <StepCard key={step.id} step={step} index={idx} editing={editing}
                editedDesc={editDescs[step.id] ?? step.description}
                onEditDesc={(v) => handleEditDesc(step.id, v)} onAction={onStepAction} />
            ))}

            {/* Controls */}
            <div className="plan-controls">
              {editing ? (
                <>
                  <button type="button" className="plan-btn plan-btn-execute" onClick={handleSaveEdit}>Save Changes</button>
                  <button type="button" className="plan-btn plan-btn-edit" onClick={() => setEditing(false)}>Cancel</button>
                </>
              ) : (
                <>
                  <button type="button" className="plan-btn plan-btn-execute" onClick={onExecute}
                    disabled={!executable || executing}>{executing ? "Executing..." : "Execute Plan"}</button>
                  <button type="button" className="plan-btn plan-btn-edit" onClick={handleStartEdit}
                    disabled={executing}>Edit Plan</button>
                  <button type="button" className="plan-btn plan-btn-exit" onClick={onExit}>Exit Plan Mode</button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

export type { PlanModeProps, PlanData, PlanStep };
