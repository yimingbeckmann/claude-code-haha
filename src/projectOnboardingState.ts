import memoize from 'lodash-es/memoize.js'
import { homedir } from 'os'
import { join } from 'path'
import {
  CLAUDE_MD_FILENAME,
  getCurrentProjectConfig,
  MACHELPER_MD_FILENAME,
  saveCurrentProjectConfig,
} from './utils/config.js'
import { getCwd } from './utils/cwd.js'
import { getFsImplementation } from './utils/fsOperations.js'

/**
 * MacHelper first-run state.
 *
 * Unlike traditional code assistants, MacHelper is NOT scoped to a git repo —
 * it's scoped to the Mac itself. The "project" here is the user's machine:
 * has MacHelper been used on this Mac before, is the MacMind daemon reachable,
 * do we have the macOS permissions we need, and is there a MACHELPER.md telling
 * us how the user wants their Mac driven.
 *
 * We preserve the existing Step/isProjectOnboardingComplete shape so the REPL
 * onboarding-card rendering path does not need to change — we just swap the
 * checks underneath.
 */

const MAC_MIND_API_BASE =
  process.env.MACMIND_API_BASE ?? 'http://127.0.0.1:8484'

const MAC_MIND_HEALTH_TIMEOUT_MS = 800

export type Step = {
  key: string
  text: string
  isComplete: boolean
  isCompletable: boolean
  isEnabled: boolean
}

/**
 * Synchronous MACHELPER.md presence check — mirrors the old CLAUDE.md check so
 * the onboarding-card render path stays sync. Looks in cwd first, then $HOME,
 * matching the "first-run on this Mac" (home) vs "first-run in this folder"
 * (cwd) split: either location is enough to consider the doc as present.
 *
 * For each candidate directory we also check the legacy CLAUDE.md filename so
 * users migrating from claude-code-haha forks don't see the onboarding step
 * light up a second time after they've already written project instructions
 * — this matches the loader fallback in claudemd.ts.
 */
function hasMacHelperMd(): boolean {
  const fs = getFsImplementation()
  const dirs = [getCwd(), homedir(), join(homedir(), '.machelper')]
  const filenames = [MACHELPER_MD_FILENAME, CLAUDE_MD_FILENAME]
  return dirs.some(dir =>
    filenames.some(filename => {
      try {
        return fs.existsSync(join(dir, filename))
      } catch {
        return false
      }
    }),
  )
}

/**
 * Has MacHelper ever been launched on this Mac before? We reuse the existing
 * per-project config (keyed by cwd in the host config store) as our
 * "has-run-before" breadcrumb — the first successful save creates it. This
 * keeps persistence consistent with the rest of the CLI and survives upgrades.
 */
function hasRunBefore(): boolean {
  const projectConfig = getCurrentProjectConfig()
  // Any of: explicit completion flag, a non-zero seen-count, or trust already
  // accepted = we've been here before. Checking multiple fields defends
  // against a partial first-run that crashed before writing the completion
  // flag.
  return Boolean(
    projectConfig.hasCompletedProjectOnboarding ||
      projectConfig.projectOnboardingSeenCount > 0 ||
      projectConfig.hasTrustDialogAccepted,
  )
}

/**
 * Async probe: is the MacMind daemon reachable on localhost? Used by the
 * doctor command and by the async first-run probe below. Soft-fails fast —
 * we do not want onboarding rendering to block on network I/O.
 */
export async function probeMacMindReachable(): Promise<boolean> {
  try {
    // /actions is the canonical "is the daemon alive and serving" endpoint
    // (see MacMindTool/prompt.ts). /health may not exist on older builds, so
    // we prefer /actions which we know is always published.
    const res = await fetch(`${MAC_MIND_API_BASE}/actions`, {
      signal: AbortSignal.timeout(MAC_MIND_HEALTH_TIMEOUT_MS),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Async probes for macOS TCC permissions, issued via MacMind action calls.
 * A permission-denied error from MacMind will surface as a non-ok HTTP
 * response or an `ok: false` JSON body containing the words "not authorized"
 * / "accessibility" / "automation" depending on which framework tripped.
 */
export async function probeAccessibilityPermission(): Promise<boolean> {
  return probeMacMindAction('window.list', {})
}

export async function probeAutomationPermission(): Promise<boolean> {
  // Running a trivial AppleScript is the cheapest way to exercise the
  // automation TCC prompt without side effects.
  return probeMacMindAction('shell.applescript', {
    script: 'return "ok"',
  })
}

export async function probeScreenRecordingPermission(): Promise<boolean> {
  // Screen recording TCC is gated on the first screen capture attempt.
  return probeMacMindAction('screen.shot', {})
}

async function probeMacMindAction(
  action: string,
  input: Record<string, unknown>,
): Promise<boolean> {
  try {
    const res = await fetch(`${MAC_MIND_API_BASE}/action/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(MAC_MIND_HEALTH_TIMEOUT_MS * 2),
    })
    if (!res.ok) {
      return false
    }
    const body = (await res.json()) as {
      ok?: boolean
      error?: string
    }
    if (body.ok === false) {
      return false
    }
    return true
  } catch {
    return false
  }
}

/**
 * Steps surfaced to the user during first-run onboarding. The shape matches
 * the legacy CLAUDE.md onboarding so the existing renderer keeps working, but
 * the semantic content is Mac-centric now.
 *
 * Daemon + TCC checks are not included here because they are async and this
 * function is called on every render — they live in the doctor diagnostic.
 * Instead we show a single static "start MacMind and run /doctor" step when
 * this is the first run on the machine, and the MACHELPER.md step otherwise.
 */
export function getSteps(): Step[] {
  const hasMd = hasMacHelperMd()
  const firstRun = !hasRunBefore()

  return [
    {
      key: 'macmind-setup',
      text: 'Start the MacMind daemon and run /doctor to verify macOS permissions',
      isComplete: !firstRun,
      isCompletable: true,
      isEnabled: firstRun,
    },
    {
      key: 'machelpermd',
      text: 'Run /init to create a MACHELPER.md describing how you want your Mac driven',
      isComplete: hasMd,
      isCompletable: true,
      isEnabled: !firstRun,
    },
  ]
}

export function isProjectOnboardingComplete(): boolean {
  return getSteps()
    .filter(({ isCompletable, isEnabled }) => isCompletable && isEnabled)
    .every(({ isComplete }) => isComplete)
}

export function maybeMarkProjectOnboardingComplete(): void {
  // Short-circuit on cached config — isProjectOnboardingComplete() hits
  // the filesystem, and REPL.tsx calls this on every prompt submit.
  if (getCurrentProjectConfig().hasCompletedProjectOnboarding) {
    return
  }
  if (isProjectOnboardingComplete()) {
    saveCurrentProjectConfig(current => ({
      ...current,
      hasCompletedProjectOnboarding: true,
    }))
  }
}

export const shouldShowProjectOnboarding = memoize((): boolean => {
  const projectConfig = getCurrentProjectConfig()
  // Short-circuit on cached config before isProjectOnboardingComplete()
  // hits the filesystem — this runs during first render.
  if (
    projectConfig.hasCompletedProjectOnboarding ||
    projectConfig.projectOnboardingSeenCount >= 4 ||
    process.env.IS_DEMO
  ) {
    return false
  }

  return !isProjectOnboardingComplete()
})

export function incrementProjectOnboardingSeenCount(): void {
  saveCurrentProjectConfig(current => ({
    ...current,
    projectOnboardingSeenCount: current.projectOnboardingSeenCount + 1,
  }))
}
