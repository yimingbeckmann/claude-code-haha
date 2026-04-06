import { execa } from 'execa'
import { readFile, realpath } from 'fs/promises'
import { homedir } from 'os'
import { delimiter, join, posix, win32 } from 'path'
import { checkGlobalInstallPermissions } from './autoUpdater.js'
import { isInBundledMode } from './bundledMode.js'
import {
  formatAutoUpdaterDisabledReason,
  getAutoUpdaterDisabledReason,
  getGlobalConfig,
  type InstallMethod,
} from './config.js'
import { getCwd } from './cwd.js'
import { isEnvTruthy } from './envUtils.js'
import { execFileNoThrow } from './execFileNoThrow.js'
import { getFsImplementation } from './fsOperations.js'
import {
  getShellType,
  isRunningFromLocalInstallation,
  localInstallationExists,
} from './localInstaller.js'
import {
  detectApk,
  detectAsdf,
  detectDeb,
  detectHomebrew,
  detectMise,
  detectPacman,
  detectRpm,
  detectWinget,
  getPackageManager,
} from './nativeInstaller/packageManagers.js'
import { getPlatform } from './platform.js'
import { getRipgrepStatus } from './ripgrep.js'
import { SandboxManager } from './sandbox/sandbox-adapter.js'
import { getManagedFilePath } from './settings/managedPath.js'
import { CUSTOMIZATION_SURFACES } from './settings/types.js'
import {
  findClaudeAlias,
  findValidClaudeAlias,
  getShellConfigPaths,
} from './shellConfig.js'
import { jsonParse } from './slowOperations.js'
import { which } from './which.js'

export type InstallationType =
  | 'npm-global'
  | 'npm-local'
  | 'native'
  | 'package-manager'
  | 'development'
  | 'unknown'

export type DiagnosticInfo = {
  installationType: InstallationType
  version: string
  installationPath: string
  invokedBinary: string
  configInstallMethod: InstallMethod | 'not set'
  autoUpdates: string
  hasUpdatePermissions: boolean | null
  multipleInstallations: Array<{ type: string; path: string }>
  warnings: Array<{ issue: string; fix: string }>
  recommendation?: string
  packageManager?: string
  ripgrepStatus: {
    working: boolean
    mode: 'system' | 'builtin' | 'embedded'
    systemPath: string | null
  }
}

function getNormalizedPaths(): [invokedPath: string, execPath: string] {
  let invokedPath = process.argv[1] || ''
  let execPath = process.execPath || process.argv[0] || ''

  // On Windows, convert backslashes to forward slashes for consistent path matching
  if (getPlatform() === 'windows') {
    invokedPath = invokedPath.split(win32.sep).join(posix.sep)
    execPath = execPath.split(win32.sep).join(posix.sep)
  }

  return [invokedPath, execPath]
}

export async function getCurrentInstallationType(): Promise<InstallationType> {
  if (process.env.NODE_ENV === 'development') {
    return 'development'
  }

  const [invokedPath] = getNormalizedPaths()

  // Check if running in bundled mode first
  if (isInBundledMode()) {
    // Check if this bundled instance was installed by a package manager
    if (
      detectHomebrew() ||
      detectWinget() ||
      detectMise() ||
      detectAsdf() ||
      (await detectPacman()) ||
      (await detectDeb()) ||
      (await detectRpm()) ||
      (await detectApk())
    ) {
      return 'package-manager'
    }
    return 'native'
  }

  // Check if running from local npm installation
  if (isRunningFromLocalInstallation()) {
    return 'npm-local'
  }

  // Check if we're in a typical npm global location
  const npmGlobalPaths = [
    '/usr/local/lib/node_modules',
    '/usr/lib/node_modules',
    '/opt/homebrew/lib/node_modules',
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/.nvm/versions/node/', // nvm installations
  ]

  if (npmGlobalPaths.some(path => invokedPath.includes(path))) {
    return 'npm-global'
  }

  // Also check for npm/nvm in the path even if not in standard locations
  if (invokedPath.includes('/npm/') || invokedPath.includes('/nvm/')) {
    return 'npm-global'
  }

  const npmConfigResult = await execa('npm config get prefix', {
    shell: true,
    reject: false,
  })
  const globalPrefix =
    npmConfigResult.exitCode === 0 ? npmConfigResult.stdout.trim() : null

  if (globalPrefix && invokedPath.startsWith(globalPrefix)) {
    return 'npm-global'
  }

  // If we can't determine, return unknown
  return 'unknown'
}

async function getInstallationPath(): Promise<string> {
  if (process.env.NODE_ENV === 'development') {
    return getCwd()
  }

  // For bundled/native builds, show the binary location
  if (isInBundledMode()) {
    // Try to find the actual binary that was invoked
    try {
      return await realpath(process.execPath)
    } catch {
      // This function doesn't expect errors
    }

    try {
      const path = await which('claude')
      if (path) {
        return path
      }
    } catch {
      // This function doesn't expect errors
    }

    // If we can't find it, check common locations
    try {
      await getFsImplementation().stat(join(homedir(), '.local/bin/claude'))
      return join(homedir(), '.local/bin/claude')
    } catch {
      // Not found
    }
    return 'native'
  }

  // For npm installations, use the path of the executable
  try {
    return process.argv[0] || 'unknown'
  } catch {
    return 'unknown'
  }
}

export function getInvokedBinary(): string {
  try {
    // For bundled/compiled executables, show the actual binary path
    if (isInBundledMode()) {
      return process.execPath || 'unknown'
    }

    // For npm/development, show the script path
    return process.argv[1] || 'unknown'
  } catch {
    return 'unknown'
  }
}

async function detectMultipleInstallations(): Promise<
  Array<{ type: string; path: string }>
> {
  const fs = getFsImplementation()
  const installations: Array<{ type: string; path: string }> = []

  // Check for local installation
  const localPath = join(homedir(), '.claude', 'local')
  if (await localInstallationExists()) {
    installations.push({ type: 'npm-local', path: localPath })
  }

  // Check for global npm installation
  const packagesToCheck = ['@anthropic-ai/machelper']
  if (MACRO.PACKAGE_URL && MACRO.PACKAGE_URL !== '@anthropic-ai/machelper') {
    packagesToCheck.push(MACRO.PACKAGE_URL)
  }
  const npmResult = await execFileNoThrow('npm', [
    '-g',
    'config',
    'get',
    'prefix',
  ])
  if (npmResult.code === 0 && npmResult.stdout) {
    const npmPrefix = npmResult.stdout.trim()
    const isWindows = getPlatform() === 'windows'

    // First check for active installations via bin/claude
    // Linux / macOS have prefix/bin/claude and prefix/lib/node_modules
    // Windows has prefix/claude and prefix/node_modules
    const globalBinPath = isWindows
      ? join(npmPrefix, 'claude')
      : join(npmPrefix, 'bin', 'claude')

    let globalBinExists = false
    try {
      await fs.stat(globalBinPath)
      globalBinExists = true
    } catch {
      // Not found
    }

    if (globalBinExists) {
      // Check if this is actually a Homebrew cask installation, not npm-global
      // When npm is installed via Homebrew, both can exist at /opt/homebrew/bin/claude
      // We need to resolve the symlink to see where it actually points
      let isCurrentHomebrewInstallation = false

      try {
        // Resolve the symlink to get the actual target
        const realPath = await realpath(globalBinPath)

        // If the symlink points to a Caskroom directory, it's a Homebrew cask
        // Only skip it if it's the same Homebrew installation we're currently running from
        if (realPath.includes('/Caskroom/')) {
          isCurrentHomebrewInstallation = detectHomebrew()
        }
      } catch {
        // If we can't resolve the symlink, include it anyway
      }

      if (!isCurrentHomebrewInstallation) {
        installations.push({ type: 'npm-global', path: globalBinPath })
      }
    } else {
      // If no bin/claude exists, check for orphaned packages (no bin/claude symlink)
      for (const packageName of packagesToCheck) {
        const globalPackagePath = isWindows
          ? join(npmPrefix, 'node_modules', packageName)
          : join(npmPrefix, 'lib', 'node_modules', packageName)

        try {
          await fs.stat(globalPackagePath)
          installations.push({
            type: 'npm-global-orphan',
            path: globalPackagePath,
          })
        } catch {
          // Package not found
        }
      }
    }
  }

  // Check for native installation

  // Check common native installation paths
  const nativeBinPath = join(homedir(), '.local', 'bin', 'claude')
  try {
    await fs.stat(nativeBinPath)
    installations.push({ type: 'native', path: nativeBinPath })
  } catch {
    // Not found
  }

  // Also check if config indicates native installation
  const config = getGlobalConfig()
  if (config.installMethod === 'native') {
    const nativeDataPath = join(homedir(), '.local', 'share', 'claude')
    try {
      await fs.stat(nativeDataPath)
      if (!installations.some(i => i.type === 'native')) {
        installations.push({ type: 'native', path: nativeDataPath })
      }
    } catch {
      // Not found
    }
  }

  return installations
}

async function detectConfigurationIssues(
  type: InstallationType,
): Promise<Array<{ issue: string; fix: string }>> {
  const warnings: Array<{ issue: string; fix: string }> = []

  // Managed-settings forwards-compat: the schema preprocess silently drops
  // unknown strictPluginOnlyCustomization surface names so one future enum
  // value doesn't null out the entire policy file (settings.ts:101). But
  // admins should KNOW — read the raw file and diff. Runs before the
  // development-mode early return: this is config correctness, not an
  // install-path check, and it's useful to see during dev testing.
  try {
    const raw = await readFile(
      join(getManagedFilePath(), 'managed-settings.json'),
      'utf-8',
    )
    const parsed: unknown = jsonParse(raw)
    const field =
      parsed && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>).strictPluginOnlyCustomization
        : undefined
    if (field !== undefined && typeof field !== 'boolean') {
      if (!Array.isArray(field)) {
        // .catch(undefined) in the schema silently drops this, so the rest
        // of managed settings survive — but the admin typed something
        // wrong (an object, a string, etc.).
        warnings.push({
          issue: `managed-settings.json: strictPluginOnlyCustomization has an invalid value (expected true or an array, got ${typeof field})`,
          fix: `The field is silently ignored (schema .catch rescues it). Set it to true, or an array of: ${CUSTOMIZATION_SURFACES.join(', ')}.`,
        })
      } else {
        const unknown = field.filter(
          x =>
            typeof x === 'string' &&
            !(CUSTOMIZATION_SURFACES as readonly string[]).includes(x),
        )
        if (unknown.length > 0) {
          warnings.push({
            issue: `managed-settings.json: strictPluginOnlyCustomization has ${unknown.length} value(s) this client doesn't recognize: ${unknown.map(String).join(', ')}`,
            fix: `These are silently ignored (forwards-compat). Known surfaces for this version: ${CUSTOMIZATION_SURFACES.join(', ')}. Either remove them, or this client is older than the managed-settings intended.`,
          })
        }
      }
    }
  } catch {
    // ENOENT (no managed settings) / parse error — not this check's concern.
    // Parse errors are surfaced by the settings loader itself.
  }

  const config = getGlobalConfig()

  // Skip most warnings for development mode
  if (type === 'development') {
    return warnings
  }

  // Check if ~/.local/bin is in PATH for native installations
  if (type === 'native') {
    const path = process.env.PATH || ''
    const pathDirectories = path.split(delimiter)
    const homeDir = homedir()
    const localBinPath = join(homeDir, '.local', 'bin')

    // On Windows, convert backslashes to forward slashes for consistent path matching
    let normalizedLocalBinPath = localBinPath
    if (getPlatform() === 'windows') {
      normalizedLocalBinPath = localBinPath.split(win32.sep).join(posix.sep)
    }

    // Check if ~/.local/bin is in PATH (handle both expanded and unexpanded forms)
    // Also handle trailing slashes that users may have in their PATH
    const localBinInPath = pathDirectories.some(dir => {
      let normalizedDir = dir
      if (getPlatform() === 'windows') {
        normalizedDir = dir.split(win32.sep).join(posix.sep)
      }
      // Remove trailing slashes for comparison (handles paths like /home/user/.local/bin/)
      const trimmedDir = normalizedDir.replace(/\/+$/, '')
      const trimmedRawDir = dir.replace(/[/\\]+$/, '')
      return (
        trimmedDir === normalizedLocalBinPath ||
        trimmedRawDir === '~/.local/bin' ||
        trimmedRawDir === '$HOME/.local/bin'
      )
    })

    if (!localBinInPath) {
      const isWindows = getPlatform() === 'windows'
      if (isWindows) {
        // Windows-specific PATH instructions
        const windowsLocalBinPath = localBinPath
          .split(posix.sep)
          .join(win32.sep)
        warnings.push({
          issue: `Native installation exists but ${windowsLocalBinPath} is not in your PATH`,
          fix: `Add it by opening: System Properties → Environment Variables → Edit User PATH → New → Add the path above. Then restart your terminal.`,
        })
      } else {
        // Unix-style PATH instructions
        const shellType = getShellType()
        const configPaths = getShellConfigPaths()
        const configFile = configPaths[shellType as keyof typeof configPaths]
        const displayPath = configFile
          ? configFile.replace(homedir(), '~')
          : 'your shell config file'

        warnings.push({
          issue:
            'Native installation exists but ~/.local/bin is not in your PATH',
          fix: `Run: echo 'export PATH="$HOME/.local/bin:$PATH"' >> ${displayPath} then open a new terminal or run: source ${displayPath}`,
        })
      }
    }
  }

  // Check for configuration mismatches
  // Skip these checks if DISABLE_INSTALLATION_CHECKS is set (e.g., in HFI)
  if (!isEnvTruthy(process.env.DISABLE_INSTALLATION_CHECKS)) {
    if (type === 'npm-local' && config.installMethod !== 'local') {
      warnings.push({
        issue: `Running from local installation but config install method is '${config.installMethod}'`,
        fix: 'Consider using native installation: claude install',
      })
    }

    if (type === 'native' && config.installMethod !== 'native') {
      warnings.push({
        issue: `Running native installation but config install method is '${config.installMethod}'`,
        fix: 'Run claude install to update configuration',
      })
    }
  }

  if (type === 'npm-global' && (await localInstallationExists())) {
    warnings.push({
      issue: 'Local installation exists but not being used',
      fix: 'Consider using native installation: claude install',
    })
  }

  const existingAlias = await findClaudeAlias()
  const validAlias = await findValidClaudeAlias()

  // Check if running local installation but it's not in PATH
  if (type === 'npm-local') {
    // Check if claude is already accessible via PATH
    const whichResult = await which('claude')
    const claudeInPath = !!whichResult

    // Only show warning if claude is NOT in PATH AND no valid alias exists
    if (!claudeInPath && !validAlias) {
      if (existingAlias) {
        // Alias exists but points to invalid target
        warnings.push({
          issue: 'Local installation not accessible',
          fix: `Alias exists but points to invalid target: ${existingAlias}. Update alias: alias claude="~/.claude/local/claude"`,
        })
      } else {
        // No alias exists and not in PATH
        warnings.push({
          issue: 'Local installation not accessible',
          fix: 'Create alias: alias claude="~/.claude/local/claude"',
        })
      }
    }
  }

  return warnings
}

export function detectLinuxGlobPatternWarnings(): Array<{
  issue: string
  fix: string
}> {
  if (getPlatform() !== 'linux') {
    return []
  }

  const warnings: Array<{ issue: string; fix: string }> = []
  const globPatterns = SandboxManager.getLinuxGlobPatternWarnings()

  if (globPatterns.length > 0) {
    // Show first 3 patterns, then indicate if there are more
    const displayPatterns = globPatterns.slice(0, 3).join(', ')
    const remaining = globPatterns.length - 3
    const patternList =
      remaining > 0 ? `${displayPatterns} (${remaining} more)` : displayPatterns

    warnings.push({
      issue: `Glob patterns in sandbox permission rules are not fully supported on Linux`,
      fix: `Found ${globPatterns.length} pattern(s): ${patternList}. On Linux, glob patterns in Edit/Read rules will be ignored.`,
    })
  }

  return warnings
}

/**
 * MacHelper-specific health checks: MacMind daemon reachability, the four
 * TCC permission gates (Accessibility, Automation, Screen Recording, Full
 * Disk Access), and a cheap network probe. Emitted as {issue, fix} warnings
 * so the existing doctor renderer can display them unchanged.
 *
 * All checks are best-effort and non-blocking — each has a short timeout
 * and swallows errors. On non-macOS platforms the whole function no-ops.
 */
const MAC_MIND_API_BASE =
  process.env.MACMIND_API_BASE ?? 'http://127.0.0.1:8484'

const MAC_MIND_PROBE_TIMEOUT_MS = 1500

type MacMindActionResponse = {
  ok?: boolean
  error?: string
}

async function callMacMindAction(
  action: string,
  input: Record<string, unknown> = {},
): Promise<
  | { reachable: true; ok: boolean; error?: string }
  | { reachable: false; error: string }
> {
  try {
    const res = await fetch(`${MAC_MIND_API_BASE}/action/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(MAC_MIND_PROBE_TIMEOUT_MS * 2),
    })
    if (!res.ok) {
      return {
        reachable: true,
        ok: false,
        error: `HTTP ${res.status}`,
      }
    }
    const body = (await res.json()) as MacMindActionResponse
    if (body.ok === false) {
      return {
        reachable: true,
        ok: false,
        error: body.error ?? 'unknown',
      }
    }
    return { reachable: true, ok: true }
  } catch (e) {
    return {
      reachable: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

/**
 * A MacMind action failure indicates a permission problem (as opposed to the
 * daemon being unreachable or a genuine bug) when the error mentions one of
 * the TCC frameworks or the phrase "not authorized" / "denied". We match
 * loosely because MacMind wraps errors from several macOS APIs and the exact
 * string varies by framework.
 */
function isPermissionDenied(error: string | undefined): boolean {
  if (!error) return false
  const lowered = error.toLowerCase()
  return (
    lowered.includes('not authorized') ||
    lowered.includes('permission') ||
    lowered.includes('denied') ||
    lowered.includes('accessibility') ||
    lowered.includes('automation') ||
    lowered.includes('tcc') ||
    lowered.includes('-1743') || // errAEEventNotPermitted
    lowered.includes('screencapture')
  )
}

export async function detectMacHelperHealthWarnings(): Promise<
  Array<{ issue: string; fix: string }>
> {
  if (getPlatform() !== 'macos') {
    return []
  }

  const warnings: Array<{ issue: string; fix: string }> = []

  // 1. Is the MacMind daemon reachable at all? Use /actions since it's the
  //    canonical "is the daemon alive" endpoint (MacMindTool/prompt.ts uses
  //    the same). If this fails, everything downstream will fail — no point
  //    probing permissions, just tell the user to start MacMind.
  let daemonReachable = false
  try {
    const res = await fetch(`${MAC_MIND_API_BASE}/actions`, {
      signal: AbortSignal.timeout(MAC_MIND_PROBE_TIMEOUT_MS),
    })
    daemonReachable = res.ok
    if (!res.ok) {
      warnings.push({
        issue: `MacMind daemon at ${MAC_MIND_API_BASE} returned HTTP ${res.status}`,
        fix: 'Restart the MacMind app. If the problem persists, check MacMind logs.',
      })
    }
  } catch {
    warnings.push({
      issue: `MacMind daemon is not reachable at ${MAC_MIND_API_BASE}`,
      fix: 'Open the MacMind app (or run the MacMind daemon) so MacHelper can drive your Mac. Without it, all MacAction tool calls will fail.',
    })
  }

  if (!daemonReachable) {
    // Don't probe permissions if the daemon is down — every probe will
    // false-positive as "denied" and spam the doctor output.
    return warnings
  }

  // 2. Accessibility permission — exercise via window.list, which reads the
  //    window server and requires the Accessibility TCC gate. If this call
  //    errors with a permission-shaped error, AX is not granted.
  const accessibility = await callMacMindAction('window.list', {})
  if (accessibility.reachable && !accessibility.ok) {
    if (isPermissionDenied(accessibility.error)) {
      warnings.push({
        issue: 'Accessibility permission not granted to MacMind',
        fix: 'System Settings → Privacy & Security → Accessibility → enable MacMind. MacHelper cannot click, type, or move windows without this.',
      })
    } else {
      warnings.push({
        issue: `MacMind window.list probe failed: ${accessibility.error ?? 'unknown error'}`,
        fix: 'Check MacMind logs. This usually indicates a daemon bug or stale build.',
      })
    }
  }

  // 3. Automation permission (Apple Events) — fire a trivial AppleScript via
  //    MacMind. macOS prompts once per target app the first time; for a
  //    script with no target, the call should just succeed if Apple Events
  //    are allowed.
  const automation = await callMacMindAction('shell.applescript', {
    script: 'return "ok"',
  })
  if (automation.reachable && !automation.ok) {
    if (isPermissionDenied(automation.error)) {
      warnings.push({
        issue: 'Automation (Apple Events) permission not granted to MacMind',
        fix: 'System Settings → Privacy & Security → Automation → enable the apps MacMind needs to control. Individual app prompts also appear on first use.',
      })
    } else {
      warnings.push({
        issue: `MacMind AppleScript probe failed: ${automation.error ?? 'unknown error'}`,
        fix: 'Check MacMind logs. The shell.applescript action may not be published by your daemon build.',
      })
    }
  }

  // 4. Screen Recording permission — probe via screen.shot. Unlike
  //    accessibility, screen recording is per-app and must be granted before
  //    the first capture; denied captures typically return a permission
  //    error or a zero-byte image.
  const screen = await callMacMindAction('screen.shot', {})
  if (screen.reachable && !screen.ok) {
    if (isPermissionDenied(screen.error)) {
      warnings.push({
        issue: 'Screen Recording permission not granted to MacMind',
        fix: 'System Settings → Privacy & Security → Screen & System Audio Recording → enable MacMind. Required for OCR and screen.shot actions.',
      })
    } else {
      warnings.push({
        issue: `MacMind screen.shot probe failed: ${screen.error ?? 'unknown error'}`,
        fix: 'Check MacMind logs or daemon build — screen.shot action may be unavailable.',
      })
    }
  }

  // 5. Full Disk Access — the canonical "do I have FDA" probe is whether
  //    we can read into ~/Library/Mail, which is gated behind FDA on modern
  //    macOS. We only check cheaply via fs.exists; a truly thorough check
  //    would open a file and read a byte, but that overreaches for a
  //    doctor command. Note we do NOT require FDA for MacHelper to work —
  //    this is informational unless the user needs Mail/Messages automation.
  try {
    const fs = getFsImplementation()
    const mailDir = join(homedir(), 'Library', 'Mail')
    // Mail may not exist (user never used Mail.app). We want to know:
    // the dir exists but we can't list it → FDA not granted. The dir not
    // existing at all is fine.
    if (fs.existsSync(mailDir)) {
      try {
        // readdirSync will throw EPERM if FDA is missing.
        fs.readdirSync(mailDir)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (
          msg.includes('EPERM') ||
          msg.includes('operation not permitted') ||
          isPermissionDenied(msg)
        ) {
          warnings.push({
            issue: 'Full Disk Access not granted (optional)',
            fix: 'System Settings → Privacy & Security → Full Disk Access → enable your terminal and MacMind. Only needed if you want MacHelper to read Mail, Messages, or other TCC-protected folders.',
          })
        }
      }
    }
  } catch {
    // fsOperations may not expose readdirSync in this build — skip silently.
  }

  return warnings
}

export async function getDoctorDiagnostic(): Promise<DiagnosticInfo> {
  const installationType = await getCurrentInstallationType()
  const version =
    typeof MACRO !== 'undefined' && MACRO.VERSION ? MACRO.VERSION : 'unknown'
  const installationPath = await getInstallationPath()
  const invokedBinary = getInvokedBinary()
  const multipleInstallations = await detectMultipleInstallations()
  const warnings = await detectConfigurationIssues(installationType)

  // Add glob pattern warnings for Linux sandboxing
  warnings.push(...detectLinuxGlobPatternWarnings())

  // Add MacHelper-specific health checks: MacMind daemon + TCC permissions.
  // These run in parallel to the install checks but are awaited here so they
  // appear in the same warnings list the doctor renderer already shows.
  warnings.push(...(await detectMacHelperHealthWarnings()))

  // Add warnings for leftover npm installations when running native
  if (installationType === 'native') {
    const npmInstalls = multipleInstallations.filter(
      i =>
        i.type === 'npm-global' ||
        i.type === 'npm-global-orphan' ||
        i.type === 'npm-local',
    )

    const isWindows = getPlatform() === 'windows'

    for (const install of npmInstalls) {
      if (install.type === 'npm-global') {
        let uninstallCmd = 'npm -g uninstall @anthropic-ai/machelper'
        if (
          MACRO.PACKAGE_URL &&
          MACRO.PACKAGE_URL !== '@anthropic-ai/machelper'
        ) {
          uninstallCmd += ` && npm -g uninstall ${MACRO.PACKAGE_URL}`
        }
        warnings.push({
          issue: `Leftover npm global installation at ${install.path}`,
          fix: `Run: ${uninstallCmd}`,
        })
      } else if (install.type === 'npm-global-orphan') {
        warnings.push({
          issue: `Orphaned npm global package at ${install.path}`,
          fix: isWindows
            ? `Run: rmdir /s /q "${install.path}"`
            : `Run: rm -rf ${install.path}`,
        })
      } else if (install.type === 'npm-local') {
        warnings.push({
          issue: `Leftover npm local installation at ${install.path}`,
          fix: isWindows
            ? `Run: rmdir /s /q "${install.path}"`
            : `Run: rm -rf ${install.path}`,
        })
      }
    }
  }

  const config = getGlobalConfig()

  // Get config values for display
  const configInstallMethod = config.installMethod || 'not set'

  // Check permissions for global installations
  let hasUpdatePermissions: boolean | null = null
  if (installationType === 'npm-global') {
    const permCheck = await checkGlobalInstallPermissions()
    hasUpdatePermissions = permCheck.hasPermissions

    // Add warning if no permissions
    if (!hasUpdatePermissions && !getAutoUpdaterDisabledReason()) {
      warnings.push({
        issue: 'Insufficient permissions for auto-updates',
        fix: 'Do one of: (1) Re-install node without sudo, or (2) Use `claude install` for native installation',
      })
    }
  }

  // Get ripgrep status and configuration
  const ripgrepStatusRaw = getRipgrepStatus()

  // Provide simple ripgrep status info
  const ripgrepStatus = {
    working: ripgrepStatusRaw.working ?? true, // Assume working if not yet tested
    mode: ripgrepStatusRaw.mode,
    systemPath:
      ripgrepStatusRaw.mode === 'system' ? ripgrepStatusRaw.path : null,
  }

  // Get package manager info if running from package manager
  const packageManager =
    installationType === 'package-manager'
      ? await getPackageManager()
      : undefined

  const diagnostic: DiagnosticInfo = {
    installationType,
    version,
    installationPath,
    invokedBinary,
    configInstallMethod,
    autoUpdates: (() => {
      const reason = getAutoUpdaterDisabledReason()
      return reason
        ? `disabled (${formatAutoUpdaterDisabledReason(reason)})`
        : 'enabled'
    })(),
    hasUpdatePermissions,
    multipleInstallations,
    warnings,
    packageManager,
    ripgrepStatus,
  }

  return diagnostic
}
