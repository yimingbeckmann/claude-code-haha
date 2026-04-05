import { useState, useCallback, useEffect, useRef } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ConversationTurn {
  id: string;
  turnNumber: number;
  timestamp: number;
  role: 'user' | 'assistant';
  firstLine: string;
}

export interface Checkpoint {
  id: string;
  name: string;
  timestamp: number;
  messageCount: number;
}

export interface RewindDialogProps {
  isOpen: boolean;
  onClose: () => void;
  turns: ConversationTurn[];
  checkpoints: Checkpoint[];
  hasUndoableRewind: boolean;
  onRewindToTurn: (turnId: string) => void;
  onRestoreCheckpoint: (checkpointId: string) => void;
  onSaveCheckpoint: (name: string) => void;
  onDeleteCheckpoint: (checkpointId: string) => void;
  onUndoLastRewind: () => void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

type TabId = 'timeline' | 'checkpoints';

interface TabDef {
  id: TabId;
  label: string;
  icon: string;
}

const TABS: TabDef[] = [
  { id: 'timeline', label: 'Timeline', icon: '\u29D7' },
  { id: 'checkpoints', label: 'Checkpoints', icon: '\u2691' },
];

/* ------------------------------------------------------------------ */
/*  CSS (injected via <style> tag, scoped by class prefix)             */
/* ------------------------------------------------------------------ */

const REWIND_CSS = `
.rw-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  animation: rw-fadeIn 0.15s ease;
}
@keyframes rw-fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
.rw-modal {
  width: min(720px, 92vw);
  max-height: min(640px, 88vh);
  background: var(--bg-primary, #0f0f1a);
  border: 1px solid var(--border, #2a2a3e);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  font-family: var(--font-mono, 'SF Mono', 'Fira Code', monospace);
  font-size: 13px;
  color: var(--text-primary, #e0e0e0);
}

/* Header */
.rw-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 46px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border, #2a2a3e);
  flex-shrink: 0;
}
.rw-header-title {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.rw-close-btn {
  background: none;
  border: none;
  color: var(--text-muted, #888);
  font-size: 18px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  line-height: 1;
  font-family: var(--font-mono, monospace);
}
.rw-close-btn:hover {
  background: var(--bg-hover, #1e1e30);
  color: var(--text-primary, #e0e0e0);
}

/* Warning banner */
.rw-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(234, 179, 8, 0.08);
  border-bottom: 1px solid rgba(234, 179, 8, 0.2);
  font-size: 12px;
  color: #eab308;
  flex-shrink: 0;
}
.rw-warning-icon {
  font-size: 14px;
  flex-shrink: 0;
}

/* Tab bar */
.rw-tab-bar {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--border, #2a2a3e);
  padding: 0 16px;
  flex-shrink: 0;
}
.rw-tab-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  color: var(--text-muted, #888);
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  font-weight: 500;
  border: none;
  padding: 10px 16px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.1s, border-color 0.1s;
}
.rw-tab-btn:hover {
  color: var(--text-primary, #e0e0e0);
}
.rw-tab-btn.active {
  color: var(--text-primary, #e0e0e0);
  font-weight: 600;
  border-bottom-color: var(--accent, #7c3aed);
}
.rw-tab-icon {
  font-size: 13px;
}

/* Content area */
.rw-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
.rw-content::-webkit-scrollbar {
  width: 6px;
}
.rw-content::-webkit-scrollbar-thumb {
  background: var(--border, #2a2a3e);
  border-radius: 3px;
}

/* Footer */
.rw-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 10px 16px;
  border-top: 1px solid var(--border, #2a2a3e);
  flex-shrink: 0;
  gap: 8px;
}

/* Buttons */
.rw-btn {
  border: none;
  border-radius: 4px;
  padding: 6px 14px;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.1s;
}
.rw-btn:hover { opacity: 0.85; }
.rw-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.rw-btn-primary {
  background: var(--accent, #7c3aed);
  color: #fff;
}
.rw-btn-danger {
  background: #dc2626;
  color: #fff;
}
.rw-btn-outline {
  background: transparent;
  color: var(--text-primary, #e0e0e0);
  border: 1px solid var(--border, #2a2a3e);
}
.rw-btn-small {
  padding: 4px 10px;
  font-size: 11px;
}
.rw-btn-warning {
  background: rgba(234, 179, 8, 0.15);
  color: #eab308;
  border: 1px solid rgba(234, 179, 8, 0.3);
}

/* Timeline */
.rw-timeline {
  display: flex;
  flex-direction: column;
  gap: 0;
  position: relative;
}
.rw-timeline::before {
  content: '';
  position: absolute;
  left: 18px;
  top: 8px;
  bottom: 8px;
  width: 2px;
  background: var(--border, #2a2a3e);
}
.rw-turn {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  position: relative;
  transition: background 0.1s;
}
.rw-turn:hover {
  background: var(--bg-hover, #1e1e30);
}
.rw-turn.selected {
  background: rgba(124, 58, 237, 0.1);
  border: 1px solid rgba(124, 58, 237, 0.3);
  margin: -1px;
}
.rw-turn.will-remove {
  opacity: 0.4;
}
.rw-turn-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--border, #2a2a3e);
  background: var(--bg-primary, #0f0f1a);
  flex-shrink: 0;
  margin-top: 3px;
  z-index: 1;
}
.rw-turn.selected .rw-turn-dot {
  border-color: var(--accent, #7c3aed);
  background: var(--accent, #7c3aed);
}
.rw-turn-body {
  flex: 1;
  min-width: 0;
}
.rw-turn-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}
.rw-turn-number {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted, #888);
  min-width: 20px;
}
.rw-turn-time {
  font-size: 10px;
  color: var(--text-muted, #888);
}
.rw-turn-message {
  font-size: 12px;
  color: var(--text-primary, #e0e0e0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rw-turn-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  margin-top: 2px;
}
.rw-removal-count {
  font-size: 11px;
  color: #f87171;
  font-weight: 600;
  padding: 2px 8px;
  background: rgba(248, 113, 113, 0.1);
  border-radius: 4px;
  white-space: nowrap;
}

/* Checkpoints */
.rw-checkpoint-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rw-checkpoint-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--bg-secondary, #12121f);
  border: 1px solid var(--border, #2a2a3e);
  border-radius: 6px;
}
.rw-checkpoint-info {
  flex: 1;
  min-width: 0;
}
.rw-checkpoint-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #e0e0e0);
  margin-bottom: 2px;
}
.rw-checkpoint-meta {
  font-size: 11px;
  color: var(--text-muted, #888);
  display: flex;
  gap: 12px;
}
.rw-checkpoint-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

/* New checkpoint form */
.rw-new-checkpoint {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border, #2a2a3e);
}
.rw-input {
  flex: 1;
  background: var(--bg-tertiary, #181828);
  border: 1px solid var(--border, #2a2a3e);
  border-radius: 4px;
  padding: 7px 10px;
  color: var(--text-primary, #e0e0e0);
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s;
}
.rw-input:focus {
  border-color: var(--accent, #7c3aed);
}
.rw-input::placeholder {
  color: var(--text-muted, #888);
}

/* Empty state */
.rw-empty {
  padding: 32px 0;
  text-align: center;
  color: var(--text-muted, #888);
  font-size: 13px;
}
`;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  if (isToday) return time;

  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${date} ${time}`;
}

/* ------------------------------------------------------------------ */
/*  Tab: Timeline                                                      */
/* ------------------------------------------------------------------ */

function TimelineTab({
  turns,
  selectedTurnId,
  onSelectTurn,
  onRewindToTurn,
}: {
  turns: ConversationTurn[];
  selectedTurnId: string | null;
  onSelectTurn: (id: string | null) => void;
  onRewindToTurn: (id: string) => void;
}) {
  if (turns.length === 0) {
    return <div className="rw-empty">No conversation turns yet.</div>;
  }

  const selectedIndex = selectedTurnId
    ? turns.findIndex((t) => t.id === selectedTurnId)
    : -1;

  const removedCount =
    selectedIndex >= 0 ? turns.length - selectedIndex - 1 : 0;

  return (
    <div className="rw-timeline">
      {turns.map((turn, idx) => {
        const isSelected = turn.id === selectedTurnId;
        const willRemove = selectedIndex >= 0 && idx > selectedIndex;

        const classes = [
          'rw-turn',
          isSelected ? 'selected' : '',
          willRemove ? 'will-remove' : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <div
            key={turn.id}
            className={classes}
            onClick={() => onSelectTurn(isSelected ? null : turn.id)}
          >
            <div className="rw-turn-dot" />
            <div className="rw-turn-body">
              <div className="rw-turn-header">
                <span className="rw-turn-number">#{turn.turnNumber}</span>
                <span className="rw-turn-time">
                  {formatTimestamp(turn.timestamp)}
                </span>
              </div>
              <div className="rw-turn-message">{turn.firstLine}</div>
            </div>
            {isSelected && (
              <div className="rw-turn-actions">
                {removedCount > 0 && (
                  <span className="rw-removal-count">
                    -{removedCount} message{removedCount !== 1 ? 's' : ''}
                  </span>
                )}
                <button
                  className="rw-btn rw-btn-primary rw-btn-small"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRewindToTurn(turn.id);
                  }}
                >
                  Rewind to here
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Checkpoints                                                   */
/* ------------------------------------------------------------------ */

function CheckpointsTab({
  checkpoints,
  onRestore,
  onSave,
  onDelete,
}: {
  checkpoints: Checkpoint[];
  onRestore: (id: string) => void;
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [newName, setNewName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSave = useCallback(() => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setNewName('');
    inputRef.current?.focus();
  }, [newName, onSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      }
    },
    [handleSave],
  );

  return (
    <div>
      {/* Save new checkpoint */}
      <div className="rw-new-checkpoint">
        <input
          ref={inputRef}
          className="rw-input"
          type="text"
          placeholder="Checkpoint name..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className="rw-btn rw-btn-primary rw-btn-small"
          disabled={!newName.trim()}
          onClick={handleSave}
        >
          Save Current
        </button>
      </div>

      {/* Checkpoint list */}
      {checkpoints.length === 0 ? (
        <div className="rw-empty">No saved checkpoints.</div>
      ) : (
        <div className="rw-checkpoint-list">
          {checkpoints.map((cp) => (
            <div key={cp.id} className="rw-checkpoint-item">
              <div className="rw-checkpoint-info">
                <div className="rw-checkpoint-name">{cp.name}</div>
                <div className="rw-checkpoint-meta">
                  <span>{formatTimestamp(cp.timestamp)}</span>
                  <span>
                    {cp.messageCount} message{cp.messageCount !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
              <div className="rw-checkpoint-actions">
                <button
                  className="rw-btn rw-btn-primary rw-btn-small"
                  onClick={() => onRestore(cp.id)}
                >
                  Restore
                </button>
                <button
                  className="rw-btn rw-btn-danger rw-btn-small"
                  onClick={() => onDelete(cp.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function RewindDialog({
  isOpen,
  onClose,
  turns,
  checkpoints,
  hasUndoableRewind,
  onRewindToTurn,
  onRestoreCheckpoint,
  onSaveCheckpoint,
  onDeleteCheckpoint,
  onUndoLastRewind,
}: RewindDialogProps) {
  const [tab, setTab] = useState<TabId>('timeline');
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(null);
  const styleRef = useRef<HTMLStyleElement | null>(null);

  // Inject CSS on mount, remove on unmount
  useEffect(() => {
    if (!styleRef.current) {
      const style = document.createElement('style');
      style.setAttribute('data-rewind-dialog', '');
      style.textContent = REWIND_CSS;
      document.head.appendChild(style);
      styleRef.current = style;
    }
    return () => {
      if (styleRef.current) {
        document.head.removeChild(styleRef.current);
        styleRef.current = null;
      }
    };
  }, []);

  // Reset selection when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSelectedTurnId(null);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="rw-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="rw-modal">
        {/* Header */}
        <div className="rw-header">
          <span className="rw-header-title">Rewind Conversation</span>
          <button className="rw-close-btn" onClick={onClose} title="Close (Esc)">
            &times;
          </button>
        </div>

        {/* Warning banner */}
        <div className="rw-warning">
          <span className="rw-warning-icon">{'\u26A0'}</span>
          Rewinding removes messages after the selected point. This cannot be undone
          unless you use Undo Last Rewind.
        </div>

        {/* Tab bar */}
        <div className="rw-tab-bar">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`rw-tab-btn ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span className="rw-tab-icon">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="rw-content">
          {tab === 'timeline' ? (
            <TimelineTab
              turns={turns}
              selectedTurnId={selectedTurnId}
              onSelectTurn={setSelectedTurnId}
              onRewindToTurn={onRewindToTurn}
            />
          ) : (
            <CheckpointsTab
              checkpoints={checkpoints}
              onRestore={onRestoreCheckpoint}
              onSave={onSaveCheckpoint}
              onDelete={onDeleteCheckpoint}
            />
          )}
        </div>

        {/* Footer with Undo Last Rewind */}
        {hasUndoableRewind && (
          <div className="rw-footer">
            <button
              className="rw-btn rw-btn-warning rw-btn-small"
              onClick={onUndoLastRewind}
            >
              Undo Last Rewind
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
