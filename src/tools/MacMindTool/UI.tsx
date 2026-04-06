import React from 'react'
import { MessageResponse } from '../../components/MessageResponse.js'
import { TOOL_SUMMARY_MAX_LENGTH } from '../../constants/toolLimits.js'
import { Box, Text } from '../../ink.js'
import { truncate } from '../../utils/format.js'
import type { Output } from './MacMindTool.js'

export function renderToolUseMessage(
  { action, input }: Partial<{ action: string; input: unknown }>,
  { verbose }: { theme?: string; verbose: boolean },
): React.ReactNode {
  if (!action) {
    return null
  }
  if (verbose && input !== undefined) {
    return `${action}(${JSON.stringify(input)})`
  }
  return action
}

export function renderToolUseProgressMessage(): React.ReactNode {
  return (
    <MessageResponse height={1}>
      <Text dimColor>Running Mac action…</Text>
    </MessageResponse>
  )
}

export function renderToolResultMessage(
  { action, ok, durationMs, resultPreview }: Output,
  _progressMessagesForMessage: unknown,
  { verbose }: { verbose: boolean },
): React.ReactNode {
  const statusText = ok ? 'ok' : 'error'
  if (verbose) {
    return (
      <Box flexDirection="column">
        <MessageResponse height={1}>
          <Text>
            {action} <Text bold>{statusText}</Text> ({durationMs}ms)
          </Text>
        </MessageResponse>
        <Box flexDirection="column">
          <Text>{resultPreview}</Text>
        </Box>
      </Box>
    )
  }
  return (
    <MessageResponse height={1}>
      <Text>
        {action} <Text bold>{statusText}</Text> ({durationMs}ms)
      </Text>
    </MessageResponse>
  )
}

export function getToolUseSummary(
  input: Partial<{ action: string; input: unknown }> | undefined,
): string | null {
  if (!input?.action) {
    return null
  }
  return truncate(input.action, TOOL_SUMMARY_MAX_LENGTH)
}
