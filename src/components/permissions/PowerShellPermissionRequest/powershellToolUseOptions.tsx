// PowerShellTool was removed in MacHelper; this options helper is no longer
// referenced anywhere. Retained as an empty stub to avoid breaking existing
// imports (if any reappear in future merges).
export type PowerShellToolUseOption =
  | 'yes'
  | 'yes-apply-suggestions'
  | 'yes-prefix-edited'
  | 'no';

export function powershellToolUseOptions(): [] {
  return [];
}
