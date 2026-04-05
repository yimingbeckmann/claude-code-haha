/* ── Types ── */

interface RecentSession {
  id: string;
  title: string;
  timestamp: number;
  model?: string;
}

interface WelcomeScreenProps {
  model: string;
  cwd?: string;
  onSuggestionClick: (text: string) => void;
  recentSessions?: RecentSession[];
  onSelectSession?: (id: string) => void;
}

/* ── SVG Icons (14x14, stroke-based) ── */

function IconWrench() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
    </svg>
  );
}

function IconGitBranch() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
  );
}

/* ── Suggestions ── */

const SUGGESTIONS: { icon: () => JSX.Element; label: string; prompt: string }[] = [
  { icon: IconWrench,    label: "Fix a bug",         prompt: "Fix this bug" },
  { icon: IconPlus,      label: "Add a feature",     prompt: "Add a feature" },
  { icon: IconSearch,    label: "Explore codebase",  prompt: "Explain this codebase" },
  { icon: IconCheck,     label: "Write tests",       prompt: "Write tests" },
  { icon: IconGitBranch, label: "Create a commit",   prompt: "Create a commit" },
  { icon: IconRefresh,   label: "Refactor code",     prompt: "Refactor this code" },
];

/* ── Styles ── */

const STYLE = `
.welcome-root {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 40px 32px 48px;
  font-family: var(--font-mono);
  user-select: none;
  position: relative;
  z-index: 1;
  animation: fadeIn 0.4s ease-out;
}

.welcome-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  margin-bottom: 32px;
}

.welcome-logo {
  width: 72px;
  height: 72px;
  border-radius: 18px;
  box-shadow: 0 4px 24px rgba(255, 97, 0, 0.18), 0 0 0 1px rgba(255, 97, 0, 0.06);
}

.welcome-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
  letter-spacing: -0.03em;
  text-align: center;
}

.welcome-version {
  font-size: 11px;
  font-weight: 400;
  color: var(--text-dim);
  margin-left: 6px;
  vertical-align: middle;
}

.welcome-context {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  margin-bottom: 36px;
  font-size: 12px;
  color: var(--text-muted);
}

.welcome-ctx {
  display: flex;
  align-items: center;
  gap: 6px;
}

.welcome-ctx-label {
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 10px;
}

.welcome-ctx-val {
  color: var(--text-secondary);
  font-family: var(--font-mono);
}

.welcome-ctx-val--accent {
  color: #ffa500;
}

.welcome-greeting {
  font-size: 17px;
  font-weight: 500;
  color: var(--text-primary);
  margin: 0 0 24px;
  letter-spacing: -0.01em;
}

.welcome-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  max-width: 460px;
  width: 100%;
  margin-bottom: 32px;
}

.welcome-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-secondary);
  transition: all 0.15s ease;
  text-align: left;
}

.welcome-card:hover {
  border-color: rgba(255, 97, 0, 0.3);
  background: rgba(255, 97, 0, 0.04);
  color: var(--text-primary);
  transform: translateY(-1px);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
}

.welcome-card:active {
  transform: scale(0.98);
}

.welcome-card-icon {
  color: var(--text-dim);
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.welcome-card:hover .welcome-card-icon {
  color: #ffa500;
}

.welcome-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  font-size: 11px;
  color: var(--text-dim);
  margin-bottom: 20px;
}

.welcome-shortcut {
  display: flex;
  align-items: center;
  gap: 4px;
}

.welcome-kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 17px;
  padding: 0 4px;
  font-size: 10px;
  font-family: var(--font-mono);
  color: var(--text-muted);
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 3px;
  line-height: 1;
}

.welcome-recent {
  max-width: 340px;
  width: 100%;
}

.welcome-recent-header {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 6px;
  text-align: center;
}

.welcome-recent-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  background: none;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-secondary);
  transition: background 0.12s, border-color 0.12s, color 0.12s;
  text-align: left;
  width: 100%;
}

.welcome-recent-item:hover {
  background: var(--bg-hover);
  border-color: var(--border-subtle);
  color: var(--text-primary);
}

.welcome-recent-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.welcome-recent-time {
  font-size: 10px;
  color: var(--text-dim);
  flex-shrink: 0;
}
`;

/* ── Helpers ── */

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* ── Component ── */

export default function WelcomeScreen({
  model,
  cwd,
  onSuggestionClick,
  recentSessions = [],
  onSelectSession,
}: WelcomeScreenProps) {
  const displayCwd = cwd ? cwd.replace(/^\/Users\/[^/]+/, "~") : undefined;

  return (
    <>
      <style>{STYLE}</style>
      <div className="welcome-root">
        <div className="welcome-hero">
          <h1 className="welcome-title">
            Tensor 2<span className="welcome-version"></span>
          </h1>
        </div>

        <div className="welcome-context">
          {displayCwd && (
            <div className="welcome-ctx">
              <span className="welcome-ctx-label">cwd</span>
              <span className="welcome-ctx-val">{displayCwd}</span>
            </div>
          )}
          <div className="welcome-ctx">
            <span className="welcome-ctx-label">model</span>
            <span className="welcome-ctx-val welcome-ctx-val--accent">{model}</span>
          </div>
        </div>

        <h2 className="welcome-greeting">What can I help you with?</h2>

        <div className="welcome-grid">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              className="welcome-card"
              onClick={() => onSuggestionClick(s.prompt)}
            >
              <span className="welcome-card-icon"><s.icon /></span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>

        <div className="welcome-footer">
          <div className="welcome-shortcut"><span className="welcome-kbd">&#x2318;K</span> Commands</div>
          <div className="welcome-shortcut"><span className="welcome-kbd">&#x2318;N</span> New session</div>
          <div className="welcome-shortcut"><span className="welcome-kbd">/</span> Slash</div>
        </div>

        {recentSessions.length > 0 && onSelectSession && (
          <div className="welcome-recent">
            <div className="welcome-recent-header">Recent Sessions</div>
            {recentSessions.slice(0, 4).map((session) => (
              <button
                key={session.id}
                className="welcome-recent-item"
                onClick={() => onSelectSession(session.id)}
              >
                <span className="welcome-recent-title">{session.title}</span>
                <span className="welcome-recent-time">{formatRelativeTime(session.timestamp)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
