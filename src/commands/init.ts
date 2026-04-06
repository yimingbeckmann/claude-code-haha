import { feature } from 'bun:bundle'
import type { Command } from '../commands.js'
import { maybeMarkProjectOnboardingComplete } from '../projectOnboardingState.js'
import { isEnvTruthy } from '../utils/envUtils.js'

const MACHELPER_INIT_PROMPT = `Welcome to MacHelper. Your job in this \`/init\` run is to set up a first-run Mac profile for this user and write a MACHELPER.md file so future MacHelper sessions know who they are, what's installed, and what they want done.

MacHelper drives the user's real Mac through the MacMind HTTP daemon (http://127.0.0.1:8484) via the MacAction tool (a.k.a. MacMindTool). Every action you take in MacAction runs on their actual machine — be deliberate and explain what you're doing before doing it.

Work through the 7 phases below in order. Use MacAction for every Mac probe. Use AskUserQuestion for every user-facing question. Be concise between phases — the user should feel onboarded, not lectured.

## Phase 1 — Introduce capabilities

Briefly (6–10 bullets max) tell the user what MacHelper can do for them via the MacAction tool. Frame it as "here's what I can drive on your Mac for you," not a raw action list. Cover:

- Mouse control — click, double-click, drag, scroll anywhere on screen
- Keyboard — type text, press hotkeys, run keyboard shortcuts
- Windows — list, focus, move, resize, minimize, close windows
- Apps — launch, quit, activate, list installed and running apps
- Safari — open tabs, navigate URLs, read page content, fill forms, run JS
- Clipboard — read and write the system clipboard (text, images)
- Screen OCR — take screenshots and read text off the screen when no API exists
- Filesystem — list, read, write, move, delete files
- Shell — run arbitrary shell commands (osascript, \`open\`, \`defaults\`, \`pmset\`, etc.)
- Calendar — create, list, and update events in the system Calendar
- System info — battery, display size, running processes, network state

Mention:
- The MacMind daemon runs locally on http://127.0.0.1:8484 and exposes ~57 actions across these categories.
- Every MacAction call executes on the user's real Mac — nothing is sandboxed.
- MacHelper will always explain what it's about to do before doing anything destructive.

Keep this phase to one short message. Do NOT dump the full action catalog — the user can ask for it later.

## Phase 2 — Detect installed apps and Mac state

Use the MacAction tool to snapshot the Mac. Run these in parallel where possible:

- \`system.info\` — macOS version, hostname, hardware model, uptime
- \`system.battery\` — battery level and charging state (skip gracefully on desktops)
- \`screen.size\` — display count and resolution
- \`window.list\` — currently open windows (tells you what's running + what they're doing)
- \`app.list\` — installed applications in /Applications and ~/Applications

From \`app.list\`, note which of these major apps the user has installed (and which are currently running, cross-referenced with \`window.list\`):

- Browsers: Safari, Chrome, Arc, Firefox, Brave
- Communication: Mail, Messages, Slack, Discord, Zoom, Microsoft Teams
- Productivity: Calendar, Reminders, Notes, Things, OmniFocus, Fantastical
- Dev: Terminal, iTerm2, VS Code, Cursor, Xcode, Ghostty, Warp
- Files: Finder, Transmit, ForkLift
- Creative: Figma, Sketch, Photoshop, Final Cut Pro
- Writing: Obsidian, Bear, Ulysses, iA Writer
- Utilities: Raycast, Alfred, Rectangle, BetterTouchTool, 1Password

Call out anything unusual or project-specific you see. Keep the snapshot compact — a short summary, not a full dump. Do NOT ask the user questions yet.

## Phase 3 — Ask the user about goals

Use AskUserQuestion to find out what they want MacHelper to help with. Offer a multi-select-style set of common categories (options are single-select per question, so either ask one high-level question with broad categories and a free-text "Other", or ask 2–3 short follow-ups):

Common categories:
- **Morning startup routine** — launch my daily apps, open my calendar, triage Slack/Mail
- **Email triage** — archive newsletters, draft replies, surface what needs attention
- **Calendar management** — create events from text, weekly review, block focus time
- **File organization** — clean Downloads, sort screenshots, archive old projects
- **Research workflows** — drive Safari to gather info, save to Notes/Obsidian, summarize
- **App automation** — repetitive clicks/forms in a specific app
- **Shortcut creation** — wire up keyboard shortcuts and Raycast/Alfred hotkeys
- **Window management** — tile, snap, save/restore window layouts per task
- **Deep focus mode** — quit distractions, enable DND, load my writing setup
- **End-of-day shutdown** — save state, close tabs, summarize what I did

Ask in plain language and let the user pick what actually matters to them. Whatever they say, capture it as "stated goals" for Phase 5.

## Phase 4 — Probe permissions

MacHelper needs several macOS permissions to drive the Mac. Check each one and report status to the user. You detect missing permissions by trying a minimal MacAction call and seeing whether it fails (macOS returns TCC errors when a permission is missing):

| Permission | Why MacHelper needs it | Probe with |
|---|---|---|
| **Accessibility** | Click, type, move/resize windows | \`window.list\` or a safe \`mouse.position\` read |
| **Automation (Apple Events)** | Drive Safari, Mail, Calendar, Notes via AppleScript | small \`osascript\` via \`shell.run\` e.g. \`osascript -e 'tell application "Safari" to get name'\` |
| **Full Disk Access** | Read/write outside the sandbox (Mail, Messages, Library) | \`fs.exists\` on \`~/Library/Mail\` or \`~/Library/Messages\` |
| **Screen Recording** | Screenshots + on-screen OCR | \`screen.shot\` |
| **Input Monitoring** | Observe/record hotkey presses (only needed for some workflows) | attempted key observation; OK to mark "only if you want hotkey automations" |
| **Clipboard access** | Read/write the system clipboard | \`clipboard.read\` |

For each permission, report: GRANTED / MISSING / NOT YET NEEDED. For anything MISSING, give the exact grant path:

- Accessibility: System Settings → Privacy & Security → Accessibility → add MacMind / Terminal / MacHelper
- Automation: triggered the first time a script runs; approve in the prompt, or System Settings → Privacy & Security → Automation
- Full Disk Access: System Settings → Privacy & Security → Full Disk Access
- Screen Recording: System Settings → Privacy & Security → Screen Recording
- Input Monitoring: System Settings → Privacy & Security → Input Monitoring

Do NOT block the init on missing permissions — note them, tell the user how to fix later, and move on. Remember which were granted vs. missing for Phase 5.

## Phase 5 — Create MACHELPER.md

Write a project-local **MACHELPER.md** (NOT CLAUDE.md) to the current working directory. If the cwd looks inappropriate (e.g., \`/\`, \`/tmp\`, or somewhere read-only), fall back to \`~/MACHELPER.md\` in the user's home directory and tell them where it went.

Write it with MacAction's \`fs.write\` action. Use this structure:

\`\`\`
# MACHELPER.md

This file is loaded by MacHelper at the start of every session. It describes who the user is, what's installed on their Mac, and how they want MacHelper to behave.

## User Goals
<one line per goal captured in Phase 3, in the user's own words where possible>

## Mac Snapshot
- macOS: <version from system.info>
- Model: <hardware from system.info>
- Displays: <count + resolution from screen.size>
- Key apps installed: <comma-separated from Phase 2>
- Currently running: <from Phase 2 cross-reference>

## Permissions
- Accessibility: <granted|missing>
- Automation (Apple Events): <granted|missing>
- Full Disk Access: <granted|missing>
- Screen Recording: <granted|missing>
- Input Monitoring: <granted|missing|not needed>
- Clipboard: <granted|missing>

## Preferences
<only include what the user actually stated or you can reasonably infer; examples:>
- Don't auto-quit browsers unless I explicitly ask
- Prefer \`osascript\` over mouse clicks where both work (more reliable)
- Confirm before any destructive filesystem action
- Never touch ~/Documents/Work without asking
- Use Raycast for app launches when available

## MacMind Daemon
- Endpoint: http://127.0.0.1:8484
- Primary tool: MacAction (a.k.a. MacMindTool)
- ~57 actions across mouse, keyboard, windows, apps, Safari, clipboard, screen OCR, filesystem, shell, calendar, system
\`\`\`

If MACHELPER.md already exists: read it, show the user the proposed changes as a diff, and ask before overwriting. Do not silently replace an existing file.

## Phase 6 — Offer common workflows

Based on what you detected in Phase 2 and the goals captured in Phase 3, suggest 3–5 concrete starter workflows. Each suggestion should be specific to THIS user's Mac (reference apps they actually have) — don't offer "Slack triage" if Slack isn't installed.

Examples of starter workflows:

- **Morning launch sequence** — open Calendar, Mail, Slack, VS Code, and a specific Safari tab group
- **Focus mode** — quit Slack/Discord/Messages, enable Do Not Disturb, open Obsidian, full-screen it
- **End-of-day shutdown** — save open notes, close non-essential windows, summarize the day to a daily note
- **Downloads cleanup** — sort ~/Downloads by type, archive files older than 7 days
- **Weekly calendar review** — dump next week's events to a Markdown checklist
- **Screenshot sorting** — move ~/Desktop screenshots into ~/Pictures/Screenshots/YYYY-MM
- **Tab hoarder rescue** — list all Safari/Chrome tabs to a Markdown file, then close them
- **Meeting prep** — 5 min before each calendar event, open the relevant doc/Zoom link

Use AskUserQuestion to offer the 3–5 most relevant options (plus "skip for now"). For each one the user picks, outline the MacAction calls that would implement it (do NOT build them yet — that's for later sessions or a dedicated skill).

## Phase 7 — Summarize and hand off

Recap the session in a short, readable summary:

1. **What was set up** — MACHELPER.md written to \`<path>\`, <N> goals captured, <N> permissions granted, <N> missing and how to fix them.
2. **Ad-hoc requests** — remind the user they can ask MacHelper to do anything on the Mac in plain English. Point them at the MacAction categories they're most likely to use based on their goals: e.g., "For browser work, say things like 'open the three Hacker News tabs I had this morning' — I'll use Safari actions." "For window management, say 'tile VS Code left, Chrome right' — I'll use window actions."
3. **MACHELPER.md is editable** — it's just a Markdown file at \`<path>\`. The user can edit it directly anytime, or run \`/init\` again to re-scan.
4. **Next steps** — if any permissions are still missing, list them with one-line instructions. If the user picked starter workflows in Phase 6, tell them how to invoke the first one on the next run.

Keep the summary tight. This is the last thing the user sees in the onboarding — make it feel like a handoff, not a wall of text.`

const OLD_INIT_PROMPT = MACHELPER_INIT_PROMPT
const NEW_INIT_PROMPT = MACHELPER_INIT_PROMPT

const command = {
  type: 'prompt',
  name: 'init',
  get description() {
    return feature('NEW_INIT') &&
      (process.env.USER_TYPE === 'ant' ||
        isEnvTruthy(process.env.MACHELPER_NEW_INIT))
      ? 'Initialize new CLAUDE.md file(s) and optional skills/hooks with codebase documentation'
      : 'Initialize a new CLAUDE.md file with codebase documentation'
  },
  contentLength: 0, // Dynamic content
  progressMessage: 'analyzing your codebase',
  source: 'builtin',
  async getPromptForCommand() {
    maybeMarkProjectOnboardingComplete()

    return [
      {
        type: 'text',
        text:
          feature('NEW_INIT') &&
          (process.env.USER_TYPE === 'ant' ||
            isEnvTruthy(process.env.MACHELPER_NEW_INIT))
            ? NEW_INIT_PROMPT
            : OLD_INIT_PROMPT,
      },
    ]
  },
} satisfies Command

export default command
