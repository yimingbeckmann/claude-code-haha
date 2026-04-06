import { AGENT_TOOL_NAME } from '../AgentTool/constants.js'
import { BASH_TOOL_NAME } from '../BashTool/toolName.js'

export const GREP_TOOL_NAME = 'Grep'

export function getDescription(): string {
  return `A powerful tool for searching file contents anywhere on the Mac, built on ripgrep

  Usage:
  - ALWAYS use ${GREP_TOOL_NAME} for search tasks. NEVER invoke \`grep\` or \`rg\` as a ${BASH_TOOL_NAME} command. The ${GREP_TOOL_NAME} tool has been optimized for correct permissions and access.
  - Search file contents anywhere on the user's Mac — logs, system configs, notes, scripts, plists, and more
  - Examples: find \`ERROR\` in \`/var/log\`, \`WiFi\` in system config, \`api_key\` in config files under \`~/.config\`, keyword search across markdown notes in \`~/Documents\`, \`com.apple\` in plist files under \`~/Library/Preferences\`
  - Supports full regex syntax (e.g., "log.*Error", "function\\s+\\w+")
  - Filter files with glob parameter (e.g., "*.log", "**/*.plist", "*.md") or type parameter (e.g., "md", "py", "js")
  - Output modes: "content" shows matching lines, "files_with_matches" shows only file paths (default), "count" shows match counts
  - Use ${AGENT_TOOL_NAME} tool for open-ended searches requiring multiple rounds
  - Pattern syntax: Uses ripgrep (not grep) - literal braces need escaping (use \`interface\\{\\}\` to find \`interface{}\` in Go code)
  - Multiline matching: By default patterns match within single lines only. For cross-line patterns like \`struct \\{[\\s\\S]*?field\`, use \`multiline: true\`
`
}
