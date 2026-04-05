import { useState, useEffect, useCallback, useRef } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

// -- KAIROS --

export interface KairosConfig {
  enabled: boolean;
  blockingBudget: number;
  watchFileChanges: boolean;
  watchGitStatus: boolean;
  watchBuildErrors: boolean;
  watchTestFailures: boolean;
  pollInterval: number;
}

export interface KairosSuggestion {
  id: string;
  timestamp: number;
  type: 'file-change' | 'git-status' | 'build-error' | 'test-failure' | 'general';
  title: string;
  detail: string;
  dismissed: boolean;
}

export type KairosStatus = 'idle' | 'polling' | 'error';

export interface UseKairosModeReturn {
  isActive: boolean;
  toggle: () => void;
  config: KairosConfig;
  suggestions: KairosSuggestion[];
  status: KairosStatus;
}

// -- Undercover --

export interface BlocklistEntry {
  term: string;
  category: 'project-codenames' | 'model-versions' | 'infrastructure' | 'api-endpoints';
  custom?: boolean;
}

export interface UseUndercoverModeReturn {
  isActive: boolean;
  toggle: () => void;
  blocklist: BlocklistEntry[];
  addTerm: (term: string, category: BlocklistEntry['category']) => void;
  removeTerm: (term: string) => void;
}

// -- Brief --

export interface UseBriefModeReturn {
  isActive: boolean;
  toggle: () => void;
}

// -- Swarm --

export type WorkerStatus = 'idle' | 'working' | 'completed' | 'failed';
export type SwarmSessionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'stopped';
export type Priority = 'critical' | 'high' | 'normal' | 'low';

export interface SwarmWorker {
  id: string;
  role: string;
  taskAssignment: string | null;
  status: WorkerStatus;
  progress: number;
  startTime: number;
}

export interface WorkQueueItem {
  id: string;
  label: string;
  priority: Priority;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  blockedBy: string[];
}

export interface SwarmSession {
  objective: string;
  createdTime: number;
  status: SwarmSessionStatus;
}

export interface UseSwarmSessionReturn {
  session: SwarmSession | null;
  workers: SwarmWorker[];
  queue: WorkQueueItem[];
  progress: number;
  scratchpad: string;
  launch: (objective: string, concurrency?: number) => void;
  stop: () => void;
}

// -- Rewind --

export interface Checkpoint {
  id: string;
  name: string;
  timestamp: number;
  messageCount: number;
}

export interface UseRewindReturn {
  checkpoints: Checkpoint[];
  saveCheckpoint: (name: string) => void;
  rewindToTurn: (turnId: string) => void;
  rewindToCheckpoint: (checkpointId: string) => void;
  undoRewind: () => void;
  canUndo: boolean;
}

// -- Fork --

export interface ConversationFork {
  id: string;
  name: string;
  createdAt: number;
  messageCount: number;
  branchedFromMessageId: string | null;
  branchedFromIndex: number;
}

export interface UseForkReturn {
  forks: ConversationFork[];
  currentFork: string | null;
  createFork: (name: string) => void;
  switchFork: (forkId: string) => void;
  deleteFork: (forkId: string) => void;
}

// -- Notifications --

export type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'agent';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  timestamp: number;
  read: boolean;
}

export interface UseNotificationsReturn {
  notifications: Notification[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
}

// -- Stickers --

export type StickerCategory = 'celebrations' | 'animals' | 'emotions' | 'coding' | 'weather';

export interface Sticker {
  id: string;
  name: string;
  category: StickerCategory;
  art: string;
  keywords: string[];
}

export interface UseStickersReturn {
  stickers: Sticker[];
  categories: StickerCategory[];
  search: (query: string) => Sticker[];
  recentlyUsed: Sticker[];
  insertSticker: (sticker: Sticker) => void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const KAIROS_CONFIG_KEY = 'tensor-kairos-config';
const KAIROS_SUGGESTIONS_KEY = 'tensor-kairos-suggestions';
const UNDERCOVER_KEY = 'tensor-undercover-state';
const UNDERCOVER_BLOCKLIST_KEY = 'tensor-undercover-blocklist';
const BRIEF_MODE_KEY = 'tensor-brief-mode';
const SWARM_SESSION_KEY = 'tensor-swarm-session';
const REWIND_CHECKPOINTS_KEY = 'tensor-rewind-checkpoints';
const FORK_STATE_KEY = 'tensor-fork-state';
const NOTIFICATIONS_KEY = 'tensor-notifications';
const STICKER_RECENT_KEY = 'sticker-panel-recent';

const MAX_NOTIFICATIONS = 100;
const MAX_RECENT_STICKERS = 8;

const DEFAULT_KAIROS_CONFIG: KairosConfig = {
  enabled: false,
  blockingBudget: 15,
  watchFileChanges: true,
  watchGitStatus: true,
  watchBuildErrors: true,
  watchTestFailures: true,
  pollInterval: 30,
};

const STICKER_CATEGORIES: StickerCategory[] = [
  'celebrations',
  'animals',
  'emotions',
  'coding',
  'weather',
];

/* ------------------------------------------------------------------ */
/*  localStorage helpers                                               */
/* ------------------------------------------------------------------ */

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function loadJSONRaw<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed as T;
  } catch {
    return fallback;
  }
}

function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage may be full or unavailable; silently ignore
  }
}

/* ------------------------------------------------------------------ */
/*  ID generation                                                      */
/* ------------------------------------------------------------------ */

let idCounter = 0;

function generateId(prefix: string): string {
  return `${prefix}-${++idCounter}-${Date.now()}`;
}

/* ------------------------------------------------------------------ */
/*  useKairosMode                                                      */
/* ------------------------------------------------------------------ */

/**
 * Manages KAIROS proactive assistant state.
 *
 * - Persists config to localStorage.
 * - Polls for suggestions at the configured interval while active.
 * - Exposes toggle, config, and current suggestions.
 */
export function useKairosMode(): UseKairosModeReturn {
  const [config, setConfig] = useState<KairosConfig>(() =>
    loadJSON(KAIROS_CONFIG_KEY, DEFAULT_KAIROS_CONFIG),
  );
  const [suggestions, setSuggestions] = useState<KairosSuggestion[]>(() =>
    loadJSONRaw(KAIROS_SUGGESTIONS_KEY, []),
  );
  // setSuggestions will be called once backend polling is wired up
  void setSuggestions;
  const [status, setStatus] = useState<KairosStatus>('idle');
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isActive = config.enabled;

  const toggle = useCallback(() => {
    setConfig((prev) => {
      const updated = { ...prev, enabled: !prev.enabled };
      saveJSON(KAIROS_CONFIG_KEY, updated);
      return updated;
    });
  }, []);

  // Persist suggestions when they change
  useEffect(() => {
    saveJSON(KAIROS_SUGGESTIONS_KEY, suggestions);
  }, [suggestions]);

  // Poll for suggestions while active
  useEffect(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    if (!isActive) {
      setStatus('idle');
      return;
    }

    const poll = () => {
      setStatus('polling');
      // In a real implementation this would hit the backend.
      // For now we transition back to idle after the "poll".
      requestAnimationFrame(() => setStatus('idle'));
    };

    // Initial poll
    poll();

    pollTimerRef.current = setInterval(poll, config.pollInterval * 1000);

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [isActive, config.pollInterval]);

  return { isActive, toggle, config, suggestions, status };
}

/* ------------------------------------------------------------------ */
/*  useUndercoverMode                                                  */
/* ------------------------------------------------------------------ */

/**
 * Manages Undercover mode state and blocklist filtering.
 *
 * - Persists active state and blocklist to localStorage.
 * - Provides helpers to add/remove blocklist terms.
 */
export function useUndercoverMode(): UseUndercoverModeReturn {
  const [isActive, setIsActive] = useState<boolean>(() =>
    loadJSONRaw(UNDERCOVER_KEY, false),
  );
  const [blocklist, setBlocklist] = useState<BlocklistEntry[]>(() =>
    loadJSONRaw(UNDERCOVER_BLOCKLIST_KEY, []),
  );

  // Persist active state
  useEffect(() => {
    saveJSON(UNDERCOVER_KEY, isActive);
  }, [isActive]);

  // Persist blocklist
  useEffect(() => {
    saveJSON(UNDERCOVER_BLOCKLIST_KEY, blocklist);
  }, [blocklist]);

  const toggle = useCallback(() => {
    setIsActive((prev) => !prev);
  }, []);

  const addTerm = useCallback(
    (term: string, category: BlocklistEntry['category']) => {
      const trimmed = term.trim();
      if (!trimmed) return;
      setBlocklist((prev) => {
        if (prev.some((e) => e.term.toLowerCase() === trimmed.toLowerCase())) {
          return prev;
        }
        return [...prev, { term: trimmed, category, custom: true }];
      });
    },
    [],
  );

  const removeTerm = useCallback((term: string) => {
    setBlocklist((prev) => prev.filter((e) => e.term !== term));
  }, []);

  return { isActive, toggle, blocklist, addTerm, removeTerm };
}

/* ------------------------------------------------------------------ */
/*  useBriefMode                                                       */
/* ------------------------------------------------------------------ */

/**
 * Simple toggle for brief/concise AI response mode.
 *
 * Persists state to localStorage.
 */
export function useBriefMode(): UseBriefModeReturn {
  const [isActive, setIsActive] = useState<boolean>(() =>
    loadJSONRaw(BRIEF_MODE_KEY, false),
  );

  useEffect(() => {
    saveJSON(BRIEF_MODE_KEY, isActive);
  }, [isActive]);

  const toggle = useCallback(() => {
    setIsActive((prev) => !prev);
  }, []);

  return { isActive, toggle };
}

/* ------------------------------------------------------------------ */
/*  useSwarmSession                                                    */
/* ------------------------------------------------------------------ */

/**
 * Manages swarm orchestration state.
 *
 * - Tracks session, workers, queue, and shared scratchpad.
 * - Provides launch/stop controls.
 * - Computes overall progress from worker/queue state.
 */
export function useSwarmSession(): UseSwarmSessionReturn {
  const [session, setSession] = useState<SwarmSession | null>(() =>
    loadJSONRaw(SWARM_SESSION_KEY, null),
  );
  const [workers, setWorkers] = useState<SwarmWorker[]>([]);
  const [queue, setQueue] = useState<WorkQueueItem[]>([]);
  const [scratchpad, setScratchpad] = useState<string>('');
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Compute progress from queue completion
  const progress =
    queue.length > 0
      ? Math.round(
          (queue.filter((q) => q.status === 'completed').length / queue.length) *
            100,
        )
      : 0;

  // Persist session
  useEffect(() => {
    saveJSON(SWARM_SESSION_KEY, session);
  }, [session]);

  // Poll while session is running
  useEffect(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    if (!session || session.status !== 'running') return;

    const poll = () => {
      // In a real implementation this would fetch worker/queue state
      // from the backend.  Placeholder for wiring.
    };

    poll();
    pollTimerRef.current = setInterval(poll, 3000);

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [session]);

  const launch = useCallback((objective: string, _concurrency = 4) => {
    const newSession: SwarmSession = {
      objective,
      createdTime: Date.now(),
      status: 'running',
    };
    setSession(newSession);
    setWorkers([]);
    setQueue([]);
    setScratchpad('');
  }, []);

  const stop = useCallback(() => {
    setSession((prev) => {
      if (!prev) return null;
      return { ...prev, status: 'stopped' };
    });
    setWorkers((prev) =>
      prev.map((w) =>
        w.status === 'working' ? { ...w, status: 'idle' as WorkerStatus } : w,
      ),
    );
  }, []);

  return { session, workers, queue, progress, scratchpad, launch, stop };
}

/* ------------------------------------------------------------------ */
/*  useRewind                                                          */
/* ------------------------------------------------------------------ */

/**
 * Manages conversation rewind/checkpoint state.
 *
 * - Maintains a list of named checkpoints.
 * - Tracks the last rewind so it can be undone.
 * - Persists checkpoints to localStorage.
 */
export function useRewind(): UseRewindReturn {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>(() =>
    loadJSONRaw(REWIND_CHECKPOINTS_KEY, []),
  );
  const [lastRewind, setLastRewind] = useState<{
    type: 'turn' | 'checkpoint';
    targetId: string;
  } | null>(null);

  // Persist checkpoints
  useEffect(() => {
    saveJSON(REWIND_CHECKPOINTS_KEY, checkpoints);
  }, [checkpoints]);

  const saveCheckpoint = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const cp: Checkpoint = {
      id: generateId('cp'),
      name: trimmed,
      timestamp: Date.now(),
      messageCount: 0, // caller should update with actual count
    };
    setCheckpoints((prev) => [cp, ...prev]);
  }, []);

  const rewindToTurn = useCallback((turnId: string) => {
    setLastRewind({ type: 'turn', targetId: turnId });
  }, []);

  const rewindToCheckpoint = useCallback((checkpointId: string) => {
    setLastRewind({ type: 'checkpoint', targetId: checkpointId });
  }, []);

  const undoRewind = useCallback(() => {
    setLastRewind(null);
  }, []);

  const canUndo = lastRewind !== null;

  return {
    checkpoints,
    saveCheckpoint,
    rewindToTurn,
    rewindToCheckpoint,
    undoRewind,
    canUndo,
  };
}

/* ------------------------------------------------------------------ */
/*  useFork                                                            */
/* ------------------------------------------------------------------ */

interface ForkState {
  forks: ConversationFork[];
  currentForkId: string | null;
}

const DEFAULT_FORK_STATE: ForkState = { forks: [], currentForkId: null };

/**
 * Manages conversation fork (branching) state.
 *
 * - Creates, switches, and deletes forks.
 * - Persists fork state to localStorage.
 */
export function useFork(): UseForkReturn {
  const [state, setState] = useState<ForkState>(() =>
    loadJSON(FORK_STATE_KEY, DEFAULT_FORK_STATE),
  );

  // Persist state
  useEffect(() => {
    saveJSON(FORK_STATE_KEY, state);
  }, [state]);

  const createFork = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const fork: ConversationFork = {
      id: generateId('fork'),
      name: trimmed,
      createdAt: Date.now(),
      messageCount: 0,
      branchedFromMessageId: null,
      branchedFromIndex: 0,
    };
    setState((prev) => ({
      forks: [...prev.forks, fork],
      currentForkId: fork.id,
    }));
  }, []);

  const switchFork = useCallback((forkId: string) => {
    setState((prev) => {
      if (!prev.forks.some((f) => f.id === forkId)) return prev;
      return { ...prev, currentForkId: forkId };
    });
  }, []);

  const deleteFork = useCallback((forkId: string) => {
    setState((prev) => {
      const updated = prev.forks.filter((f) => f.id !== forkId);
      const newCurrent =
        prev.currentForkId === forkId
          ? updated.length > 0
            ? updated[0].id
            : null
          : prev.currentForkId;
      return { forks: updated, currentForkId: newCurrent };
    });
  }, []);

  return {
    forks: state.forks,
    currentFork: state.currentForkId,
    createFork,
    switchFork,
    deleteFork,
  };
}

/* ------------------------------------------------------------------ */
/*  useNotifications                                                   */
/* ------------------------------------------------------------------ */

/**
 * Manages a notification center backed by localStorage.
 *
 * - Caps stored notifications at MAX_NOTIFICATIONS (100).
 * - Provides read/clear helpers and an unread count.
 */
export function useNotifications(): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<Notification[]>(() =>
    loadJSONRaw(NOTIFICATIONS_KEY, []),
  );

  // Persist notifications
  useEffect(() => {
    saveJSON(NOTIFICATIONS_KEY, notifications);
  }, [notifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const addNotification = useCallback(
    (input: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
      const entry: Notification = {
        ...input,
        id: generateId('notif'),
        timestamp: Date.now(),
        read: false,
      };
      setNotifications((prev) => {
        const updated = [entry, ...prev];
        return updated.length > MAX_NOTIFICATIONS
          ? updated.slice(0, MAX_NOTIFICATIONS)
          : updated;
      });
    },
    [],
  );

  return {
    notifications,
    unreadCount,
    markRead,
    markAllRead,
    clearAll,
    addNotification,
  };
}

/* ------------------------------------------------------------------ */
/*  useStickers                                                        */
/* ------------------------------------------------------------------ */

// Inline sticker data for the hook so consumers do not need the panel.

const STICKER_DATA: Sticker[] = [
  // Celebrations
  { id: 'party', name: 'Party', category: 'celebrations', keywords: ['party', 'celebrate', 'fun'], art:
`  * + *
 \\( ^o^ )/
  /|   |\\
   d   b` },
  { id: 'trophy', name: 'Trophy', category: 'celebrations', keywords: ['trophy', 'win', 'winner', 'first'], art:
` ___________
 \\         /
  )  #1   (
 /_________\\
    || ||
  __||_||__` },
  { id: 'fireworks', name: 'Fireworks', category: 'celebrations', keywords: ['fireworks', 'boom', 'celebration'], art:
`    *  .  *
  . *\\|/* .
 * -=*=- *
  . */|\\* .
    *  .  *` },
  { id: 'champagne', name: 'Champagne', category: 'celebrations', keywords: ['champagne', 'cheers', 'toast', 'drink'], art:
`    o  o
   o o o
   |   |
   |___|
  /     \\
  \\_____/` },
  { id: 'confetti', name: 'Confetti', category: 'celebrations', keywords: ['confetti', 'yay', 'hooray'], art:
` * .+ o .+
 .+  * . o
  HOORAY!
 o .+ * .+
 .+ o . * ` },
  { id: 'star', name: 'Star', category: 'celebrations', keywords: ['star', 'achievement', 'gold'], art:
`     /\\
    /  \\
\\--/    \\--/
 \\  STAR  /
  \\------/
   \\    /
    \\  /` },
  // Animals
  { id: 'cat', name: 'Cat', category: 'animals', keywords: ['cat', 'kitty', 'meow', 'feline'], art:
`  /\\_/\\
 ( o.o )
  > ^ <
 /|   |\\` },
  { id: 'dog', name: 'Dog', category: 'animals', keywords: ['dog', 'puppy', 'woof', 'bark'], art:
`    __
 o-''|\\-'
  \\_/|_/
    |
   _|_
  |   |` },
  { id: 'bear', name: 'Bear', category: 'animals', keywords: ['bear', 'teddy', 'grizzly'], art:
` _(\\_ _/)_
(  ( o_o )  )
 \\  (u u)  /
  \\  ---  /` },
  { id: 'penguin', name: 'Penguin', category: 'animals', keywords: ['penguin', 'tux', 'cold'], art:
`   .--.
  |o_o |
  |:_/ |
 //   \\ \\
(|     | )
 \\'|\\_/'/` },
  { id: 'owl', name: 'Owl', category: 'animals', keywords: ['owl', 'hoot', 'wise', 'bird'], art:
`  ,_,
 (O,O)
 (   )
--"-"--` },
  { id: 'butterfly', name: 'Butterfly', category: 'animals', keywords: ['butterfly', 'fly', 'pretty', 'insect'], art:
` ,  _  ,
/ \`/ \\\`  \\
\\  \\ /  /
 \`._Y_.\`` },
  // Emotions
  { id: 'happy', name: 'Happy', category: 'emotions', keywords: ['happy', 'smile', 'joy', 'glad'], art:
`  \\(^_^)/
   |   |
   |   |
   d   b` },
  { id: 'sad', name: 'Sad', category: 'emotions', keywords: ['sad', 'cry', 'upset', 'unhappy'], art:
`   (;_;)
   /| |\\
    | |
    d b` },
  { id: 'cool', name: 'Cool', category: 'emotions', keywords: ['cool', 'sunglasses', 'awesome', 'rad'], art:
`   (B_B)
    \\| |/
     | |
    _/ \\_` },
  { id: 'thinking', name: 'Thinking', category: 'emotions', keywords: ['thinking', 'hmm', 'wonder', 'curious'], art:
`  (._. )?
   |  |/
   |  |
   d  b` },
  { id: 'love', name: 'Love', category: 'emotions', keywords: ['love', 'heart', 'romance', 'like'], art:
`  <3 <3 <3
 (<3_<3)
  \\| |/
   | |` },
  { id: 'shocked', name: 'Shocked', category: 'emotions', keywords: ['shocked', 'surprise', 'wow', 'omg'], art:
`   (O_O;)
    |  |
   /|  |\\
    d  b` },
  // Coding
  { id: 'bug', name: 'Bug', category: 'coding', keywords: ['bug', 'debug', 'error', 'fix'], art:
`  _  _
 / \\/ \\
( BUG! )
 \\_/\\_/
  /  \\` },
  { id: 'coffee', name: 'Coffee', category: 'coding', keywords: ['coffee', 'java', 'brew', 'caffeine'], art:
`    )  )
   (  (
  c|~~|
   |  |
   \`--'` },
  { id: 'rocket', name: 'Rocket', category: 'coding', keywords: ['rocket', 'launch', 'deploy', 'ship'], art:
`    /\\
   /  \\
  | ** |
  |    |
  /|/\\|\\
 /_||||_\\` },
  { id: 'keyboard', name: 'Keyboard', category: 'coding', keywords: ['keyboard', 'type', 'code', 'dev'], art:
` ___________
|  _  _  _  |
| |_||_||_| |
|  _  _  _  |
|___________|` },
  { id: 'binary', name: 'Binary', category: 'coding', keywords: ['binary', 'data', 'bits', '010'], art:
` 01001000
 01101001
 00100001
 --------
  >HELLO<` },
  { id: 'git', name: 'Git', category: 'coding', keywords: ['git', 'branch', 'merge', 'commit'], art:
`  o--o--o
  |     \\
  o  o---o
  |  |
  o--o` },
  // Weather
  { id: 'sun', name: 'Sun', category: 'weather', keywords: ['sun', 'sunny', 'bright', 'warm'], art:
`    \\  |  /
  -- ( ) --
    /  |  \\
   ~  ~  ~` },
  { id: 'rain', name: 'Rain', category: 'weather', keywords: ['rain', 'rainy', 'wet', 'shower'], art:
`   .---.
  (     )
 (_______)
  ' ' ' '
 ' ' ' '` },
  { id: 'snow', name: 'Snow', category: 'weather', keywords: ['snow', 'snowflake', 'winter', 'cold'], art:
`   *  *  *
  .---.
 (     )
  *  *  *
    *  *` },
  { id: 'thunder', name: 'Thunder', category: 'weather', keywords: ['thunder', 'lightning', 'storm', 'bolt'], art:
`   .---.
  (     )
 (_/\\/\\__)
    /  /
   /  /` },
  { id: 'rainbow', name: 'Rainbow', category: 'weather', keywords: ['rainbow', 'colors', 'arc', 'spectrum'], art:
`     .-.
   .'   \`.
  /  ~ ~  \\
 |  R A I N|
  \\ B O W /` },
  { id: 'cloud', name: 'Cloud', category: 'weather', keywords: ['cloud', 'cloudy', 'overcast', 'sky'], art:
`    .---.
 .-(     )-.
(  _______  )
 \`---------\`` },
];

const STICKER_MAP = new Map(STICKER_DATA.map((s) => [s.id, s]));

/**
 * Provides sticker search, category browsing, and recent-use tracking.
 *
 * - `search(query)` filters stickers by name, category, or keywords.
 * - `insertSticker` records usage in the recently-used list.
 * - Recent history is persisted to localStorage (max 8).
 */
export function useStickers(): UseStickersReturn {
  const [recentIds, setRecentIds] = useState<string[]>(() =>
    loadJSONRaw(STICKER_RECENT_KEY, []),
  );

  const recentlyUsed = recentIds
    .map((id) => STICKER_MAP.get(id))
    .filter((s): s is Sticker => s !== undefined);

  const search = useCallback((query: string): Sticker[] => {
    const q = query.trim().toLowerCase();
    if (!q) return STICKER_DATA;
    return STICKER_DATA.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.category.includes(q) ||
        s.keywords.some((k) => k.includes(q)),
    );
  }, []);

  const insertSticker = useCallback((sticker: Sticker) => {
    setRecentIds((prev) => {
      const next = [sticker.id, ...prev.filter((id) => id !== sticker.id)].slice(
        0,
        MAX_RECENT_STICKERS,
      );
      saveJSON(STICKER_RECENT_KEY, next);
      return next;
    });
  }, []);

  return {
    stickers: STICKER_DATA,
    categories: STICKER_CATEGORIES,
    search,
    recentlyUsed,
    insertSticker,
  };
}
