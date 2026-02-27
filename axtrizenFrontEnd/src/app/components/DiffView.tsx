"use client";

import React, { useState } from "react";

// ── Diff View — Shows before/after file changes ───────────────────────

interface DiffLine {
  type: "added" | "removed" | "unchanged" | "header";
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

interface FileDiff {
  path: string;
  status: "added" | "modified" | "deleted";
  lines: DiffLine[];
}

interface DiffViewProps {
  diffs: FileDiff[];
  mode?: "unified" | "split";
  onClose?: () => void;
}

const STATUS_ICONS: Record<FileDiff["status"], { icon: string; color: string }> = {
  added: { icon: "➕", color: "rgba(34, 197, 94, 0.8)" },
  modified: { icon: "✏️", color: "rgba(251, 191, 36, 0.8)" },
  deleted: { icon: "❌", color: "rgba(239, 68, 68, 0.8)" },
};

export function DiffView({ diffs, onClose }: DiffViewProps) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(
    new Set(diffs.map((d) => d.path)),
  );

  const toggleFile = (path: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const addedCount = diffs.filter((d) => d.status === "added").length;
  const modifiedCount = diffs.filter((d) => d.status === "modified").length;
  const deletedCount = diffs.filter((d) => d.status === "deleted").length;

  return (
    <div
      style={{
        borderRadius: "12px",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        background: "rgba(15, 15, 20, 0.95)",
        overflow: "hidden",
        maxHeight: "60vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "12px 16px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          background: "rgba(255, 255, 255, 0.03)",
        }}
      >
        <span style={{ fontSize: "16px" }}>📊</span>
        <span style={{ fontSize: "14px", fontWeight: 600, color: "rgba(255, 255, 255, 0.9)" }}>
          Changes
        </span>
        <div style={{ display: "flex", gap: "8px", marginLeft: "auto", fontSize: "11px" }}>
          {addedCount > 0 && (
            <span style={{ color: "rgba(34, 197, 94, 0.8)" }}>+{addedCount} added</span>
          )}
          {modifiedCount > 0 && (
            <span style={{ color: "rgba(251, 191, 36, 0.8)" }}>{modifiedCount} modified</span>
          )}
          {deletedCount > 0 && (
            <span style={{ color: "rgba(239, 68, 68, 0.8)" }}>-{deletedCount} deleted</span>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "rgba(255, 255, 255, 0.4)",
              cursor: "pointer",
              fontSize: "14px",
              padding: "2px 6px",
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* File diffs */}
      <div style={{ overflow: "auto", flex: 1 }}>
        {diffs.map((diff) => {
          const statusInfo = STATUS_ICONS[diff.status];
          const isExpanded = expandedFiles.has(diff.path);
          const filename = diff.path.split("/").pop() || diff.path;

          return (
            <div key={diff.path}>
              {/* File header */}
              <div
                onClick={() => toggleFile(diff.path)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 16px",
                  cursor: "pointer",
                  borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
                  background: "rgba(255, 255, 255, 0.02)",
                  fontSize: "13px",
                  userSelect: "none",
                }}
              >
                <span style={{ fontSize: "10px", opacity: 0.5 }}>{isExpanded ? "▼" : "▶"}</span>
                <span>{statusInfo.icon}</span>
                <span style={{ color: statusInfo.color, fontWeight: 500 }}>{filename}</span>
                <span
                  style={{
                    color: "rgba(255, 255, 255, 0.3)",
                    fontSize: "11px",
                    fontFamily: "monospace",
                  }}
                >
                  {diff.path}
                </span>
              </div>

              {/* Diff lines */}
              {isExpanded && (
                <div
                  style={{
                    fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
                    fontSize: "12px",
                    lineHeight: 1.5,
                    borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
                  }}
                >
                  {diff.lines.map((line, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        background:
                          line.type === "added"
                            ? "rgba(34, 197, 94, 0.08)"
                            : line.type === "removed"
                              ? "rgba(239, 68, 68, 0.08)"
                              : line.type === "header"
                                ? "rgba(139, 92, 246, 0.06)"
                                : "transparent",
                        borderLeft:
                          line.type === "added"
                            ? "3px solid rgba(34, 197, 94, 0.5)"
                            : line.type === "removed"
                              ? "3px solid rgba(239, 68, 68, 0.5)"
                              : "3px solid transparent",
                      }}
                    >
                      {/* Line numbers */}
                      <span
                        style={{
                          display: "inline-block",
                          width: "36px",
                          textAlign: "right",
                          padding: "0 8px 0 4px",
                          color: "rgba(255, 255, 255, 0.2)",
                          userSelect: "none",
                          flexShrink: 0,
                        }}
                      >
                        {line.oldLineNo || ""}
                      </span>
                      <span
                        style={{
                          display: "inline-block",
                          width: "36px",
                          textAlign: "right",
                          padding: "0 8px 0 0",
                          color: "rgba(255, 255, 255, 0.2)",
                          userSelect: "none",
                          flexShrink: 0,
                        }}
                      >
                        {line.newLineNo || ""}
                      </span>
                      {/* Prefix */}
                      <span
                        style={{
                          width: "16px",
                          textAlign: "center",
                          color:
                            line.type === "added"
                              ? "rgba(34, 197, 94, 0.8)"
                              : line.type === "removed"
                                ? "rgba(239, 68, 68, 0.8)"
                                : "transparent",
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
                      </span>
                      {/* Content */}
                      <span
                        style={{
                          whiteSpace: "pre",
                          color:
                            line.type === "header"
                              ? "rgba(139, 92, 246, 0.7)"
                              : "rgba(255, 255, 255, 0.75)",
                          padding: "0 8px",
                        }}
                      >
                        {line.content}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Diff Generator — Create diffs from before/after content ────────────

export function generateDiff(oldContent: string, newContent: string, filePath: string): FileDiff {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const diffLines: DiffLine[] = [];

  // Simple LCS-based diff
  const lcs = computeLCS(oldLines, newLines);
  let oldIdx = 0;
  let newIdx = 0;

  diffLines.push({
    type: "header",
    content: `@@ ${filePath} @@`,
  });

  for (const match of lcs) {
    // Lines removed (in old but not matched yet)
    while (oldIdx < match.oldIndex) {
      diffLines.push({
        type: "removed",
        content: oldLines[oldIdx],
        oldLineNo: oldIdx + 1,
      });
      oldIdx++;
    }
    // Lines added (in new but not matched yet)
    while (newIdx < match.newIndex) {
      diffLines.push({
        type: "added",
        content: newLines[newIdx],
        newLineNo: newIdx + 1,
      });
      newIdx++;
    }
    // Unchanged
    diffLines.push({
      type: "unchanged",
      content: oldLines[oldIdx],
      oldLineNo: oldIdx + 1,
      newLineNo: newIdx + 1,
    });
    oldIdx++;
    newIdx++;
  }

  // Remaining removed
  while (oldIdx < oldLines.length) {
    diffLines.push({ type: "removed", content: oldLines[oldIdx], oldLineNo: oldIdx + 1 });
    oldIdx++;
  }
  // Remaining added
  while (newIdx < newLines.length) {
    diffLines.push({ type: "added", content: newLines[newIdx], newLineNo: newIdx + 1 });
    newIdx++;
  }

  const hasChanges = diffLines.some((l) => l.type === "added" || l.type === "removed");
  return {
    path: filePath,
    status: oldContent === "" ? "added" : newContent === "" ? "deleted" : "modified",
    lines: hasChanges ? diffLines : [{ type: "header", content: "No changes" }],
  };
}

// Simple LCS for diffing
function computeLCS(a: string[], b: string[]): Array<{ oldIndex: number; newIndex: number }> {
  const m = a.length;
  const n = b.length;

  // For very large files, use a simpler approach
  if (m * n > 100000) {
    return simpleMatch(a, b);
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack
  const result: Array<{ oldIndex: number; newIndex: number }> = [];
  let i = m,
    j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift({ oldIndex: i - 1, newIndex: j - 1 });
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return result;
}

function simpleMatch(a: string[], b: string[]): Array<{ oldIndex: number; newIndex: number }> {
  const result: Array<{ oldIndex: number; newIndex: number }> = [];
  let j = 0;
  for (let i = 0; i < a.length && j < b.length; i++) {
    if (a[i] === b[j]) {
      result.push({ oldIndex: i, newIndex: j });
      j++;
    }
  }
  return result;
}
