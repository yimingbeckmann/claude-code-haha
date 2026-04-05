import { useState, useEffect, useCallback, useRef } from "react";

// ============================================================================
// BuddyPanel — /buddy companion system
//
// Deterministic companion generation from a seed (user ID). Each user gets a
// unique species, eyes, hat, rarity, and stats. The companion can be named
// ("hatched") and persists in localStorage.
// ============================================================================

// -- Types ------------------------------------------------------------------

const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"] as const;
type Rarity = (typeof RARITIES)[number];

const SPECIES = [
  "duck", "goose", "blob", "cat", "dragon", "octopus", "owl", "penguin",
  "turtle", "snail", "ghost", "axolotl", "capybara", "cactus", "robot",
  "rabbit", "mushroom", "chonk",
] as const;
type Species = (typeof SPECIES)[number];

const EYES = ["·", "✦", "×", "◉", "@", "°"] as const;
type Eye = (typeof EYES)[number];

const HATS = ["none", "crown", "tophat", "propeller", "halo", "wizard", "beanie", "tinyduck"] as const;
type Hat = (typeof HATS)[number];

const STAT_NAMES = ["DEBUGGING", "PATIENCE", "CHAOS", "WISDOM", "SNARK"] as const;
type StatName = (typeof STAT_NAMES)[number];

type CompanionBones = {
  rarity: Rarity;
  species: Species;
  eye: Eye;
  hat: Hat;
  shiny: boolean;
  stats: Record<StatName, number>;
};

type Companion = CompanionBones & { name: string; personality: string; hatchedAt: number };

// -- PRNG -------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

const RARITY_WEIGHTS: Record<Rarity, number> = { common: 60, uncommon: 25, rare: 10, epic: 4, legendary: 1 };

function rollRarity(rng: () => number): Rarity {
  const total = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (const r of RARITIES) { roll -= RARITY_WEIGHTS[r]; if (roll < 0) return r; }
  return "common";
}

const RARITY_FLOOR: Record<Rarity, number> = { common: 5, uncommon: 15, rare: 25, epic: 35, legendary: 50 };

function rollStats(rng: () => number, rarity: Rarity): Record<StatName, number> {
  const floor = RARITY_FLOOR[rarity];
  const peak = pick(rng, STAT_NAMES);
  let dump = pick(rng, STAT_NAMES);
  while (dump === peak) dump = pick(rng, STAT_NAMES);
  const stats = {} as Record<StatName, number>;
  for (const name of STAT_NAMES) {
    if (name === peak) stats[name] = Math.min(100, floor + 50 + Math.floor(rng() * 30));
    else if (name === dump) stats[name] = Math.max(1, floor - 10 + Math.floor(rng() * 15));
    else stats[name] = floor + Math.floor(rng() * 40);
  }
  return stats;
}

function rollBones(seed: string): CompanionBones {
  const rng = mulberry32(hashString(seed + "friend-2026-401"));
  const rarity = rollRarity(rng);
  return {
    rarity,
    species: pick(rng, SPECIES),
    eye: pick(rng, EYES),
    hat: rarity === "common" ? "none" : pick(rng, HATS),
    shiny: rng() < 0.01,
    stats: rollStats(rng, rarity),
  };
}

// -- Sprites ----------------------------------------------------------------

const BODIES: Record<Species, string[][]> = {
  duck: [
    ["            ", "    __      ", "  <({E} )___  ", "   (  ._>   ", "    `--´    "],
    ["            ", "    __      ", "  <({E} )___  ", "   (  ._>   ", "    `--´~   "],
    ["            ", "    __      ", "  <({E} )___  ", "   (  .__>  ", "    `--´    "],
  ],
  goose: [
    ["            ", "     ({E}>    ", "     ||     ", "   _(__)_   ", "    ^^^^    "],
    ["            ", "    ({E}>     ", "     ||     ", "   _(__)_   ", "    ^^^^    "],
    ["            ", "     ({E}>>   ", "     ||     ", "   _(__)_   ", "    ^^^^    "],
  ],
  blob: [
    ["            ", "   .----.   ", "  ( {E}  {E} )  ", "  (      )  ", "   `----´   "],
    ["            ", "  .------.  ", " (  {E}  {E}  ) ", " (        ) ", "  `------´  "],
    ["            ", "    .--.    ", "   ({E}  {E})   ", "   (    )   ", "    `--´    "],
  ],
  cat: [
    ["            ", "   /\\_/\\    ", "  ( {E}   {E})  ", "  (  ω  )   ", '  (")_(")   '],
    ["            ", "   /\\_/\\    ", "  ( {E}   {E})  ", "  (  ω  )   ", '  (")_(")~  '],
    ["            ", "   /\\-/\\    ", "  ( {E}   {E})  ", "  (  ω  )   ", '  (")_(")   '],
  ],
  dragon: [
    ["            ", "  /^\\  /^\\  ", " <  {E}  {E}  > ", " (   ~~   ) ", "  `-vvvv-´  "],
    ["            ", "  /^\\  /^\\  ", " <  {E}  {E}  > ", " (        ) ", "  `-vvvv-´  "],
    ["   ~    ~   ", "  /^\\  /^\\  ", " <  {E}  {E}  > ", " (   ~~   ) ", "  `-vvvv-´  "],
  ],
  octopus: [
    ["            ", "   .----.   ", "  ( {E}  {E} )  ", "  (______)  ", "  /\\/\\/\\/\\  "],
    ["            ", "   .----.   ", "  ( {E}  {E} )  ", "  (______)  ", "  \\/\\/\\/\\/  "],
    ["     o      ", "   .----.   ", "  ( {E}  {E} )  ", "  (______)  ", "  /\\/\\/\\/\\  "],
  ],
  owl: [
    ["            ", "   /\\  /\\   ", "  (({E})({E}))  ", "  (  ><  )  ", "   `----´   "],
    ["            ", "   /\\  /\\   ", "  (({E})({E}))  ", "  (  ><  )  ", "   .----.   "],
    ["            ", "   /\\  /\\   ", "  (({E})(-))  ", "  (  ><  )  ", "   `----´   "],
  ],
  penguin: [
    ["            ", "  .---.     ", "  ({E}>{E})     ", " /(   )\\    ", "  `---´     "],
    ["            ", "  .---.     ", "  ({E}>{E})     ", " |(   )|    ", "  `---´     "],
    ["  .---.     ", "  ({E}>{E})     ", " /(   )\\    ", "  `---´     ", "   ~ ~      "],
  ],
  turtle: [
    ["            ", "   _,--._   ", "  ( {E}  {E} )  ", " /[______]\\ ", "  ``    ``  "],
    ["            ", "   _,--._   ", "  ( {E}  {E} )  ", " /[______]\\ ", "   ``  ``   "],
    ["            ", "   _,--._   ", "  ( {E}  {E} )  ", " /[======]\\ ", "  ``    ``  "],
  ],
  snail: [
    ["            ", " {E}    .--.  ", "  \\  ( @ )  ", "   \\_`--´   ", "  ~~~~~~~   "],
    ["            ", "  {E}   .--.  ", "  |  ( @ )  ", "   \\_`--´   ", "  ~~~~~~~   "],
    ["            ", " {E}    .--.  ", "  \\  ( @  ) ", "   \\_`--´   ", "   ~~~~~~   "],
  ],
  ghost: [
    ["            ", "   .----.   ", "  / {E}  {E} \\  ", "  |      |  ", "  ~`~``~`~  "],
    ["            ", "   .----.   ", "  / {E}  {E} \\  ", "  |      |  ", "  `~`~~`~`  "],
    ["    ~  ~    ", "   .----.   ", "  / {E}  {E} \\  ", "  |      |  ", "  ~~`~~`~~  "],
  ],
  axolotl: [
    ["            ", "}~(______)~{", "}~({E} .. {E})~{", "  ( .--. )  ", "  (_/  \\_)  "],
    ["            ", "~}(______){~", "~}({E} .. {E}){~", "  ( .--. )  ", "  (_/  \\_)  "],
    ["            ", "}~(______)~{", "}~({E} .. {E})~{", "  (  --  )  ", "  ~_/  \\_~  "],
  ],
  capybara: [
    ["            ", "  n______n  ", " ( {E}    {E} ) ", " (   oo   ) ", "  `------´  "],
    ["            ", "  n______n  ", " ( {E}    {E} ) ", " (   Oo   ) ", "  `------´  "],
    ["    ~  ~    ", "  u______n  ", " ( {E}    {E} ) ", " (   oo   ) ", "  `------´  "],
  ],
  cactus: [
    ["            ", " n  ____  n ", " | |{E}  {E}| | ", " |_|    |_| ", "   |    |   "],
    ["            ", "    ____    ", " n |{E}  {E}| n ", " |_|    |_| ", "   |    |   "],
    [" n        n ", " |  ____  | ", " | |{E}  {E}| | ", " |_|    |_| ", "   |    |   "],
  ],
  robot: [
    ["            ", "   .[||].   ", "  [ {E}  {E} ]  ", "  [ ==== ]  ", "  `------´  "],
    ["            ", "   .[||].   ", "  [ {E}  {E} ]  ", "  [ -==- ]  ", "  `------´  "],
    ["     *      ", "   .[||].   ", "  [ {E}  {E} ]  ", "  [ ==== ]  ", "  `------´  "],
  ],
  rabbit: [
    ["            ", "   (\\__/)   ", "  ( {E}  {E} )  ", " =(  ..  )= ", '  (")__(")  '],
    ["            ", "   (|__/)   ", "  ( {E}  {E} )  ", " =(  ..  )= ", '  (")__(")  '],
    ["            ", "   (\\__/)   ", "  ( {E}  {E} )  ", " =( .  . )= ", '  (")__(")  '],
  ],
  mushroom: [
    ["            ", " .-o-OO-o-. ", "(__________)", "   |{E}  {E}|   ", "   |____|   "],
    ["            ", " .-O-oo-O-. ", "(__________)", "   |{E}  {E}|   ", "   |____|   "],
    ["   . o  .   ", " .-o-OO-o-. ", "(__________)", "   |{E}  {E}|   ", "   |____|   "],
  ],
  chonk: [
    ["            ", "  /\\    /\\  ", " ( {E}    {E} ) ", " (   ..   ) ", "  `------´  "],
    ["            ", "  /\\    /|  ", " ( {E}    {E} ) ", " (   ..   ) ", "  `------´  "],
    ["            ", "  /\\    /\\  ", " ( {E}    {E} ) ", " (   ..   ) ", "  `------´~ "],
  ],
};

const HAT_LINES: Record<Hat, string> = {
  none: "", crown: "   \\^^^/    ", tophat: "   [___]    ", propeller: "    -+-     ",
  halo: "   (   )    ", wizard: "    /^\\     ", beanie: "   (___)    ", tinyduck: "    ,>      ",
};

function renderSprite(bones: CompanionBones, frame = 0): string[] {
  const frames = BODIES[bones.species];
  const body = frames[frame % frames.length]!.map((line) => line.replaceAll("{E}", bones.eye));
  const lines = [...body];
  if (bones.hat !== "none" && !lines[0]!.trim()) lines[0] = HAT_LINES[bones.hat];
  if (!lines[0]!.trim() && frames.every((f) => !f[0]!.trim())) lines.shift();
  return lines;
}

// -- Constants --------------------------------------------------------------

const RARITY_COLORS: Record<Rarity, string> = {
  common: "#888", uncommon: "#4ade80", rare: "#60a5fa", epic: "#c084fc", legendary: "#f59e0b",
};
const RARITY_STARS: Record<Rarity, string> = {
  common: "★", uncommon: "★★", rare: "★★★", epic: "★★★★", legendary: "★★★★★",
};
const RARITY_BG: Record<Rarity, string> = {
  common: "rgba(136,136,136,0.08)", uncommon: "rgba(74,222,128,0.08)",
  rare: "rgba(96,165,250,0.08)", epic: "rgba(192,132,252,0.08)",
  legendary: "rgba(245,158,11,0.1)",
};
const PERSONALITIES = [
  "Cheerful and curious — loves watching you debug",
  "Quietly supportive — nods along to your commits",
  "Snarky but loyal — judges your code, stays anyway",
  "Hyperactive — bounces with every keystroke",
  "Wise and calm — has seen many refactors",
  "Mischievous — hides in your terminal output",
  "Encouraging — celebrates every saved file",
  "Sleepy — dozes off during long builds",
];

const STORAGE_KEY = "tensor-buddy-companion";

const STAT_COLORS: Record<StatName, string> = {
  DEBUGGING: "#60a5fa",
  PATIENCE: "#4ade80",
  CHAOS: "#ef4444",
  WISDOM: "#c084fc",
  SNARK: "#f97316",
};

// -- Egg sprites for hatch animation ----------------------------------------

const EGG_FRAMES: string[][] = [
  // Phase 0: pristine egg
  [
    "    .----.    ",
    "   /      \\   ",
    "  |  ?  ?  |  ",
    "  |        |  ",
    "   \\      /   ",
    "    '----'    ",
  ],
  // Phase 1: wobble left
  [
    "   .----.     ",
    "  /      \\    ",
    " |  ?  ?  |   ",
    " |        |   ",
    "  \\      /    ",
    "   '----'     ",
  ],
  // Phase 2: wobble right + small crack
  [
    "     .----.   ",
    "    / ···  \\  ",
    "   |  ?  ?  | ",
    "   |        | ",
    "    \\      /  ",
    "     '----'   ",
  ],
  // Phase 3: big cracks
  [
    "    .--/\\-.   ",
    "   / ·//·  \\  ",
    "  | ?  \\ ?  | ",
    "  |   /     | ",
    "   \\ /    /   ",
    "    '-\\--'    ",
  ],
  // Phase 4: cracking open
  [
    "      \\  /    ",
    "   .--    --. ",
    "  /  ·    ·  \\",
    "  |    **    |",
    "   \\        / ",
    "    '------'  ",
  ],
  // Phase 5: shattered - empty (buddy will show)
  [
    "    *  · *    ",
    "  ·  ****  ·  ",
    "    *    *    ",
    " ·    **   ·  ",
    "   *      *   ",
    "    · ** ·    ",
  ],
];

// -- Panel ------------------------------------------------------------------

interface BuddyPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function BuddyPanel({ isOpen, onClose }: BuddyPanelProps) {
  const [companion, setCompanion] = useState<Companion | null>(null);
  const [bones, setBones] = useState<CompanionBones | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [frame, setFrame] = useState(0);
  const [hatching, setHatching] = useState(false);
  const [hatchPhase, setHatchPhase] = useState(0);
  const [revealAnim, setRevealAnim] = useState(false);
  const [petAnim, setPetAnim] = useState(false);
  const [muted, setMuted] = useState(() => localStorage.getItem(STORAGE_KEY + "-muted") === "true");
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  // Load from storage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const b = rollBones(parsed.seed || "anon");
        setCompanion({ ...b, name: parsed.name, personality: parsed.personality, hatchedAt: parsed.hatchedAt });
        setBones(b);
      } catch { /* ignore corrupt data */ }
    } else {
      const seed = `user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const b = rollBones(seed);
      setBones(b);
      localStorage.setItem(STORAGE_KEY + "-seed", seed);
    }
  }, []);

  // Animation tick
  useEffect(() => {
    if (!isOpen) return;
    const id = setInterval(() => setFrame((f) => f + 1), 600);
    return () => clearInterval(id);
  }, [isOpen]);

  // Hatch animation — 6 phases over 3s, then reveal
  useEffect(() => {
    if (!hatching) return;
    let i = 0;
    const id = setInterval(() => {
      i++;
      if (i < EGG_FRAMES.length) {
        setHatchPhase(i);
      } else {
        clearInterval(id);
        setHatching(false);
        setHatchPhase(0);
        setRevealAnim(true);
        setTimeout(() => setRevealAnim(false), 1200);
      }
    }, 500);
    return () => clearInterval(id);
  }, [hatching]);

  // Focus rename input when entering rename mode
  useEffect(() => {
    if (renaming) renameRef.current?.focus();
  }, [renaming]);

  const handleHatch = useCallback(() => {
    if (!bones || !nameInput.trim()) return;
    const seed = localStorage.getItem(STORAGE_KEY + "-seed") || "anon";
    const rng = mulberry32(hashString(seed + "personality"));
    const personality = PERSONALITIES[Math.floor(rng() * PERSONALITIES.length)]!;
    const comp: Companion = { ...bones, name: nameInput.trim(), personality, hatchedAt: Date.now() };
    setHatching(true);
    setHatchPhase(0);
    // Companion is set after egg animation completes (in the useEffect above)
    const totalDelay = EGG_FRAMES.length * 500;
    setTimeout(() => {
      setCompanion(comp);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ seed, name: comp.name, personality: comp.personality, hatchedAt: comp.hatchedAt }));
    }, totalDelay);
  }, [bones, nameInput]);

  const handlePet = useCallback(() => {
    setPetAnim(true);
    setTimeout(() => setPetAnim(false), 2000);
  }, []);

  const handleMuteToggle = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      localStorage.setItem(STORAGE_KEY + "-muted", String(next));
      return next;
    });
  }, []);

  const handleRenameStart = useCallback(() => {
    if (!companion) return;
    setRenameValue(companion.name);
    setRenaming(true);
  }, [companion]);

  const handleRenameConfirm = useCallback(() => {
    if (!companion || !renameValue.trim()) return;
    const newName = renameValue.trim();
    const updated = { ...companion, name: newName };
    setCompanion(updated);
    setRenaming(false);
    // Persist
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        parsed.name = newName;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      } catch { /* ignore */ }
    }
  }, [companion, renameValue]);

  const handleRenameCancel = useCallback(() => {
    setRenaming(false);
  }, []);

  const handleRelease = useCallback(() => {
    setCompanion(null);
    localStorage.removeItem(STORAGE_KEY);
    const seed = `user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const b = rollBones(seed);
    setBones(b);
    localStorage.setItem(STORAGE_KEY + "-seed", seed);
    setNameInput("");
  }, []);

  if (!isOpen) return null;

  const activeBones = companion || bones;
  if (!activeBones) return null;

  // Show egg during hatching, buddy sprite otherwise
  const showEgg = hatching || (!companion && !revealAnim);
  const sprite = showEgg
    ? (hatching ? EGG_FRAMES[hatchPhase] ?? EGG_FRAMES[0]! : EGG_FRAMES[0]!)
    : renderSprite(activeBones, frame);
  const rarityColor = RARITY_COLORS[activeBones.rarity];
  const rarityBg = RARITY_BG[activeBones.rarity];

  return (
    <>
      <style>{STYLE}</style>
      <div className="buddy-overlay" onClick={onClose}>
        <div className="buddy-panel" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="buddy-header">
            <span className="buddy-header-title">
              {companion ? companion.name : "Hatch Your Buddy"}
            </span>
            <button className="buddy-close" onClick={onClose}>×</button>
          </div>

          {/* Info card (hatched buddy) */}
          {companion && (
            <div className="buddy-info-card">
              <div className="buddy-info-card-row">
                {renaming ? (
                  <div className="buddy-rename-inline">
                    <input
                      ref={renameRef}
                      className="buddy-name-input buddy-rename-input"
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameConfirm();
                        if (e.key === "Escape") handleRenameCancel();
                      }}
                      maxLength={20}
                    />
                    <button className="buddy-action-btn buddy-action-btn--small" onClick={handleRenameConfirm}>Save</button>
                    <button className="buddy-action-btn buddy-action-btn--small" onClick={handleRenameCancel}>Cancel</button>
                  </div>
                ) : (
                  <div className="buddy-info-card-name">
                    <span className="buddy-info-card-label">Name</span>
                    <span className="buddy-info-card-value">{companion.name}</span>
                    <button className="buddy-rename-btn" onClick={handleRenameStart} title="Rename">✎</button>
                  </div>
                )}
              </div>
              <div className="buddy-info-card-row">
                <span className="buddy-info-card-label">Species</span>
                <span className="buddy-info-card-value buddy-info-species">{activeBones.species}</span>
              </div>
              <div className="buddy-info-card-row">
                <span className="buddy-info-card-label">Rarity</span>
                <span className="buddy-info-card-value" style={{ color: rarityColor }}>
                  {RARITY_STARS[activeBones.rarity]} {activeBones.rarity.toUpperCase()}
                </span>
                {activeBones.shiny && <span className="buddy-shiny-badge">✧ SHINY</span>}
              </div>
              {companion.hatchedAt && (
                <div className="buddy-info-card-row">
                  <span className="buddy-info-card-label">Hatched</span>
                  <span className="buddy-info-card-value">{new Date(companion.hatchedAt).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          )}

          {/* Sprite Card */}
          <div className="buddy-card" style={{ borderColor: rarityColor, background: rarityBg }}>
            {/* Rarity badge (only shown for unhatched preview) */}
            {!companion && (
              <div className="buddy-rarity" style={{ color: rarityColor }}>
                {RARITY_STARS[activeBones.rarity]} {activeBones.rarity.toUpperCase()}
                {activeBones.shiny && <span className="buddy-shiny"> ✧ SHINY</span>}
              </div>
            )}

            {/* ASCII sprite or egg */}
            <pre
              className={[
                "buddy-sprite",
                petAnim ? "buddy-sprite--pet" : "",
                hatching ? "buddy-sprite--hatch" : "",
                revealAnim ? "buddy-sprite--reveal" : "",
                showEgg && !hatching ? "buddy-sprite--egg-idle" : "",
              ].filter(Boolean).join(" ")}
              onClick={companion ? handlePet : undefined}
              style={{ cursor: companion ? "pointer" : "default" }}
            >
              {sprite.join("\n")}
            </pre>

            {/* Species label */}
            {!showEgg && <div className="buddy-species">{activeBones.species}</div>}

            {/* Pet hearts */}
            {petAnim && <div className="buddy-hearts">♥ ♥ ♥</div>}
          </div>

          {/* Stats */}
          <div className="buddy-stats">
            {STAT_NAMES.map((stat) => (
              <div key={stat} className="buddy-stat-row">
                <span className="buddy-stat-name" style={{ color: STAT_COLORS[stat] }}>{stat}</span>
                <div className="buddy-stat-bar-bg">
                  <div
                    className="buddy-stat-bar-fill"
                    style={{
                      width: `${activeBones.stats[stat]}%`,
                      background: STAT_COLORS[stat],
                    }}
                  />
                </div>
                <span className="buddy-stat-val">{activeBones.stats[stat]}</span>
              </div>
            ))}
          </div>

          {/* Personality (if hatched) */}
          {companion && (
            <div className="buddy-personality">
              <span className="buddy-personality-label">Personality:</span> {companion.personality}
            </div>
          )}

          {/* Hatch form or actions */}
          {!companion ? (
            <div className="buddy-hatch-area">
              {hatching ? (
                <p className="buddy-hatch-text buddy-hatch-text--active">Your egg is hatching...</p>
              ) : (
                <>
                  <p className="buddy-hatch-text">Give your companion a name to hatch it!</p>
                  <div className="buddy-hatch-form">
                    <input
                      ref={inputRef}
                      className="buddy-name-input"
                      type="text"
                      placeholder="Enter a name..."
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleHatch(); }}
                      maxLength={20}
                      autoFocus
                    />
                    <button
                      className="buddy-hatch-btn"
                      onClick={handleHatch}
                      disabled={!nameInput.trim() || hatching}
                    >
                      Hatch Your Buddy
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="buddy-actions">
              <button className="buddy-action-btn buddy-action-btn--pet" onClick={handlePet}>Pet</button>
              <button className="buddy-action-btn" onClick={handleMuteToggle}>
                {muted ? "Unmute" : "Mute"}
              </button>
              <button className="buddy-action-btn" onClick={handleRenameStart}>Rename</button>
              <button className="buddy-action-btn buddy-action-btn--danger" onClick={handleRelease}>Release</button>
            </div>
          )}

          {/* Footer info */}
          <div className="buddy-info">
            {companion && muted && (
              <span className="buddy-muted-indicator">Muted</span>
            )}
            <span style={{ opacity: 0.4 }}>
              {companion ? "Click the sprite to pet!" : "A mystery awaits inside the egg..."}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

// -- Styles -----------------------------------------------------------------

const STYLE = `
.buddy-overlay {
  position: fixed;
  inset: 0;
  z-index: 6000;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
}

.buddy-panel {
  background: var(--bg-primary, #0d1117);
  border: 1px solid var(--border, #21262d);
  border-radius: 12px;
  width: 400px;
  max-height: 85vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.buddy-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border, #21262d);
}

.buddy-header-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, #e6edf3);
  font-family: var(--font-mono, monospace);
}

.buddy-close {
  background: none;
  border: none;
  color: var(--text-dim, #484f58);
  font-size: 20px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  transition: color 0.15s;
}
.buddy-close:hover { color: var(--text-primary, #e6edf3); }

/* -- Info card ------------------------------------------------------------- */

.buddy-info-card {
  margin: 12px 18px 0;
  padding: 10px 14px;
  background: var(--bg-secondary, #161b22);
  border: 1px solid var(--border, #21262d);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.buddy-info-card-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.buddy-info-card-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-dim, #484f58);
  font-family: var(--font-mono, monospace);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  width: 56px;
  flex-shrink: 0;
}

.buddy-info-card-value {
  font-size: 13px;
  color: var(--text-primary, #e6edf3);
  font-family: var(--font-mono, monospace);
}

.buddy-info-species {
  text-transform: capitalize;
}

.buddy-info-card-name {
  display: flex;
  align-items: center;
  gap: 8px;
}

.buddy-rename-btn {
  background: none;
  border: none;
  color: var(--text-dim, #484f58);
  font-size: 13px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  transition: color 0.15s;
}
.buddy-rename-btn:hover {
  color: var(--accent, #f97316);
}

.buddy-rename-inline {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
}

.buddy-rename-input {
  width: 120px;
  flex: 0 1 auto;
}

.buddy-shiny-badge {
  color: #fbbf24;
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-mono, monospace);
  margin-left: 4px;
  animation: buddy-sparkle 2s ease-in-out infinite;
}

@keyframes buddy-sparkle {
  0%, 100% { opacity: 1; text-shadow: 0 0 4px rgba(251, 191, 36, 0.6); }
  25% { opacity: 0.7; text-shadow: 0 0 8px rgba(251, 191, 36, 0.9); }
  50% { opacity: 1; text-shadow: 0 0 12px rgba(251, 191, 36, 1); }
  75% { opacity: 0.8; text-shadow: 0 0 6px rgba(251, 191, 36, 0.7); }
}

/* -- Sprite card ----------------------------------------------------------- */

.buddy-card {
  margin: 12px 16px;
  padding: 16px;
  border: 1px solid;
  border-radius: 8px;
  text-align: center;
  position: relative;
}

.buddy-rarity {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  margin-bottom: 8px;
  font-family: var(--font-mono, monospace);
}

.buddy-shiny {
  color: #fbbf24;
  animation: buddy-shimmer 1.5s ease-in-out infinite;
}

@keyframes buddy-shimmer {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.buddy-sprite {
  font-family: var(--font-mono, monospace);
  font-size: 14px;
  line-height: 1.3;
  color: var(--text-primary, #e6edf3);
  margin: 8px auto;
  white-space: pre;
  display: inline-block;
  transition: transform 0.2s, opacity 0.3s;
  user-select: none;
}

.buddy-sprite--pet {
  animation: buddy-bounce 0.3s ease-out 3;
}

.buddy-sprite--hatch {
  animation: buddy-egg-crack 0.5s ease-in-out infinite;
}

.buddy-sprite--reveal {
  animation: buddy-reveal 1.2s ease-out forwards;
}

.buddy-sprite--egg-idle {
  animation: buddy-egg-breathe 2s ease-in-out infinite;
}

@keyframes buddy-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

@keyframes buddy-egg-crack {
  0%, 100% { transform: rotate(0) scale(1); }
  20% { transform: rotate(-4deg) scale(1.02); }
  40% { transform: rotate(5deg) scale(1.04); }
  60% { transform: rotate(-6deg) scale(1.02); }
  80% { transform: rotate(3deg) scale(1.06); }
}

@keyframes buddy-egg-breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.03); }
}

@keyframes buddy-reveal {
  0% {
    opacity: 0;
    transform: scale(0.3) rotate(-10deg);
    filter: brightness(2);
  }
  40% {
    opacity: 1;
    transform: scale(1.2) rotate(5deg);
    filter: brightness(1.5);
  }
  70% {
    transform: scale(0.95) rotate(-2deg);
    filter: brightness(1.1);
  }
  100% {
    transform: scale(1) rotate(0);
    filter: brightness(1);
  }
}

.buddy-species {
  font-size: 12px;
  color: var(--text-secondary, #8b949e);
  text-transform: capitalize;
  margin-top: 4px;
  font-family: var(--font-mono, monospace);
}

.buddy-hearts {
  position: absolute;
  top: 30%;
  left: 50%;
  transform: translateX(-50%);
  color: #ef4444;
  font-size: 18px;
  animation: buddy-hearts-float 2s ease-out forwards;
  pointer-events: none;
}

@keyframes buddy-hearts-float {
  0% { opacity: 1; transform: translateX(-50%) translateY(0); }
  100% { opacity: 0; transform: translateX(-50%) translateY(-30px); }
}

/* -- Stats ----------------------------------------------------------------- */

.buddy-stats {
  padding: 0 18px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.buddy-stat-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.buddy-stat-name {
  font-size: 10px;
  font-weight: 600;
  width: 72px;
  text-align: right;
  font-family: var(--font-mono, monospace);
  letter-spacing: 0.04em;
}

.buddy-stat-bar-bg {
  flex: 1;
  height: 6px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  overflow: hidden;
}

.buddy-stat-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.5s ease-out;
}

.buddy-stat-val {
  font-size: 10px;
  color: var(--text-secondary, #8b949e);
  width: 24px;
  text-align: right;
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
}

/* -- Personality ----------------------------------------------------------- */

.buddy-personality {
  padding: 0 18px 12px;
  font-size: 12px;
  color: var(--text-secondary, #8b949e);
  font-style: italic;
  background: rgba(255, 255, 255, 0.02);
  margin: 0 18px 12px;
  padding: 10px 14px;
  border-radius: 6px;
  border-left: 3px solid var(--border, #21262d);
}

.buddy-personality-label {
  color: var(--text-dim, #484f58);
  font-style: normal;
  font-weight: 600;
}

/* -- Hatch area ------------------------------------------------------------ */

.buddy-hatch-area {
  padding: 0 18px 16px;
  text-align: center;
}

.buddy-hatch-text {
  font-size: 12px;
  color: var(--text-secondary, #8b949e);
  margin: 0 0 10px;
}

.buddy-hatch-text--active {
  color: var(--accent, #f97316);
  animation: buddy-pulse-text 1s ease-in-out infinite;
}

@keyframes buddy-pulse-text {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.buddy-hatch-form {
  display: flex;
  gap: 8px;
}

.buddy-name-input {
  flex: 1;
  background: var(--bg-secondary, #161b22);
  border: 1px solid var(--border, #21262d);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 13px;
  color: var(--text-primary, #e6edf3);
  font-family: var(--font-mono, monospace);
  outline: none;
  transition: border-color 0.15s;
}

.buddy-name-input:focus {
  border-color: var(--accent, #f97316);
}

.buddy-hatch-btn {
  background: var(--accent, #f97316);
  color: #000;
  border: none;
  border-radius: 6px;
  padding: 6px 16px;
  font-size: 12px;
  font-weight: 600;
  font-family: var(--font-mono, monospace);
  cursor: pointer;
  transition: opacity 0.15s;
  white-space: nowrap;
}

.buddy-hatch-btn:hover { opacity: 0.9; }
.buddy-hatch-btn:disabled { opacity: 0.4; cursor: default; }

/* -- Actions --------------------------------------------------------------- */

.buddy-actions {
  display: flex;
  gap: 8px;
  padding: 0 18px 16px;
  justify-content: center;
  flex-wrap: wrap;
}

.buddy-action-btn {
  background: var(--bg-secondary, #161b22);
  border: 1px solid var(--border, #21262d);
  border-radius: 6px;
  padding: 6px 14px;
  font-size: 12px;
  color: var(--text-secondary, #8b949e);
  font-family: var(--font-mono, monospace);
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}

.buddy-action-btn:hover {
  border-color: var(--accent, #f97316);
  color: var(--text-primary, #e6edf3);
}

.buddy-action-btn--small {
  padding: 4px 10px;
  font-size: 11px;
}

.buddy-action-btn--pet:hover {
  border-color: #ef4444;
  color: #ef4444;
}

.buddy-action-btn--danger:hover {
  border-color: #ef4444;
  color: #ef4444;
}

/* -- Footer info ----------------------------------------------------------- */

.buddy-info {
  padding: 8px 18px 14px;
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--text-dim, #484f58);
  font-family: var(--font-mono, monospace);
}

.buddy-muted-indicator {
  color: var(--text-dim, #484f58);
  font-style: italic;
}
`;
