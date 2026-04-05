import { useState, useEffect, useRef, useMemo } from "react";

interface SpinnerProps {
  verb?: string;
  toolName?: string;
  startTime?: number;
  tokenCount?: number;
}

const GLYPHS = ['\u28CB', '\u28D9', '\u28F9', '\u28F8', '\u28FC', '\u28F4', '\u28E6', '\u28E7', '\u28C7', '\u28CF'];

const SPINNER_VERBS = [
  'Accomplishing', 'Architecting', 'Baking', "Beboppin'", 'Befuddling',
  'Bloviating', 'Boondoggling', 'Bootstrapping', 'Brewing', 'Calculating',
  'Canoodling', 'Caramelizing', 'Cerebrating', 'Churning', 'Clauding',
  'Cogitating', 'Combobulating', 'Computing', 'Concocting', 'Contemplating',
  'Cooking', 'Crafting', 'Crunching', 'Crystallizing', 'Deciphering',
  'Deliberating', 'Distilling', 'Dreaming', 'Emanating', 'Enchanting',
  'Engineering', 'Fabricating', 'Fermenting', 'Fiddle-faddling',
  'Finagling', 'Forging', 'Formulating', 'Fossicking', 'Galvanizing',
  'Generating', 'Germinating', 'Hatching', 'Herding', 'Hypothesizing',
  'Illuminating', 'Imagining', 'Incubating', 'Iterating', 'Manifesting',
  'Marinating', 'Musing', 'Noodling', 'Orchestrating', 'Percolating',
  'Pondering', 'Processing', 'Puzzling', 'Reckoning', 'Reflecting',
  'Ruminating', 'Simmering', 'Synthesizing', 'Tinkering', 'Transmuting',
  'Unraveling', 'Weaving', 'Wrangling',
];

function formatDuration(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rs = Math.round(s % 60);
  return `${m}m ${rs}s`;
}

/** Match CLI's formatNumber — compact lowercase: 900, 1.3k, 12k, 1.2M */
function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  const formatted = n.toLocaleString("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  });
  // toLocaleString gives uppercase K/M — CLI uses lowercase
  return formatted.replace('K', 'k').replace('M', 'm');
}

const SHOW_TOKENS_AFTER_MS = 400;

export default function Spinner({ verb, toolName, startTime, tokenCount }: SpinnerProps) {
  const [frame, setFrame] = useState(0);
  const startRef = useRef(startTime || Date.now());
  const [elapsed, setElapsed] = useState(0);
  const displayedTokensRef = useRef(0);
  const [displayedTokens, setDisplayedTokens] = useState(0);

  const randomVerb = useMemo(() =>
    SPINNER_VERBS[Math.floor(Math.random() * SPINNER_VERBS.length)],
  []);

  useEffect(() => {
    const id = setInterval(() => {
      setFrame(f => (f + 1) % GLYPHS.length);
      setElapsed(Date.now() - startRef.current);
      // Smooth token counter animation — like CLI's SpinnerAnimationRow
      const target = tokenCount || 0;
      if (target > displayedTokensRef.current) {
        const gap = target - displayedTokensRef.current;
        const increment = gap < 70 ? 3 : gap < 200 ? Math.max(8, Math.ceil(gap * 0.15)) : 50;
        displayedTokensRef.current = Math.min(displayedTokensRef.current + increment, target);
        setDisplayedTokens(displayedTokensRef.current);
      }
    }, 80);
    return () => clearInterval(id);
  }, [tokenCount]);

  const label = verb
    ? verb.replace(/\.+…?$/, '').replace(/…$/, '')
    : toolName
      ? `Using ${toolName}`
      : randomVerb;

  // Phoenix fire colors — deep orange → crimson → dark red over time
  const color = elapsed > 6000
    ? '#cc1100'   // deep ember
    : elapsed > 3000
      ? '#e03000'   // crimson fire
      : '#ff4500';  // orange-red phoenix

  const showTokens = elapsed > SHOW_TOKENS_AFTER_MS && displayedTokens > 0;

  return (
    <>
      <style>{`
        @keyframes cc-shimmer-text {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .cc-spinner-label-shimmer {
          background: linear-gradient(
            90deg,
            #e83600 0%,
            #e83600 30%,
            #ffffff 50%,
            #e83600 70%,
            #e83600 100%
          );
          background-size: 200% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: cc-shimmer-text 4s ease-in-out infinite;
        }
      `}</style>
      <div className="cc-spinner">
        <span className="cc-spinner-glyph" style={{ color }}>{GLYPHS[frame]}</span>
        <span className="cc-spinner-label cc-spinner-label-shimmer">{label}...</span>
        {elapsed > 1000 && (
          <span className="cc-spinner-time">{formatDuration(elapsed)}</span>
        )}
        {showTokens && (
          <span className="cc-spinner-tokens">{"\u2193"} {formatTokens(displayedTokens)} tokens</span>
        )}
      </div>
    </>
  );
}
