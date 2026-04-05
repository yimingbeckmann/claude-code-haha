import { useEffect, useCallback, useRef } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ShortcutAction {
  id: string;
  keys: string[];       // e.g., ["meta+k", "ctrl+k"]
  label: string;
  category: string;
  action: () => void;
  when?: () => boolean;  // condition guard; shortcut fires only when true
}

/* ------------------------------------------------------------------ */
/*  Key-combo parser                                                   */
/* ------------------------------------------------------------------ */

interface ParsedCombo {
  meta: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  key: string;  // normalised to lowercase
}

function parseCombo(raw: string): ParsedCombo {
  const parts = raw.toLowerCase().split('+').map((p) => p.trim());
  const key = parts[parts.length - 1];
  return {
    meta: parts.includes('meta') || parts.includes('cmd'),
    ctrl: parts.includes('ctrl') || parts.includes('control'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt') || parts.includes('option'),
    key,
  };
}

/* ------------------------------------------------------------------ */
/*  Normalise event.key to match our combo vocabulary                  */
/* ------------------------------------------------------------------ */

const KEY_ALIASES: Record<string, string> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Escape: 'escape',
  Enter: 'enter',
  Tab: 'tab',
  Backspace: 'backspace',
  Delete: 'delete',
  ' ': 'space',
  ',': ',',
  '.': '.',
  '/': '/',
};

function normaliseKey(e: KeyboardEvent): string {
  return (KEY_ALIASES[e.key] ?? e.key).toLowerCase();
}

/* ------------------------------------------------------------------ */
/*  Decide whether the event target is a text-input element            */
/* ------------------------------------------------------------------ */

function isTextInput(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    return ['text', 'search', 'url', 'email', 'password', 'number', 'tel'].includes(type);
  }
  if (target.isContentEditable) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/*  Match an event against a single parsed combo                       */
/* ------------------------------------------------------------------ */

function matchesCombo(e: KeyboardEvent, combo: ParsedCombo): boolean {
  if (combo.meta !== e.metaKey) return false;
  if (combo.ctrl !== e.ctrlKey) return false;
  if (combo.shift !== e.shiftKey) return false;
  if (combo.alt !== e.altKey) return false;
  return normaliseKey(e) === combo.key;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

/**
 * Registers global keyboard shortcuts.
 *
 * - Matches modifier combos (meta, ctrl, shift, alt).
 * - Prevents default browser behaviour for matched shortcuts.
 * - Skips shortcuts when focus is inside text inputs **unless** the
 *   shortcut provides a `when` guard that explicitly returns true.
 * - Cleans up the listener on unmount.
 */
export function useKeyboardShortcuts(shortcuts: ShortcutAction[]): void {
  // Keep latest shortcuts in a ref so the listener always sees current values
  // without needing to re-attach.
  const shortcutsRef = useRef<ShortcutAction[]>(shortcuts);
  shortcutsRef.current = shortcuts;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const current = shortcutsRef.current;
    const inTextInput = isTextInput(e.target);

    for (let i = 0; i < current.length; i++) {
      const shortcut = current[i];

      // Check `when` guard first -- if it returns false, skip.
      if (shortcut.when && !shortcut.when()) continue;

      // If focus is in a text input and no explicit `when` guard opted-in,
      // suppress the shortcut so normal typing is not hijacked.
      if (inTextInput && !shortcut.when) continue;

      const combos = shortcut.keys.map(parseCombo);
      const matched = combos.some((combo) => matchesCombo(e, combo));

      if (matched) {
        e.preventDefault();
        e.stopPropagation();
        shortcut.action();
        return;
      }
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [handleKeyDown]);
}

/* ------------------------------------------------------------------ */
/*  Preset shortcut definitions (no-op actions -- wire at call-site)   */
/* ------------------------------------------------------------------ */

export type ShortcutId =
  | 'commandPalette'
  | 'commandPaletteAlt'
  | 'newSession'
  | 'clearConversation'
  | 'openSettings'
  | 'toggleSidebar'
  | 'toggleTerminal'
  | 'escapeCancel'
  | 'openSearch'
  | 'openDispatch'
  | 'cycleModels'
  | 'sendMessage'
  | 'editLastMessage'
  | 'acceptSuggestion'
  | 'pasteAsCodeBlock'
  | 'toggleKairos'
  | 'toggleBrief'
  | 'toggleUndercover'
  | 'openInsights'
  | 'openSecurityReview'
  | 'openSwarm'
  | 'openRewind'
  | 'forkConversation';

const noop = () => {};

/** A catalogue of every registered shortcut with platform-appropriate keys. */
export const SHORTCUT_CATALOGUE: Omit<ShortcutAction, 'action'>[] = [
  {
    id: 'commandPalette',
    keys: ['meta+k', 'ctrl+k'],
    label: 'Open command palette',
    category: 'Navigation',
  },
  {
    id: 'commandPaletteAlt',
    keys: ['meta+shift+p', 'ctrl+shift+p'],
    label: 'Command palette (alt)',
    category: 'Navigation',
  },
  {
    id: 'newSession',
    keys: ['meta+n', 'ctrl+n'],
    label: 'New session',
    category: 'Session',
  },
  {
    id: 'clearConversation',
    keys: ['meta+l', 'ctrl+l'],
    label: 'Clear conversation',
    category: 'Session',
  },
  {
    id: 'openSettings',
    keys: ['meta+,', 'ctrl+,'],
    label: 'Open settings',
    category: 'General',
  },
  {
    id: 'toggleSidebar',
    keys: ['meta+/', 'ctrl+/'],
    label: 'Toggle sidebar',
    category: 'Navigation',
  },
  {
    id: 'toggleTerminal',
    keys: ['meta+.', 'ctrl+.'],
    label: 'Toggle terminal',
    category: 'Navigation',
  },
  {
    id: 'escapeCancel',
    keys: ['escape'],
    label: 'Cancel / close / stop',
    category: 'General',
  },
  {
    id: 'openSearch',
    keys: ['meta+shift+s', 'ctrl+shift+s'],
    label: 'Open search',
    category: 'Tools',
  },
  {
    id: 'openDispatch',
    keys: ['meta+shift+d', 'ctrl+shift+d'],
    label: 'Open dispatch',
    category: 'Tools',
  },
  {
    id: 'cycleModels',
    keys: ['meta+m', 'ctrl+m'],
    label: 'Cycle models',
    category: 'Tools',
  },
  {
    id: 'sendMessage',
    keys: ['meta+enter', 'ctrl+enter'],
    label: 'Send message',
    category: 'Editor',
  },
  {
    id: 'editLastMessage',
    keys: ['up'],
    label: 'Edit last message',
    category: 'Editor',
  },
  {
    id: 'acceptSuggestion',
    keys: ['tab'],
    label: 'Accept suggestion',
    category: 'Editor',
  },
  {
    id: 'pasteAsCodeBlock',
    keys: ['meta+shift+v', 'ctrl+shift+v'],
    label: 'Paste as code block',
    category: 'Editor',
  },
  {
    id: 'toggleKairos',
    keys: ['meta+shift+k', 'ctrl+shift+k'],
    label: 'Toggle KAIROS mode',
    category: 'Modes',
  },
  {
    id: 'toggleBrief',
    keys: ['meta+shift+b', 'ctrl+shift+b'],
    label: 'Toggle Brief mode',
    category: 'Modes',
  },
  {
    id: 'toggleUndercover',
    keys: ['meta+shift+u', 'ctrl+shift+u'],
    label: 'Toggle Undercover mode',
    category: 'Modes',
  },
  {
    id: 'openInsights',
    keys: ['meta+shift+i', 'ctrl+shift+i'],
    label: 'Open Insights panel',
    category: 'Tools',
  },
  {
    id: 'openSecurityReview',
    keys: ['meta+shift+r', 'ctrl+shift+r'],
    label: 'Open Security Review',
    category: 'Tools',
  },
  {
    id: 'openSwarm',
    keys: ['meta+shift+w', 'ctrl+shift+w'],
    label: 'Open Swarm panel',
    category: 'Tools',
  },
  {
    id: 'openRewind',
    keys: ['meta+shift+z', 'ctrl+shift+z'],
    label: 'Open Rewind dialog',
    category: 'Session',
  },
  {
    id: 'forkConversation',
    keys: ['meta+shift+y', 'ctrl+shift+y'],
    label: 'Fork conversation',
    category: 'Session',
  },
];

/**
 * Build a ShortcutAction[] array by merging caller-supplied action handlers
 * into the catalogue.  Any shortcut without a handler is assigned a no-op so
 * the full catalogue is always available for display in the shortcuts dialog.
 */
export function buildShortcuts(
  handlers: Partial<Record<ShortcutId, { action: () => void; when?: () => boolean }>>,
): ShortcutAction[] {
  return SHORTCUT_CATALOGUE.map((entry) => {
    const handler = handlers[entry.id as ShortcutId];
    return {
      ...entry,
      action: handler?.action ?? noop,
      when: handler?.when,
    };
  });
}

export default useKeyboardShortcuts;
