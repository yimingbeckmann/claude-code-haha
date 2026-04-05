import { useState, useCallback, useEffect, useRef, memo } from "react";

interface FileItem {
  name: string;
  path: string;
  isDirectory?: boolean;
}

interface Props {
  query: string;
  files: FileItem[];
  visible: boolean;
  onSelect: (file: FileItem) => void;
  onDismiss: () => void;
}

const MAX_VISIBLE = 8;
const ITEM_HEIGHT = 32;

function getExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

function getFileIcon(file: FileItem): { symbol: string; color: string } {
  if (file.isDirectory) return { symbol: "\u{1F4C1}", color: "#eab308" };
  const ext = getExtension(file.name);
  switch (ext) {
    case "tsx":
    case "ts":
      return { symbol: "\u{1F4C4}", color: "#06b6d4" };
    case "js":
    case "jsx":
      return { symbol: "\u{1F4C4}", color: "#eab308" };
    case "css":
    case "scss":
    case "less":
      return { symbol: "\u{1F4C4}", color: "#a855f7" };
    case "json":
    case "yaml":
    case "yml":
    case "toml":
    case "env":
    case "config":
    case "lock":
      return { symbol: "\u2699\uFE0F", color: "#9ca3af" };
    default:
      return { symbol: "\u{1F4C4}", color: "#9ca3af" };
  }
}

function fuzzyMatch(text: string, query: string): { matches: boolean; indices: number[] } {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const indices: number[] = [];
  let qi = 0;
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) {
      indices.push(i);
      qi++;
    }
  }
  return { matches: qi === q.length, indices };
}

function HighlightedText({ text, indices }: { text: string; indices: number[] }) {
  const set = new Set(indices);
  const spans: React.ReactNode[] = [];
  let run = "";
  let runBold = false;

  for (let i = 0; i <= text.length; i++) {
    const bold = set.has(i);
    if (i === text.length || bold !== runBold) {
      if (run) {
        spans.push(
          runBold ? (
            <span key={i} style={{ fontWeight: 700, color: "#f97316" }}>
              {run}
            </span>
          ) : (
            <span key={i}>{run}</span>
          )
        );
      }
      run = i < text.length ? text[i] : "";
      runBold = bold;
    } else {
      run += text[i];
    }
  }
  return <>{spans}</>;
}

const styles = {
  overlay: {
    position: "absolute" as const,
    bottom: "100%",
    left: 0,
    right: 0,
    marginBottom: 4,
    zIndex: 100,
  },
  container: {
    background: "#151520",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    boxShadow: "0 -4px 24px rgba(0,0,0,0.5)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column" as const,
  },
  header: {
    padding: "8px 12px",
    fontSize: 11,
    fontWeight: 600,
    color: "rgba(255,255,255,0.4)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  list: {
    maxHeight: MAX_VISIBLE * ITEM_HEIGHT,
    overflowY: "auto" as const,
    padding: "4px 0",
  },
  item: (selected: boolean) => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    height: ITEM_HEIGHT,
    padding: "0 12px",
    cursor: "pointer",
    background: selected ? "rgba(249,115,22,0.12)" : "transparent",
    transition: "background 0.1s",
    fontSize: 13,
    color: selected ? "#fff" : "rgba(255,255,255,0.7)",
  }),
  icon: (color: string) => ({
    fontSize: 14,
    color,
    width: 20,
    textAlign: "center" as const,
    flexShrink: 0,
  }),
  fileName: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
    fontSize: 12,
  },
  filePath: {
    fontSize: 11,
    color: "rgba(255,255,255,0.3)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    maxWidth: 200,
  },
  empty: {
    padding: "16px 12px",
    textAlign: "center" as const,
    color: "rgba(255,255,255,0.35)",
    fontSize: 13,
  },
  footer: {
    display: "flex",
    gap: 12,
    padding: "6px 12px",
    borderTop: "1px solid rgba(255,255,255,0.06)",
    fontSize: 11,
    color: "rgba(255,255,255,0.3)",
  },
  kbd: {
    display: "inline-block",
    background: "rgba(255,255,255,0.08)",
    borderRadius: 3,
    padding: "1px 5px",
    fontSize: 10,
    fontFamily: "inherit",
    color: "rgba(255,255,255,0.5)",
    marginRight: 4,
  },
};

function FileMention({ query, files, visible, onSelect, onDismiss }: Props) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = query
    ? files
        .map((f) => {
          const result = fuzzyMatch(f.name, query);
          return { file: f, ...result };
        })
        .filter((r) => r.matches)
    : files.map((f) => ({ file: f, matches: true, indices: [] as number[] }));

  useEffect(() => setSelectedIdx(0), [query]);

  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.children[selectedIdx] as HTMLElement | undefined;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIdx]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!visible) return;
      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          setSelectedIdx((i) => (i > 0 ? i - 1 : filtered.length - 1));
          break;
        case "ArrowDown":
          e.preventDefault();
          setSelectedIdx((i) => (i < filtered.length - 1 ? i + 1 : 0));
          break;
        case "Tab":
        case "Enter":
          e.preventDefault();
          if (filtered[selectedIdx]) {
            onSelect(filtered[selectedIdx].file);
          }
          break;
        case "Escape":
          e.preventDefault();
          onDismiss();
          break;
      }
    },
    [visible, filtered, selectedIdx, onSelect, onDismiss]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!visible) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.container}>
        <div style={styles.header}>Files</div>

        {filtered.length === 0 ? (
          <div style={styles.empty}>No files found</div>
        ) : (
          <div ref={listRef} style={styles.list}>
            {filtered.map((item, i) => {
              const icon = getFileIcon(item.file);
              return (
                <div
                  key={item.file.path}
                  style={styles.item(i === selectedIdx)}
                  onMouseEnter={() => setSelectedIdx(i)}
                  onClick={() => onSelect(item.file)}
                >
                  <span style={styles.icon(icon.color)}>{icon.symbol}</span>
                  <span style={styles.fileName}>
                    <HighlightedText text={item.file.name} indices={item.indices} />
                  </span>
                  <span style={styles.filePath}>{item.file.path}</span>
                </div>
              );
            })}
          </div>
        )}

        <div style={styles.footer}>
          <span>
            <span style={styles.kbd}>&uarr;&darr;</span> navigate
          </span>
          <span>
            <span style={styles.kbd}>Tab</span> accept
          </span>
          <span>
            <span style={styles.kbd}>Esc</span> dismiss
          </span>
        </div>
      </div>
    </div>
  );
}

export default memo(FileMention);
