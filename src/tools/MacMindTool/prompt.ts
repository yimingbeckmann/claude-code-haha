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
clipboard and file system, run shell commands, schedule calendar events, and
more.

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

Guidelines:
- Prefer high-level actions (e.g. "app.launch", "browser.open",
  "form.type_into") over low-level mouse/keyboard actions when possible. They
  are more reliable and survive window/layout changes.
- When you need to find something on screen, use "form.read_screen" (OCR) or
  "screen.shot" first so you are acting on what is actually visible, not what
  you assume is there.
- Batch related work into sequential tool calls — each call is a single
  action. Do not try to stuff multiple commands into one "input" field.
- If an action fails, read the error message and adapt. Do not retry the same
  call blindly. Common causes: wrong coordinates, app not focused, missing
  accessibility permissions, invalid bundle id.
- When you open an app or window, give it a moment to appear (use "wait" with
  a small duration) before acting on it.
- NEVER execute destructive actions (fs.delete, system.shell rm, etc.) without
  the user having explicitly asked for them.
`
