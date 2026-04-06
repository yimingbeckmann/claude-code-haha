# Example: Verifying a filesystem mutation and a screen-visible effect

You were asked to add a new bookmark entry to a Safari bookmarks-backing plist and confirm the bookmark now appears in Safari's bookmarks bar.

## The actions

```
fs.write path:"~/Library/Safari/Bookmarks.plist" content:<modified plist>
ui.menu app:"Safari" path:"View > Show Bookmarks Bar"
```

## Insufficient verification

"Done — bookmark added." — **Wrong.** You did not read the file back (the write could have produced an invalid plist), and you did not look at the bookmarks bar (Safari caches the plist in memory and may not reflect on-disk changes until it reloads).

## Proper verification

1. **Filesystem read-back.** `fs.read path:"~/Library/Safari/Bookmarks.plist"` → parse it as a plist (binary or XML as appropriate) → confirm the new bookmark entry is present with the expected URL and title. If parsing fails, the write corrupted the file. Restore from the backup you took before writing. You did take a backup, right?
2. **App reload.** Safari may be holding a stale in-memory copy. Quit Safari (`app.quit name:"Safari"`), confirm it is gone via `app.list`, relaunch, and wait for the window to be ready via `window.active`.
3. **On-screen observation.** Screenshot the Safari window → OCR or visually scan the bookmarks bar region → confirm the new bookmark label appears with the expected text. If the bookmarks bar is hidden, trigger the View menu toggle and re-screenshot.
4. **Click-through (optional, for high-confidence tasks).** `ui.click` the new bookmark entry → use `window.active` to confirm the URL loads in a new tab with the expected title. This catches cases where the plist entry is well-formed but points at the wrong URL.

## Reporting

- Good: "Added the bookmark. Confirmed via `fs.read` + plist parse that the entry is present, and confirmed via screenshot that it is visible in the Safari bookmarks bar after a relaunch."
- Bad: "Added the bookmark." (No observation, no verification, and a real chance you broke Safari's plist and will not know until the user tries to open a bookmark tomorrow.)

## Why both checks matter

Only the filesystem read catches a corrupted write. Only the on-screen check catches Safari ignoring the file. Skipping either leaves a class of failure invisible until the user trips over it. The whole point of verify is to surface those failures *now*, while you still have context and can fix them.
</content>
</invoke>