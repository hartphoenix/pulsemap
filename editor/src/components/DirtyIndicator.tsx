import type { CSSProperties } from "react";

interface DirtyIndicatorProps {
  dirty: boolean;
  editCount: number;
}

export function DirtyIndicator({ dirty, editCount }: DirtyIndicatorProps) {
  if (!dirty) return null;

  return (
    <span style={styles.indicator}>
      <span style={styles.dot} />
      Unsaved ({editCount} edit{editCount !== 1 ? "s" : ""})
    </span>
  );
}

const styles: Record<string, CSSProperties> = {
  indicator: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
    color: "#ffcc00",
  },
  dot: {
    display: "inline-block",
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#ffcc00",
  },
};
