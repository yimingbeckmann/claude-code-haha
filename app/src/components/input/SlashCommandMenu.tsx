import { useState, useEffect, useCallback, useRef, memo, useMemo } from "react";
import { commands, filterCommands, categoryMeta, CATEGORY_ORDER, type Command, type CommandCategory } from "../../commands";

// ── Constants ───────────────────────────────────────────────

const MAX_VISIBLE = 12;
const ITEM_HEIGHT = 32;
const CATEGORY_HEIGHT = 26;
const STYLE_ID = "scm-injected-styles";

// ── Types ───────────────────────────────────────────────────

interface Props {
  query: string;
  visible: boolean;
  onSelect: (commandId: string) => void;
  onDismiss: () => void;
}

type RowItem =
  | { type: "category"; category: CommandCategory }
  | { type: "command"; cmd: Command & { matchIndices?: number[] }; flatIdx: number };

// ── Category icons ──────────────────────────────────────────

const CATEGORY_ICONS: Record<CommandCategory, string> = {
  session:    "\u25B6",  // play
  code:       "\u2774",  // curly brace
  model:      "\u2699",  // gear
  tools:      "\u2692",  // hammer and pick
  navigation: "\u2630",  // trigram
  info:       "\u2139",  // info
  view:       "\u25A3",  // square
};

// ── Inject styles ───────────────────────────────────────────

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.scm-overlay {
  position: absolute;
  bottom: 100%;
  left: 8px;
  width: 380px;
  margin-bottom: 4px;
  z-index: 150;
  animation: scmSlideIn 0.12s ease-out;
}
@keyframes scmSlideIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.scm-container {
  background: var(--bg-secondary, #1e1e2e);
  border: 1px solid var(--border, #333);
  border-radius: 8px;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.4);
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px;
  scrollbar-width: thin;
  scrollbar-color: var(--border, #444) transparent;
}
.scm-container::-webkit-scrollbar { width: 4px; }
.scm-container::-webkit-scrollbar-thumb {
  background: var(--border, #444);
  border-radius: 4px;
}

/* Category headers */
.scm-cat {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px 3px;
  user-select: none;
}
.scm-cat-icon {
  font-size: 10px;
  color: var(--text-dim, #666);
  width: 14px;
  text-align: center;
}
.scm-cat-label {
  font-size: 9px;
  font-weight: 600;
  color: var(--text-dim, #666);
  text-transform: uppercase;
  letter-spacing: 0.8px;
}
.scm-cat-line {
  flex: 1;
  height: 1px;
  background: var(--border, #333);
  margin-left: 4px;
  opacity: 0.4;
}

/* Command items */
.scm-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.08s;
  height: ${ITEM_HEIGHT}px;
  box-sizing: border-box;
}
.scm-item:hover,
.scm-item-sel {
  background: var(--bg-hover, rgba(255,255,255,0.06));
}
.scm-item-sel {
  border-left: 2px solid var(--accent, #7c6af4);
  padding-left: 8px;
}

.scm-item-icon {
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  color: var(--text-dim, #666);
  width: 18px;
  text-align: center;
  flex-shrink: 0;
}

.scm-item-name {
  font-family: var(--font-mono, monospace);
  font-size: 13px;
  color: var(--accent, #7c6af4);
  white-space: nowrap;
  min-width: 85px;
  flex-shrink: 0;
}

.scm-item-desc {
  font-size: 11px;
  color: var(--text-muted, #888);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.scm-item-shortcut {
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  color: var(--text-dim, #666);
  background: var(--bg-primary, #111);
  border: 1px solid var(--border, #333);
  border-radius: 3px;
  padding: 1px 5px;
  white-space: nowrap;
  flex-shrink: 0;
}

/* Fuzzy match highlight */
.scm-match {
  font-weight: 700;
  color: var(--accent, #7c6af4);
}

/* Footer */
.scm-footer {
  display: flex;
  gap: 12px;
  padding: 4px 10px;
  border-top: 1px solid var(--border, #333);
  margin-top: 2px;
}
.scm-footer span {
  font-size: 9px;
  color: var(--text-dim, #555);
}
.scm-footer kbd {
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  background: var(--bg-primary, #111);
  border: 1px solid var(--border, #333);
  border-radius: 2px;
  padding: 0 3px;
  margin-right: 2px;
}

/* Empty state */
.scm-empty {
  padding: 16px 10px;
  text-align: center;
  font-size: 11px;
  color: var(--text-dim, #666);
}
`;
  document.head.appendChild(style);
}

// ── Component ───────────────────────────────────────────────

function SlashCommandMenu({ query, visible, onSelect, onDismiss }: Props) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Inject styles on mount
  useEffect(() => { ensureStyles(); }, []);

  // Build grouped row list
  const { flatItems, rows } = useMemo(() => {
    const q = query.replace(/^\//, "").trim();
    let filtered: (Command & { matchIndices?: number[] })[];

    if (!q) {
      filtered = commands;
    } else {
      filtered = filterCommands(query);
    }

    // Group by category
    const grouped = new Map<CommandCategory, (Command & { matchIndices?: number[] })[]>();
    for (const cmd of filtered) {
      if (!grouped.has(cmd.category)) grouped.set(cmd.category, []);
      grouped.get(cmd.category)!.push(cmd);
    }

    const flat: (Command & { matchIndices?: number[] })[] = [];
    const rowList: RowItem[] = [];

    for (const cat of CATEGORY_ORDER) {
      const catCmds = grouped.get(cat);
      if (!catCmds || catCmds.length === 0) continue;
      rowList.push({ type: "category", category: cat });
      for (const cmd of catCmds) {
        rowList.push({ type: "command", cmd, flatIdx: flat.length });
        flat.push(cmd);
      }
    }

    return { flatItems: flat, rows: rowList };
  }, [query]);

  // Reset selection on query change
  useEffect(() => setSelectedIdx(0), [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector("[data-selected='true']");
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!visible || flatItems.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIdx((i) => Math.min(i + 1, flatItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        if (flatItems[selectedIdx]) {
          onSelect(flatItems[selectedIdx].id);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onDismiss();
      }
    },
    [visible, flatItems, selectedIdx, onSelect, onDismiss]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [handleKeyDown]);

  // Click outside to dismiss
  useEffect(() => {
    if (!visible) return;
    const handleClick = (e: MouseEvent) => {
      if (listRef.current && !listRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [visible, onDismiss]);

  if (!visible || flatItems.length === 0) return null;

  // Calculate max height: allow MAX_VISIBLE items plus a couple category headers
  const categoryCount = rows.filter(r => r.type === "category").length;
  const itemCount = Math.min(flatItems.length, MAX_VISIBLE);
  const visibleCategories = Math.min(categoryCount, 3);
  const maxHeight = itemCount * ITEM_HEIGHT + visibleCategories * CATEGORY_HEIGHT + 8 + 24; // 8 padding + 24 footer

  return (
    <div className="scm-overlay">
      <div
        className="scm-container"
        ref={listRef}
        style={{ maxHeight }}
      >
        {rows.map((row, ri) => {
          if (row.type === "category") {
            const meta = categoryMeta[row.category];
            const icon = CATEGORY_ICONS[row.category];
            return (
              <div key={`cat-${row.category}`} className="scm-cat">
                <span className="scm-cat-icon">{icon}</span>
                <span className="scm-cat-label">{meta.label}</span>
                <span className="scm-cat-line" />
              </div>
            );
          }

          const { cmd, flatIdx } = row;
          const isSelected = flatIdx === selectedIdx;

          return (
            <div
              key={`${cmd.id}-${ri}`}
              className={`scm-item${isSelected ? " scm-item-sel" : ""}`}
              data-selected={isSelected}
              onClick={() => onSelect(cmd.id)}
              onMouseEnter={() => setSelectedIdx(flatIdx)}
            >
              <span className="scm-item-icon">{cmd.icon}</span>
              <span className="scm-item-name">
                /<SlashHighlight text={cmd.label} indices={cmd.matchIndices} />
              </span>
              <span className="scm-item-desc">{cmd.description}</span>
              {cmd.shortcut && (
                <span className="scm-item-shortcut">{cmd.shortcut}</span>
              )}
            </div>
          );
        })}

        {/* Footer */}
        <div className="scm-footer">
          <span><kbd>&uarr;</kbd><kbd>&darr;</kbd> navigate</span>
          <span><kbd>enter</kbd> select</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

// ── Highlight helper ────────────────────────────────────────

function SlashHighlight({ text, indices }: { text: string; indices?: number[] }) {
  if (!indices || indices.length === 0) return <>{text}</>;
  const indexSet = new Set(indices);
  return (
    <>
      {text.split("").map((ch, i) =>
        indexSet.has(i) ? (
          <span key={i} className="scm-match">{ch}</span>
        ) : (
          <span key={i}>{ch}</span>
        )
      )}
    </>
  );
}

export default memo(SlashCommandMenu);
