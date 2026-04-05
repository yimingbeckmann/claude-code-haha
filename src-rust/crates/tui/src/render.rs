// render.rs â€” All ratatui rendering logic.

use std::cell::RefCell;

use crate::agents_view::render_agents_menu;
use crate::app::{App, EffortLevel, SystemAnnotation, SystemMessageStyle, ToolStatus};
use crate::clawd::{clawd_lines, ClawdPose};
use crate::diff_viewer::render_diff_dialog;
use crate::figures;
use crate::dialogs::render_permission_dialog;
use crate::mcp_view::render_mcp_view;
use crate::messages::{RenderContext, render_markdown, render_message};
use crate::notifications::render_notification_banner;
use crate::overlays::{
    render_global_search, render_help_overlay, render_history_search_overlay, render_rewind_flow,
};
use crate::plugin_views::render_plugin_hints;
use crate::privacy_screen::render_privacy_screen;
use crate::prompt_input::{InputMode, render_prompt_input};
use crate::settings_screen::render_settings_screen;
use crate::stats_dialog::render_stats_dialog;
use crate::theme_screen::render_theme_screen;
use crate::virtual_list::{VirtualItem, VirtualList};
use cc_core::constants::APP_VERSION;
use ratatui::buffer::Buffer;
use ratatui::layout::{Alignment, Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, BorderType, Borders, Clear, Paragraph, Widget, Wrap};
use ratatui::Frame;
use unicode_width::UnicodeWidthStr;

// ASCII spinner sequence. We keep this ASCII-only to avoid Windows source
// encoding surprises while still giving the prompt/status row visible motion.
const SPINNER: &[char] = &['-', '\\', '|', '/'];
const CLAUDE_ORANGE: Color = Color::Rgb(215, 119, 87);
const WELCOME_BOX_HEIGHT: u16 = 11;

fn spinner_char(frame_count: u64) -> char {
    SPINNER[(frame_count as usize) % SPINNER.len()]
}

/// Returns the colour to use for the streaming spinner.
/// Turns red when no stream data has arrived for more than 3 seconds.
fn spinner_color(app: &App) -> Color {
    if let Some(start) = app.stall_start {
        if start.elapsed() > std::time::Duration::from_secs(3) {
            return Color::Red;
        }
    }
    Color::Yellow
}

#[derive(Clone)]
struct RenderedLineItem {
    line: Line<'static>,
    search_text: String,
}

impl VirtualItem for RenderedLineItem {
    fn measure_height(&self, _width: u16) -> u16 {
        1
    }

    fn render(&self, area: Rect, buf: &mut Buffer, _selected: bool) {
        Paragraph::new(vec![self.line.clone()]).render(area, buf);
    }

    fn search_text(&self) -> String {
        self.search_text.clone()
    }
}

fn flatten_line_text(line: &Line<'_>) -> String {
    line.spans
        .iter()
        .map(|span| span.content.to_string())
        .collect::<Vec<_>>()
        .join("")
}

#[derive(Clone, Copy, PartialEq, Eq)]
struct MessageLinesCacheKey {
    width: u16,
    messages_ptr: usize,
    messages_len: usize,
    annotations_ptr: usize,
    annotations_len: usize,
}

#[derive(Clone)]
struct MessageLinesCache {
    key: MessageLinesCacheKey,
    lines: Vec<RenderedLineItem>,
}

thread_local! {
    static MESSAGE_LINES_CACHE: RefCell<Option<MessageLinesCache>> = const { RefCell::new(None) };
}

// -----------------------------------------------------------------------
// Top-level layout
// -----------------------------------------------------------------------

/// Render the entire application into the current frame.
pub fn render_app(frame: &mut Frame, app: &App) {
    let size = frame.area();

    // Fill the entire frame with a black background so the terminal's default
    // color (blue on Windows) doesn't bleed through cells not covered by widgets.
    frame.render_widget(
        Block::default().style(Style::default().bg(Color::Black).fg(Color::White)),
        size,
    );

    let prompt_focused =
        !app.is_streaming && app.permission_request.is_none() && !app.history_search_overlay.visible;
    let status_height = if should_render_status_row(app) { 1 } else { 0 };
    let suggestions_height = if prompt_focused && !app.prompt_input.suggestions.is_empty() {
        app.prompt_input.suggestions.len().min(5) as u16
    } else {
        0
    };

    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Min(1),
            Constraint::Length(status_height),
            Constraint::Length(3),
            Constraint::Length(suggestions_height),
            Constraint::Length(1),
        ])
        .split(size);

    render_messages(frame, app, chunks[0]);
    if status_height > 0 {
        render_status_row(frame, app, chunks[1]);
    }
    render_input(frame, app, chunks[2], prompt_focused);
    if suggestions_height > 0 {
        render_prompt_suggestions(frame, app, chunks[3]);
    }
    render_footer(frame, app, chunks[4]);

    // Overlays (rendered on top in Z-order)

    // Permission dialog (highest priority)
    if let Some(ref pr) = app.permission_request {
        render_permission_dialog(frame, pr, size);
    }

    // Rewind flow (takes over screen)
    if app.rewind_flow.visible {
        render_rewind_flow(frame, &app.rewind_flow, size);
    }

    // New help overlay
    if app.help_overlay.visible {
        render_help_overlay(frame, &app.help_overlay, size);
    } else if app.show_help {
        // Legacy fallback â€” render the simple help overlay
        render_simple_help_overlay(frame, size);
    }

    // History search overlay
    if app.history_search_overlay.visible {
        render_history_search_overlay(
            frame,
            &app.history_search_overlay,
            &app.prompt_input.history,
            size,
        );
    } else if let Some(ref hs) = app.history_search {
        // Legacy history search rendering
        render_legacy_history_search(frame, hs, app, size);
    }

    // Settings screen (highest-priority full-screen overlay)
    if app.settings_screen.visible {
        render_settings_screen(frame, &app.settings_screen, size);
    }

    // Theme picker overlay
    if app.theme_screen.visible {
        render_theme_screen(frame, &app.theme_screen, size);
    }

    // Privacy settings dialog
    if app.privacy_screen.visible {
        render_privacy_screen(frame, &app.privacy_screen, size);
    }

    if app.stats_dialog.open {
        render_stats_dialog(&app.stats_dialog, size, frame.buffer_mut());
    }

    if app.mcp_view.open {
        render_mcp_view(&app.mcp_view, size, frame.buffer_mut());
    }

    if app.agents_menu.open {
        render_agents_menu(&app.agents_menu, size, frame.buffer_mut());
    }

    if app.diff_viewer.open {
        let mut state = app.diff_viewer.clone();
        render_diff_dialog(&mut state, size, frame.buffer_mut());
    }

    if app.global_search.open {
        render_global_search(&app.global_search, size, frame.buffer_mut());
    }

    // Notification banner (bottom of overlays stack so it's always visible)
    if !app.notifications.is_empty() {
        render_notification_banner(frame, &app.notifications, size);
    }
}

// -----------------------------------------------------------------------
// Messages pane
// -----------------------------------------------------------------------

fn render_messages(frame: &mut Frame, app: &App, area: Rect) {
    // Reserve space at the top for plugin hint banners
    let hint_height = if app.plugin_hints.iter().any(|h| h.is_visible()) {
        3u16
    } else {
        0
    };

    let (hint_area, content_area) = if hint_height > 0 && area.height > hint_height + 2 {
        let splits = Layout::default()
            .direction(Direction::Vertical)
            .constraints([Constraint::Length(hint_height), Constraint::Min(1)])
            .split(area);
        (Some(splits[0]), splits[1])
    } else {
        (None, area)
    };

    // Render plugin hint banner if there is one
    if let Some(ha) = hint_area {
        render_plugin_hints(frame, &app.plugin_hints, ha);
    }

    let show_logo_header =
        content_area.height >= WELCOME_BOX_HEIGHT + 3 && content_area.width >= 60;
    let (logo_area, msg_area) = if show_logo_header {
        let splits = Layout::default()
            .direction(Direction::Vertical)
            .constraints([Constraint::Length(WELCOME_BOX_HEIGHT), Constraint::Min(1)])
            .split(content_area);
        (Some(splits[0]), splits[1])
    } else {
        (None, content_area)
    };

    if let Some(la) = logo_area {
        render_welcome_box(frame, app, la);
    } else if app.messages.is_empty() && app.streaming_text.is_empty() {
        render_welcome_box(frame, app, content_area);
        return;
    }

    let lines = render_message_items(app, msg_area.width);

    // Compute total virtual height and apply scroll clamping.
    // When auto_scroll is on we always show the tail; otherwise we respect
    // the user's scroll_offset.
    let content_height = lines.len() as u16;
    let visible_height = msg_area.height;  // no borders, full height available
    let max_scroll = content_height.saturating_sub(visible_height) as usize;
    // scroll_offset counts lines above the bottom (0 = at bottom).
    // ratatui scroll() takes an absolute top-row index, so convert:
    //   top_row = max_scroll - scroll_offset  (clamped to [0, max_scroll])
    let scroll = if app.auto_scroll {
        max_scroll
    } else {
        max_scroll.saturating_sub(app.scroll_offset)
    };

    // No border — messages render directly into the area.
    let mut list = VirtualList::new();
    list.viewport_height = msg_area.height;
    list.sticky_bottom = app.auto_scroll;
    list.set_items(lines);
    list.scroll_offset = scroll as u16;
    list.render(msg_area, frame.buffer_mut());

    // "â†“ N new messages" indicator when scrolled up and new messages arrived.
    if app.new_messages_while_scrolled > 0 && msg_area.height > 4 && msg_area.width > 20 {
        let indicator = format!(
            " \u{2193} {} new message{} ",
            app.new_messages_while_scrolled,
            if app.new_messages_while_scrolled == 1 { "" } else { "s" }
        );
        let ind_len = indicator.len() as u16;
        let ind_x = msg_area
            .x
            .saturating_add(msg_area.width.saturating_sub(ind_len + 2));
        let ind_y = msg_area.y + msg_area.height.saturating_sub(1);
        let ind_area = Rect {
            x: ind_x,
            y: ind_y,
            width: ind_len.min(msg_area.width.saturating_sub(2)),
            height: 1,
        };
        let ind_line = Line::from(vec![Span::styled(
            indicator,
            Style::default()
                .fg(Color::Black)
                .bg(CLAUDE_ORANGE)
                .add_modifier(Modifier::BOLD),
        )]);
        frame.render_widget(Paragraph::new(vec![ind_line]), ind_area);
    }
}

fn render_message_items(app: &App, width: u16) -> Vec<RenderedLineItem> {
    let cacheable = app.streaming_text.is_empty() && app.tool_use_blocks.is_empty();
    let cache_key = MessageLinesCacheKey {
        width,
        messages_ptr: app.messages.as_ptr() as usize,
        messages_len: app.messages.len(),
        annotations_ptr: app.system_annotations.as_ptr() as usize,
        annotations_len: app.system_annotations.len(),
    };

    if cacheable {
        if let Some(lines) = MESSAGE_LINES_CACHE.with(|cache| {
            cache
                .borrow()
                .as_ref()
                .filter(|cached| cached.key == cache_key)
                .map(|cached| cached.lines.clone())
        }) {
            return lines;
        }
    }

    let mut lines: Vec<Line> = Vec::new();
    let total = app.messages.len();
    for i in 0..=total {
        for ann in app.system_annotations.iter().filter(|a| a.after_index == i) {
            render_system_annotation_lines(&mut lines, ann, width as usize);
        }

        if i < total {
            render_message_lines(&mut lines, &app.messages[i], width as usize);
        }
    }

    for block in &app.tool_use_blocks {
        render_tool_block_lines(&mut lines, block, app.frame_count);
    }

    if !app.streaming_text.is_empty() {
        let rendered = render_markdown(&app.streaming_text, width);
        let mut first = true;
        for line in rendered {
            let mut spans = line.spans;
            if first {
                let mut prefixed = Vec::with_capacity(spans.len() + 1);
                prefixed.push(Span::styled(
                    "\u{2022} ",
                    Style::default().fg(Color::White).add_modifier(Modifier::BOLD),
                ));
                prefixed.extend(spans);
                spans = prefixed;
                first = false;
            }
            lines.push(Line::from(spans));
        }
    }

    let items = lines
        .into_iter()
        .map(|line| RenderedLineItem {
            search_text: flatten_line_text(&line),
            line,
        })
        .collect::<Vec<_>>();

    if cacheable {
        MESSAGE_LINES_CACHE.with(|cache| {
            *cache.borrow_mut() = Some(MessageLinesCache {
                key: cache_key,
                lines: items.clone(),
            });
        });
    }

    items
}

// â”€â”€ Welcome / startup screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Render the two-column orange round-bordered welcome box (matches TS LogoV2).
fn render_welcome_box(frame: &mut Frame, app: &App, area: Rect) {
    // Shorten cwd: replace $USERPROFILE/$HOME prefix with ~
    let cwd = std::env::current_dir()
        .ok()
        .and_then(|p| {
            let home = std::env::var("USERPROFILE")
                .or_else(|_| std::env::var("HOME"))
                .ok();
            if let Some(h) = home {
                let hs = p.display().to_string();
                if hs.starts_with(&h) {
                    return Some(format!("~{}", &hs[h.len()..]));
                }
            }
            Some(p.display().to_string())
        })
        .unwrap_or_else(|| ".".to_string());

    // --- Box dimensions ---
    // The box should be at most the full area width, and a fixed height.
    let box_width = area.width.min(area.width);
    let box_height: u16 = WELCOME_BOX_HEIGHT;
    if area.height < box_height + 1 || box_width < 30 {
        // Too small: fall back to a single line
        let line = Line::from(vec![
            Span::styled("Claude Code ", Style::default().fg(CLAUDE_ORANGE).add_modifier(Modifier::BOLD)),
            Span::styled(format!("v{}", APP_VERSION), Style::default().fg(Color::DarkGray)),
        ]);
        frame.render_widget(Paragraph::new(vec![line]), area);
        return;
    }
    let box_area = Rect { x: area.x, y: area.y, width: box_width, height: box_height };

    // Outer orange rounded border with title "Claude Code vX.Y"
    let outer_block = Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .border_style(Style::default().fg(CLAUDE_ORANGE))
        .title(Line::from(vec![
            Span::styled(" Claude Code ", Style::default().fg(CLAUDE_ORANGE).add_modifier(Modifier::BOLD)),
            Span::styled(format!("v{} ", APP_VERSION), Style::default().fg(Color::DarkGray)),
        ]));
    frame.render_widget(outer_block, box_area);

    // Inner area (inside the border)
    let inner = Rect {
        x: box_area.x + 1,
        y: box_area.y + 1,
        width: box_area.width.saturating_sub(2),
        height: box_area.height.saturating_sub(2),
    };

    // Split inner into left | divider(1) | right
    // Left width: ~28 chars or half the inner width, whichever is smaller
    let left_w = (inner.width / 2).max(22).min(32).min(inner.width.saturating_sub(3));
    let right_w = inner.width.saturating_sub(left_w + 1);
    let h_chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Length(left_w),
            Constraint::Length(1),
            Constraint::Length(right_w),
        ])
        .split(inner);

    // Draw orange vertical divider
    let divider_lines: Vec<Line> = (0..inner.height)
        .map(|_| Line::from(Span::styled("\u{2502}", Style::default().fg(CLAUDE_ORANGE))))
        .collect();
    frame.render_widget(Paragraph::new(divider_lines), h_chunks[1]);

    // --- Left column ---
    let welcome_msg = "Welcome back!";
    let clawd = clawd_lines(&ClawdPose::Default);
    let model_line = format!("{} \u{00b7} API Usage Billing", app.model_name);

    let mut left_lines: Vec<Line> = Vec::new();
    left_lines.push(Line::from(Span::styled(
        welcome_msg,
        Style::default().fg(Color::White).add_modifier(Modifier::BOLD),
    )));
    left_lines.push(Line::from(""));
    // Center mascot in left column
    let mascot_indent = left_w.saturating_sub(11) / 2;
    let pad = " ".repeat(mascot_indent as usize);
    for cl in &clawd {
        let mut spans = vec![Span::raw(pad.clone())];
        spans.extend(cl.spans.iter().cloned());
        left_lines.push(Line::from(spans));
    }
    left_lines.push(Line::from(""));
    left_lines.push(Line::from(Span::styled(
        model_line,
        Style::default().fg(Color::DarkGray),
    )));
    left_lines.push(Line::from(Span::styled(
        cwd,
        Style::default().fg(Color::DarkGray),
    )));

    frame.render_widget(Paragraph::new(left_lines).wrap(Wrap { trim: false }), h_chunks[0]);

    // --- Right column ---
    let tip_text = cc_core::tips::select_tip(0)
        .map(|t| t.content.to_string())
        .unwrap_or_else(|| "Run /init to create a CLAUDE.md file with instructions for Claude".to_string());

    let mut right_lines: Vec<Line> = Vec::new();
    right_lines.push(Line::from(Span::styled(
        "Tips for getting started",
        Style::default().fg(CLAUDE_ORANGE).add_modifier(Modifier::BOLD),
    )));
    // Word-wrap the tip text into the right column width
    let right_w_usize = right_w.saturating_sub(1) as usize;
    for chunk in tip_text.chars().collect::<Vec<_>>().chunks(right_w_usize.max(1)) {
        right_lines.push(Line::from(chunk.iter().collect::<String>()));
    }
    right_lines.push(Line::from(""));
    right_lines.push(Line::from(Span::styled(
        "Recent activity",
        Style::default().fg(CLAUDE_ORANGE).add_modifier(Modifier::BOLD),
    )));
    right_lines.push(Line::from(Span::styled(
        "No recent activity",
        Style::default().fg(Color::DarkGray),
    )));

    frame.render_widget(Paragraph::new(right_lines).wrap(Wrap { trim: false }), h_chunks[2]);
}

// â”€â”€ Per-message rendering â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

fn render_message_lines(lines: &mut Vec<Line<'static>>, msg: &cc_core::types::Message, width: usize) {
    let rendered = render_message(
        msg,
        &RenderContext {
            width: width as u16,
            highlight: true,
            show_thinking: false,
        },
    );

    // Truncate very long outputs with a "â€¦ N more lines" notice
    const MAX_LINES_PER_MSG: usize = 200;
    if rendered.len() > MAX_LINES_PER_MSG {
        lines.extend(rendered[..MAX_LINES_PER_MSG].iter().cloned());
        lines.push(Line::from(vec![Span::styled(
            format!(
                "  \u{2026} {} more lines (scroll up to read all)",
                rendered.len() - MAX_LINES_PER_MSG
            ),
            Style::default()
                .fg(Color::DarkGray)
                .add_modifier(Modifier::ITALIC),
        )]));
    } else {
        lines.extend(rendered);
    }
}

// â”€â”€ System annotation (compact boundary, info notices) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

fn render_system_annotation_lines(
    lines: &mut Vec<Line<'static>>,
    ann: &SystemAnnotation,
    width: usize,
) {
    // Compact boundary: show âœ» prefix with dimmed text
    if ann.style == SystemMessageStyle::Compact {
        lines.push(Line::from(vec![
            Span::styled(
                format!("  {} ", figures::TEARDROP_ASTERISK),
                Style::default().fg(Color::DarkGray),
            ),
            Span::styled(
                ann.text.clone(),
                Style::default()
                    .fg(Color::DarkGray)
                    .add_modifier(Modifier::DIM),
            ),
        ]));
        lines.push(Line::from(""));
        return;
    }

    let (text_color, border_color) = match ann.style {
        SystemMessageStyle::Info => (Color::DarkGray, Color::DarkGray),
        SystemMessageStyle::Warning => (Color::Yellow, Color::Yellow),
        SystemMessageStyle::Compact => unreachable!(),
    };

    // Centred, padded rule: "â”€â”€â”€ text â”€â”€â”€"
    let text = ann.text.as_str();
    let inner_width = width.saturating_sub(4);
    let text_len = text.len();
    let dashes = inner_width.saturating_sub(text_len + 2);
    let left = dashes / 2;
    let right = dashes - left;

    lines.push(Line::from(vec![
        Span::styled(
            format!("  {}", "\u{2500}".repeat(left)),
            Style::default().fg(border_color),
        ),
        Span::styled(
            format!("\u{2500} {} \u{2500}", text),
            Style::default().fg(text_color).add_modifier(Modifier::DIM),
        ),
        Span::styled(
            "\u{2500}".repeat(right),
            Style::default().fg(border_color),
        ),
    ]));
    lines.push(Line::from(""));
}

// â”€â”€ Tool use block â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

fn render_tool_block_lines(lines: &mut Vec<Line<'static>>, block: &crate::app::ToolUseBlock, frame_count: u64) {
    let (icon, icon_style) = match block.status {
        ToolStatus::Running => (
            format!("{}", spinner_char(frame_count)),
            Style::default().fg(Color::Yellow),
        ),
        ToolStatus::Done => ("\u{2713}".to_string(), Style::default().fg(Color::Green)),
        ToolStatus::Error => ("\u{2717}".to_string(), Style::default().fg(Color::Red)),
    };

    let label_style = match block.status {
        ToolStatus::Running => Style::default()
            .fg(Color::Yellow)
            .add_modifier(Modifier::BOLD),
        ToolStatus::Done => Style::default()
            .fg(Color::Green)
            .add_modifier(Modifier::BOLD),
        ToolStatus::Error => Style::default()
            .fg(Color::Red)
            .add_modifier(Modifier::BOLD),
    };

    let verb = match block.status {
        ToolStatus::Running => "Running",
        ToolStatus::Done => "Done",
        ToolStatus::Error => "Error",
    };

    lines.push(Line::from(vec![
        Span::styled(format!("  {} ", icon), icon_style),
        Span::styled(verb.to_string(), Style::default().fg(Color::DarkGray)),
        Span::raw(": "),
        Span::styled(block.name.clone(), label_style),
    ]));

    if let Some(ref preview) = block.output_preview {
        let (preview_style, is_error) = match block.status {
            ToolStatus::Error => (Style::default().fg(Color::Red), true),
            _ => (Style::default().fg(Color::DarkGray), false),
        };
        for (i, line_text) in preview.lines().enumerate() {
            if i == 0 && is_error {
                lines.push(Line::from(vec![
                    Span::raw("    "),
                    Span::styled(
                        line_text.to_string(),
                        Style::default().fg(Color::Red),
                    ),
                ]));
            } else if line_text.starts_with('\u{2026}') {
                // "â€¦ N more lines" truncation marker
                lines.push(Line::from(vec![
                    Span::raw("    "),
                    Span::styled(
                        line_text.to_string(),
                        Style::default()
                            .fg(Color::DarkGray)
                            .add_modifier(Modifier::ITALIC),
                    ),
                ]));
            } else {
                lines.push(Line::from(vec![
                    Span::raw("    "),
                    Span::styled(line_text.to_string(), preview_style),
                ]));
            }
        }
    }
}

// -----------------------------------------------------------------------
// Input pane
// -----------------------------------------------------------------------

fn render_input(frame: &mut Frame, app: &App, area: Rect, focused: bool) {
    render_prompt_input(
        &app.prompt_input,
        area,
        frame.buffer_mut(),
        focused,
        if app.is_streaming {
            InputMode::Readonly
        } else if app.plan_mode {
            InputMode::Plan
        } else {
            InputMode::Default
        },
    );
}

fn should_render_status_row(app: &App) -> bool {
    app.is_streaming || app.voice_recording || app.status_message.is_some()
}

fn render_status_row(frame: &mut Frame, app: &App, area: Rect) {
    if area.height == 0 {
        return;
    }

    let spans = if app.voice_recording {
        vec![Span::styled(
            format!("{} Recording... press Alt+V to transcribe", figures::black_circle()),
            Style::default().fg(Color::Red).add_modifier(Modifier::BOLD),
        )]
    } else if app.is_streaming {
        vec![
            Span::styled(
                spinner_char(app.frame_count).to_string(),
                Style::default().fg(spinner_color(app)).add_modifier(Modifier::BOLD),
            ),
            Span::raw(" "),
            Span::styled(
                app.status_message
                    .as_deref()
                    .unwrap_or("Thinking..."),
                Style::default().fg(Color::DarkGray),
            ),
        ]
    } else if let Some(status) = app.status_message.as_deref() {
        vec![Span::styled(status, Style::default().fg(Color::DarkGray))]
    } else {
        Vec::new()
    };

    if spans.is_empty() {
        return;
    }

    frame.render_widget(Paragraph::new(Line::from(spans)), area);
}
// Keybinding hints footer
// -----------------------------------------------------------------------

/// Single footer line matching real Claude Code:
///   Left:  "? for shortcuts" (dimmed)  â€” or streaming/mode context
///   Right: "â— high Â· /effort" (effort indicator + model)
fn render_footer(frame: &mut Frame, app: &App, area: Rect) {
    if area.height == 0 {
        return;
    }

    // Left side
    let left_spans: Vec<Span> = if app.voice_recording {
        vec![Span::styled(
            format!(" {} REC â€” speak now", figures::black_circle()),
            Style::default().fg(Color::Red).add_modifier(Modifier::BOLD),
        )]
    } else {
        vec![Span::styled(
            "? for shortcuts",
            Style::default().fg(Color::DarkGray),
        )]
    };

    // Right side: effort glyph Â· effort name Â· /effort  (matches TS StatusLine)
    let effort_glyph = match app.effort_level {
        EffortLevel::Low => figures::EFFORT_LOW,
        EffortLevel::Medium => figures::EFFORT_MEDIUM,
        EffortLevel::High => figures::EFFORT_HIGH,
        EffortLevel::Max => figures::EFFORT_MAX,
    };
    let effort_name = match app.effort_level {
        EffortLevel::Low => "low",
        EffortLevel::Medium => "medium",
        EffortLevel::High => "high",
        EffortLevel::Max => "max",
    };
    let mut right_spans: Vec<Span> = Vec::new();
    if app.fast_mode {
        right_spans.push(Span::styled(
            format!("{} ", figures::LIGHTNING_BOLT),
            Style::default().fg(Color::Yellow),
        ));
    }
    right_spans.push(Span::styled(
        format!("{} {} \u{00b7} /effort", effort_glyph, effort_name),
        Style::default().fg(Color::DarkGray),
    ));

    // Gap fill
    let left_len: usize = left_spans.iter().map(|s| s.content.len()).sum();
    let right_len: usize = right_spans.iter().map(|s| s.content.len()).sum();
    let gap = (area.width as usize).saturating_sub(left_len + right_len);

    let mut spans = left_spans;
    spans.push(Span::raw(" ".repeat(gap)));
    spans.extend(right_spans);

    frame.render_widget(Paragraph::new(vec![Line::from(spans)]), area);
}

fn render_prompt_suggestions(frame: &mut Frame, app: &App, area: Rect) {
    let suggestions = &app.prompt_input.suggestions;
    if suggestions.is_empty() || area.height == 0 {
        return;
    }

    let selected = app.prompt_input.suggestion_index.unwrap_or(0);
    let max_visible = area.height as usize;
    let start = selected.saturating_sub(max_visible / 2).min(suggestions.len().saturating_sub(max_visible));
    let end = (start + max_visible).min(suggestions.len());

    for (row, suggestion) in suggestions[start..end].iter().enumerate() {
        let is_selected = start + row == selected;
        let prefix = if is_selected { "> " } else { "  " };
        let style = if is_selected {
            Style::default().fg(CLAUDE_ORANGE).add_modifier(Modifier::BOLD)
        } else {
            Style::default().fg(Color::DarkGray)
        };
        let mut spans = vec![
            Span::styled(prefix, style),
            Span::styled(suggestion.text.clone(), style),
        ];
        if !suggestion.description.is_empty() {
            spans.push(Span::styled(
                format!("  {}", suggestion.description),
                Style::default().fg(Color::DarkGray),
            ));
        }

        frame.render_widget(
            Paragraph::new(Line::from(spans)),
            Rect {
                x: area.x,
                y: area.y + row as u16,
                width: area.width,
                height: 1,
            },
        );
    }
}

// -----------------------------------------------------------------------
// Legacy simple help overlay (fallback when help_overlay is not open)
// -----------------------------------------------------------------------

fn render_simple_help_overlay(frame: &mut Frame, area: Rect) {
    let help_width = 50u16.min(area.width.saturating_sub(4));
    let help_height = 20u16.min(area.height.saturating_sub(4));
    let help_area = crate::overlays::centered_rect(help_width, help_height, area);

    frame.render_widget(Clear, help_area);

    let lines = vec![
        Line::from(vec![Span::styled(
            " Key Bindings",
            Style::default()
                .fg(Color::Cyan)
                .add_modifier(Modifier::BOLD | Modifier::UNDERLINED),
        )]),
        Line::from(""),
        kb_line("Enter", "Submit message"),
        kb_line("Ctrl+C", "Cancel streaming / Quit"),
        kb_line("Ctrl+D", "Quit (empty input)"),
        kb_line("Up / Down", "Navigate input history"),
        kb_line("Ctrl+R", "Search input history"),
        kb_line("PageUp / PageDown", "Scroll messages"),
        kb_line("F1 / ?", "Toggle this help"),
        Line::from(""),
        Line::from(vec![Span::styled(
            " Permission Dialog",
            Style::default()
                .fg(Color::Yellow)
                .add_modifier(Modifier::BOLD | Modifier::UNDERLINED),
        )]),
        Line::from(""),
        kb_line("1 / 2 / 3", "Select option"),
        kb_line("y / a / n", "Allow / Always / Deny"),
        kb_line("Enter", "Confirm selection"),
        kb_line("Esc", "Deny (close dialog)"),
        Line::from(""),
        Line::from(vec![Span::styled(
            " press F1 or ? to close ",
            Style::default()
                .fg(Color::DarkGray)
                .add_modifier(Modifier::ITALIC),
        )]),
    ];

    let block = Block::default()
        .borders(Borders::ALL)
        .title(" Help ")
        .border_style(Style::default().fg(Color::Cyan));

    let para = Paragraph::new(lines)
        .block(block)
        .alignment(Alignment::Left);
    frame.render_widget(para, help_area);
}

fn kb_line<'a>(key: &str, desc: &str) -> Line<'a> {
    Line::from(vec![
        Span::raw("  "),
        Span::styled(
            format!("{:<20}", key),
            Style::default()
                .fg(Color::Green)
                .add_modifier(Modifier::BOLD),
        ),
        Span::raw(desc.to_string()),
    ])
}

// -----------------------------------------------------------------------
// Legacy history search overlay (used when history_search_overlay is not open)
// -----------------------------------------------------------------------

fn render_legacy_history_search(
    frame: &mut Frame,
    hs: &crate::app::HistorySearch,
    app: &App,
    area: Rect,
) {
    let dialog_width = 60u16.min(area.width.saturating_sub(4));
    let visible_matches = 8usize;
    let dialog_height =
        (4 + visible_matches.min(hs.matches.len().max(1)) as u16).min(area.height.saturating_sub(4));
    let dialog_area = crate::overlays::centered_rect(dialog_width, dialog_height, area);

    frame.render_widget(Clear, dialog_area);

    let mut lines: Vec<Line> = Vec::new();
    lines.push(Line::from(vec![
        Span::raw("  Search: "),
        Span::styled(
            hs.query.clone(),
            Style::default().fg(Color::White).add_modifier(Modifier::BOLD),
        ),
        Span::styled("\u{2588}", Style::default().fg(Color::White)),
    ]));
    lines.push(Line::from(""));

    if hs.matches.is_empty() {
        lines.push(Line::from(vec![Span::styled(
            "  (no matches)",
            Style::default().fg(Color::DarkGray),
        )]));
    } else {
        let start = hs.selected.saturating_sub(visible_matches / 2);
        let end = (start + visible_matches).min(hs.matches.len());
        let start = end.saturating_sub(visible_matches).min(start);

        for (display_idx, &hist_idx) in hs.matches[start..end].iter().enumerate() {
            let real_idx = start + display_idx;
            let is_selected = real_idx == hs.selected;
            let entry = app
                .prompt_input
                .history
                .get(hist_idx)
                .map(String::as_str)
                .unwrap_or("");

            let truncated = if UnicodeWidthStr::width(entry) > (dialog_width as usize - 6) {
                let mut s = entry.to_string();
                s.truncate(dialog_width as usize - 9);
                format!("{}\u{2026}", s)
            } else {
                entry.to_string()
            };

            let (prefix, style) = if is_selected {
                (
                    "  \u{25BA} ",
                    Style::default()
                        .fg(Color::Cyan)
                        .add_modifier(Modifier::BOLD),
                )
            } else {
                ("    ", Style::default().fg(Color::White))
            };
            lines.push(Line::from(vec![
                Span::raw(prefix),
                Span::styled(truncated, style),
            ]));
        }
    }

    let block = Block::default()
        .borders(Borders::ALL)
        .title(" History Search (Esc to cancel) ")
        .border_style(Style::default().fg(Color::Cyan));

    let para = Paragraph::new(lines).block(block);
    frame.render_widget(para, dialog_area);
}

// -----------------------------------------------------------------------
// Complete status line (T2-8)
// -----------------------------------------------------------------------

/// Complete status line data for rendering.
#[derive(Debug, Clone, Default)]
pub struct StatusLineData {
    pub model: String,
    pub tokens_used: u64,
    pub tokens_total: u64,
    pub cost_cents: f64,
    pub compact_warning_pct: Option<f64>,  // None = no warning; Some(pct) = show warning
    pub vim_mode: Option<String>,           // None = no vim mode; Some("NORMAL") etc.
    pub bridge_connected: bool,
    pub session_id: Option<String>,
    pub worktree: Option<String>,
    pub agent_badge: Option<String>,
    pub rate_limit_pct_5h: Option<f64>,
    pub rate_limit_pct_7d: Option<f64>,
}

pub fn render_full_status_line(data: &StatusLineData, area: Rect, buf: &mut ratatui::buffer::Buffer) {
    use ratatui::{
        style::{Color, Modifier, Style},
        text::{Line, Span},
        widgets::{Paragraph, Widget},
    };

    let mut spans = Vec::new();

    // Model name
    if !data.model.is_empty() {
        spans.push(Span::styled(
            format!(" {} ", data.model),
            Style::default().fg(Color::Cyan),
        ));
        spans.push(Span::styled(" â”‚ ", Style::default().fg(Color::DarkGray)));
    }

    // Context window
    if data.tokens_total > 0 {
        let pct = data.tokens_used as f64 / data.tokens_total as f64;
        let ctx_color = if pct >= 0.95 { Color::Red } else if pct >= 0.80 { Color::Yellow } else { Color::Green };
        let used_k = data.tokens_used / 1000;
        let total_k = data.tokens_total / 1000;
        spans.push(Span::styled(
            format!("{}k/{}k ({:.0}%)", used_k, total_k, pct * 100.0),
            Style::default().fg(ctx_color),
        ));
        spans.push(Span::styled(" â”‚ ", Style::default().fg(Color::DarkGray)));
    }

    // Cost
    if data.cost_cents > 0.0 {
        spans.push(Span::styled(
            format!("${:.2}", data.cost_cents / 100.0),
            Style::default().fg(Color::White),
        ));
        spans.push(Span::styled(" â”‚ ", Style::default().fg(Color::DarkGray)));
    }

    // Compact warning
    if let Some(pct) = data.compact_warning_pct {
        if pct >= 0.80 {
            let color = if pct >= 0.95 { Color::Red } else { Color::Yellow };
            spans.push(Span::styled(
                format!("âš  ctx {:.0}% ", pct * 100.0),
                Style::default().fg(color).add_modifier(Modifier::BOLD),
            ));
        }
    }

    // Vim mode
    if let Some(mode) = &data.vim_mode {
        let color = match mode.as_str() {
            "NORMAL" => Color::Green,
            "INSERT" => Color::Blue,
            "VISUAL" => Color::Magenta,
            _ => Color::White,
        };
        spans.push(Span::styled(
            format!("[{}]", mode),
            Style::default().fg(color).add_modifier(Modifier::BOLD),
        ));
        spans.push(Span::styled(" ", Style::default()));
    }

    // Agent badge
    if let Some(badge) = &data.agent_badge {
        spans.push(Span::styled(
            format!("[{}]", badge),
            Style::default().fg(Color::Magenta),
        ));
        spans.push(Span::styled(" ", Style::default()));
    }

    // Bridge connected
    if data.bridge_connected {
        spans.push(Span::styled(
            "ðŸ”— ",
            Style::default().fg(Color::Green),
        ));
    }

    // Session ID
    if let Some(sid) = &data.session_id {
        let short = &sid[..sid.len().min(8)];
        spans.push(Span::styled(
            format!("[session:{}]", short),
            Style::default().fg(Color::DarkGray),
        ));
    }

    // Worktree
    if let Some(wt) = &data.worktree {
        spans.push(Span::styled(
            format!("[worktree:{}]", wt),
            Style::default().fg(Color::DarkGray),
        ));
    }

    let line = Line::from(spans);
    Paragraph::new(line)
        .style(Style::default().bg(Color::Black))
        .render(area, buf);
}

