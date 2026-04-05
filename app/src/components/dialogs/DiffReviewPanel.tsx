import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import '../../styles/diff-review.css';

// ── Types ──────────────────────────────────────────────

export interface DiffLine {
  type: 'added' | 'removed' | 'context';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface DiffFile {
  path: string;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
}

export interface InlineComment {
  filePath: string;
  line: number;
  side: 'old' | 'new';
  body: string;
}

export interface DiffReviewPanelProps {
  files: DiffFile[];
  onClose: () => void;
  onAddComment: (comment: InlineComment) => void;
  onSubmitReview: (comments: InlineComment[]) => void;
  onRequestAIReview: (files: DiffFile[]) => void;
}

// ── LCS word-level diff ────────────────────────────────

type WordSpan = { text: string; highlighted: boolean };

function tokenize(s: string): string[] {
  return s.match(/\S+|\s+/g) ?? [];
}

function lcsLength(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

function computeWordDiff(
  oldText: string,
  newText: string,
): { oldSpans: WordSpan[]; newSpans: WordSpan[] } {
  const oldTokens = tokenize(oldText);
  const newTokens = tokenize(newText);
  const dp = lcsLength(oldTokens, newTokens);

  const oldSpans: WordSpan[] = [];
  const newSpans: WordSpan[] = [];

  let i = oldTokens.length;
  let j = newTokens.length;

  const oldStack: WordSpan[] = [];
  const newStack: WordSpan[] = [];

  while (i > 0 && j > 0) {
    if (oldTokens[i - 1] === newTokens[j - 1]) {
      oldStack.push({ text: oldTokens[i - 1], highlighted: false });
      newStack.push({ text: newTokens[j - 1], highlighted: false });
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      oldStack.push({ text: oldTokens[i - 1], highlighted: true });
      i--;
    } else {
      newStack.push({ text: newTokens[j - 1], highlighted: true });
      j--;
    }
  }
  while (i > 0) {
    oldStack.push({ text: oldTokens[i - 1], highlighted: true });
    i--;
  }
  while (j > 0) {
    newStack.push({ text: newTokens[j - 1], highlighted: true });
    j--;
  }

  oldStack.reverse().forEach((s) => oldSpans.push(s));
  newStack.reverse().forEach((s) => newSpans.push(s));

  return { oldSpans, newSpans };
}

// ── Pair consecutive removed/added runs for word diff ──

interface PairedRun {
  removed: DiffLine[];
  added: DiffLine[];
}

function pairRuns(lines: DiffLine[]): (DiffLine | PairedRun)[] {
  const result: (DiffLine | PairedRun)[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].type === 'removed') {
      const removed: DiffLine[] = [];
      while (i < lines.length && lines[i].type === 'removed') {
        removed.push(lines[i]);
        i++;
      }
      const added: DiffLine[] = [];
      while (i < lines.length && lines[i].type === 'added') {
        added.push(lines[i]);
        i++;
      }
      if (added.length > 0) {
        result.push({ removed, added });
      } else {
        removed.forEach((l) => result.push(l));
      }
    } else {
      result.push(lines[i]);
      i++;
    }
  }
  return result;
}

// ── Word-highlighted content renderer ──────────────────

function renderWordSpans(
  spans: WordSpan[],
  className: string,
): React.ReactNode {
  return spans.map((span, i) =>
    span.highlighted ? (
      <span key={i} className={className}>
        {span.text}
      </span>
    ) : (
      <React.Fragment key={i}>{span.text}</React.Fragment>
    ),
  );
}

// ── Component ──────────────────────────────────────────

const DiffReviewPanel: React.FC<DiffReviewPanelProps> = ({
  files,
  onClose,
  onAddComment,
  onSubmitReview,
  onRequestAIReview,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [commentLine, setCommentLine] = useState<{
    filePath: string;
    line: number;
    side: 'old' | 'new';
  } | null>(null);
  const [commentText, setCommentText] = useState('');
  const [pendingComments, setPendingComments] = useState<InlineComment[]>([]);

  const commentRef = useRef<HTMLTextAreaElement>(null);
  const fileListRef = useRef<HTMLDivElement>(null);

  const selectedFile = files[selectedIndex] ?? null;

  // ── Totals ──
  const totals = useMemo(() => {
    let additions = 0;
    let deletions = 0;
    for (const f of files) {
      additions += f.additions;
      deletions += f.deletions;
    }
    return { additions, deletions };
  }, [files]);

  // ── Keyboard shortcuts ──
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (commentLine) {
          setCommentLine(null);
          setCommentText('');
        } else {
          onClose();
        }
        return;
      }

      // Don't hijack arrows when typing in textarea
      if (
        document.activeElement instanceof HTMLTextAreaElement ||
        document.activeElement instanceof HTMLInputElement
      ) {
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(files.length - 1, prev + 1));
      }
    },
    [files.length, onClose, commentLine],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // ── Auto-focus comment textarea ──
  useEffect(() => {
    if (commentLine && commentRef.current) {
      commentRef.current.focus();
    }
  }, [commentLine]);

  // ── Scroll selected file into view ──
  useEffect(() => {
    const el = fileListRef.current?.querySelector('.selected');
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // ── Click on line to comment ──
  const handleLineClick = useCallback(
    (filePath: string, line: number, side: 'old' | 'new') => {
      setCommentLine({ filePath, line, side });
      setCommentText('');
    },
    [],
  );

  // ── Add comment ──
  const handleAddComment = useCallback(() => {
    if (!commentLine || !commentText.trim()) return;
    const comment: InlineComment = {
      filePath: commentLine.filePath,
      line: commentLine.line,
      side: commentLine.side,
      body: commentText.trim(),
    };
    onAddComment(comment);
    setPendingComments((prev) => [...prev, comment]);
    setCommentLine(null);
    setCommentText('');
  }, [commentLine, commentText, onAddComment]);

  // ── Cmd+Enter to submit ──
  const handleCommentKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleAddComment();
      }
    },
    [handleAddComment],
  );

  // ── Submit all ──
  const handleSubmitReview = useCallback(() => {
    onSubmitReview(pendingComments);
  }, [onSubmitReview, pendingComments]);

  // ── Render diff lines for a hunk ──
  const renderHunkLines = useCallback(
    (hunk: DiffHunk, filePath: string) => {
      const paired = pairRuns(hunk.lines);
      const rows: React.ReactNode[] = [];

      let lineKey = 0;

      for (const item of paired) {
        // Paired word-diff run
        if ('removed' in item && 'added' in item) {
          const { removed, added } = item as PairedRun;
          const maxLen = Math.max(removed.length, added.length);

          for (let k = 0; k < maxLen; k++) {
            const rem = removed[k];
            const add = added[k];

            if (rem && add) {
              const { oldSpans, newSpans } = computeWordDiff(
                rem.content,
                add.content,
              );

              // Removed line with word highlight
              const remKey = `rem-${lineKey++}`;
              rows.push(
                <tr
                  key={remKey}
                  className="diff-line diff-line-removed"
                  onClick={() =>
                    handleLineClick(
                      filePath,
                      rem.oldLineNum ?? 0,
                      'old',
                    )
                  }
                >
                  <td className="diff-line-num old-num">
                    {rem.oldLineNum ?? ''}
                  </td>
                  <td className="diff-line-num new-num" />
                  <td className="diff-line-content">
                    {renderWordSpans(oldSpans, 'diff-word-removed')}
                  </td>
                </tr>,
              );
              maybeRenderCommentRow(rows, filePath, rem.oldLineNum, 'old');

              // Added line with word highlight
              const addKey = `add-${lineKey++}`;
              rows.push(
                <tr
                  key={addKey}
                  className="diff-line diff-line-added"
                  onClick={() =>
                    handleLineClick(
                      filePath,
                      add.newLineNum ?? 0,
                      'new',
                    )
                  }
                >
                  <td className="diff-line-num old-num" />
                  <td className="diff-line-num new-num">
                    {add.newLineNum ?? ''}
                  </td>
                  <td className="diff-line-content">
                    {renderWordSpans(newSpans, 'diff-word-added')}
                  </td>
                </tr>,
              );
              maybeRenderCommentRow(rows, filePath, add.newLineNum, 'new');
            } else if (rem) {
              renderSingleLine(rows, rem, filePath, lineKey++);
            } else if (add) {
              renderSingleLine(rows, add, filePath, lineKey++);
            }
          }
        } else {
          // Single line (context, unpaired add/remove)
          const line = item as DiffLine;
          renderSingleLine(rows, line, filePath, lineKey++);
        }
      }

      return rows;
    },
    [commentLine, commentText, pendingComments, handleLineClick],
  );

  // ── Render a single diff line ──
  const renderSingleLine = useCallback(
    (rows: React.ReactNode[], line: DiffLine, filePath: string, key: number) => {
      const cls =
        line.type === 'added'
          ? 'diff-line diff-line-added'
          : line.type === 'removed'
            ? 'diff-line diff-line-removed'
            : 'diff-line diff-line-context';

      const lineNum = line.type === 'removed' ? line.oldLineNum : line.newLineNum;
      const side: 'old' | 'new' = line.type === 'removed' ? 'old' : 'new';

      rows.push(
        <tr
          key={`line-${key}`}
          className={cls}
          onClick={() =>
            handleLineClick(filePath, lineNum ?? 0, side)
          }
        >
          <td className="diff-line-num old-num">
            {line.type !== 'added' ? (line.oldLineNum ?? '') : ''}
          </td>
          <td className="diff-line-num new-num">
            {line.type !== 'removed' ? (line.newLineNum ?? '') : ''}
          </td>
          <td className="diff-line-content">{line.content}</td>
        </tr>,
      );
      maybeRenderCommentRow(rows, filePath, lineNum, side);
    },
    [commentLine, commentText, handleLineClick],
  );

  // ── Inline comment row (open form or existing badge) ──
  const maybeRenderCommentRow = (
    rows: React.ReactNode[],
    filePath: string,
    lineNum: number | undefined,
    side: 'old' | 'new',
  ) => {
    if (lineNum == null) return;

    const existing = pendingComments.filter(
      (c) => c.filePath === filePath && c.line === lineNum && c.side === side,
    );

    const isOpen =
      commentLine?.filePath === filePath &&
      commentLine?.line === lineNum &&
      commentLine?.side === side;

    if (existing.length > 0) {
      rows.push(
        <tr
          key={`comment-existing-${filePath}-${side}-${lineNum}`}
          className="diff-inline-comment-row"
        >
          <td colSpan={3}>
            <div className="diff-inline-comment-form">
              {existing.map((c, i) => (
                <div key={i} style={{ color: '#ccc', fontSize: 13, marginBottom: 4 }}>
                  <span className="diff-comment-badge">comment</span> {c.body}
                </div>
              ))}
            </div>
          </td>
        </tr>,
      );
    }

    if (isOpen) {
      rows.push(
        <tr
          key={`comment-form-${filePath}-${side}-${lineNum}`}
          className="diff-inline-comment-row"
        >
          <td colSpan={3}>
            <div className="diff-inline-comment-form">
              <textarea
                ref={commentRef}
                className="diff-inline-comment-textarea"
                placeholder="Add a review comment..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={handleCommentKeyDown}
              />
              <div className="diff-inline-comment-actions">
                <span className="diff-inline-comment-hint">
                  Cmd+Enter to submit
                </span>
                <button
                  className="diff-review-btn"
                  onClick={() => {
                    setCommentLine(null);
                    setCommentText('');
                  }}
                >
                  Cancel
                </button>
                <button
                  className="diff-review-btn diff-review-btn-primary"
                  onClick={handleAddComment}
                  disabled={!commentText.trim()}
                >
                  Add Comment
                </button>
              </div>
            </div>
          </td>
        </tr>,
      );
    }
  };

  // ── Render ──
  return (
    <div className="diff-review-overlay">
      {/* Header */}
      <div className="diff-review-header">
        <div className="diff-review-header-left">
          <span className="diff-review-title">Review Changes</span>
          <span className="diff-review-summary">
            {files.length} file{files.length !== 1 ? 's' : ''},{' '}
            <span className="added">+{totals.additions}</span>,{' '}
            <span className="removed">-{totals.deletions}</span>
          </span>
        </div>
        <div className="diff-review-header-actions">
          <button
            className="diff-review-btn"
            onClick={() => onRequestAIReview(files)}
          >
            Review Code
          </button>
          <button
            className="diff-review-btn diff-review-btn-primary"
            onClick={handleSubmitReview}
          >
            Submit Review ({pendingComments.length})
          </button>
          <button className="diff-review-close-btn" onClick={onClose}>
            &times;
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="diff-review-body">
        {/* File list */}
        <div className="diff-review-file-list" ref={fileListRef}>
          {files.map((file, idx) => (
            <div
              key={file.path}
              className={`diff-review-file-item ${idx === selectedIndex ? 'selected' : ''}`}
              onClick={() => setSelectedIndex(idx)}
            >
              <span className="diff-review-file-name" title={file.path}>
                {file.path.split('/').pop()}
              </span>
              <span className="diff-review-file-stats">
                <span className="stat-added">+{file.additions}</span>
                <span className="stat-removed">-{file.deletions}</span>
              </span>
            </div>
          ))}
        </div>

        {/* Diff view */}
        <div className="diff-review-content">
          {selectedFile ? (
            selectedFile.hunks.map((hunk, hi) => (
              <div key={hi}>
                <div className="diff-hunk-header">{hunk.header}</div>
                <table className="diff-table">
                  <tbody>{renderHunkLines(hunk, selectedFile.path)}</tbody>
                </table>
              </div>
            ))
          ) : (
            <div className="diff-review-content-empty">
              Select a file to view its diff
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DiffReviewPanel;
