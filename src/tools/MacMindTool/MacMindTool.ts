import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { DESCRIPTION, MAC_MIND_API_BASE, MAC_MIND_TOOL_NAME } from './prompt.js'
import {
  getToolUseSummary,
  renderToolResultMessage,
  renderToolUseMessage,
  renderToolUseProgressMessage,
} from './UI.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    action: z
      .string()
      .describe(
        'The fully-qualified MacMind action name (e.g. "mouse.click", "app.launch", "safari.current_url"). Use dots, not dashes.',
      ),
    input: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        'The action arguments, as a JSON object. Omit or pass {} when the action takes no arguments.',
      ),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    action: z.string().describe('The action that was executed'),
    ok: z.boolean().describe('Whether the action succeeded'),
    durationMs: z.number().describe('Time taken to execute the action'),
    result: z
      .unknown()
      .describe('Raw action result as returned by MacMind (any JSON value)'),
    resultPreview: z
      .string()
      .describe('Human-readable preview of the result for UI rendering'),
    error: z
      .string()
      .optional()
      .describe('Error message if the action failed'),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

type MacMindActionsResponse = {
  count: number
  actions: Array<{ name: string; summary: string }>
}

/**
 * Fetch the live MacMind action catalog at system-prompt build time so the
 * model's tool description always reflects the actions the daemon currently
 * publishes. Soft-fails if the server is unreachable — machelper still boots,
 * it just gets a generic description.
 */
async function fetchMacMindActionList(): Promise<string> {
  try {
    const res = await fetch(`${MAC_MIND_API_BASE}/actions`, {
      signal: AbortSignal.timeout(1500),
    })
    if (!res.ok) {
      return '\n(MacMind /actions returned HTTP ' + res.status + ')'
    }
    const body = (await res.json()) as MacMindActionsResponse
    const lines = body.actions
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(a => `  - ${a.name}: ${a.summary}`)
    return (
      `\nAvailable MacMind actions (${body.count} total):\n` + lines.join('\n')
    )
  } catch (e) {
    return (
      '\n(MacMind API at ' +
      MAC_MIND_API_BASE +
      ' is not reachable. Start the MacMind app or server before using ' +
      MAC_MIND_TOOL_NAME +
      '. Error: ' +
      (e instanceof Error ? e.message : String(e)) +
      ')'
    )
  }
}

export const MacMindTool = buildTool({
  name: MAC_MIND_TOOL_NAME,
  searchHint: 'drive macOS: click, type, launch apps, windows, safari, files',
  maxResultSizeChars: 100_000,
  async description() {
    return 'Run a MacMind action to control the macOS machine (mouse, keyboard, windows, apps, safari, filesystem, clipboard, calendar, screen OCR, shell).'
  },
  userFacingName() {
    return 'Mac'
  },
  getToolUseSummary,
  getActivityDescription(input) {
    const summary = getToolUseSummary(input)
    return summary ? `Running ${summary}` : 'Running Mac action'
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  isConcurrencySafe() {
    // Mac actions mutate real UI state — do NOT run them in parallel.
    return false
  },
  isReadOnly(input) {
    // Read-only actions are safe for auto-mode / speculation.
    const action = (input as { action?: string }).action ?? ''
    return (
      action.startsWith('screen.') ||
      action.startsWith('system.info') ||
      action.startsWith('system.battery') ||
      action.startsWith('system.volume.get') ||
      action === 'clipboard.read' ||
      action === 'mouse.position' ||
      action === 'window.list' ||
      action === 'window.active' ||
      action === 'safari.current_url' ||
      action === 'safari.current_title' ||
      action === 'safari.list_tabs' ||
      action === 'app.list' ||
      action === 'calendar.list' ||
      action === 'fs.read' ||
      action === 'fs.list' ||
      action === 'fs.stat' ||
      action === 'fs.exists' ||
      action === 'memory.get' ||
      action === 'screen.size'
    )
  },
  toAutoClassifierInput(input) {
    return `${input.action}: ${JSON.stringify(input.input ?? {})}`
  },
  async checkPermissions(input) {
    // Localhost-only, user-owned daemon. Always allow.
    return {
      behavior: 'allow',
      updatedInput: input,
      decisionReason: {
        type: 'other',
        reason: 'MacMind actions are auto-approved (localhost daemon)',
      },
    }
  },
  async prompt() {
    const actionList = await fetchMacMindActionList()
    return `${DESCRIPTION}\n${actionList}`
  },
  async validateInput(input) {
    if (!input.action || typeof input.action !== 'string') {
      return {
        result: false,
        message: 'Error: "action" is required and must be a string.',
        errorCode: 1,
      }
    }
    return { result: true }
  },
  renderToolUseMessage,
  renderToolUseProgressMessage,
  renderToolResultMessage,
  async call({ action, input }, { abortController }) {
    const start = Date.now()
    const url = `${MAC_MIND_API_BASE}/action/${encodeURIComponent(action)}`
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input ?? {}),
        signal: abortController.signal,
      })

      const text = await res.text()
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = text
      }

      const durationMs = Date.now() - start

      if (!res.ok) {
        const errMsg =
          typeof parsed === 'object' && parsed && 'error' in parsed
            ? String((parsed as { error: unknown }).error)
            : `HTTP ${res.status}`
        return {
          data: {
            action,
            ok: false,
            durationMs,
            result: parsed,
            resultPreview: `Error: ${errMsg}`,
            error: errMsg,
          },
        }
      }

      const preview = formatPreview(parsed)
      return {
        data: {
          action,
          ok: true,
          durationMs,
          result: parsed,
          resultPreview: preview,
        },
      }
    } catch (e) {
      const durationMs = Date.now() - start
      const errMsg = e instanceof Error ? e.message : String(e)
      return {
        data: {
          action,
          ok: false,
          durationMs,
          result: null,
          resultPreview: `Error: ${errMsg}`,
          error: errMsg,
        },
      }
    }
  },
  mapToolResultToToolResultBlockParam(
    { action, ok, durationMs, result, error },
    toolUseID,
  ) {
    const header = ok
      ? `MacMind ${action} → ok (${durationMs}ms)`
      : `MacMind ${action} → error (${durationMs}ms): ${error ?? 'unknown'}`
    const body =
      result === null || result === undefined ? '' : `\n${formatForModel(result)}`
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: header + body,
      is_error: !ok,
    }
  },
} satisfies ToolDef<InputSchema, Output>)

function formatPreview(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') {
    return value.length > 500 ? value.slice(0, 500) + '…' : value
  }
  try {
    const s = JSON.stringify(value, null, 2)
    return s.length > 500 ? s.slice(0, 500) + '…' : s
  } catch {
    return String(value)
  }
}

function formatForModel(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
