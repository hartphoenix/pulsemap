import { useCallback, type CSSProperties } from "react";
import type { ValidationIssue } from "../validation/types";
import type { EditorDispatchAction } from "../state/types";

interface ValidationPanelProps {
  issues: ValidationIssue[];
  dispatch: (action: EditorDispatchAction) => void;
}

export function ValidationPanel({ issues, dispatch }: ValidationPanelProps) {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  const handleClick = useCallback(
    (issue: ValidationIssue) => {
      if (issue.lane != null && issue.index != null) {
        dispatch({
          type: "select",
          selection: { lane: issue.lane, index: issue.index },
        });
      }
    },
    [dispatch],
  );

  if (issues.length === 0) {
    return (
      <div style={styles.panel}>
        <div style={styles.clean}>No issues</div>
      </div>
    );
  }

  return (
    <div style={styles.panel}>
      <div style={styles.summary}>
        {errors.length > 0 && (
          <span style={styles.errorCount}>
            {errors.length} error{errors.length !== 1 ? "s" : ""}
          </span>
        )}
        {warnings.length > 0 && (
          <span style={styles.warningCount}>
            {warnings.length} warning{warnings.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <div style={styles.list}>
        {issues.map((issue, i) => (
          <div
            key={`${issue.lane ?? "map"}-${issue.index ?? "x"}-${i}`}
            style={{
              ...styles.item,
              cursor: issue.lane != null && issue.index != null ? "pointer" : "default",
            }}
            onClick={() => handleClick(issue)}
          >
            <span
              style={{
                ...styles.icon,
                color: issue.severity === "error" ? "#ff4444" : "#ffaa00",
              }}
            >
              {issue.severity === "error" ? "●" : "▲"}
            </span>
            <span style={styles.msg}>
              {issue.lane && (
                <span style={styles.lane}>{issue.lane}</span>
              )}
              {issue.index != null && (
                <span style={styles.idx}>#{issue.index}</span>
              )}
              {issue.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  panel: {
    fontSize: 12,
    color: "#ccc",
  },
  clean: {
    color: "#4ade80",
    fontSize: 12,
    padding: "4px 0",
  },
  summary: {
    display: "flex",
    gap: 10,
    padding: "4px 0 6px",
  },
  errorCount: {
    color: "#ff4444",
    fontWeight: 600,
  },
  warningCount: {
    color: "#ffaa00",
    fontWeight: 600,
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    maxHeight: 160,
    overflowY: "auto",
  },
  item: {
    display: "flex",
    alignItems: "flex-start",
    gap: 6,
    padding: "3px 6px",
    borderRadius: 3,
    lineHeight: "1.3",
  },
  icon: {
    flexShrink: 0,
    fontSize: 10,
    marginTop: 2,
  },
  msg: {
    display: "inline",
  },
  lane: {
    fontWeight: 600,
    textTransform: "capitalize" as const,
    marginRight: 4,
  },
  idx: {
    color: "#888",
    fontFamily: "monospace",
    fontSize: 11,
    marginRight: 4,
  },
};
