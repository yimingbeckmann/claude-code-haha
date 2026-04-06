---
name: verify
description: Verify a Mac automation task actually worked by observing the screen, app state, and filesystem — not by assuming the action you sent had the effect you wanted.
---

# Verify

Prove the automation worked before declaring done. A tool call succeeding is not proof — the click may have landed on the wrong element, the app may have been busy, the file write may have produced garbage, or the dialog you expected may never have appeared. You are not done until you have observed the expected new state.

## Core discipline

"Prove it works before declaring done." If you cannot point to a concrete observation that confirms the change, you have not verified it — you have guessed.

## The verification loop

For every meaningful step in an automation, after the action runs:

1. **Decide what "worked" means for this step.** Write it down in one sentence — e.g. "the Save dialog is now focused and shows the Desktop as the default location", or "the file at ~/Documents/foo.md contains the new heading I just added".
2. **Pick a check that can actually see that state.** One or more of:
   - **Screen OCR / screenshot** — capture the relevant window and confirm the expected text, button, dialog, or error message is present. Use this for anything that is only visible in the UI (dialogs, toasts, menu state, selected items, progress indicators).
   - **App / window state** — `app.list` to confirm the target app is running, `window.active` to confirm it is focused and showing the expected title, `ui.tree` to inspect the accessibility hierarchy for a specific element.
   - **Filesystem read-back** — after any write, `fs.read` the file back and confirm the content is what you intended. Parse structured files (plist, JSON, YAML) to catch corruption.
   - **App response / script return** — AppleScript or shell command output that the action produced the side effect (e.g. `osascript -e 'tell app "Finder" to count windows'` after opening a folder).
3. **Run the check and compare.** If the observation matches, continue. If it does not, stop — do not pile more actions on top of a broken state.
4. **On mismatch, diagnose before retrying.** Screenshot the current state. Look at what the screen actually shows versus what you expected. The wrong element may have been clicked, a modal may be blocking input, the app may still be loading, focus may have stolen away. Fix the cause, do not just retry the same action hoping for different luck.

## Common verification patterns

- **After `ui.click` on a button that should open a dialog:** screenshot → OCR → confirm the dialog title and at least one distinctive piece of dialog text are present. Do not assume the click worked just because the tool returned success.
- **After `app.launch` or `app.activate`:** `app.list` to confirm the app process exists, then `window.active` to confirm it is the frontmost window. If another app stole focus, re-activate and re-check.
- **After typing into a text field:** OCR the field region or read the a11y value via `ui.tree` to confirm the characters actually landed. Keystrokes can be dropped if focus moves mid-type.
- **After `fs.write`:** `fs.read` the same path and diff against what you intended to write. For structured formats, parse it. For long files, spot-check the sections you changed.
- **After triggering a menu item or keyboard shortcut:** screenshot → confirm the visible side effect (new window, state change, status bar update). Shortcuts silently no-op if the wrong app is frontmost.
- **After a long-running operation (export, render, sync):** poll the window / a progress indicator / the output file. Do not assume it finished just because time passed.

## Reporting

When you report success, say *how you verified it*, not just that you did it. Concrete observations beat assertions.

- Good: "Opened the Preferences window — confirmed via screenshot that the General tab is showing and the theme dropdown is set to Dark."
- Bad: "Opened Preferences and set the theme." (No observation, no verification.)

If a verification check failed and you could not recover, say so clearly with the observation that led you to stop — do not paper over it.

## See also

- `examples/cli.md` — verifying a command-line driven automation end-to-end.
- `examples/server.md` — verifying a filesystem mutation and a screen-visible effect.
</content>
</invoke>