import { useState, useCallback, useMemo, type ReactNode } from "react";
import { CopyIcon, CheckIcon, ChevronDown, ChevronRight, FileIcon, SearchIcon, WarningIcon, EditIcon } from "../icons/Icons";
import SleepToolMessage from "./tools/SleepToolMessage";
import SyntheticOutputMessage from "./tools/SyntheticOutputMessage";
import McpAuthMessage from "./tools/McpAuthMessage";
import TeamToolMessage from "./tools/TeamToolMessage";
import SwarmMessage from "./tools/SwarmMessage";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ToolResultMessageProps {
  toolName?: string;
  toolId?: string;
  output: string;
  isError?: boolean;
  isStreaming?: boolean;
  durationMs?: number;
  filePath?: string;
  matchCount?: number;
  fileCount?: number;
}

// ---------------------------------------------------------------------------
// ANSI parsing (mirrors BashOutputMessage)
// ---------------------------------------------------------------------------

const ANSI_COLORS: Record<string, string> = {
  "30": "#1e1e1e", "31": "#e06c75", "32": "#98c379", "33": "#e5c07b",
  "34": "#61afef", "35": "#c678dd", "36": "#56b6c2", "37": "#abb2bf",
  "90": "#5c6370", "91": "#e06c75", "92": "#98c379", "93": "#e5c07b",
  "94": "#61afef", "95": "#c678dd", "96": "#56b6c2", "97": "#ffffff",
};

const ANSI_BG_COLORS: Record<string, string> = {
  "40": "#1e1e1e", "41": "#e06c75", "42": "#98c379", "43": "#e5c07b",
  "44": "#61afef", "45": "#c678dd", "46": "#56b6c2", "47": "#abb2bf",
  "100": "#5c6370", "101": "#e06c75", "102": "#98c379", "103": "#e5c07b",
  "104": "#61afef", "105": "#c678dd", "106": "#56b6c2", "107": "#ffffff",
};

export function parseAnsi(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  // eslint-disable-next-line no-control-regex
  const re = /\x1b\[([0-9;]*)m/g;
  let lastIndex = 0;
  let fg: string | undefined;
  let bg: string | undefined;
  let bold = false;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const chunk = text.slice(lastIndex, match.index);
      if (fg || bg || bold) {
        const style: React.CSSProperties = {};
        if (fg) style.color = fg;
        if (bg) style.backgroundColor = bg;
        if (bold) style.fontWeight = "bold";
        parts.push(<span key={lastIndex} style={style}>{chunk}</span>);
      } else {
        parts.push(chunk);
      }
    }
    const codes = match[1].split(";").filter(Boolean);
    for (const code of codes) {
      if (code === "0" || code === "") { fg = undefined; bg = undefined; bold = false; }
      else if (code === "1") bold = true;
      else if (code === "22") bold = false;
      else if (ANSI_COLORS[code]) fg = ANSI_COLORS[code];
      else if (ANSI_BG_COLORS[code]) bg = ANSI_BG_COLORS[code];
      else if (code === "39") fg = undefined;
      else if (code === "49") bg = undefined;
    }
    lastIndex = re.lastIndex;
  }

  if (lastIndex < text.length) {
    const chunk = text.slice(lastIndex);
    if (fg || bg || bold) {
      const style: React.CSSProperties = {};
      if (fg) style.color = fg;
      if (bg) style.backgroundColor = bg;
      if (bold) style.fontWeight = "bold";
      parts.push(<span key={lastIndex} style={style}>{chunk}</span>);
    } else {
      parts.push(chunk);
    }
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function shortPath(p: string): string {
  return p.replace(/^\/Users\/[^/]+/, "~");
}

function basename(path: string): string {
  return path.split("/").pop() || path;
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m${s}s`;
}

function isToolType(toolName: string | undefined, ...names: string[]): boolean {
  if (!toolName) return false;
  const lower = toolName.toLowerCase();
  return names.some(n => lower === n.toLowerCase() || lower.includes(n.toLowerCase()));
}

// ---------------------------------------------------------------------------
// Language detection from file extension
// ---------------------------------------------------------------------------

const LANG_MAP: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
  py: "python", rb: "ruby", rs: "rust", go: "go", java: "java",
  kt: "kotlin", swift: "swift", c: "c", cpp: "c++", h: "c", hpp: "c++",
  cs: "c#", css: "css", scss: "scss", html: "html", htm: "html", xml: "xml",
  json: "json", yaml: "yaml", yml: "yaml", toml: "toml",
  md: "markdown", sh: "shell", bash: "shell", zsh: "shell", fish: "shell",
  sql: "sql", graphql: "graphql", gql: "graphql", proto: "protobuf",
  dockerfile: "dockerfile", makefile: "makefile",
  lua: "lua", php: "php", pl: "perl", r: "r", scala: "scala",
  ex: "elixir", exs: "elixir", zig: "zig", dart: "dart",
  vue: "vue", svelte: "svelte", nim: "nim",
};

function langFromPath(path: string): string {
  const base = path.split("/").pop() || "";
  const lower = base.toLowerCase();
  if (LANG_MAP[lower]) return LANG_MAP[lower];
  const ext = lower.split(".").pop() || "";
  return LANG_MAP[ext] || ext;
}

// ---------------------------------------------------------------------------
// Lightweight syntax highlighting (keyword-based, no external deps)
// ---------------------------------------------------------------------------

const KEYWORD_SETS: Record<string, Set<string>> = {
  typescript: new Set(["import", "export", "from", "const", "let", "var", "function", "return", "if", "else", "for", "while", "class", "interface", "type", "extends", "implements", "new", "this", "async", "await", "try", "catch", "throw", "switch", "case", "default", "break", "continue", "typeof", "instanceof", "in", "of", "null", "undefined", "true", "false", "void", "never", "any", "string", "number", "boolean", "enum", "readonly", "private", "public", "protected", "static", "abstract", "as", "is"]),
  javascript: new Set(["import", "export", "from", "const", "let", "var", "function", "return", "if", "else", "for", "while", "class", "extends", "new", "this", "async", "await", "try", "catch", "throw", "switch", "case", "default", "break", "continue", "typeof", "instanceof", "in", "of", "null", "undefined", "true", "false", "void", "yield"]),
  python: new Set(["import", "from", "def", "return", "if", "elif", "else", "for", "while", "class", "with", "as", "try", "except", "finally", "raise", "pass", "break", "continue", "and", "or", "not", "in", "is", "None", "True", "False", "lambda", "yield", "async", "await", "self", "global", "nonlocal"]),
  rust: new Set(["fn", "let", "mut", "const", "if", "else", "for", "while", "loop", "match", "return", "struct", "enum", "impl", "trait", "pub", "use", "mod", "crate", "self", "super", "where", "async", "await", "move", "ref", "true", "false", "Some", "None", "Ok", "Err", "Self", "type", "unsafe", "extern", "static", "dyn", "as", "in"]),
  go: new Set(["func", "return", "if", "else", "for", "range", "switch", "case", "default", "break", "continue", "var", "const", "type", "struct", "interface", "map", "chan", "go", "defer", "select", "package", "import", "nil", "true", "false", "make", "new", "append", "len", "cap"]),
  shell: new Set(["if", "then", "else", "elif", "fi", "for", "do", "done", "while", "until", "case", "esac", "function", "return", "local", "export", "source", "echo", "exit", "set", "unset", "readonly", "shift", "true", "false"]),
};

function highlightLine(text: string, lang: string): ReactNode {
  const keywords = KEYWORD_SETS[lang];
  if (!keywords) return text;

  const parts: ReactNode[] = [];
  const re = /(\/\/.*$|#.*$|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b\d+\.?\d*\b|\b[a-zA-Z_]\w*\b)/gm;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("//") || (token.startsWith("#") && lang !== "c" && lang !== "c++")) {
      parts.push(<span key={match.index} style={{ color: "var(--text-dim, #5c6370)", fontStyle: "italic" }}>{token}</span>);
    } else if (token.startsWith('"') || token.startsWith("'") || token.startsWith("`")) {
      parts.push(<span key={match.index} style={{ color: "var(--syntax-string, #98c379)" }}>{token}</span>);
    } else if (/^\d/.test(token)) {
      parts.push(<span key={match.index} style={{ color: "var(--syntax-number, #d19a66)" }}>{token}</span>);
    } else if (keywords.has(token)) {
      parts.push(<span key={match.index} style={{ color: "var(--syntax-keyword, #c678dd)" }}>{token}</span>);
    } else {
      parts.push(token);
    }
    lastIndex = re.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts}</>;
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

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

function DurationBadge({ ms }: { ms: number }) {
  if (ms <= 0) return null;
  return <Badge color="var(--text-dim, #5c6370)">{fmtDuration(ms)}</Badge>;
}

function CollapsibleFileGroup({
  title,
  defaultExpanded = true,
  count,
  children,
}: {
  title: ReactNode;
  defaultExpanded?: boolean;
  count?: number;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div style={{ borderBottom: "1px solid var(--border, #2e2e3e)" }}>
      <div
        style={S.collapsibleHeader}
        onClick={() => setExpanded(!expanded)}
      >
        <span style={{ display: "inline-flex", alignItems: "center", marginRight: 4 }}>
          {expanded ? <ChevronDown /> : <ChevronRight />}
        </span>
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
        {count !== undefined && count > 0 && <Badge>{count} match{count !== 1 ? "es" : ""}</Badge>}
      </div>
      {expanded && children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. ReadResult - File read with syntax highlighting, line numbers, gutter
// ---------------------------------------------------------------------------

const READ_COLLAPSE = 30;

function ReadResult({ output, filePath, durationMs }: {
  output: string; filePath?: string; durationMs?: number;
}) {
  const path = filePath || "";
  const lang = path ? langFromPath(path) : "";
  const lines = useMemo(() => output.split("\n"), [output]);
  const lineCount = lines.length;
  const isLong = lineCount > READ_COLLAPSE;
  const [expanded, setExpanded] = useState(!isLong);

  // Detect "cat -n" style output: lines starting with number + tab
  const { startLine, hasLineNumbers } = useMemo(() => {
    const first = lines[0] || "";
    const m = first.match(/^\s*(\d+)\t/);
    return { startLine: m ? parseInt(m[1], 10) : 1, hasLineNumbers: !!m };
  }, [lines]);

  const displayLines = expanded ? lines : lines.slice(0, READ_COLLAPSE);

  return (
    <div style={S.container}>
      {/* Header */}
      <div style={S.header}>
        <span style={S.headerIcon}><FileIcon /></span>
        {path && <span style={S.filePath}>{shortPath(path)}</span>}
        <Badge color="var(--tool-read, #61afef)">{lineCount} lines</Badge>
        {lang && <Badge color="var(--text-dim, #5c6370)">{lang}</Badge>}
        {durationMs !== undefined && <DurationBadge ms={durationMs} />}
        <span style={{ flex: 1 }} />
        <CopyButton text={output} label="file content" />
      </div>

      {/* Code block with gutter */}
      <div style={S.codeScroller}>
        <table style={S.codeTable}>
          <tbody>
            {displayLines.map((line, i) => {
              let lineNum: number;
              let content: string;
              if (hasLineNumbers) {
                const m = line.match(/^\s*(\d+)\t(.*)/);
                lineNum = m ? parseInt(m[1], 10) : startLine + i;
                content = m ? m[2] : line;
              } else {
                lineNum = startLine + i;
                content = line;
              }
              return (
                <tr key={i}>
                  <td style={S.lineGutter}>{lineNum}</td>
                  <td style={S.lineContent}>
                    <pre style={S.lineContentPre}>{highlightLine(content, lang)}</pre>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Expand / Collapse toggle */}
      {isLong && (
        <button style={S.expandBtn} onClick={() => setExpanded(!expanded)}>
          {expanded ? "Collapse" : `+${lineCount - READ_COLLAPSE} more lines`}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. SearchResult - Grep results grouped by file with match highlighting
// ---------------------------------------------------------------------------

interface GrepFileGroup {
  path: string;
  matches: { lineNum: number; text: string }[];
}

function parseGrepOutput(output: string): GrepFileGroup[] {
  const byFile = new Map<string, { lineNum: number; text: string }[]>();

  for (const line of output.split("\n")) {
    if (!line.trim()) continue;
    // filepath:linenum:content
    const m = line.match(/^(.+?):(\d+):(.*)$/);
    if (m) {
      const [, fp, num, text] = m;
      if (!byFile.has(fp)) byFile.set(fp, []);
      byFile.get(fp)!.push({ lineNum: parseInt(num, 10), text });
    } else {
      // Might be a file path only (files_with_matches mode)
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("Found ")) {
        if (!byFile.has(trimmed)) byFile.set(trimmed, []);
      }
    }
  }

  const groups: GrepFileGroup[] = [];
  for (const [path, matches] of byFile) {
    groups.push({ path, matches });
  }
  return groups;
}

function parseGrepCounts(output: string, propMatch?: number, propFiles?: number): { matches: number; files: number } {
  if (propMatch !== undefined && propFiles !== undefined) {
    return { matches: propMatch, files: propFiles };
  }
  const foundMatch = output.match(/Found\s+(\d+)\s+results?/i);
  const matches = propMatch ?? (foundMatch ? parseInt(foundMatch[1], 10) : 0);
  if (propFiles !== undefined) return { matches, files: propFiles };
  const fileSet = new Set<string>();
  for (const line of output.split("\n")) {
    const m = line.match(/^([^\s:]+\.\w+):/);
    if (m) fileSet.add(m[1]);
  }
  const files = fileSet.size || (matches > 0 ? 1 : 0);
  return { matches: matches || output.split("\n").filter(l => l.trim()).length, files };
}

function highlightMatchInLine(text: string): ReactNode {
  // Highlight text between ** markers if present, otherwise return as-is
  if (!text.includes("**")) return text;
  const parts: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push(text.slice(lastIdx, m.index));
    parts.push(
      <span key={m.index} style={{
        background: "var(--highlight-bg, rgba(229, 192, 123, 0.25))",
        color: "var(--highlight-fg, #e5c07b)",
        borderRadius: 2,
        padding: "0 1px",
      }}>
        {m[1]}
      </span>
    );
    lastIdx = re.lastIndex;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return <>{parts}</>;
}

function SearchResult({ output, matchCount, fileCount, durationMs }: {
  output: string; matchCount?: number; fileCount?: number; durationMs?: number;
}) {
  const groups = useMemo(() => parseGrepOutput(output), [output]);
  const { matches: totalMatches, files: totalFiles } = useMemo(
    () => parseGrepCounts(output, matchCount, fileCount),
    [output, matchCount, fileCount]
  );

  return (
    <div style={S.container}>
      {/* Header */}
      <div style={S.header}>
        <span style={S.headerIcon}><SearchIcon /></span>
        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>Search Results</span>
        <Badge color="var(--tool-grep, #e5c07b)">{totalMatches} match{totalMatches !== 1 ? "es" : ""}</Badge>
        <Badge color="var(--text-dim, #5c6370)">{totalFiles} file{totalFiles !== 1 ? "s" : ""}</Badge>
        {durationMs !== undefined && <DurationBadge ms={durationMs} />}
        <span style={{ flex: 1 }} />
        <CopyButton text={output} label="search results" />
      </div>

      {/* File groups */}
      <div style={S.resultScroller}>
        {groups.length > 0 ? groups.map((group, gi) => (
          <CollapsibleFileGroup
            key={gi}
            title={<span style={S.filePath}>{shortPath(group.path)}</span>}
            defaultExpanded={groups.length <= 5}
            count={group.matches.length > 0 ? group.matches.length : undefined}
          >
            {group.matches.length > 0 && (
              <table style={S.codeTable}>
                <tbody>
                  {group.matches.map((m, mi) => (
                    <tr key={mi} style={mi % 2 === 0 ? undefined : { background: "rgba(255,255,255,0.015)" }}>
                      <td style={S.lineGutter}>{m.lineNum}</td>
                      <td style={S.lineContent}>
                        <pre style={S.lineContentPre}>{highlightMatchInLine(m.text)}</pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CollapsibleFileGroup>
        )) : (
          <pre style={S.preBlock}>{output}</pre>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. GlobResult - File list with icons and extension grouping
// ---------------------------------------------------------------------------

function getFileExtension(path: string): string {
  const name = path.split("/").pop() || "";
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

function isDirectory(path: string): boolean {
  return path.endsWith("/");
}

function GlobResult({ output, fileCount, durationMs }: {
  output: string; fileCount?: number; durationMs?: number;
}) {
  const [groupByExt, setGroupByExt] = useState(false);

  const files = useMemo(() =>
    output.split("\n").map(l => l.trim()).filter(Boolean),
    [output]
  );
  const totalCount = fileCount ?? files.length;

  const grouped = useMemo(() => {
    if (!groupByExt) return null;
    const map = new Map<string, string[]>();
    for (const f of files) {
      const ext = getFileExtension(f) || "(no ext)";
      if (!map.has(ext)) map.set(ext, []);
      map.get(ext)!.push(f);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [files, groupByExt]);

  const isLong = files.length > 30;
  const [expanded, setExpanded] = useState(!isLong);
  const displayFiles = expanded ? files : files.slice(0, 30);

  return (
    <div style={S.container}>
      {/* Header */}
      <div style={S.header}>
        <span style={S.headerIcon}><FileIcon /></span>
        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>Files</span>
        <Badge color="var(--tool-glob, #56b6c2)">{totalCount} file{totalCount !== 1 ? "s" : ""}</Badge>
        {durationMs !== undefined && <DurationBadge ms={durationMs} />}
        <span style={{ flex: 1 }} />
        <button
          style={{
            ...S.copyBtn,
            fontSize: 10,
            width: "auto",
            padding: "1px 6px",
            opacity: groupByExt ? 1 : 0.5,
            fontFamily: "var(--font-mono, monospace)",
          }}
          onClick={(e) => { e.stopPropagation(); setGroupByExt(!groupByExt); }}
          title="Group by file extension"
        >
          .ext
        </button>
        <CopyButton text={output} label="file list" />
      </div>

      {/* File list */}
      <div style={S.fileListScroller}>
        {!grouped ? (
          <>
            {displayFiles.map((f, i) => (
              <div key={i} style={S.fileListItem}>
                <span style={S.fileIcon}>{isDirectory(f) ? "\uD83D\uDCC1" : "\uD83D\uDCC4"}</span>
                <span style={S.fileListPath}>{shortPath(f)}</span>
              </div>
            ))}
            {isLong && (
              <button style={S.expandBtn} onClick={() => setExpanded(!expanded)}>
                {expanded ? "Collapse" : `+${files.length - 30} more files`}
              </button>
            )}
          </>
        ) : (
          grouped.map(([ext, extFiles]) => (
            <CollapsibleFileGroup
              key={ext}
              title={
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontWeight: 600, fontFamily: "var(--font-mono, monospace)", fontSize: 11 }}>.{ext}</span>
                  <Badge>{extFiles.length}</Badge>
                </span>
              }
              defaultExpanded={grouped.length <= 5}
            >
              {extFiles.map((f, i) => (
                <div key={i} style={{ ...S.fileListItem, paddingLeft: 28 }}>
                  <span style={S.fileIcon}>{"\uD83D\uDCC4"}</span>
                  <span style={S.fileListPath}>{shortPath(f)}</span>
                </div>
              ))}
            </CollapsibleFileGroup>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. WebFetchResult - URL, response status, truncated content
// ---------------------------------------------------------------------------

const WEB_TRUNCATE = 2000;

function WebFetchResult({ output, durationMs }: {
  output: string; durationMs?: number;
}) {
  const [expanded, setExpanded] = useState(false);

  // Heuristic extraction of URL and status
  const { url, statusCode, body } = useMemo(() => {
    const lines = output.split("\n");
    let url = "";
    let statusCode = "";
    let bodyStart = 0;

    if (lines[0] && /^https?:\/\//.test(lines[0].trim())) {
      url = lines[0].trim();
      bodyStart = 1;
    }
    const statusMatch = output.match(/HTTP\/[\d.]+ (\d{3})/);
    if (statusMatch) statusCode = statusMatch[1];

    // Also try "Status: NNN" pattern
    if (!statusCode) {
      const alt = output.match(/(?:status)[:\s]*(\d{3})/i);
      if (alt) statusCode = alt[1];
    }

    return { url, statusCode, body: lines.slice(bodyStart).join("\n") };
  }, [output]);

  const isTruncated = body.length > WEB_TRUNCATE;
  const displayBody = expanded ? body : body.slice(0, WEB_TRUNCATE);

  const sizeLabel = body.length < 1024
    ? `${body.length}B`
    : body.length < 1024 * 1024
      ? `${(body.length / 1024).toFixed(1)}KB`
      : `${(body.length / (1024 * 1024)).toFixed(1)}MB`;

  return (
    <div style={S.container}>
      <div style={S.header}>
        <span style={{ ...S.headerIcon, fontSize: 13 }}>{"\uD83C\uDF10"}</span>
        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>Web Fetch</span>
        {url && (
          <span style={{
            fontFamily: "var(--font-mono, monospace)",
            fontSize: 11,
            color: "var(--text-dim, #5c6370)",
            maxWidth: 280,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {url}
          </span>
        )}
        {statusCode && (
          <Badge color={statusCode.startsWith("2") ? "var(--success, #98c379)" : "var(--error, #e06c75)"}>
            {statusCode}
          </Badge>
        )}
        <Badge color="var(--text-dim, #5c6370)">{sizeLabel}</Badge>
        {durationMs !== undefined && <DurationBadge ms={durationMs} />}
        <span style={{ flex: 1 }} />
        <CopyButton text={output} label="response" />
      </div>

      <div style={S.codeScroller}>
        <pre style={S.preBlock}>{displayBody}</pre>
      </div>

      {isTruncated && (
        <button style={S.expandBtn} onClick={() => setExpanded(!expanded)}>
          {expanded ? "Show less" : `+${(body.length - WEB_TRUNCATE).toLocaleString()} more characters`}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. AgentResult - Agent sub-task with description and duration
// ---------------------------------------------------------------------------

function AgentResult({ output, durationMs }: {
  output: string; durationMs?: number;
}) {
  const lines = useMemo(() => output.split("\n"), [output]);
  const lineCount = lines.length;
  const isLong = lineCount > 30;
  const [expanded, setExpanded] = useState(!isLong);
  const displayOutput = expanded ? output : lines.slice(0, 30).join("\n");

  return (
    <div style={{ ...S.container, borderLeftColor: "var(--tool-agent, #c678dd)" }}>
      <div style={S.header}>
        <span style={{ ...S.headerIcon, fontSize: 13 }}>{"\uD83E\uDD16"}</span>
        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>Agent Result</span>
        <Badge color="var(--tool-agent, #c678dd)">{lineCount} lines</Badge>
        {durationMs !== undefined && <DurationBadge ms={durationMs} />}
        <span style={{ flex: 1 }} />
        <CopyButton text={output} label="agent result" />
      </div>

      <div style={S.codeScroller}>
        <pre style={S.preBlock}>{displayOutput}</pre>
      </div>

      {isLong && (
        <button style={S.expandBtn} onClick={() => setExpanded(!expanded)}>
          {expanded ? "Collapse" : `+${lineCount - 30} more lines`}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit/Write result (compact success confirmations)
// ---------------------------------------------------------------------------

function EditResultCompact({ filePath }: { filePath?: string }) {
  return (
    <div style={{ ...S.container, borderLeftColor: "var(--success, #98c379)" }}>
      <div style={{ ...S.header, borderBottom: "none" }}>
        <span style={{ color: "var(--success, #98c379)", display: "inline-flex" }}><CheckIcon /></span>
        <span style={{ display: "inline-flex" }}><EditIcon /></span>
        <span style={{ color: "var(--text-secondary, #abb2bf)" }}>File updated</span>
        {filePath && <span style={S.filePath}>{shortPath(filePath)}</span>}
      </div>
    </div>
  );
}

function WriteResultCompact({ filePath, output }: { filePath?: string; output: string }) {
  const verb = /creat/i.test(output) ? "File created" : "File written";
  return (
    <div style={{ ...S.container, borderLeftColor: "var(--success, #98c379)" }}>
      <div style={{ ...S.header, borderBottom: "none" }}>
        <span style={{ color: "var(--success, #98c379)", display: "inline-flex" }}><CheckIcon /></span>
        <span style={{ display: "inline-flex" }}><FileIcon /></span>
        <span style={{ color: "var(--text-secondary, #abb2bf)" }}>{verb}</span>
        {filePath && <span style={S.filePath}>{shortPath(filePath)}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 6. GenericResult - Fallback with error highlighting and copy
// ---------------------------------------------------------------------------

function ErrorResult({ output, durationMs }: { output: string; durationMs?: number }) {
  const lines = useMemo(() => output.split("\n"), [output]);
  const isLong = lines.length > 20;
  const [expanded, setExpanded] = useState(!isLong);
  const display = expanded ? output : lines.slice(0, 20).join("\n");

  return (
    <div style={{ ...S.container, borderLeftColor: "var(--error, #e06c75)" }}>
      <div style={S.header}>
        <span style={{ color: "var(--error, #e06c75)", display: "inline-flex" }}><WarningIcon /></span>
        <span style={{ color: "var(--error, #e06c75)", fontWeight: 600 }}>Error</span>
        {durationMs !== undefined && <DurationBadge ms={durationMs} />}
        <span style={{ flex: 1 }} />
        <CopyButton text={output} label="error" />
      </div>
      <div style={S.codeScroller}>
        <pre style={{ ...S.preBlock, color: "var(--error, #e06c75)" }}>{display}</pre>
      </div>
      {isLong && (
        <button style={S.expandBtn} onClick={() => setExpanded(!expanded)}>
          {expanded ? "Collapse" : `+${lines.length - 20} more lines`}
        </button>
      )}
    </div>
  );
}

function GenericResult({ output, durationMs, toolName }: {
  output: string; durationMs?: number; toolName?: string;
}) {
  const lines = useMemo(() => output.split("\n"), [output]);
  const lineCount = lines.length;
  const isLong = lineCount > 30;
  const [expanded, setExpanded] = useState(!isLong);
  const hasAnsi = output.includes("\x1b[");

  const displayText = expanded ? output : lines.slice(0, 30).join("\n");
  const parsed = useMemo(() => hasAnsi ? parseAnsi(displayText) : null, [displayText, hasAnsi]);

  return (
    <div style={S.container}>
      <div style={S.header}>
        {toolName && (
          <span style={{
            fontSize: 9,
            color: "var(--text-dim, #5c6370)",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            fontWeight: 500,
          }}>
            {toolName}
          </span>
        )}
        <span style={{ color: "var(--success, #98c379)", display: "inline-flex" }}><CheckIcon /></span>
        <Badge>{lineCount} lines</Badge>
        {durationMs !== undefined && <DurationBadge ms={durationMs} />}
        <span style={{ flex: 1 }} />
        <CopyButton text={output} label="output" />
      </div>
      <div style={S.codeScroller}>
        <pre style={S.preBlock}>{parsed || displayText}</pre>
      </div>
      {isLong && (
        <button style={S.expandBtn} onClick={() => setExpanded(!expanded)}>
          {expanded ? "Collapse" : `+${lineCount - 30} more lines`}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 7. Main ToolResultMessage - routes to specialized sub-component
// ---------------------------------------------------------------------------

export default function ToolResultMessage({
  toolName, toolId: _toolId, output, isError, isStreaming, durationMs, filePath, matchCount, fileCount,
}: ToolResultMessageProps) {
  // Streaming indicator when output is still arriving
  if (isStreaming && output.length < 100) {
    return (
      <div style={{
        padding: '4px 8px', fontSize: '12px', color: 'var(--text-dim)',
        display: 'flex', alignItems: 'center', gap: '6px'
      }}>
        <span className="tool-item-spinner" />
        <span>Running...</span>
      </div>
    );
  }

  // Error always gets the error renderer regardless of tool type
  if (isError) {
    return <ErrorResult output={output} durationMs={durationMs} />;
  }

  // Route by tool type
  if (isToolType(toolName, "Read", "FileReadTool", "read_file")) {
    return <ReadResult output={output} filePath={filePath} durationMs={durationMs} />;
  }
  if (isToolType(toolName, "Grep", "GrepTool", "search_content")) {
    return <SearchResult output={output} matchCount={matchCount} fileCount={fileCount} durationMs={durationMs} />;
  }
  if (isToolType(toolName, "Glob", "GlobTool", "search_files", "list_files")) {
    return <GlobResult output={output} fileCount={fileCount} durationMs={durationMs} />;
  }
  if (isToolType(toolName, "WebFetch", "WebFetchTool")) {
    return <WebFetchResult output={output} durationMs={durationMs} />;
  }
  if (isToolType(toolName, "Agent", "AgentTool")) {
    return <AgentResult output={output} durationMs={durationMs} />;
  }
  if (isToolType(toolName, "Edit", "FileEditTool", "edit_file")) {
    return <EditResultCompact filePath={filePath} />;
  }
  if (isToolType(toolName, "Write", "FileWriteTool", "write_file")) {
    return <WriteResultCompact filePath={filePath} output={output} />;
  }

  // Sleep tool
  if (isToolType(toolName, "Sleep", "SleepTool")) {
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(output); } catch { /* use raw */ }
    const actualMs = typeof parsed.actual === "number" ? parsed.actual : (typeof parsed.actualMs === "number" ? parsed.actualMs : undefined);
    const dur = typeof parsed.duration === "number" ? parsed.duration : (typeof parsed.durationMs === "number" ? parsed.durationMs : 0);
    const interrupted = parsed.interrupted === true;
    return <SleepToolMessage mode="result" durationMs={dur} actualMs={actualMs} interrupted={interrupted} />;
  }

  // Synthetic output tool
  if (isToolType(toolName, "SyntheticOutput", "SyntheticOutputTool")) {
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(output); } catch { /* use raw */ }
    const fmt = (String(parsed.format || "")).toLowerCase();
    const format = (fmt === "json" || fmt === "yaml" || fmt === "table") ? fmt as "json" | "yaml" | "table" : "text";
    const content = typeof parsed.content === "string" ? parsed.content : output;
    const title = typeof parsed.title === "string" ? parsed.title : undefined;
    return <SyntheticOutputMessage output={content} format={format} title={title} durationMs={durationMs} />;
  }

  // MCP Auth tool
  if (isToolType(toolName, "McpAuth", "McpAuthTool")) {
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(output); } catch { /* use raw */ }
    const action = (String(parsed.action || "authenticate")) as "authenticate" | "status" | "refresh" | "reauthenticate";
    const serverName = String(parsed.server || parsed.serverName || "unknown");
    const authStatus = (parsed.status === "success" || parsed.status === "failure" || parsed.status === "pending")
      ? parsed.status as "success" | "failure" | "pending" : undefined;
    const credentialType = typeof parsed.credentialType === "string" ? parsed.credentialType : undefined;
    const expiry = typeof parsed.expiry === "string" ? parsed.expiry : undefined;
    const errorMessage = typeof parsed.error === "string" ? parsed.error : undefined;
    return (
      <McpAuthMessage
        mode="result" action={action} serverName={serverName}
        authStatus={authStatus} credentialType={credentialType}
        expiry={expiry} errorMessage={errorMessage}
      />
    );
  }

  // Team tools
  if (isToolType(toolName, "TeamCreate", "TeamDelete", "TeamTool")) {
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(output); } catch { /* use raw */ }
    const isDelete = isToolType(toolName, "TeamDelete") || parsed.action === "delete";
    const teamName = String(parsed.teamName || parsed.name || "team");
    const members = Array.isArray(parsed.members)
      ? (parsed.members as Array<{ name?: string; role?: string }>).map((m) => ({
          name: String(m.name || ""),
          role: String(m.role || "member"),
        }))
      : undefined;
    const scratchpadPath = typeof parsed.scratchpadPath === "string" ? parsed.scratchpadPath : undefined;
    return (
      <TeamToolMessage
        mode="result" action={isDelete ? "delete" : "create"}
        teamName={teamName} members={members} scratchpadPath={scratchpadPath}
      />
    );
  }

  // Swarm tools
  if (isToolType(toolName, "Swarm", "SwarmTool", "SwarmDispatch")) {
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(output); } catch { /* use raw */ }
    const action = typeof parsed.action === "string" ? parsed.action : undefined;
    const workers = Array.isArray(parsed.workers)
      ? (parsed.workers as Array<{ id?: string; name?: string; status?: string; task?: string; progress?: number }>).map((w) => ({
          id: String(w.id || ""),
          name: w.name ? String(w.name) : undefined,
          status: (w.status === "idle" || w.status === "running" || w.status === "completed" || w.status === "failed")
            ? w.status : "idle" as const,
          task: w.task ? String(w.task) : undefined,
          progress: typeof w.progress === "number" ? w.progress : undefined,
        }))
      : undefined;
    const totalTasks = typeof parsed.totalTasks === "number" ? parsed.totalTasks : undefined;
    const completedTasks = typeof parsed.completedTasks === "number" ? parsed.completedTasks : undefined;
    return (
      <SwarmMessage
        mode="result" action={action} workers={workers}
        totalTasks={totalTasks} completedTasks={completedTasks}
        output={output}
      />
    );
  }

  // Fallback: generic result
  return <GenericResult output={output} durationMs={durationMs} toolName={toolName} />;
}

// ---------------------------------------------------------------------------
// Inline styles using CSS variables from the theme
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
    flexWrap: "wrap",
  },
  headerIcon: {
    display: "inline-flex",
    alignItems: "center",
    marginRight: 2,
    color: "var(--text-dim, #5c6370)",
  },
  filePath: {
    fontFamily: "var(--font-mono, 'SF Mono', Monaco, Consolas, monospace)",
    fontSize: 11,
    color: "var(--text-secondary, #abb2bf)",
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: 400,
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
    whiteSpace: "nowrap",
    lineHeight: 1.4,
  },
  codeScroller: {
    overflowX: "auto",
    overflowY: "auto",
    maxHeight: 500,
  },
  codeTable: {
    borderCollapse: "collapse",
    width: "100%",
    fontFamily: "var(--font-mono, 'SF Mono', Monaco, Consolas, monospace)",
    fontSize: 11,
    lineHeight: 1.5,
  },
  lineGutter: {
    color: "var(--text-dim, #5c6370)",
    textAlign: "right" as const,
    paddingRight: 12,
    paddingLeft: 8,
    userSelect: "none" as const,
    whiteSpace: "nowrap" as const,
    width: 1,
    verticalAlign: "top",
    fontSize: 10,
    opacity: 0.5,
  },
  lineContent: {
    paddingRight: 12,
    whiteSpace: "pre" as const,
    color: "var(--text-primary, #abb2bf)",
  },
  lineContentPre: {
    margin: 0,
    fontFamily: "inherit",
    fontSize: "inherit",
    lineHeight: "inherit",
    whiteSpace: "pre" as const,
  },
  preBlock: {
    margin: 0,
    padding: "8px 12px",
    fontFamily: "var(--font-mono, 'SF Mono', Monaco, Consolas, monospace)",
    fontSize: 11,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
    color: "var(--text-primary, #abb2bf)",
  },
  expandBtn: {
    display: "block",
    width: "100%",
    padding: "4px 10px",
    background: "var(--bg-tertiary, rgba(255,255,255,0.02))",
    border: "none",
    borderTop: "1px solid var(--border, #2e2e3e)",
    color: "var(--text-dim, #5c6370)",
    fontSize: 11,
    cursor: "pointer",
    textAlign: "center" as const,
    transition: "background 0.15s",
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
  collapsibleHeader: {
    display: "flex",
    alignItems: "center",
    padding: "4px 10px",
    cursor: "pointer",
    fontSize: 12,
    color: "var(--text-secondary, #abb2bf)",
    userSelect: "none" as const,
    background: "var(--bg-tertiary, rgba(255,255,255,0.02))",
    transition: "background 0.15s",
  },
  resultScroller: {
    maxHeight: 500,
    overflowY: "auto" as const,
  },
  fileListScroller: {
    maxHeight: 400,
    overflowY: "auto" as const,
  },
  fileListItem: {
    display: "flex",
    alignItems: "center",
    padding: "2px 10px",
    fontSize: 12,
    fontFamily: "var(--font-mono, 'SF Mono', Monaco, Consolas, monospace)",
    lineHeight: 1.6,
  },
  fileIcon: {
    marginRight: 6,
    opacity: 0.6,
    fontSize: 12,
    flexShrink: 0,
  },
  fileListPath: {
    color: "var(--text-primary, #abb2bf)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    fontSize: 11,
  },
};
