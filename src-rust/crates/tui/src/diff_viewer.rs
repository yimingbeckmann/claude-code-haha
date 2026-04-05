//! Diff viewer TUI component.
//! Mirrors src/components/diff/ and src/components/StructuredDiff.tsx.
//!
//! Shows a two-pane diff dialog: file list (left) + unified diff detail (right).
//! Keyboard: ↑↓ navigate files, Tab switch pane, t toggle diff type, Esc close.

use cc_core::file_history::FileHistory;
use ratatui::{
    buffer::Buffer,
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Paragraph, Widget},
};
use similar::{ChangeTag, TextDiff};
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

/// A single hunk of a unified diff.
#[derive(Debug, Clone)]
pub struct DiffHunk {
    /// Original line number range: (start, count).
    pub old_range: (u32, u32),
    /// New line number range: (start, count).
    pub new_range: (u32, u32),
    /// Lines in this hunk.
    pub lines: Vec<DiffLine>,
}

/// A single line in a diff hunk.
#[derive(Debug, Clone)]
pub struct DiffLine {
    pub kind: DiffLineKind,
    pub content: String,
    /// Original line number (if applicable).
    pub old_line_no: Option<u32>,
    /// New line number (if applicable).
    pub new_line_no: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiffLineKind {
    /// Unchanged context line.
    Context,
    /// Added line.
    Added,
    /// Removed line.
    Removed,
    /// Hunk header (@@ line).
    Header,
}

/// Stats for a single file in the diff.
#[derive(Debug, Clone)]
pub struct FileDiffStats {
    /// File path (relative to project root).
    pub path: String,
    /// Number of added lines.
    pub added: u32,
    /// Number of removed lines.
    pub removed: u32,
    /// Is this a binary file?
    pub binary: bool,
    /// All hunks for this file.
    pub hunks: Vec<DiffHunk>,
}

/// Which diff type to show.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiffType {
    /// `git diff` since last commit.
    GitDiff,
    /// Changes made during this conversation turn.
    TurnDiff,
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/// Active pane in the diff dialog.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiffPane {
    FileList,
    Detail,
}

/// Full state for the diff viewer dialog.
#[derive(Debug, Clone)]
pub struct DiffViewerState {
    /// All files in the diff.
    pub files: Vec<FileDiffStats>,
    /// Cached turn-specific files, populated externally.
    pub turn_files: Vec<FileDiffStats>,
    /// Currently selected file index.
    pub selected_file: usize,
    /// Active pane.
    pub active_pane: DiffPane,
    /// Current diff type.
    pub diff_type: DiffType,
    /// Scroll offset for the detail pane (in lines).
    pub detail_scroll: u16,
    /// Rendered line cache: (file_index, terminal_width) → lines.
    render_cache: HashMap<(usize, u16), Vec<String>>,
    /// Whether the dialog is open.
    pub open: bool,
}

impl DiffViewerState {
    pub fn new() -> Self {
        Self {
            files: Vec::new(),
            turn_files: Vec::new(),
            selected_file: 0,
            active_pane: DiffPane::FileList,
            diff_type: DiffType::GitDiff,
            detail_scroll: 0,
            render_cache: HashMap::new(),
            open: false,
        }
    }

    /// Open the dialog and load diffs from the project root.
    pub fn open(&mut self, project_root: &std::path::Path) {
        self.open_for_type(DiffType::GitDiff, project_root);
    }

    /// Open directly in turn-diff mode.
    pub fn open_turn(&mut self, project_root: &std::path::Path) {
        self.open_for_type(DiffType::TurnDiff, project_root);
    }

    pub fn close(&mut self) {
        self.open = false;
    }

    pub fn select_prev(&mut self) {
        if self.selected_file > 0 {
            self.selected_file -= 1;
            self.detail_scroll = 0;
        }
    }

    pub fn select_next(&mut self) {
        if self.selected_file + 1 < self.files.len() {
            self.selected_file += 1;
            self.detail_scroll = 0;
        }
    }

    pub fn switch_pane(&mut self) {
        self.active_pane = match self.active_pane {
            DiffPane::FileList => DiffPane::Detail,
            DiffPane::Detail => DiffPane::FileList,
        };
    }

    pub fn toggle_diff_type(&mut self, project_root: &std::path::Path) {
        self.diff_type = match self.diff_type {
            DiffType::GitDiff => DiffType::TurnDiff,
            DiffType::TurnDiff => DiffType::GitDiff,
        };
        self.reload_files(project_root);
    }

    pub fn scroll_detail_up(&mut self) {
        self.detail_scroll = self.detail_scroll.saturating_sub(3);
    }

    pub fn scroll_detail_down(&mut self) {
        self.detail_scroll = self.detail_scroll.saturating_add(3);
    }

    pub fn set_turn_diff(&mut self, files: Vec<FileDiffStats>) {
        self.turn_files = files;
        if self.diff_type == DiffType::TurnDiff {
            self.files = self.turn_files.clone();
            self.selected_file = 0;
            self.detail_scroll = 0;
            self.render_cache.clear();
        }
    }

    fn open_for_type(&mut self, diff_type: DiffType, project_root: &std::path::Path) {
        self.diff_type = diff_type;
        self.reload_files(project_root);
        self.open = true;
    }

    fn reload_files(&mut self, project_root: &std::path::Path) {
        self.files = match self.diff_type {
            DiffType::GitDiff => load_git_diff(project_root),
            DiffType::TurnDiff => self.turn_files.clone(),
        };
        self.selected_file = 0;
        self.detail_scroll = 0;
        self.render_cache.clear();
    }
}

impl Default for DiffViewerState {
    fn default() -> Self { Self::new() }
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

/// Load the current `git diff HEAD` from `project_root`.
pub fn load_git_diff(project_root: &std::path::Path) -> Vec<FileDiffStats> {
    let output = std::process::Command::new("git")
        .args(["diff", "HEAD", "--unified=3"])
        .current_dir(project_root)
        .output();

    let text = match output {
        Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout).to_string(),
        Ok(_out) => {
            // Try just `git diff` (no HEAD) for unstaged changes
            let out2 = std::process::Command::new("git")
                .args(["diff", "--unified=3"])
                .current_dir(project_root)
                .output();
            match out2 {
                Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).to_string(),
                _ => return Vec::new(),
            }
        }
        Err(_) => return Vec::new(),
    };

    parse_unified_diff(&text)
}

/// Build a turn-local diff from file-history snapshots.
pub fn build_turn_diff(
    file_history: &FileHistory,
    turn_index: usize,
    project_root: &std::path::Path,
) -> Vec<FileDiffStats> {
    file_history
        .snapshots_for_turn(turn_index)
        .into_iter()
        .map(|snapshot| {
            let path = relative_diff_path(&snapshot.path, project_root);
            if snapshot.binary {
                return FileDiffStats {
                    path,
                    added: 0,
                    removed: 0,
                    binary: true,
                    hunks: Vec::new(),
                };
            }

            let before = snapshot.before_text.as_deref().unwrap_or("");
            let after = snapshot.after_text.as_deref().unwrap_or("");
            build_file_diff_from_snapshots(path, before, after)
        })
        .filter(|file| file.binary || !file.hunks.is_empty())
        .collect()
}

pub fn build_latest_turn_diff(
    file_history: &FileHistory,
    project_root: &std::path::Path,
) -> Vec<FileDiffStats> {
    let Some(turn_index) = file_history.latest_turn_index() else {
        return Vec::new();
    };
    build_turn_diff(file_history, turn_index, project_root)
}

fn relative_diff_path(path: &std::path::Path, project_root: &std::path::Path) -> String {
    path.strip_prefix(project_root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn build_file_diff_from_snapshots(path: String, before: &str, after: &str) -> FileDiffStats {
    let diff = TextDiff::from_lines(before, after);
    let mut added = 0u32;
    let mut removed = 0u32;
    let mut hunks = Vec::new();

    for group in diff.grouped_ops(3) {
        let mut lines = Vec::new();

        for op in group {
            for change in diff.iter_changes(&op) {
                let mut content = change.to_string();
                if content.ends_with('\n') {
                    content.pop();
                    if content.ends_with('\r') {
                        content.pop();
                    }
                }

                let kind = match change.tag() {
                    ChangeTag::Equal => DiffLineKind::Context,
                    ChangeTag::Delete => {
                        removed += 1;
                        DiffLineKind::Removed
                    }
                    ChangeTag::Insert => {
                        added += 1;
                        DiffLineKind::Added
                    }
                };

                lines.push(DiffLine {
                    kind,
                    content,
                    old_line_no: change.old_index().map(|idx| idx as u32 + 1),
                    new_line_no: change.new_index().map(|idx| idx as u32 + 1),
                });
            }
        }

        let old_range = summarize_old_range(&lines);
        let new_range = summarize_new_range(&lines);
        lines.insert(
            0,
            DiffLine {
                kind: DiffLineKind::Header,
                content: format!(
                    "@@ -{},{} +{},{} @@",
                    old_range.0, old_range.1, new_range.0, new_range.1
                ),
                old_line_no: None,
                new_line_no: None,
            },
        );

        hunks.push(DiffHunk {
            old_range,
            new_range,
            lines,
        });
    }

    FileDiffStats {
        path,
        added,
        removed,
        binary: false,
        hunks,
    }
}

fn summarize_old_range(lines: &[DiffLine]) -> (u32, u32) {
    summarize_range(lines.iter().filter_map(|line| line.old_line_no).collect())
}

fn summarize_new_range(lines: &[DiffLine]) -> (u32, u32) {
    summarize_range(lines.iter().filter_map(|line| line.new_line_no).collect())
}

fn summarize_range(line_numbers: Vec<u32>) -> (u32, u32) {
    match (line_numbers.first().copied(), line_numbers.last().copied()) {
        (Some(start), Some(end)) => (start, end.saturating_sub(start) + 1),
        _ => (0, 0),
    }
}

/// Parse unified diff text into `Vec<FileDiffStats>`.
pub fn parse_unified_diff(text: &str) -> Vec<FileDiffStats> {
    let mut files: Vec<FileDiffStats> = Vec::new();
    let mut current_file: Option<FileDiffStats> = None;
    let mut current_hunk: Option<DiffHunk> = None;
    let mut old_line = 0u32;
    let mut new_line = 0u32;

    for raw_line in text.lines() {
        if raw_line.starts_with("diff --git ") {
            // Flush previous hunk and file
            if let Some(hunk) = current_hunk.take() {
                if let Some(f) = current_file.as_mut() {
                    f.hunks.push(hunk);
                }
            }
            if let Some(f) = current_file.take() {
                files.push(f);
            }
            // Extract file path from "diff --git a/foo b/foo"
            let path = raw_line
                .split_whitespace()
                .nth(3)
                .map(|s| s.strip_prefix("b/").unwrap_or(s).to_string())
                .unwrap_or_else(|| "unknown".to_string());
            current_file = Some(FileDiffStats {
                path,
                added: 0,
                removed: 0,
                binary: false,
                hunks: Vec::new(),
            });
        } else if raw_line.starts_with("Binary files ") {
            if let Some(f) = current_file.as_mut() {
                f.binary = true;
            }
        } else if raw_line.starts_with("@@ ") {
            // Flush previous hunk
            if let Some(hunk) = current_hunk.take() {
                if let Some(f) = current_file.as_mut() {
                    f.hunks.push(hunk);
                }
            }
            // Parse @@ -old_start,old_count +new_start,new_count @@
            let (old_start, old_count, new_start, new_count) = parse_hunk_header(raw_line);
            old_line = old_start;
            new_line = new_start;
            current_hunk = Some(DiffHunk {
                old_range: (old_start, old_count),
                new_range: (new_start, new_count),
                lines: vec![DiffLine {
                    kind: DiffLineKind::Header,
                    content: raw_line.to_string(),
                    old_line_no: None,
                    new_line_no: None,
                }],
            });
        } else if let Some(hunk) = current_hunk.as_mut() {
            if raw_line.starts_with('+') && !raw_line.starts_with("+++") {
                hunk.lines.push(DiffLine {
                    kind: DiffLineKind::Added,
                    content: raw_line[1..].to_string(),
                    old_line_no: None,
                    new_line_no: Some(new_line),
                });
                new_line += 1;
                if let Some(f) = current_file.as_mut() {
                    f.added += 1;
                }
            } else if raw_line.starts_with('-') && !raw_line.starts_with("---") {
                hunk.lines.push(DiffLine {
                    kind: DiffLineKind::Removed,
                    content: raw_line[1..].to_string(),
                    old_line_no: Some(old_line),
                    new_line_no: None,
                });
                old_line += 1;
                if let Some(f) = current_file.as_mut() {
                    f.removed += 1;
                }
            } else if raw_line.starts_with(' ') {
                hunk.lines.push(DiffLine {
                    kind: DiffLineKind::Context,
                    content: raw_line[1..].to_string(),
                    old_line_no: Some(old_line),
                    new_line_no: Some(new_line),
                });
                old_line += 1;
                new_line += 1;
            }
        }
    }

    // Flush final hunk and file
    if let Some(hunk) = current_hunk.take() {
        if let Some(f) = current_file.as_mut() {
            f.hunks.push(hunk);
        }
    }
    if let Some(f) = current_file.take() {
        files.push(f);
    }

    files
}

fn parse_hunk_header(line: &str) -> (u32, u32, u32, u32) {
    // @@ -old_start,old_count +new_start,new_count @@
    let parts: Vec<&str> = line.split_whitespace().collect();
    let parse_range = |s: &str| -> (u32, u32) {
        let s = s.trim_start_matches(['-', '+']);
        if let Some(comma) = s.find(',') {
            let start = s[..comma].parse().unwrap_or(1);
            let count = s[comma+1..].parse().unwrap_or(0);
            (start, count)
        } else {
            (s.parse().unwrap_or(1), 1)
        }
    };
    let old = parts.get(1).map(|s| parse_range(s)).unwrap_or((1, 0));
    let new = parts.get(2).map(|s| parse_range(s)).unwrap_or((1, 0));
    (old.0, old.1, new.0, new.1)
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/// Render the diff dialog overlay.
pub fn render_diff_dialog(state: &mut DiffViewerState, area: Rect, buf: &mut Buffer) {
    if !state.open {
        return;
    }

    // Center the dialog (80% width, 80% height)
    let dialog_width = (area.width * 4 / 5).max(40).min(area.width);
    let dialog_height = (area.height * 4 / 5).max(10).min(area.height);
    let x = area.x + (area.width - dialog_width) / 2;
    let y = area.y + (area.height - dialog_height) / 2;
    let dialog_area = Rect { x, y, width: dialog_width, height: dialog_height };

    // Clear the area
    Clear.render(dialog_area, buf);

    // Outer border
    let title = match state.diff_type {
        DiffType::GitDiff => " Diff (git) [d: toggle, Tab: pane, Esc: close] ",
        DiffType::TurnDiff => " Diff (turn) [d: toggle, Tab: pane, Esc: close] ",
    };
    Block::default()
        .title(title)
        .borders(Borders::ALL)
        .style(Style::default().fg(Color::White))
        .render(dialog_area, buf);

    let inner = Rect {
        x: dialog_area.x + 1,
        y: dialog_area.y + 1,
        width: dialog_area.width.saturating_sub(2),
        height: dialog_area.height.saturating_sub(2),
    };

    if state.files.is_empty() {
        let empty = match state.diff_type {
            DiffType::GitDiff => "No git changes available.",
            DiffType::TurnDiff => "No turn changes available yet.",
        };
        Paragraph::new(vec![
            Line::from(""),
            Line::from(vec![Span::styled(
                empty,
                Style::default().fg(Color::DarkGray).add_modifier(Modifier::ITALIC),
            )]),
            Line::from(""),
            Line::from(vec![Span::styled(
                "No tracked file changes were captured for the selected turn.",
                Style::default().fg(Color::DarkGray),
            )]),
        ])
        .render(inner, buf);
        return;
    }

    // Split: file list 30%, detail 70%
    let panes = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(30), Constraint::Percentage(70)])
        .split(inner);

    render_file_list(state, panes[0], buf);
    render_diff_detail(state, panes[1], buf);
}

fn render_file_list(state: &DiffViewerState, area: Rect, buf: &mut Buffer) {
    let focused = state.active_pane == DiffPane::FileList;
    let border_style = if focused {
        Style::default().fg(Color::Cyan)
    } else {
        Style::default().fg(Color::DarkGray)
    };
    Block::default()
        .title(" Files ")
        .borders(Borders::ALL)
        .border_style(border_style)
        .render(area, buf);

    let inner = Rect {
        x: area.x + 1,
        y: area.y + 1,
        width: area.width.saturating_sub(2),
        height: area.height.saturating_sub(2),
    };

    let max_visible = inner.height as usize;
    let start = state.selected_file.saturating_sub(max_visible / 2);
    let end = (start + max_visible).min(state.files.len());

    for (i, file) in state.files[start..end].iter().enumerate() {
        let abs_idx = start + i;
        let selected = abs_idx == state.selected_file;

        // Truncate path to fit
        let avail = inner.width.saturating_sub(10) as usize;
        let path = if file.path.len() > avail {
            format!("…{}", &file.path[file.path.len() - avail..])
        } else {
            file.path.clone()
        };

        let prefix = if selected { "> " } else { "  " };
        let stats = format!("+{} -{}", file.added, file.removed);

        let base_style = if selected {
            Style::default().add_modifier(Modifier::BOLD)
        } else {
            Style::default()
        };

        // Render prefix + path
        let y = inner.y + i as u16;
        if y >= area.y + area.height { break; }

        let line = Line::from(vec![
            Span::styled(prefix, base_style),
            Span::styled(path, base_style.fg(if selected { Color::White } else { Color::Gray })),
        ]);
        let row_area = Rect { x: inner.x, y, width: inner.width, height: 1 };
        Paragraph::new(line).render(row_area, buf);

        // Stats on the right side
        let stats_x = inner.x + inner.width.saturating_sub(stats.len() as u16 + 1);
        if stats_x > inner.x {
            let stats_area = Rect { x: stats_x, y, width: stats.len() as u16, height: 1 };
            Paragraph::new(Line::from(vec![
                Span::styled(stats, Style::default().fg(Color::DarkGray)),
            ])).render(stats_area, buf);
        }
    }

    // Pagination indicators
    if start > 0 {
        let ind_area = Rect { x: inner.x, y: inner.y, width: inner.width, height: 1 };
        Paragraph::new(format!("↑ {} more", start))
            .style(Style::default().fg(Color::DarkGray))
            .render(ind_area, buf);
    }
    if end < state.files.len() {
        let remaining = state.files.len() - end;
        let y = inner.y + inner.height.saturating_sub(1);
        let ind_area = Rect { x: inner.x, y, width: inner.width, height: 1 };
        Paragraph::new(format!("↓ {} more", remaining))
            .style(Style::default().fg(Color::DarkGray))
            .render(ind_area, buf);
    }
}

fn render_diff_detail(state: &DiffViewerState, area: Rect, buf: &mut Buffer) {
    let focused = state.active_pane == DiffPane::Detail;
    let border_style = if focused {
        Style::default().fg(Color::Cyan)
    } else {
        Style::default().fg(Color::DarkGray)
    };

    let file = match state.files.get(state.selected_file) {
        Some(f) => f,
        None => return,
    };

    let title = format!(" {} ", file.path);
    Block::default()
        .title(title.as_str())
        .borders(Borders::ALL)
        .border_style(border_style)
        .render(area, buf);

    let inner = Rect {
        x: area.x + 1,
        y: area.y + 1,
        width: area.width.saturating_sub(2),
        height: area.height.saturating_sub(2),
    };

    if file.binary {
        Paragraph::new("Binary file — no diff available")
            .style(Style::default().fg(Color::DarkGray))
            .render(inner, buf);
        return;
    }

    // Build lines for rendering
    let lines = build_diff_lines(file, inner.width);
    let total_lines = lines.len();
    let scroll = (state.detail_scroll as usize).min(total_lines.saturating_sub(inner.height as usize));
    let visible = &lines[scroll..];

    for (i, line) in visible.iter().enumerate() {
        if i as u16 >= inner.height { break; }
        let y = inner.y + i as u16;
        let row_area = Rect { x: inner.x, y, width: inner.width, height: 1 };
        Paragraph::new(line.clone()).render(row_area, buf);
    }
}

fn build_diff_lines(file: &FileDiffStats, width: u16) -> Vec<Line<'static>> {
    let mut lines = Vec::new();
    let gutter_width = 8usize; // "  123  "

    for hunk in &file.hunks {
        for diff_line in &hunk.lines {
            let (marker, content_style, _bg) = match diff_line.kind {
                DiffLineKind::Header => (
                    Span::styled("@@ ", Style::default().fg(Color::Cyan)),
                    Style::default().fg(Color::Cyan),
                    None,
                ),
                DiffLineKind::Added => (
                    Span::styled("+  ", Style::default().fg(Color::Green)),
                    Style::default().fg(Color::Green),
                    Some(Color::DarkGray),
                ),
                DiffLineKind::Removed => (
                    Span::styled("-  ", Style::default().fg(Color::Red)),
                    Style::default().fg(Color::Red),
                    None,
                ),
                DiffLineKind::Context => (
                    Span::styled("   ", Style::default().fg(Color::DarkGray)),
                    Style::default().fg(Color::White),
                    None,
                ),
            };

            // Line number gutter
            let ln_str = match (diff_line.old_line_no, diff_line.new_line_no) {
                (Some(o), Some(n)) => format!("{:>4} {:>4} ", o, n),
                (Some(o), None) => format!("{:>4}      ", o),
                (None, Some(n)) => format!("     {:>4} ", n),
                (None, None) => "          ".to_string(),
            };

            let content: String = diff_line.content.chars()
                .take((width as usize).saturating_sub(gutter_width + 3))
                .collect();

            lines.push(Line::from(vec![
                Span::styled(ln_str, Style::default().fg(Color::DarkGray)),
                marker,
                Span::styled(content, content_style),
            ]));
        }
    }

    lines
}
