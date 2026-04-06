import { BASH_TOOL_NAME } from '../../tools/BashTool/toolName.js'

export const SHELL_TOOL_NAMES: string[] = [BASH_TOOL_NAME]

/**
 * PowerShellTool removed in MacHelper (macOS-only coworker). This stub keeps
 * legacy call sites compiling but always reports the tool as disabled.
 */
export function isPowerShellToolEnabled(): boolean {
  return false
}
