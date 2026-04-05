import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { SHORTCUT_CATALOGUE } from '../../hooks/useKeyboardShortcuts';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ShortcutsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CATEGORIES = ['Session', 'Navigation', 'Editor', 'Tools', 'Modes', 'General'] as const;

const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

/* ------------------------------------------------------------------ */
/*  CSS (injected via <style> tag, scoped by class prefix)             */
/* ------------------------------------------------------------------ */

const SHORTCUTS_CSS = `
.sc-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
}

.sc-dialog {
  display: flex;
  flex-direction: column;
  width: 680px;
  max-width: 94vw;
  max-height: 80vh;
  background: var(--bg-primary, #0a0a12);
  border-radius: 12px;
  border: 1px solid var(--border, #2a2a3e);
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.55);
  overflow: hidden;
  color: #e4e4ed;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

/* Header */
.sc-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid #2a2a3e;
  flex-shrink: 0;
}
.sc-dialog-header h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #e4e4ed;
}
.sc-dialog-close {
  background: none;
  border: none;
  cursor: pointer;
  color: #6a6a82;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: color 0.15s;
}
.sc-dialog-close:hover {
  color: #e4e4ed;
}

/* Search bar */
.sc-search-wrap {
  padding: 12px 20px;
  border-bottom: 1px solid #2a2a3e;
  flex-shrink: 0;
  position: relative;
}
.sc-search-icon {
  position: absolute;
  left: 30px;
  top: 50%;
  transform: translateY(-50%);
  color: #6a6a82;
  pointer-events: none;
}
.sc-search {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 12px 8px 34px;
  font-size: 13px;
  background: #1a1a2e;
  border: 1px solid #2a2a3e;
  border-radius: 6px;
  color: #e4e4ed;
  outline: none;
  transition: border-color 0.15s;
}
.sc-search:focus {
  border-color: #f97316;
}
.sc-search::placeholder {
  color: #6a6a82;
}

/* Body */
.sc-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px 20px;
}
.sc-body::-webkit-scrollbar {
  width: 6px;
}
.sc-body::-webkit-scrollbar-track {
  background: transparent;
}
.sc-body::-webkit-scrollbar-thumb {
  background: #2a2a3e;
  border-radius: 3px;
}

/* Two-column grid */
.sc-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px 32px;
}
@media (max-width: 580px) {
  .sc-grid {
    grid-template-columns: 1fr;
  }
}

/* Category */
.sc-category {
  min-width: 0;
}
.sc-category-title {
  font-size: 11px;
  font-weight: 700;
  color: #6a6a82;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin: 0 0 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #1e1e32;
}

/* Shortcut row */
.sc-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  gap: 12px;
}
.sc-label {
  font-size: 13px;
  color: #c8c8da;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

/* Key badges */
.sc-keys {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
.sc-kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 6px;
  font-size: 11px;
  font-family: "SF Mono", "Fira Code", "Cascadia Code", Menlo, Consolas, monospace;
  font-weight: 500;
  color: #d4d4e4;
  background: #1a1a2e;
  border: 1px solid #2e2e48;
  border-radius: 4px;
  box-shadow: 0 1px 0 #161628;
  line-height: 1;
  white-space: nowrap;
}

/* Empty state */
.sc-empty {
  padding: 32px 0;
  text-align: center;
  color: #6a6a82;
  font-size: 13px;
  grid-column: 1 / -1;
}
`;

/* ------------------------------------------------------------------ */
/*  Key display helpers                                                */
/* ------------------------------------------------------------------ */

const MODIFIER_SYMBOLS: Record<string, string> = isMac
  ? { meta: '\u2318', ctrl: '\u2303', shift: '\u21E7', alt: '\u2325' }
  : { meta: 'Win', ctrl: 'Ctrl', shift: 'Shift', alt: 'Alt' };

const SPECIAL_LABELS: Record<string, string> = {
  escape: 'Esc',
  enter: isMac ? '\u21A9' : 'Enter',
  tab: isMac ? '\u21E5' : 'Tab',
  up: '\u2191',
  down: '\u2193',
  left: '\u2190',
  right: '\u2192',
  backspace: isMac ? '\u232B' : 'Bksp',
  delete: isMac ? '\u2326' : 'Del',
  space: 'Space',
  ',': ',',
  '.': '.',
  '/': '/',
};

/**
 * Turn a combo string like "meta+shift+s" into an array of display tokens,
 * choosing the platform-appropriate combo (prefer meta on Mac, ctrl elsewhere).
 */
function comboToTokens(keys: string[]): string[] {
  // Pick the platform-preferred combo: meta-based on Mac, ctrl-based elsewhere.
  const preferred = keys.find((k) =>
    isMac ? k.toLowerCase().startsWith('meta') : k.toLowerCase().startsWith('ctrl'),
  ) ?? keys[0];

  const parts = preferred.toLowerCase().split('+').map((p) => p.trim());
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1);

  const tokens: string[] = [];

  // Render modifiers in a consistent order.
  const order = ['ctrl', 'alt', 'shift', 'meta'];
  for (const m of order) {
    if (mods.includes(m) || mods.includes(m === 'meta' ? 'cmd' : '')) {
      tokens.push(MODIFIER_SYMBOLS[m] ?? m);
    }
  }

  // Render the base key.
  tokens.push(SPECIAL_LABELS[key] ?? key.toUpperCase());
  return tokens;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ShortcutsDialog({ isOpen, onClose }: ShortcutsDialogProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  /* ---- inject stylesheet ---- */
  useEffect(() => {
    const id = 'sc-dialog-styles';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = SHORTCUTS_CSS;
    document.head.appendChild(style);
    return () => {
      const el = document.getElementById(id);
      if (el) el.remove();
    };
  }, []);

  /* ---- focus search on open ---- */
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  /* ---- close on Escape ---- */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    },
    [onClose],
  );

  /* ---- filter catalogue ---- */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SHORTCUT_CATALOGUE;
    return SHORTCUT_CATALOGUE.filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        s.keys.some((k) => k.toLowerCase().includes(q)),
    );
  }, [query]);

  /* ---- group by category, preserving defined order ---- */
  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const cat of CATEGORIES) map.set(cat, []);
    for (const s of filtered) {
      const list = map.get(s.category);
      if (list) list.push(s);
    }
    // Drop empty categories.
    return Array.from(map.entries()).filter(([, items]) => items.length > 0);
  }, [filtered]);

  /* ---- overlay click ---- */
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).classList.contains('sc-dialog-overlay')) {
        onClose();
      }
    },
    [onClose],
  );

  if (!isOpen) return null;

  return (
    <div className="sc-dialog-overlay" onClick={handleOverlayClick} onKeyDown={handleKeyDown}>
      <div className="sc-dialog" role="dialog" aria-label="Keyboard shortcuts">
        {/* Header */}
        <div className="sc-dialog-header">
          <h2>Keyboard Shortcuts</h2>
          <button className="sc-dialog-close" onClick={onClose} aria-label="Close">
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

        {/* Search */}
        <div className="sc-search-wrap">
          <svg className="sc-search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            className="sc-search"
            type="text"
            placeholder="Filter shortcuts..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* Body */}
        <div className="sc-body">
          {grouped.length === 0 ? (
            <div className="sc-empty">No shortcuts match "{query}"</div>
          ) : (
            <div className="sc-grid">
              {grouped.map(([category, items]) => (
                <div className="sc-category" key={category}>
                  <h3 className="sc-category-title">{category}</h3>
                  {items.map((shortcut) => {
                    const tokens = comboToTokens(shortcut.keys);
                    return (
                      <div className="sc-row" key={shortcut.id}>
                        <span className="sc-label">{shortcut.label}</span>
                        <span className="sc-keys">
                          {tokens.map((tok, i) => (
                            <kbd className="sc-kbd" key={i}>
                              {tok}
                            </kbd>
                          ))}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
