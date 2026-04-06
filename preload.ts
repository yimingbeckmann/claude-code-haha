const version = process.env.MACHELPER_LOCAL_VERSION ?? '999.0.0-local';
const packageUrl = process.env.MACHELPER_LOCAL_PACKAGE_URL ?? 'machelper-local';
const buildTime = process.env.MACHELPER_LOCAL_BUILD_TIME ?? new Date().toISOString();

process.env.MACHELPER_LOCAL_SKIP_REMOTE_PREFETCH ??= '1';

Object.assign(globalThis, {
  MACRO: {
    VERSION: version,
    PACKAGE_URL: packageUrl,
    NATIVE_PACKAGE_URL: packageUrl,
    BUILD_TIME: buildTime,
    FEEDBACK_CHANNEL: 'local',
    VERSION_CHANGELOG: '',
    ISSUES_EXPLAINER: 'describe what you were trying to automate on your Mac, which MacAction call (if any) ran, what happened vs. what you expected, and any permission dialogs you saw. If a MacMind action failed with a permission error (Accessibility, Screen Recording, Automation, Full Disk Access), you usually need to grant it in System Settings \u2192 Privacy & Security and then restart the affected app. If a UI element could not be found, a screenshot or clearer description of the target usually helps.',
  },
});
// Switch to the current workspace
if (process.env.CALLER_DIR) {
  process.chdir(process.env.CALLER_DIR);
}