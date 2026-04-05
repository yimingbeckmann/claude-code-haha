import { useState, useCallback, useMemo, type ReactNode } from "react";
import { CopyIcon, CheckIcon } from "../../icons/Icons";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SyntheticOutputMessageProps {
  /** The raw output text */
  output: string;
  /** Detected or declared format */
  format: "json" | "yaml" | "table" | "text";
  /** Optional title/label */
  title?: string;
  durationMs?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m${s}s`;
}

function CopyButton({ text, label = "output" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);

  return (
    <button
      style={S.copyBtn}
      onClick={(e) => { e.stopPropagation(); handleCopy(); }}
      title={`Copy ${label}`}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

function Badge({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span style={{
      ...S.badge,
      ...(color ? { background: color + "18", color, borderColor: color + "40" } : {}),
    }}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// JSON syntax highlighting (lightweight, no deps)
// ---------------------------------------------------------------------------

function highlightJson(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /("(?:[^"\\]|\\.)*")\s*:|("(?:[^"\\]|\\.)*")|(\b(?:true|false|null)\b)|(-?\d+\.?\d*(?:[eE][+-]?\d+)?)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[1]) {
      // Key
      parts.push(<span key={match.index} style={{ color: "var(--syntax-keyword, #c678dd)" }}>{match[1]}</span>);
      parts.push(":");
      lastIndex = re.lastIndex;
      continue;
    }
    if (match[2]) {
      // String value
      parts.push(<span key={match.index} style={{ color: "var(--syntax-string, #98c379)" }}>{match[2]}</span>);
    } else if (match[3]) {
      // Boolean / null
      parts.push(<span key={match.index} style={{ color: "var(--syntax-number, #d19a66)" }}>{match[3]}</span>);
    } else if (match[4]) {
      // Number
      parts.push(<span key={match.index} style={{ color: "var(--syntax-number, #d19a66)" }}>{match[4]}</span>);
    }
    lastIndex = re.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

// ---------------------------------------------------------------------------
// YAML syntax highlighting (lightweight)
// ---------------------------------------------------------------------------

function highlightYaml(text: string): ReactNode[] {
  const lines = text.split("\n");
  const parts: ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (i > 0) parts.push("\n");
    const line = lines[i];

    // Comments
    if (line.trimStart().startsWith("#")) {
      parts.push(<span key={`c${i}`} style={{ color: "var(--text-dim, #5c6370)", fontStyle: "italic" }}>{line}</span>);
      continue;
    }

    // Key: value
    const kv = line.match(/^(\s*)([\w.-]+)(\s*:\s*)(.*)/);
    if (kv) {
      const [, indent, key, colon, value] = kv;
      parts.push(indent);
      parts.push(<span key={`k${i}`} style={{ color: "var(--syntax-keyword, #c678dd)" }}>{key}</span>);
      parts.push(colon);
      // Highlight string values in quotes
      if (/^["']/.test(value)) {
        parts.push(<span key={`v${i}`} style={{ color: "var(--syntax-string, #98c379)" }}>{value}</span>);
      } else if (/^(true|false|null|~)$/i.test(value.trim())) {
        parts.push(<span key={`v${i}`} style={{ color: "var(--syntax-number, #d19a66)" }}>{value}</span>);
      } else if (/^-?\d/.test(value.trim())) {
        parts.push(<span key={`v${i}`} style={{ color: "var(--syntax-number, #d19a66)" }}>{value}</span>);
      } else {
        parts.push(<span key={`v${i}`} style={{ color: "var(--syntax-string, #98c379)" }}>{value}</span>);
      }
      continue;
    }

    // List items
    const li = line.match(/^(\s*-\s)(.*)/);
    if (li) {
      parts.push(<span key={`d${i}`} style={{ color: "var(--text-dim, #5c6370)" }}>{li[1]}</span>);
      parts.push(li[2]);
      continue;
    }

    parts.push(line);
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Table parser: expects TSV/CSV or markdown-style table
// ---------------------------------------------------------------------------

interface TableData {
  headers: string[];
  rows: string[][];
}

function parseTable(text: string): TableData | null {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return null;

  // Try markdown table (with | separators)
  if (lines[0].includes("|")) {
    const parse = (line: string) =>
      line.split("|").map((c) => c.trim()).filter(Boolean);
    const headers = parse(lines[0]);
    if (headers.length === 0) return null;
    // Skip separator line (--- | ---)
    const startIdx = lines[1] && /^[\s|:-]+$/.test(lines[1]) ? 2 : 1;
    const rows = lines.slice(startIdx).map(parse);
    return { headers, rows };
  }

  // Try TSV
  if (lines[0].includes("\t")) {
    const headers = lines[0].split("\t").map((c) => c.trim());
    const rows = lines.slice(1).map((l) => l.split("\t").map((c) => c.trim()));
    return { headers, rows };
  }

  // Try CSV (simple, no quoting)
  if (lines[0].includes(",") && lines[0].split(",").length >= 2) {
    const headers = lines[0].split(",").map((c) => c.trim());
    const rows = lines.slice(1).map((l) => l.split(",").map((c) => c.trim()));
    return { headers, rows };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Sub-renderers
// ---------------------------------------------------------------------------

function JsonBlock({ output }: { output: string }) {
  const formatted = useMemo(() => {
    try {
      return JSON.stringify(JSON.parse(output), null, 2);
    } catch {
      return output;
    }
  }, [output]);
  const highlighted = useMemo(() => highlightJson(formatted), [formatted]);
  return <pre style={S.pre}>{highlighted}</pre>;
}

function YamlBlock({ output }: { output: string }) {
  const highlighted = useMemo(() => highlightYaml(output), [output]);
  return <pre style={S.pre}>{highlighted}</pre>;
}

function TableBlock({ output }: { output: string }) {
  const data = useMemo(() => parseTable(output), [output]);

  if (!data) {
    // Fallback to pre
    return <pre style={S.pre}>{output}</pre>;
  }

  return (
    <div style={S.tableScroller}>
      <table style={S.table}>
        <thead>
          <tr>
            {data.headers.map((h, i) => (
              <th key={i} style={S.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, ri) => (
            <tr key={ri} style={ri % 2 === 0 ? undefined : { background: "rgba(255,255,255,0.015)" }}>
              {row.map((cell, ci) => (
                <td key={ci} style={S.td}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const FORMAT_LABELS: Record<string, string> = {
  json: "JSON",
  yaml: "YAML",
  table: "Table",
  text: "Text",
};

const FORMAT_COLORS: Record<string, string> = {
  json: "var(--syntax-string, #98c379)",
  yaml: "var(--syntax-keyword, #c678dd)",
  table: "var(--tool-glob, #eab308)",
  text: "var(--text-dim, #5c6370)",
};

export default function SyntheticOutputMessage({
  output, format, title, durationMs,
}: SyntheticOutputMessageProps) {
  const color = FORMAT_COLORS[format] || FORMAT_COLORS.text;

  return (
    <div style={{ ...S.container, borderLeftColor: color }}>
      {/* Header */}
      <div style={S.header}>
        <span style={{ ...S.headerIcon, fontSize: 13 }}>{"\uD83D\uDCCB"}</span>
        {title && <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{title}</span>}
        <Badge color={color}>{FORMAT_LABELS[format] || format}</Badge>
        {durationMs !== undefined && durationMs > 0 && (
          <Badge color="var(--text-dim, #5c6370)">{fmtDuration(durationMs)}</Badge>
        )}
        <span style={{ flex: 1 }} />
        <CopyButton text={output} label="output" />
      </div>

      {/* Content */}
      <div style={S.codeScroller}>
        {format === "json" && <JsonBlock output={output} />}
        {format === "yaml" && <YamlBlock output={output} />}
        {format === "table" && <TableBlock output={output} />}
        {format === "text" && <pre style={S.pre}>{output}</pre>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const S: Record<string, React.CSSProperties> = {
  container: {
    background: "var(--bg-secondary, #1e1e2e)",
    border: "1px solid var(--border, #2e2e3e)",
    borderLeft: "3px solid var(--border, #2e2e3e)",
    borderRadius: 6,
    marginTop: 4,
    marginBottom: 4,
    overflow: "hidden",
    fontSize: 13,
    lineHeight: 1.5,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderBottom: "1px solid var(--border, #2e2e3e)",
    background: "var(--bg-tertiary, rgba(255,255,255,0.02))",
    cursor: "default",
    minHeight: 32,
    flexWrap: "wrap" as const,
  },
  headerIcon: {
    display: "inline-flex",
    alignItems: "center",
    marginRight: 2,
    color: "var(--text-dim, #5c6370)",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    fontSize: 10,
    fontWeight: 500,
    padding: "1px 6px",
    borderRadius: 4,
    border: "1px solid var(--border, #2e2e3e)",
    background: "var(--bg-tertiary, rgba(255,255,255,0.04))",
    color: "var(--text-dim, #5c6370)",
    whiteSpace: "nowrap" as const,
    lineHeight: 1.4,
  },
  codeScroller: {
    overflowX: "auto",
    overflowY: "auto",
    maxHeight: 500,
  },
  pre: {
    margin: 0,
    padding: "8px 12px",
    fontFamily: "var(--font-mono, 'SF Mono', Monaco, Consolas, monospace)",
    fontSize: 11,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
    color: "var(--text-primary, #abb2bf)",
  },
  tableScroller: {
    overflowX: "auto",
    maxHeight: 500,
  },
  table: {
    borderCollapse: "collapse" as const,
    width: "100%",
    fontFamily: "var(--font-mono, 'SF Mono', Monaco, Consolas, monospace)",
    fontSize: 11,
    lineHeight: 1.5,
  },
  th: {
    textAlign: "left" as const,
    padding: "6px 12px",
    borderBottom: "2px solid var(--border, #2e2e3e)",
    color: "var(--text-primary, #abb2bf)",
    fontWeight: 600,
    whiteSpace: "nowrap" as const,
    background: "var(--bg-tertiary, rgba(255,255,255,0.02))",
  },
  td: {
    padding: "4px 12px",
    borderBottom: "1px solid var(--border, #2e2e3e)",
    color: "var(--text-secondary, #abb2bf)",
    whiteSpace: "pre-wrap" as const,
  },
  copyBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "none",
    border: "none",
    color: "var(--text-dim, #5c6370)",
    cursor: "pointer",
    padding: 2,
    borderRadius: 3,
    width: 22,
    height: 22,
    opacity: 0.6,
    transition: "opacity 0.15s",
  },
};
