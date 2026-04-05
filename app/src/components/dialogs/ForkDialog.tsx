import { useState, useEffect, useCallback, useRef } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ConversationFork {
  id: string;
  name: string;
  createdAt: number;        // epoch ms
  messageCount: number;
  branchedFromMessageId: string | null;
  branchedFromIndex: number; // 0-based message index where fork diverged
}

export interface ForkDialogProps {
  isOpen: boolean;
  onClose: () => void;
  forks: ConversationFork[];
  activeForkId: string;
  onSwitchFork: (forkId: string) => void;
  onDeleteFork: (forkId: string) => void;
  onRenameFork: (forkId: string, newName: string) => void;
  onCreateFork: (name: string) => void;
  totalMessages: number;     // total messages in active conversation
}

/* ------------------------------------------------------------------ */
/*  CSS (injected via <style> tag, scoped by class prefix `fd-`)       */
/* ------------------------------------------------------------------ */

const FORK_CSS = `
.fd-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  animation: fd-fadeIn 0.15s ease;
}
@keyframes fd-fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.fd-dialog {
  display: flex;
  flex-direction: column;
  width: min(640px, 92vw);
  max-height: 80vh;
  background: var(--bg-primary, #0f0f1a);
  border: 1px solid var(--border, #2a2a3e);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  font-family: var(--font-mono, 'SF Mono', 'Fira Code', monospace);
  font-size: 13px;
  color: var(--text-primary, #e0e0e0);
}

/* Header */
.fd-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 46px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border, #2a2a3e);
  flex-shrink: 0;
}
.fd-header-title {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.fd-close-btn {
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
.fd-close-btn:hover {
  background: var(--bg-hover, #1e1e30);
  color: var(--text-primary, #e0e0e0);
}

/* Current branch banner */
.fd-current-branch {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--bg-secondary, #12121f);
  border-bottom: 1px solid var(--border, #2a2a3e);
  flex-shrink: 0;
}
.fd-current-label {
  font-size: 11px;
  color: var(--text-muted, #888);
  text-transform: uppercase;
  letter-spacing: 0.6px;
  font-weight: 600;
}
.fd-current-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent, #7c3aed);
}

/* Body / fork list */
.fd-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}
.fd-body::-webkit-scrollbar {
  width: 6px;
}
.fd-body::-webkit-scrollbar-track {
  background: transparent;
}
.fd-body::-webkit-scrollbar-thumb {
  background: var(--border, #2a2a3e);
  border-radius: 3px;
}

.fd-empty {
  padding: 24px 0;
  text-align: center;
  color: var(--text-muted, #888);
  font-size: 12px;
}

/* Fork card */
.fd-fork-card {
  background: var(--bg-secondary, #12121f);
  border: 1px solid var(--border, #2a2a3e);
  border-radius: 6px;
  padding: 12px 14px;
  margin-bottom: 8px;
  transition: border-color 0.15s;
}
.fd-fork-card:hover {
  border-color: #3a3a52;
}
.fd-fork-card.fd-active {
  border-color: var(--accent, #7c3aed);
  box-shadow: 0 0 0 1px var(--accent, #7c3aed) inset;
}

.fd-fork-top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.fd-fork-name-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.fd-fork-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #e0e0e0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fd-fork-name-input {
  background: var(--bg-tertiary, #181828);
  border: 1px solid var(--accent, #7c3aed);
  border-radius: 4px;
  padding: 3px 8px;
  color: var(--text-primary, #e0e0e0);
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  outline: none;
  min-width: 0;
  flex: 1;
}

.fd-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-radius: 3px;
  background: var(--accent, #7c3aed);
  color: #fff;
  flex-shrink: 0;
}

.fd-fork-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

/* Fork metadata row */
.fd-fork-meta {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 11px;
  color: var(--text-muted, #888);
}

/* Tree indicator */
.fd-tree-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--text-muted, #888);
}
.fd-tree-icon {
  color: var(--accent, #7c3aed);
  flex-shrink: 0;
}

/* Buttons */
.fd-btn {
  border: none;
  border-radius: 4px;
  padding: 4px 10px;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.1s;
  white-space: nowrap;
}
.fd-btn:hover { opacity: 0.85; }
.fd-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.fd-btn-primary {
  background: var(--accent, #7c3aed);
  color: #fff;
}
.fd-btn-outline {
  background: transparent;
  color: var(--text-primary, #e0e0e0);
  border: 1px solid var(--border, #2a2a3e);
}
.fd-btn-danger {
  background: transparent;
  color: #f87171;
  border: 1px solid #3a1c1c;
}
.fd-btn-danger:hover {
  background: #2a1010;
}
.fd-btn-ghost {
  background: transparent;
  color: var(--text-muted, #888);
  padding: 4px 6px;
}
.fd-btn-ghost:hover {
  color: var(--text-primary, #e0e0e0);
}

/* Create fork section */
.fd-create-section {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid var(--border, #2a2a3e);
  flex-shrink: 0;
}
.fd-create-input {
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
.fd-create-input:focus {
  border-color: var(--accent, #7c3aed);
}
.fd-create-input::placeholder {
  color: var(--text-muted, #888);
}

/* Confirmation overlay (nested) */
.fd-confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(2px);
}
.fd-confirm-dialog {
  width: min(400px, 88vw);
  background: var(--bg-primary, #0f0f1a);
  border: 1px solid var(--border, #2a2a3e);
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  font-family: var(--font-mono, monospace);
  color: var(--text-primary, #e0e0e0);
}
.fd-confirm-title {
  font-size: 14px;
  font-weight: 700;
  margin: 0 0 8px;
}
.fd-confirm-message {
  font-size: 12px;
  color: var(--text-muted, #888);
  margin: 0 0 16px;
  line-height: 1.5;
}
.fd-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
`;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatTimestamp(epoch: number): string {
  const d = new Date(epoch);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;

  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ForkDialog({
  isOpen,
  onClose,
  forks,
  activeForkId,
  onSwitchFork,
  onDeleteFork,
  onRenameFork,
  onCreateFork,
  totalMessages,
}: ForkDialogProps) {
  const [newForkName, setNewForkName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [confirmSwitch, setConfirmSwitch] = useState<string | null>(null); // fork id pending switch
  const createInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  /* ---- inject stylesheet ---- */
  useEffect(() => {
    const id = 'fd-dialog-styles';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = FORK_CSS;
    document.head.appendChild(style);
    return () => {
      const el = document.getElementById(id);
      if (el) el.remove();
    };
  }, []);

  /* ---- reset state on open ---- */
  useEffect(() => {
    if (isOpen) {
      setNewForkName('');
      setEditingId(null);
      setEditingName('');
      setConfirmSwitch(null);
    }
  }, [isOpen]);

  /* ---- focus edit input when editing ---- */
  useEffect(() => {
    if (editingId) {
      requestAnimationFrame(() => editInputRef.current?.focus());
    }
  }, [editingId]);

  /* ---- close on Escape ---- */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (confirmSwitch) {
          setConfirmSwitch(null);
        } else if (editingId) {
          setEditingId(null);
          setEditingName('');
        } else {
          onClose();
        }
      }
    },
    [onClose, confirmSwitch, editingId],
  );

  /* ---- overlay click ---- */
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).classList.contains('fd-overlay')) {
        onClose();
      }
    },
    [onClose],
  );

  /* ---- fork actions ---- */
  const handleSwitchClick = useCallback(
    (forkId: string) => {
      if (forkId === activeForkId) return;
      setConfirmSwitch(forkId);
    },
    [activeForkId],
  );

  const handleConfirmSwitch = useCallback(() => {
    if (confirmSwitch) {
      onSwitchFork(confirmSwitch);
      setConfirmSwitch(null);
    }
  }, [confirmSwitch, onSwitchFork]);

  const handleCancelSwitch = useCallback(() => {
    setConfirmSwitch(null);
  }, []);

  const handleStartRename = useCallback((fork: ConversationFork) => {
    setEditingId(fork.id);
    setEditingName(fork.name);
  }, []);

  const handleCommitRename = useCallback(() => {
    if (editingId && editingName.trim()) {
      onRenameFork(editingId, editingName.trim());
    }
    setEditingId(null);
    setEditingName('');
  }, [editingId, editingName, onRenameFork]);

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleCommitRename();
      }
      // Escape handled by parent handleKeyDown
    },
    [handleCommitRename],
  );

  const handleCreateFork = useCallback(() => {
    const name = newForkName.trim() || `Fork ${forks.length + 1}`;
    onCreateFork(name);
    setNewForkName('');
    requestAnimationFrame(() => createInputRef.current?.focus());
  }, [newForkName, forks.length, onCreateFork]);

  const handleCreateKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleCreateFork();
      }
    },
    [handleCreateFork],
  );

  /* ---- derived ---- */
  const activeFork = forks.find((f) => f.id === activeForkId);

  if (!isOpen) return null;

  return (
    <div className="fd-overlay" onClick={handleOverlayClick} onKeyDown={handleKeyDown}>
      <div className="fd-dialog" role="dialog" aria-label="Conversation Forks">
        {/* Header */}
        <div className="fd-header">
          <span className="fd-header-title">Conversation Forks</span>
          <button className="fd-close-btn" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Current branch indicator */}
        {activeFork && (
          <div className="fd-current-branch">
            <span className="fd-current-label">Current branch:</span>
            <span className="fd-current-name">{activeFork.name}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted, #888)' }}>
              ({activeFork.messageCount} messages)
            </span>
          </div>
        )}

        {/* Fork list */}
        <div className="fd-body">
          {forks.length === 0 ? (
            <div className="fd-empty">
              No forks yet. Create one below to branch this conversation.
            </div>
          ) : (
            forks.map((fork) => {
              const isActive = fork.id === activeForkId;
              const isEditing = editingId === fork.id;

              return (
                <div
                  key={fork.id}
                  className={`fd-fork-card${isActive ? ' fd-active' : ''}`}
                >
                  {/* Top row: name + badge + actions */}
                  <div className="fd-fork-top-row">
                    <div className="fd-fork-name-wrap">
                      {isEditing ? (
                        <input
                          ref={editInputRef}
                          className="fd-fork-name-input"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onBlur={handleCommitRename}
                          onKeyDown={handleRenameKeyDown}
                        />
                      ) : (
                        <span
                          className="fd-fork-name"
                          onDoubleClick={() => handleStartRename(fork)}
                          title="Double-click to rename"
                        >
                          {fork.name}
                        </span>
                      )}
                      {isActive && <span className="fd-badge">Active</span>}
                    </div>

                    <div className="fd-fork-actions">
                      {!isEditing && (
                        <button
                          className="fd-btn fd-btn-ghost"
                          onClick={() => handleStartRename(fork)}
                          title="Rename"
                        >
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                            <path
                              d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z"
                              stroke="currentColor"
                              strokeWidth="1.3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      )}
                      {!isActive && (
                        <>
                          <button
                            className="fd-btn fd-btn-outline"
                            onClick={() => handleSwitchClick(fork.id)}
                          >
                            Switch
                          </button>
                          <button
                            className="fd-btn fd-btn-danger"
                            onClick={() => onDeleteFork(fork.id)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Metadata row */}
                  <div className="fd-fork-meta">
                    {/* Tree / branch-point indicator */}
                    <span className="fd-tree-indicator">
                      <svg className="fd-tree-icon" width="12" height="12" viewBox="0 0 16 16" fill="none">
                        <circle cx="4" cy="4" r="2" stroke="currentColor" strokeWidth="1.2" />
                        <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="1.2" />
                        <path
                          d="M4 6v2c0 1.1.9 2 2 2h4"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          strokeLinecap="round"
                        />
                      </svg>
                      <span>
                        Forked at message {fork.branchedFromIndex + 1}
                        {totalMessages > 0 && ` of ${totalMessages}`}
                      </span>
                    </span>

                    <span>{fork.messageCount} msgs</span>
                    <span>{formatTimestamp(fork.createdAt)}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Create fork section */}
        <div className="fd-create-section">
          <input
            ref={createInputRef}
            className="fd-create-input"
            type="text"
            placeholder="Name this fork..."
            value={newForkName}
            onChange={(e) => setNewForkName(e.target.value)}
            onKeyDown={handleCreateKeyDown}
          />
          <button className="fd-btn fd-btn-primary" onClick={handleCreateFork}>
            Fork from here
          </button>
        </div>
      </div>

      {/* Confirmation dialog for switching forks */}
      {confirmSwitch && (
        <div
          className="fd-confirm-overlay"
          onClick={(e) => {
            if ((e.target as HTMLElement).classList.contains('fd-confirm-overlay')) {
              handleCancelSwitch();
            }
          }}
        >
          <div className="fd-confirm-dialog">
            <h3 className="fd-confirm-title">Switch Fork</h3>
            <p className="fd-confirm-message">
              Unsaved messages in current branch will be preserved.
              Switch to "{forks.find((f) => f.id === confirmSwitch)?.name}"?
            </p>
            <div className="fd-confirm-actions">
              <button className="fd-btn fd-btn-outline" onClick={handleCancelSwitch}>
                Cancel
              </button>
              <button className="fd-btn fd-btn-primary" onClick={handleConfirmSwitch}>
                Switch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
