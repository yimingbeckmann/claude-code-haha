// Code indexing is disabled in MacHelper — this module returns no-op stubs to preserve import compatibility.

/**
 * Known code indexing tool identifiers.
 * Preserved for type compatibility with existing importers. Not used at runtime.
 */
export type CodeIndexingTool =
  // Code search engines
  | 'sourcegraph'
  | 'hound'
  | 'seagoat'
  | 'bloop'
  | 'gitloop'
  // AI coding assistants with indexing
  | 'cody'
  | 'aider'
  | 'continue'
  | 'github-copilot'
  | 'cursor'
  | 'tabby'
  | 'codeium'
  | 'tabnine'
  | 'augment'
  | 'windsurf'
  | 'aide'
  | 'pieces'
  | 'qodo'
  | 'amazon-q'
  | 'gemini'
  // MCP code indexing servers
  | 'claude-context'
  | 'code-index-mcp'
  | 'local-code-search'
  | 'autodev-codebase'
  // Context providers
  | 'openctx'

/**
 * No-op stub: code indexing detection is disabled in MacHelper.
 * Always returns undefined.
 */
export function detectCodeIndexingFromCommand(
  _command: string,
): CodeIndexingTool | undefined {
  return undefined
}

/**
 * No-op stub: code indexing detection is disabled in MacHelper.
 * Always returns undefined.
 */
export function detectCodeIndexingFromMcpTool(
  _toolName: string,
): CodeIndexingTool | undefined {
  return undefined
}

/**
 * No-op stub: code indexing detection is disabled in MacHelper.
 * Always returns undefined.
 */
export function detectCodeIndexingFromMcpServerName(
  _serverName: string,
): CodeIndexingTool | undefined {
  return undefined
}
