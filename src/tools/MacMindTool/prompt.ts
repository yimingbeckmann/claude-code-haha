export const MAC_MIND_TOOL_NAME = 'MacAction'

export const MAC_MIND_API_BASE =
  process.env.MACMIND_API_BASE ?? 'http://127.0.0.1:8484'

/**
 * Static description. The dynamic action list is appended by the tool's
 * prompt() method at system-prompt build time so the model always sees the
 * live list of actions published by MacMind's HTTP API.
 */
export const DESCRIPTION = `
Drive the local macOS machine via the MacMind automation server.

Use this tool to take real actions on the user's Mac: click, type, move windows,
launch apps, open URLs in Safari, read the screen with OCR, manipulate the
clipboard and file system, run shell commands, schedule calendar events, send
notifications, persist cross-action state, and more. MacMind exposes ~57
actions across mouse, keyboard, windows, apps, Safari, clipboard, screen OCR,
filesystem, shell, calendar, memory (key-value store), system info, and
notifications.

Input:
- action: the fully-qualified action name (e.g. "mouse.click", "app.launch",
  "safari.current_url"). Action names use dots, not dashes.
- input: an object containing the action's arguments. Omit or pass {} when the
  action takes no arguments.

Behavior:
- Calls POST ${MAC_MIND_API_BASE}/action/<action> with the input as JSON body.
- Returns the action's JSON result on success, or an error object on failure.
- Actions run synchronously on the user's actual Mac. They are NOT sandboxed.
  Treat every call like a real physical action — because it is one.

=== ACTION CATEGORIES ===

Mouse / Keyboard (low-level — prefer higher-level actions when possible):
- mouse.click {x, y}            — click at absolute screen coords
- mouse.move {x, y}             — move pointer to coords
- mouse.position                — read current pointer position
- keyboard.type {text}          — type a string as keystrokes
- keyboard.key {key, modifiers} — press a single key with optional modifiers
  (e.g. {key: "a", modifiers: ["cmd"]} for select-all)
Warning: coordinate-based actions break when windows move or layouts change.
Use apps/windows/form actions whenever possible.

Windows:
- window.list                   — list all open windows
- window.active                 — get the currently focused window
- window.focus {id}             — bring window to front
- window.move {id, x, y}        — move window to screen coords
- window.resize {id, w, h}      — resize window
- window.close {id}             — close window (may prompt to save)
- window.minimize               — minimize the active/given window
- window.maximize               — maximize the active/given window

Apps:
- app.list                      — list running apps
- app.launch {bundleId}         — launch or activate an app by bundle id
- app.quit {bundleId}           — quit an app (may lose unsaved work)
- app.focus {bundleId}          — bring an app to front
Common bundle ids:
  com.apple.Safari, com.apple.mail, com.apple.iCal, com.apple.Notes,
  com.apple.Terminal, com.apple.finder, com.google.Chrome,
  com.microsoft.VSCode, com.tinyspeck.slackmacgap

Safari (prefer these over mouse-clicking Safari chrome):
- safari.current_url            — URL of the frontmost Safari tab
- safari.current_title          — title of the frontmost Safari tab
- safari.list_tabs              — list open tabs across windows
- safari.open {url}             — open a URL in Safari (new tab if needed)
- safari.close_tab {id}         — close a specific tab

Screen:
- screen.shot {path?}           — take a screenshot (optionally save to path)
- screen.size                   — get the display resolution
- form.read_screen              — OCR the current screen, returns text + bboxes
Use OCR to verify what's actually on screen before clicking or typing.

Clipboard:
- clipboard.read                — read current clipboard text
- clipboard.write {text}        — set clipboard text

Filesystem:
- fs.read {path}                — read a file's contents
- fs.write {path, content}      — write (overwrite) a file
- fs.list {path}                — list directory entries
- fs.stat {path}                — stat a path (size, mtime, type)
- fs.exists {path}              — check if a path exists
- fs.delete {path}              — DELETE a file/dir (destructive!)
- fs.move {from, to}            — move/rename a path

Calendar:
- calendar.list {start, end}    — list events in a time range
- calendar.create {title, start, end, ...} — create an event
- calendar.delete {id}          — delete an event (destructive)

Shell:
- system.shell {command}        — run an arbitrary shell command on the user's
  Mac. Full destructive potential — prefer specific actions when they exist.

System:
- system.info                   — hostname, OS version, uptime, etc.
- system.battery                — battery level and charging state
- system.volume.get             — current output volume
- system.volume.set {value}     — set output volume (0–100)
- system.notification {title, body} — post a macOS user notification

Memory (cross-action key-value store, persists within MacMind):
- memory.get {key}              — read a value
- memory.set {key, value}       — write a value
Useful for remembering state between tool calls (e.g. a window id you want to
return to, a URL you extracted earlier).

High-level form / browser (prefer these over low-level):
- form.type_into {fieldHint, text} — find a form field by label/placeholder and
  type into it. Much more robust than mouse.click + keyboard.type.
- browser.open {url}            — open a URL in the user's default browser.

=== WHEN TO USE MacMindTool VS OTHER TOOLS ===

Use MacMindTool for:
- UI manipulation (clicking, typing, moving/resizing windows)
- App control (launch, focus, quit, list)
- Screen reading (screenshots, OCR)
- Clipboard, calendar events, system notifications
- Reading system state (volume, battery, running apps)
- Key-value memory across actions

Use BashTool for:
- Mac CLI operations that don't have a MacMind equivalent: osascript, defaults,
  pmset, launchctl, diskutil, networksetup, security, brew, etc.
- Tools and scripts where you want stdout/stderr/exit code directly.

Use FileEdit / Read / Write for:
- Precise file modifications, especially code and config. MacMind's fs.* works
  but FileEdit has better diff and exact-match semantics and is safer for
  structured edits.

Use WebFetch / WebSearch for:
- Fetching web pages or searching the web. Don't drive Safari to read a page
  when a direct HTTP fetch will do.

=== GUIDANCE ===

- Prefer high-level actions (app.launch, browser.open, form.type_into,
  safari.open) over low-level coordinate-based actions (mouse.click at fixed
  xy). High-level actions survive layout changes; pixel coords don't.
- Before interacting with unfamiliar UI, take a screenshot or call
  form.read_screen first. Act on what's actually on screen, not on what you
  assume is there.
- Each tool call runs exactly one action. Batch related work as multiple
  sequential tool calls — don't try to cram several commands into one input.
- After launching or focusing an app, give it a moment to appear before
  interacting. Use a "wait" action if one is available, otherwise
  system.shell with "sleep 0.5".
- If an action fails, read the error and adapt — don't blindly retry. Common
  causes: wrong coordinates, app not focused, missing Accessibility or
  Automation permissions, invalid bundle id, stale window id.
- NEVER run destructive actions without explicit user permission. This
  includes: fs.delete, fs.move over existing files, system.shell rm / mv /
  chmod, calendar.delete, app.quit on apps with unsaved work, window.close on
  dirty editors, and any shell command that touches user data irreversibly.
  When in doubt, ask first.
`
