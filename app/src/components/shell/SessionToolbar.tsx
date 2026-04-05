/**
 * SessionToolbar is no longer rendered as a separate bar.
 * All its functionality (preview, diff stats, review, rename) has been
 * merged into LogoHeader for a cleaner single-bar layout.
 *
 * This stub is kept so existing imports compile without changes.
 */

interface SessionToolbarProps {
  sessionTitle: string;
  onRename: (newTitle: string) => void;
  linesAdded: number;
  linesRemoved: number;
  onOpenDiff: () => void;
  onOpenPreview: (action: "start" | "stop" | "configure") => void;
  onReviewCode: () => void;
}

export default function SessionToolbar(_props: SessionToolbarProps) {
  // Intentionally renders nothing -- all toolbar UI now lives in LogoHeader
  return null;
}
