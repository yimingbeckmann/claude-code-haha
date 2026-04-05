interface PlanStep {
  text: string;
  status: "pending" | "in_progress" | "done";
  substeps?: Array<{ text: string; status: string }>;
}

interface PlanMessageProps {
  title: string;
  steps: PlanStep[];
  isActive?: boolean;
}

const STEP_ICONS: Record<string, { icon: string; color: string }> = {
  pending:     { icon: "\u25CB", color: "var(--text-muted)" },
  in_progress: { icon: "\u25CF", color: "var(--accent)" },
  done:        { icon: "\u2713", color: "var(--success)" },
};

export default function PlanMessage({ title, steps, isActive = false }: PlanMessageProps) {
  return (
    <>
      <style>{`
        .plan-msg {
          padding: 12px 14px;
          margin: 4px 0;
          border-left: 3px solid var(--accent);
          background: var(--bg-secondary);
          border-radius: 0 6px 6px 0;
          font-size: 13px;
          line-height: 1.6;
        }
        .plan-msg--active {
          border-left-color: var(--accent-bright, var(--accent));
        }
        .plan-msg-title {
          font-weight: 600;
          color: var(--text-primary);
          font-size: 13px;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .plan-msg-title-icon {
          color: var(--accent);
          font-size: 14px;
        }
        .plan-msg-steps {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .plan-msg-step {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 3px 0;
        }
        .plan-msg-step-icon {
          flex-shrink: 0;
          font-size: 12px;
          margin-top: 2px;
          width: 14px;
          text-align: center;
        }
        .plan-msg-step-text {
          color: var(--text-primary);
        }
        .plan-msg-step--done .plan-msg-step-text {
          color: var(--text-secondary);
          text-decoration: line-through;
          text-decoration-color: var(--text-muted);
        }
        .plan-msg-substeps {
          list-style: none;
          padding: 0;
          margin: 2px 0 2px 22px;
        }
        .plan-msg-substep {
          display: flex;
          align-items: flex-start;
          gap: 6px;
          padding: 2px 0;
          font-size: 12px;
        }
        .plan-msg-substep-icon {
          flex-shrink: 0;
          font-size: 10px;
          margin-top: 3px;
          width: 12px;
          text-align: center;
        }
        .plan-msg-substep-text {
          color: var(--text-secondary);
        }
        @keyframes plan-step-pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        .plan-msg-step--in_progress .plan-msg-step-icon {
          animation: plan-step-pulse 1.2s ease-in-out infinite;
        }
      `}</style>
      <div className={`plan-msg animate-fade-in${isActive ? " plan-msg--active" : ""}`}>
        <div className="plan-msg-title">
          <span className="plan-msg-title-icon">{"\u2630"}</span>
          {title}
        </div>
        <ul className="plan-msg-steps">
          {steps.map((step, i) => {
            const cfg = STEP_ICONS[step.status] || STEP_ICONS.pending;
            return (
              <li key={i}>
                <div className={`plan-msg-step plan-msg-step--${step.status}`}>
                  <span className="plan-msg-step-icon" style={{ color: cfg.color }}>
                    {cfg.icon}
                  </span>
                  <span className="plan-msg-step-text">{step.text}</span>
                </div>
                {step.substeps && step.substeps.length > 0 && (
                  <ul className="plan-msg-substeps">
                    {step.substeps.map((sub, j) => {
                      const subCfg = STEP_ICONS[sub.status as keyof typeof STEP_ICONS] || STEP_ICONS.pending;
                      return (
                        <li key={j} className="plan-msg-substep">
                          <span className="plan-msg-substep-icon" style={{ color: subCfg.color }}>
                            {subCfg.icon}
                          </span>
                          <span className="plan-msg-substep-text">{sub.text}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
