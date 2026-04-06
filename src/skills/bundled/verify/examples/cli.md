# Example: Verifying a Terminal-driven automation

You were asked to open Terminal, cd into `~/projects/foo`, run `git status`, and report what branch the user is on.

## The actions

```
app.activate name:"Terminal"
ui.type text:"cd ~/projects/foo && git status\n"
```

## Insufficient verification

"Done — you are on `main`." — **Wrong if you did not actually read the Terminal output.** Maybe Terminal was not the frontmost app when `ui.type` ran, so your command went into Slack. Maybe `~/projects/foo` does not exist and `cd` errored out. Maybe you guessed `main` because it is the common default.

## Proper verification

1. **Confirm Terminal is focused before typing.** `window.active` → title should contain "Terminal". If not, `app.activate` again and re-check. Never type into an app you have not confirmed is frontmost.
2. **Confirm the command actually ran.** After sending the keystrokes, screenshot the Terminal window and OCR the visible region. Look for:
   - The prompt now showing the `foo` directory (proves `cd` succeeded — or look for a `cd:` error line).
   - The `git status` output block (proves the second command ran).
3. **Extract the real answer from the real output.** Read the branch name from the OCR'd "On branch X" line. Do not substitute a guess. If the OCR is ambiguous, scroll the Terminal, screenshot again, and re-read.
4. **Report with the observed text.** "On branch `feature/login-rework`, working tree clean — observed from the Terminal output."

## Things that will bite you if you skip verification

- `ui.type` sent keystrokes to the wrong app because focus changed between `app.activate` and `ui.type`.
- `cd` failed silently and `git status` ran in the wrong directory, reporting on a totally different repo.
- The Terminal window was scrolled up and the command you wanted to see was below the viewport.
- A zsh plugin printed extra lines that shifted the output you expected to OCR at a specific position.

Each of these looks fine if you only check that the tool calls returned success. Only reading the screen catches them.
</content>
</invoke>