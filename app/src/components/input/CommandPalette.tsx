import { useState, useCallback, useEffect, useRef, useMemo, memo } from "react";
import { commands, filterCommands, categoryMeta, CATEGORY_ORDER, type Command, type CommandCategory } from "../../commands";

// ── Constants ───────────────────────────────────────────────

const RECENT_KEY = "claw-recent-commands";
const MAX_RECENT = 5;

// ── Recent commands persistence ─────────────────────────────

function getRecentIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecent(id: string) {
  const recent = getRecentIds().filter((r) => r !== id);
  recent.unshift(id);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

// ── Fuzzy highlight ─────────────────────────────────────────

function HighlightedText({ text, indices }: { text: string; indices?: number[] }) {
  if (!indices || indices.length === 0) return <>{text}</>;
  const indexSet = new Set(indices);
  return (
    <>
      {text.split("").map((ch, i) =>
        indexSet.has(i) ? (
          <span key={i} className="cp-match">{ch}</span>
        ) : (
          <span key={i}>{ch}</span>
        )
      )}
    </>
  );
}

// ── Types ───────────────────────────────────────────────────

type RowItem =
  | { type: "category"; category: CommandCategory }
  | { type: "command"; flatIdx: number };

interface Props {
  visible: boolean;
  filter: string;
  onSelect: (action: string) => void;
  onClose: () => void;
}

// ── Component ───────────────────────────────────────────────

function CommandPalette({ visible, filter, onSelect, onClose }: Props) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [searchValue, setSearchValue] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Derive effective query: external filter or local search input
  const query = filter.replace(/^\//, "").trim() || searchValue;

  // Build filtered + grouped items
  const { items, rows } = useMemo(() => {
    const topLevel = commands.filter((c) => !c.id.includes(":"));

    if (!query) {
      // No query: group by category in fixed order
      const flat: Command[] = [];
      const rowList: RowItem[] = [];

      for (const cat of CATEGORY_ORDER) {
        const catCmds = topLevel.filter((c) => c.category === cat);
        if (catCmds.length === 0) continue;
        rowList.push({ type: "category", category: cat });
        for (const cmd of catCmds) {
          rowList.push({ type: "command", flatIdx: flat.length });
          flat.push(cmd);
        }
      }
      return { items: flat, rows: rowList };
    }

    // Query present: flat filtered list, grouped by category
    const matched = filterCommands(query);
    const flat: (Command & { matchIndices?: number[] })[] = [];
    const rowList: RowItem[] = [];
    const grouped = new Map<CommandCategory, typeof matched>();

    for (const cmd of matched) {
      const cat = cmd.category;
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push(cmd);
    }

    for (const cat of CATEGORY_ORDER) {
      const catCmds = grouped.get(cat);
      if (!catCmds || catCmds.length === 0) continue;
      rowList.push({ type: "category", category: cat });
      for (const cmd of catCmds) {
        rowList.push({ type: "command", flatIdx: flat.length });
        flat.push(cmd);
      }
    }

    return { items: flat, rows: rowList };
  }, [query]);

  // Reset selection when filter changes
  useEffect(() => setSelectedIdx(0), [query]);

  // Focus search input when palette opens
  useEffect(() => {
    if (visible && searchRef.current) {
      searchRef.current.focus();
    }
    if (visible) {
      setSearchValue("");
    }
  }, [visible]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector("[data-selected='true']");
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!visible) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, items.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (items[selectedIdx]) {
          saveRecent(items[selectedIdx].id);
          onSelect(items[selectedIdx].id);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [visible, items, selectedIdx, onSelect, onClose]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!visible) return null;

  return (
    <div className="cp-overlay" onClick={onClose}>
      <div className="cp-container" onClick={(e) => e.stopPropagation()}>
        {/* Search input */}
        <div className="cp-search-row">
          <span className="cp-search-icon">&gt;</span>
          <input
            ref={searchRef}
            className="cp-search-input"
            type="text"
            placeholder="Type a command..."
            value={filter.replace(/^\//, "").trim() || searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
          <span className="cp-search-hint">esc to close</span>
        </div>

        {/* Command list */}
        <div className="cp-list" ref={listRef}>
          {items.length === 0 ? (
            <div className="cp-empty">
              <span className="cp-empty-text">No matching commands</span>
            </div>
          ) : (
            rows.map((row, ri) => {
              if (row.type === "category") {
                const meta = categoryMeta[row.category];
                return (
                  <div key={`cat-${row.category}`} className="cp-category">
                    <span className="cp-category-label">{meta.label}</span>
                    <span className="cp-category-line" />
                  </div>
                );
              }

              const cmd = items[row.flatIdx];
              const isSelected = row.flatIdx === selectedIdx;
              const matchIndices = "matchIndices" in cmd
                ? (cmd as any).matchIndices as number[] | undefined
                : undefined;

              return (
                <div
                  key={`${cmd.id}-${ri}`}
                  className={`cp-item${isSelected ? " cp-item-selected" : ""}`}
                  data-selected={isSelected}
                  onClick={() => {
                    saveRecent(cmd.id);
                    onSelect(cmd.id);
                  }}
                  onMouseEnter={() => setSelectedIdx(row.flatIdx)}
                >
                  <span className="cp-item-name">
                    <HighlightedText text={cmd.label} indices={matchIndices} />
                  </span>
                  <span className="cp-item-desc">{cmd.description}</span>
                  {cmd.shortcut && (
                    <span className="cp-item-shortcut">{cmd.shortcut}</span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="cp-footer">
          <span><kbd>up</kbd><kbd>down</kbd> navigate</span>
          <span><kbd>enter</kbd> select</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

export default memo(CommandPalette);
