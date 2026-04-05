import { useState, useMemo, useCallback } from "react";
import { CopyIcon, CheckIcon, ChevronDown, ChevronRight } from "../icons/Icons";

interface FileEditMessageProps {
  filePath: string;
  oldContent?: string;
  newContent?: string;
  diff?: string;
  timestamp?: number; // accepted but not displayed
  isStreaming?: boolean;
}

// -- Types --

interface DiffLine {
  type: "add" | "del" | "ctx" | "hunk";
  text: string;
  oldNum: number | null;
  newNum: number | null;
}

interface Hunk {
  header: string;
  lines: DiffLine[];
  index: number;
}

interface WordSegment {
  text: string;
  changed: boolean;
}

// -- LCS-based word diff --

function lcsWordDiff(oldStr: string, newStr: string): { oldSegs: WordSegment[]; newSegs: WordSegment[] } {
  const oldWords = tokenize(oldStr);
  const newWords = tokenize(newStr);

  const m = oldWords.length;
  const n = newWords.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldWords[i - 1] === newWords[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const oldInLcs = new Set<number>();
  const newInLcs = new Set<number>();
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (oldWords[i - 1] === newWords[j - 1]) {
      oldInLcs.add(i - 1);
      newInLcs.add(j - 1);
      i--; j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  const oldSegs = buildSegments(oldWords, oldInLcs);
  const newSegs = buildSegments(newWords, newInLcs);
  return { oldSegs, newSegs };
}

function tokenize(s: string): string[] {
  return s.match(/\S+|\s+/g) || [];
}

function buildSegments(words: string[], inLcs: Set<number>): WordSegment[] {
  const segs: WordSegment[] = [];
  let buf = "";
  let bufChanged: boolean | null = null;
  for (let i = 0; i < words.length; i++) {
    const changed = !inLcs.has(i);
    if (bufChanged !== null && changed !== bufChanged) {
      segs.push({ text: buf, changed: bufChanged });
      buf = "";
    }
    buf += words[i];
    bufChanged = changed;
  }
  if (buf) segs.push({ text: buf, changed: bufChanged! });
  return segs;
}

// -- Parse unified diff --

function parseDiff(raw: string): { hunks: Hunk[]; added: number; removed: number } {
  const lines = raw.split("\n");
  const hunks: Hunk[] = [];
  let current: Hunk | null = null;
  let oldNum = 0, newNum = 0;
  let added = 0, removed = 0;
  let hunkIdx = 0;

  for (const line of lines) {
    if (line.startsWith("@@")) {
      const match = line.match(/@@ -(\d+)/);
      const matchNew = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
      oldNum = match ? parseInt(match[1], 10) : 1;
      newNum = matchNew ? parseInt(matchNew[1], 10) : 1;
      current = { header: line, lines: [], index: hunkIdx++ };
      hunks.push(current);
    } else if (line.startsWith("+++") || line.startsWith("---")) {
      // skip file headers
    } else if (current) {
      if (line.startsWith("+")) {
        current.lines.push({ type: "add", text: line.slice(1), oldNum: null, newNum: newNum++ });
        added++;
      } else if (line.startsWith("-")) {
        current.lines.push({ type: "del", text: line.slice(1), oldNum: oldNum++, newNum: null });
        removed++;
      } else {
        current.lines.push({ type: "ctx", text: line.startsWith(" ") ? line.slice(1) : line, oldNum: oldNum++, newNum: newNum++ });
      }
    }
  }

  return { hunks, added, removed };
}

// -- Pair adjacent del/add runs for word-level highlighting --

function pairChangedLines(lines: DiffLine[]): Map<number, { oldSegs: WordSegment[]; newSegs: WordSegment[] }> {
  const pairs = new Map<number, { oldSegs: WordSegment[]; newSegs: WordSegment[] }>();
  let i = 0;
  while (i < lines.length) {
    if (lines[i].type === "del") {
      const delStart = i;
      while (i < lines.length && lines[i].type === "del") i++;
      const addStart = i;
      while (i < lines.length && lines[i].type === "add") i++;
      const delCount = addStart - delStart;
      const addCount = i - addStart;
      const pairCount = Math.min(delCount, addCount);
      for (let p = 0; p < pairCount; p++) {
        const result = lcsWordDiff(lines[delStart + p].text, lines[addStart + p].text);
        pairs.set(delStart + p, result);
        pairs.set(addStart + p, result);
      }
    } else {
      i++;
    }
  }
  return pairs;
}

// -- Copy button --

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);

  return (
    <button
      className="diff-copy-btn"
      onClick={e => { e.stopPropagation(); handleCopy(); }}
      title="Copy diff"
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

// -- Component --

const COLLAPSE_THRESHOLD = 10;

export default function FileEditMessage({ filePath, diff, isStreaming }: FileEditMessageProps) {
  const [expanded, setExpanded] = useState(true);
  const [collapsedHunks, setCollapsedHunks] = useState<Set<number>>(new Set());

  const shortPath = filePath.replace(/^\/Users\/[^/]+/, "~");

  const { hunks, added, removed } = useMemo(() => {
    if (!diff) return { hunks: [], added: 0, removed: 0 };
    return parseDiff(diff);
  }, [diff]);

  // Auto-collapse large hunks on first render
  const initialCollapsed = useMemo(() => {
    const s = new Set<number>();
    for (const h of hunks) {
      if (h.lines.length > COLLAPSE_THRESHOLD) s.add(h.index);
    }
    return s;
  }, [hunks]);

  // Merge initial + user toggled
  const effectiveCollapsed = useMemo(() => {
    const s = new Set(initialCollapsed);
    for (const idx of collapsedHunks) {
      if (s.has(idx)) s.delete(idx); else s.add(idx);
    }
    return s;
  }, [initialCollapsed, collapsedHunks]);

  const toggleHunkCollapse = useCallback((idx: number) => {
    setCollapsedHunks(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }, []);

  return (
    <div className="file-edit-msg animate-fade-in">
      {/* Header: filepath  +N/-N  Copy  collapse-toggle */}
      <div className="file-edit-header" onClick={() => setExpanded(!expanded)}>
        <span className="file-edit-path">{shortPath}</span>
        {(added > 0 || removed > 0) && (
          <span className="file-edit-stats">
            {added > 0 && <span className="file-edit-stat-add">+{added}</span>}
            {removed > 0 && <span className="file-edit-stat-del">-{removed}</span>}
          </span>
        )}
        {diff && <CopyButton text={diff} />}
        <span className="file-edit-toggle">
          {expanded ? <ChevronDown /> : <ChevronRight />}
        </span>
      </div>

      {/* Streaming indicator */}
      {isStreaming && (
        <div className="file-edit-streaming" style={{
          padding: '4px 8px', fontSize: '12px', color: 'var(--text-dim)',
          display: 'flex', alignItems: 'center', gap: '6px'
        }}>
          <span className="tool-item-spinner" />
          <span>Writing changes...</span>
        </div>
      )}

      {/* Diff content */}
      {expanded && hunks.length > 0 && (
        <div className="diff-container">
          {hunks.map(hunk => {
            const isCollapsed = effectiveCollapsed.has(hunk.index);
            const wordPairs = pairChangedLines(hunk.lines);

            return (
              <div key={hunk.index} className="diff-hunk">
                {/* Hunk header */}
                <div
                  className="diff-hunk-header"
                  onClick={() => toggleHunkCollapse(hunk.index)}
                >
                  <span className="diff-hunk-toggle">
                    {isCollapsed ? <ChevronRight /> : <ChevronDown />}
                  </span>
                  <span className="diff-hunk-text">{hunk.header}</span>
                  {isCollapsed && (
                    <span className="diff-hunk-count">({hunk.lines.length} lines)</span>
                  )}
                </div>

                {/* Diff lines table */}
                {!isCollapsed && (
                  <table className="diff-table">
                    <tbody>
                      {hunk.lines.map((line, li) => {
                        const pair = wordPairs.get(li);
                        const segs = pair
                          ? (line.type === "del" ? pair.oldSegs : line.type === "add" ? pair.newSegs : null)
                          : null;

                        const rowClass =
                          line.type === "add" ? "diff-line-add" :
                          line.type === "del" ? "diff-line-del" :
                          "diff-line-ctx";

                        return (
                          <tr key={li} className={rowClass}>
                            <td className="diff-gutter">{line.oldNum ?? ""}</td>
                            <td className="diff-gutter">{line.newNum ?? ""}</td>
                            <td className="diff-prefix">
                              {line.type === "add" ? "+" : line.type === "del" ? "-" : " "}
                            </td>
                            <td className="diff-content">
                              {segs ? (
                                segs.map((seg, si) => (
                                  <span
                                    key={si}
                                    className={
                                      seg.changed
                                        ? (line.type === "del" ? "diff-word-del" : "diff-word-add")
                                        : undefined
                                    }
                                  >
                                    {seg.text}
                                  </span>
                                ))
                              ) : (
                                line.text
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
