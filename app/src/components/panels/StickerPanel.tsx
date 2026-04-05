import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ============================================================================
// StickerPanel — Browse and insert ASCII art stickers into conversation
// ============================================================================

// -- Types ------------------------------------------------------------------

interface Sticker {
  id: string;
  name: string;
  category: Category;
  art: string;
  keywords: string[];
}

type Category = "celebrations" | "animals" | "emotions" | "coding" | "weather";
const CATEGORIES: Category[] = ["celebrations", "animals", "emotions", "coding", "weather"];
const CATEGORY_LABELS: Record<"all" | Category, string> = {
  all: "All",
  celebrations: "Celebrations",
  animals: "Animals",
  emotions: "Emotions",
  coding: "Coding",
  weather: "Weather",
};

export interface StickerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSendMessage: (text: string) => void;
}

// -- localStorage key -------------------------------------------------------

const RECENT_KEY = "sticker-panel-recent";
const MAX_RECENT = 8;

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecent(ids: string[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, MAX_RECENT)));
  } catch {}
}

// -- Sticker data -----------------------------------------------------------

const STICKERS: Sticker[] = [
  // Celebrations
  { id: "party", name: "Party", category: "celebrations", keywords: ["party", "celebrate", "fun"], art:
`  ★ ☆ ★
 \\( ^o^ )/
  /|   |\\
   d   b` },
  { id: "trophy", name: "Trophy", category: "celebrations", keywords: ["trophy", "win", "winner", "first"], art:
` ___________
 \\         /
  )  #1   (
 /_________\\
    || ||
  __||_||__` },
  { id: "fireworks", name: "Fireworks", category: "celebrations", keywords: ["fireworks", "boom", "celebration"], art:
`    *  .  *
  . *\\|/* .
 * -=≡=- *
  . */|\\* .
    *  .  *` },
  { id: "champagne", name: "Champagne", category: "celebrations", keywords: ["champagne", "cheers", "toast", "drink"], art:
`    o  o
   o o o
   |   |
   |___|
  /     \\
  \\_____/` },
  { id: "confetti", name: "Confetti", category: "celebrations", keywords: ["confetti", "yay", "hooray"], art:
` * .+ o .+
 .+  * . o
  HOORAY!
 o .+ * .+
 .+ o . * ` },
  { id: "star", name: "Star", category: "celebrations", keywords: ["star", "achievement", "gold"], art:
`     /\\
    /  \\
\\--/    \\--/
 \\  STAR  /
  \\------/
   \\    /
    \\  /` },
  // Animals
  { id: "cat", name: "Cat", category: "animals", keywords: ["cat", "kitty", "meow", "feline"], art:
`  /\\_/\\
 ( o.o )
  > ^ <
 /|   |\\` },
  { id: "dog", name: "Dog", category: "animals", keywords: ["dog", "puppy", "woof", "bark"], art:
`    __
 o-''|\\-'
  \\_/|_/
    |
   _|_
  |   |` },
  { id: "bear", name: "Bear", category: "animals", keywords: ["bear", "teddy", "grizzly"], art:
` _(\\_ _/)_
(  ( o_o )  )
 \\  (u u)  /
  \\  ---  /` },
  { id: "penguin", name: "Penguin", category: "animals", keywords: ["penguin", "tux", "cold"], art:
`   .--.
  |o_o |
  |:_/ |
 //   \\ \\
(|     | )
 \\'|\\_/'/` },
  { id: "owl", name: "Owl", category: "animals", keywords: ["owl", "hoot", "wise", "bird"], art:
`  ,_,
 (O,O)
 (   )
--"-"--` },
  { id: "butterfly", name: "Butterfly", category: "animals", keywords: ["butterfly", "fly", "pretty", "insect"], art:
` ,  _  ,
/ \`/ \\\`  \\
\\  \\ /  /
 \`._Y_.\`` },
  // Emotions
  { id: "happy", name: "Happy", category: "emotions", keywords: ["happy", "smile", "joy", "glad"], art:
`  \\(^_^)/
   |   |
   |   |
   d   b` },
  { id: "sad", name: "Sad", category: "emotions", keywords: ["sad", "cry", "upset", "unhappy"], art:
`   (;_;)
   /| |\\
    | |
    d b` },
  { id: "cool", name: "Cool", category: "emotions", keywords: ["cool", "sunglasses", "awesome", "rad"], art:
`   (⌐■_■)
    \\| |/
     | |
    _/ \\_` },
  { id: "thinking", name: "Thinking", category: "emotions", keywords: ["thinking", "hmm", "wonder", "curious"], art:
`  (._. )?
   |  |/
   |  |
   d  b` },
  { id: "love", name: "Love", category: "emotions", keywords: ["love", "heart", "romance", "like"], art:
`  ♥ ♥ ♥
 (♥‿♥)
  \\| |/
   | |` },
  { id: "shocked", name: "Shocked", category: "emotions", keywords: ["shocked", "surprise", "wow", "omg"], art:
`   (◎_◎;)
    |  |
   /|  |\\
    d  b` },
  // Coding
  { id: "bug", name: "Bug", category: "coding", keywords: ["bug", "debug", "error", "fix"], art:
`  _  _
 / \\/ \\
( BUG! )
 \\_/\\_/
  /  \\` },
  { id: "coffee", name: "Coffee", category: "coding", keywords: ["coffee", "java", "brew", "caffeine"], art:
`    )  )
   (  (
  c|~~|
   |  |
   \`--'` },
  { id: "rocket", name: "Rocket", category: "coding", keywords: ["rocket", "launch", "deploy", "ship"], art:
`    /\\
   /  \\
  | ** |
  |    |
  /|/\\|\\
 /_||||_\\` },
  { id: "keyboard", name: "Keyboard", category: "coding", keywords: ["keyboard", "type", "code", "dev"], art:
` ___________
|  _  _  _  |
| |_||_||_| |
|  _  _  _  |
|___________|` },
  { id: "binary", name: "Binary", category: "coding", keywords: ["binary", "data", "bits", "010"], art:
` 01001000
 01101001
 00100001
 --------
  >HELLO<` },
  { id: "git", name: "Git", category: "coding", keywords: ["git", "branch", "merge", "commit"], art:
`  o--o--o
  |     \\
  o  o---o
  |  |
  o--o` },
  // Weather
  { id: "sun", name: "Sun", category: "weather", keywords: ["sun", "sunny", "bright", "warm"], art:
`    \\  |  /
  -- ( ) --
    /  |  \\
   ~  ~  ~` },
  { id: "rain", name: "Rain", category: "weather", keywords: ["rain", "rainy", "wet", "shower"], art:
`   .---.
  (     )
 (_______)
  ' ' ' '
 ' ' ' '` },
  { id: "snow", name: "Snow", category: "weather", keywords: ["snow", "snowflake", "winter", "cold"], art:
`   *  *  *
  .---.
 (     )
  *  *  *
    *  *` },
  { id: "thunder", name: "Thunder", category: "weather", keywords: ["thunder", "lightning", "storm", "bolt"], art:
`   .---.
  (     )
 (_/\\/\\__)
    /  /
   /  /` },
  { id: "rainbow", name: "Rainbow", category: "weather", keywords: ["rainbow", "colors", "arc", "spectrum"], art:
`     .-.
   .'   \`.
  /  ~ ~  \\
 |  R A I N|
  \\ B O W /` },
  { id: "cloud", name: "Cloud", category: "weather", keywords: ["cloud", "cloudy", "overcast", "sky"], art:
`    .---.
 .-(     )-.
(  _______  )
 \`---------\`` },
];

// -- Styles (injected CSS) --------------------------------------------------

const CSS = `
.sticker-panel-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.6);
  display: flex; justify-content: flex-end; z-index: 9998;
  backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
}
.sticker-panel {
  display: flex; flex-direction: column; width: 520px; max-width: 96vw;
  height: 100vh; background: var(--bg-primary, #0a0a0f);
  border-left: 1px solid var(--border, #2a2a36);
  box-shadow: -8px 0 30px rgba(0,0,0,.4);
  color: var(--text-primary, rgba(255,255,255,.9));
  font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
  overflow: hidden; animation: sticker-slide .2s ease-out;
}
@keyframes sticker-slide {
  from { transform: translateX(100%); opacity: .8; }
  to   { transform: translateX(0); opacity: 1; }
}

/* Header */
.sticker-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px; border-bottom: 1px solid var(--border, #2a2a36); flex-shrink: 0;
}
.sticker-header h2 { margin: 0; font-size: 15px; font-weight: 600; }
.sticker-close-btn {
  background: none; border: none; cursor: pointer; color: var(--text-secondary, #6a6a82);
  padding: 4px; display: flex; align-items: center; border-radius: 4px; transition: color .15s;
}
.sticker-close-btn:hover { color: var(--text-primary, #e4e4ed); }

/* Search */
.sticker-search-row {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px; border-bottom: 1px solid var(--border, #2a2a36); flex-shrink: 0;
}
.sticker-search-icon { color: var(--text-secondary, #6a6a82); flex-shrink: 0; display: flex; }
.sticker-search-input {
  flex: 1; background: var(--bg-tertiary, #1a1a2e); border: 1px solid var(--border, #2a2a36);
  border-radius: 6px; padding: 7px 10px; font-size: 13px;
  color: var(--text-primary, #e4e4ed); font-family: var(--font-mono, monospace);
  outline: none; transition: border-color .15s;
}
.sticker-search-input:focus { border-color: var(--accent, #e84520); }
.sticker-search-input::placeholder { color: var(--text-secondary, #6a6a82); }

/* Category tabs */
.sticker-tabs {
  display: flex; padding: 0 12px; border-bottom: 1px solid var(--border, #2a2a36);
  flex-shrink: 0; background: var(--bg-secondary, #12121a); overflow-x: auto;
}
.sticker-tabs::-webkit-scrollbar { height: 0; }
.sticker-tab {
  padding: 9px 14px; font-size: 12px; font-weight: 500;
  color: var(--text-secondary, #9898b0); background: none; border: none;
  border-bottom: 2px solid transparent; cursor: pointer;
  transition: color .15s, border-color .15s; white-space: nowrap;
}
.sticker-tab:hover { color: var(--text-primary, #e4e4ed); }
.sticker-tab.active {
  color: var(--accent, #e84520); border-bottom-color: var(--accent, #e84520); font-weight: 600;
}

/* Body scrollable area */
.sticker-body {
  flex: 1; overflow-y: auto; padding: 16px; min-height: 0;
}
.sticker-body::-webkit-scrollbar { width: 5px; }
.sticker-body::-webkit-scrollbar-track { background: transparent; }
.sticker-body::-webkit-scrollbar-thumb { background: var(--border, #2a2a36); border-radius: 3px; }

/* Section labels */
.sticker-section-title {
  font-size: 11px; font-weight: 700; color: var(--text-secondary, #6a6a82);
  text-transform: uppercase; letter-spacing: 1px; margin: 0 0 10px;
}
.sticker-section-title:not(:first-child) { margin-top: 20px; }

/* Grid */
.sticker-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;
}

/* Card */
.sticker-card {
  border: 1px solid var(--border, #2a2a36); border-radius: 8px;
  padding: 10px; background: var(--bg-secondary, #12121a);
  cursor: pointer; transition: border-color .15s, background .15s;
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  position: relative; overflow: hidden;
}
.sticker-card:hover {
  border-color: var(--accent, #e84520);
  background: rgba(232, 69, 32, 0.05);
}
.sticker-card-art {
  font-family: var(--font-mono, "JetBrains Mono", "Fira Code", monospace);
  font-size: 10px; line-height: 1.3; white-space: pre;
  color: var(--text-primary, #e4e4ed); text-align: center;
  pointer-events: none; user-select: none;
  min-height: 44px; display: flex; align-items: center; justify-content: center;
}
.sticker-card-name {
  font-size: 11px; font-weight: 600; color: var(--text-secondary, #9898b0);
  text-align: center; pointer-events: none;
}

/* Insert overlay on hover */
.sticker-card-insert {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(232, 69, 32, 0.85); opacity: 0; transition: opacity .15s;
  border-radius: 7px;
}
.sticker-card:hover .sticker-card-insert { opacity: 1; }
.sticker-card-insert span {
  font-size: 12px; font-weight: 600; color: #fff; letter-spacing: 0.5px;
}

/* Recent section */
.sticker-recent-row {
  display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 6px;
}
.sticker-recent-chip {
  border: 1px solid var(--border, #2a2a36); border-radius: 6px;
  padding: 6px 8px; background: var(--bg-secondary, #12121a);
  cursor: pointer; transition: border-color .15s, background .15s;
  display: flex; flex-direction: column; align-items: center; gap: 2px;
}
.sticker-recent-chip:hover {
  border-color: var(--accent, #e84520);
  background: rgba(232, 69, 32, 0.05);
}
.sticker-recent-chip-art {
  font-family: var(--font-mono, "JetBrains Mono", "Fira Code", monospace);
  font-size: 7px; line-height: 1.2; white-space: pre;
  color: var(--text-primary, #e4e4ed); text-align: center;
  pointer-events: none; user-select: none;
}
.sticker-recent-chip-name {
  font-size: 9px; color: var(--text-secondary, #9898b0);
  pointer-events: none;
}

/* Empty state */
.sticker-empty {
  text-align: center; padding: 40px 20px; color: var(--text-secondary, #6a6a82); font-size: 12px;
}
`;

// -- Sticker lookup map -----------------------------------------------------

const STICKER_MAP = new Map(STICKERS.map((s) => [s.id, s]));

// -- Component --------------------------------------------------------------

export default function StickerPanel({ isOpen, onClose, onSendMessage }: StickerPanelProps) {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | Category>("all");
  const [recentIds, setRecentIds] = useState<string[]>(loadRecent);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus search on open
  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [isOpen]);

  // Filter stickers
  const filtered = useMemo(() => {
    let list = STICKERS;
    if (activeTab !== "all") {
      list = list.filter((s) => s.category === activeTab);
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.category.includes(q) ||
          s.keywords.some((k) => k.includes(q))
      );
    }
    return list;
  }, [query, activeTab]);

  // Group by category for "All" tab display
  const grouped = useMemo(() => {
    if (activeTab !== "all") return null;
    const map = new Map<Category, Sticker[]>();
    for (const s of filtered) {
      const arr = map.get(s.category) || [];
      arr.push(s);
      map.set(s.category, arr);
    }
    return map;
  }, [filtered, activeTab]);

  // Recent stickers resolved
  const recentStickers = useMemo(() => {
    return recentIds
      .map((id) => STICKER_MAP.get(id))
      .filter((s): s is Sticker => s !== undefined);
  }, [recentIds]);

  // Insert handler
  const insertSticker = useCallback(
    (sticker: Sticker) => {
      onSendMessage("```\n" + sticker.art + "\n```");
      // Update recent
      setRecentIds((prev) => {
        const next = [sticker.id, ...prev.filter((id) => id !== sticker.id)].slice(0, MAX_RECENT);
        saveRecent(next);
        return next;
      });
    },
    [onSendMessage]
  );

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const renderCard = (sticker: Sticker) => (
    <div
      key={sticker.id}
      className="sticker-card"
      onClick={() => insertSticker(sticker)}
      title={`Insert "${sticker.name}" sticker`}
    >
      <pre className="sticker-card-art">{sticker.art}</pre>
      <div className="sticker-card-name">{sticker.name}</div>
      <div className="sticker-card-insert">
        <span>Insert</span>
      </div>
    </div>
  );

  return (
    <>
      <style>{CSS}</style>
      <div className="sticker-panel-overlay" onClick={onClose}>
        <div className="sticker-panel" onClick={(e) => e.stopPropagation()}>

          {/* Header */}
          <div className="sticker-header">
            <h2>ASCII Stickers</h2>
            <button className="sticker-close-btn" onClick={onClose} aria-label="Close sticker panel">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Search */}
          <div className="sticker-search-row">
            <div className="sticker-search-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <input
              ref={inputRef}
              className="sticker-search-input"
              type="text"
              placeholder="Search stickers..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
          </div>

          {/* Category tabs */}
          <div className="sticker-tabs">
            <button
              className={`sticker-tab ${activeTab === "all" ? "active" : ""}`}
              onClick={() => setActiveTab("all")}
            >
              {CATEGORY_LABELS.all}
            </button>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                className={`sticker-tab ${activeTab === cat ? "active" : ""}`}
                onClick={() => setActiveTab(cat)}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>

          {/* Body */}
          <div className="sticker-body">

            {/* Recently used */}
            {recentStickers.length > 0 && !query.trim() && (
              <>
                <div className="sticker-section-title">Recently Used</div>
                <div className="sticker-recent-row">
                  {recentStickers.map((s) => (
                    <div
                      key={`recent-${s.id}`}
                      className="sticker-recent-chip"
                      onClick={() => insertSticker(s)}
                      title={`Insert "${s.name}"`}
                    >
                      <pre className="sticker-recent-chip-art">{s.art}</pre>
                      <div className="sticker-recent-chip-name">{s.name}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Sticker grid */}
            {activeTab === "all" && grouped ? (
              // Grouped by category
              Array.from(grouped.entries()).map(([cat, stickers]) => (
                <div key={cat}>
                  <div className="sticker-section-title">{CATEGORY_LABELS[cat]}</div>
                  <div className="sticker-grid">
                    {stickers.map(renderCard)}
                  </div>
                </div>
              ))
            ) : filtered.length > 0 ? (
              // Single category or search results
              <div className="sticker-grid">
                {filtered.map(renderCard)}
              </div>
            ) : null}

            {/* Empty state */}
            {filtered.length === 0 && (
              <div className="sticker-empty">
                {query.trim()
                  ? `No stickers matching "${query.trim()}"`
                  : "No stickers in this category"}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
