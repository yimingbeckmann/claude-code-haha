import { useState, useEffect, useCallback, type CSSProperties } from "react";

interface PromptSuggestionProps {
  suggestions: string[];
  onAccept: (suggestion: string) => void;
  visible: boolean;
  inputValue: string;
}

function PromptSuggestion({
  suggestions,
  onAccept,
  visible,
  inputValue,
}: PromptSuggestionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [opacity, setOpacity] = useState(1);

  const isEmpty = inputValue.length === 0;
  const show = visible && isEmpty && suggestions.length > 0;
  const currentSuggestion = suggestions[currentIndex] ?? "";

  // Rotate suggestions every 4s with fade
  useEffect(() => {
    if (!show || suggestions.length <= 1) return;

    const interval = setInterval(() => {
      setOpacity(0);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % suggestions.length);
        setOpacity(1);
      }, 200);
    }, 4000);

    return () => clearInterval(interval);
  }, [show, suggestions.length]);

  // Reset index when suggestions change
  useEffect(() => {
    setCurrentIndex(0);
    setOpacity(1);
  }, [suggestions]);

  // Handle Tab / Right Arrow to accept
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!show) return;
      if (e.key === "Tab" || e.key === "ArrowRight") {
        e.preventDefault();
        onAccept(currentSuggestion);
      }
    },
    [show, currentSuggestion, onAccept],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!show) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 16,
        right: 50,
        height: "38px",
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        gap: 8,
        overflow: "hidden",
      }}
    >
      <span
        style={{
          color: "rgba(255, 255, 255, 0.15)",
          fontFamily: "var(--font-mono, monospace)",
          fontSize: "13px",
          lineHeight: "38px",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          opacity,
          transition: "opacity 0.2s ease-in-out",
          flex: 1,
          minWidth: 0,
        }}
      >
        {currentSuggestion}
      </span>
      <span
        style={{
          color: "rgba(255,255,255,0.12)",
          fontFamily: "var(--font-mono, monospace)",
          fontSize: "10px",
          flexShrink: 0,
          userSelect: "none",
        }}
      >
        Tab ↹
      </span>
    </div>
  );
}

export default PromptSuggestion;
