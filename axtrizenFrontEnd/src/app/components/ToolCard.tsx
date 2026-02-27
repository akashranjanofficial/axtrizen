"use client";

import React, { useState } from "react";
import { FileBrowser } from "./FileBrowser";

// ── Tool Card — displays tool use events (bash, file ops, etc.) ────────

interface ToolCardProps {
  agentName: string;
  tool: string;
  input: string;
  output?: string;
  error?: string;
  isActive?: boolean;
}

const TOOL_ICONS: Record<string, string> = {
  bash: "⚡",
  write_file: "📝",
  create_file: "📝",
  read_file: "📖",
  edit_file: "✏️",
  web_search: "🌐",
  search: "🔍",
  unknown: "🔧",
};

const TOOL_LABELS: Record<string, string> = {
  bash: "Terminal",
  write_file: "Write File",
  create_file: "Create File",
  read_file: "Read File",
  edit_file: "Edit File",
  web_search: "Web Search",
  search: "Search",
};

function getToolIcon(tool: string): string {
  return TOOL_ICONS[tool] || TOOL_ICONS.unknown;
}

function getToolLabel(tool: string): string {
  return TOOL_LABELS[tool] || tool;
}

const MAX_PREVIEW_LINES = 12;

export function ToolCard({ agentName, tool, input, output, error, isActive }: ToolCardProps) {
  const [expanded, setExpanded] = useState(false);

  const icon = getToolIcon(tool);
  const label = getToolLabel(tool);

  const inputLines = input.split("\n");
  const outputLines = output ? output.split("\n") : [];
  const isInputLong = inputLines.length > MAX_PREVIEW_LINES;
  const isOutputLong = outputLines.length > MAX_PREVIEW_LINES;
  const needsExpand = isInputLong || isOutputLong;

  const displayInput = expanded ? input : inputLines.slice(0, MAX_PREVIEW_LINES).join("\n");
  const displayOutput = expanded ? output : outputLines.slice(0, MAX_PREVIEW_LINES).join("\n");

  return (
    <div
      style={{
        margin: "8px 0",
        borderRadius: "8px",
        border: error ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid rgba(255, 255, 255, 0.08)",
        background: error ? "rgba(239, 68, 68, 0.05)" : "rgba(255, 255, 255, 0.03)",
        overflow: "hidden",
        fontSize: "13px",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 12px",
          background: "rgba(255, 255, 255, 0.04)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
          cursor: needsExpand ? "pointer" : undefined,
        }}
        onClick={() => needsExpand && setExpanded(!expanded)}
      >
        <span style={{ fontSize: "16px" }}>{icon}</span>
        <span style={{ fontWeight: 600, color: "rgba(255, 255, 255, 0.9)" }}>@{agentName}</span>
        <span style={{ color: "rgba(255, 255, 255, 0.5)" }}>used</span>
        <span
          style={{
            fontFamily: "monospace",
            fontSize: "12px",
            padding: "2px 6px",
            borderRadius: "4px",
            background: "rgba(139, 92, 246, 0.15)",
            color: "rgba(139, 92, 246, 0.9)",
          }}
        >
          {label}
        </span>
        {isActive && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: "11px",
              color: "rgba(34, 197, 94, 0.8)",
            }}
          >
            ● Running...
          </span>
        )}
        {error && (
          <span style={{ marginLeft: "auto", color: "rgba(239, 68, 68, 0.8)", fontSize: "12px" }}>
            ✗ Error
          </span>
        )}
      </div>

      {/* Input */}
      {input && (
        <div
          style={{
            padding: "8px 12px",
            fontFamily: "monospace",
            fontSize: "12px",
            color: "rgba(255, 255, 255, 0.75)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            lineHeight: 1.5,
            borderBottom: output || error ? "1px solid rgba(255, 255, 255, 0.06)" : undefined,
          }}
        >
          {tool === "bash" && (
            <span style={{ color: "rgba(34, 197, 94, 0.7)", marginRight: "4px" }}>$</span>
          )}
          {displayInput}
          {isInputLong && !expanded && (
            <span style={{ color: "rgba(139, 92, 246, 0.7)" }}>
              {" "}
              ... ({inputLines.length} lines)
            </span>
          )}
        </div>
      )}

      {/* Output */}
      {(output || error) && (
        <div
          style={{
            padding: "8px 12px",
            fontFamily: "monospace",
            fontSize: "12px",
            color: error ? "rgba(239, 68, 68, 0.8)" : "rgba(255, 255, 255, 0.6)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            lineHeight: 1.5,
            maxHeight: expanded ? undefined : "200px",
            overflow: expanded ? undefined : "hidden",
          }}
        >
          {displayOutput || error}
          {isOutputLong && !expanded && (
            <span style={{ color: "rgba(139, 92, 246, 0.7)" }}>
              {"\n"}... ({outputLines.length} lines total)
            </span>
          )}
        </div>
      )}

      {/* Expand/Collapse */}
      {needsExpand && (
        <div
          style={{
            padding: "4px 12px 6px",
            textAlign: "right",
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            style={{
              background: "none",
              border: "none",
              color: "rgba(139, 92, 246, 0.8)",
              cursor: "pointer",
              fontSize: "11px",
              fontWeight: 500,
            }}
          >
            {expanded ? "▲ Show less" : "▼ Show all"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Product Ready Card — Full Delivery View ────────────────────────────

interface ProductReadyProps {
  workspacePath: string;
  summary: string;
  onOpenFolder?: () => void;
  onRequestChanges?: (feedback: string) => void;
  onApprove?: () => void;
  onRun?: (command: string) => void;
  onDownload?: () => void;
}

type ProductView = "actions" | "files" | "summary" | "feedback" | "run";

export function ProductReadyCard({
  workspacePath,
  summary,
  onOpenFolder,
  onRequestChanges,
  onApprove,
  onRun,
  onDownload,
}: ProductReadyProps) {
  const [view, setView] = useState<ProductView>("actions");
  const [feedback, setFeedback] = useState("");
  const [approved, setApproved] = useState(false);

  if (approved) {
    return (
      <div
        style={{
          margin: "16px 0",
          padding: "20px",
          borderRadius: "12px",
          border: "1px solid rgba(34, 197, 94, 0.4)",
          background: "linear-gradient(135deg, rgba(34, 197, 94, 0.12), rgba(16, 185, 129, 0.08))",
          textAlign: "center",
        }}
      >
        <span style={{ fontSize: "32px" }}>✅</span>
        <div
          style={{
            fontSize: "16px",
            fontWeight: 700,
            color: "rgba(34, 197, 94, 0.9)",
            marginTop: "8px",
          }}
        >
          Project Approved
        </div>
        <div style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.5)", marginTop: "4px" }}>
          Deliverables accepted • {workspacePath}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        margin: "16px 0",
        borderRadius: "12px",
        border: "1px solid rgba(34, 197, 94, 0.3)",
        background: "linear-gradient(135deg, rgba(34, 197, 94, 0.08), rgba(16, 185, 129, 0.05))",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          borderBottom: "1px solid rgba(34, 197, 94, 0.15)",
        }}
      >
        <span style={{ fontSize: "28px" }}>📦</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "16px", fontWeight: 700, color: "rgba(34, 197, 94, 0.9)" }}>
            Product Ready
          </div>
          <div style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.5)", marginTop: "2px" }}>
            Your AI team has built the deliverables
          </div>
        </div>
      </div>

      {/* Workspace path */}
      <div
        style={{
          padding: "10px 20px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontSize: "13px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
        }}
      >
        <span style={{ color: "rgba(255, 255, 255, 0.5)" }}>📁</span>
        <code
          style={{
            fontFamily: "monospace",
            fontSize: "12px",
            color: "rgba(255, 255, 255, 0.7)",
            padding: "4px 8px",
            background: "rgba(255, 255, 255, 0.05)",
            borderRadius: "4px",
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {workspacePath}
        </code>
      </div>

      {/* Action Bar */}
      <div
        style={{
          padding: "10px 20px",
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
          borderBottom: view !== "actions" ? "1px solid rgba(255, 255, 255, 0.06)" : undefined,
        }}
      >
        {/* Primary: Approve */}
        <ActionButton
          icon="✅"
          label="Approve"
          color="34, 197, 94"
          primary
          onClick={() => {
            setApproved(true);
            onApprove?.();
          }}
        />

        {/* Browse Files */}
        <ActionButton
          icon="📂"
          label="Browse Files"
          color="139, 92, 246"
          active={view === "files"}
          onClick={() => setView(view === "files" ? "actions" : "files")}
        />

        {/* Open in Finder */}
        {onOpenFolder && (
          <ActionButton
            icon="🗂️"
            label="Open Folder"
            color="255, 255, 255"
            onClick={onOpenFolder}
          />
        )}

        {/* Download ZIP */}
        {onDownload && (
          <ActionButton icon="⬇️" label="Download" color="59, 130, 246" onClick={onDownload} />
        )}

        {/* Run */}
        {onRun && (
          <ActionButton
            icon="▶️"
            label="Run"
            color="34, 197, 94"
            active={view === "run"}
            onClick={() => setView(view === "run" ? "actions" : "run")}
          />
        )}

        {/* View Summary */}
        <ActionButton
          icon="📋"
          label="Summary"
          color="255, 255, 255"
          active={view === "summary"}
          onClick={() => setView(view === "summary" ? "actions" : "summary")}
        />

        {/* Request Changes */}
        <ActionButton
          icon="🔄"
          label="Request Changes"
          color="251, 191, 36"
          active={view === "feedback"}
          onClick={() => setView(view === "feedback" ? "actions" : "feedback")}
        />
      </div>

      {/* Expandable Content Panels */}

      {/* File Browser Panel */}
      {view === "files" && (
        <div style={{ height: "400px" }}>
          <FileBrowser workspacePath={workspacePath} onClose={() => setView("actions")} />
        </div>
      )}

      {/* Summary Panel */}
      {view === "summary" && (
        <div
          style={{
            padding: "16px 20px",
            fontSize: "13px",
            color: "rgba(255, 255, 255, 0.7)",
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            maxHeight: "300px",
            overflow: "auto",
          }}
        >
          {summary}
        </div>
      )}

      {/* Feedback Panel (Request Changes) */}
      {view === "feedback" && (
        <div style={{ padding: "16px 20px" }}>
          <div
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "rgba(251, 191, 36, 0.9)",
              marginBottom: "8px",
            }}
          >
            🔄 What should the team change?
          </div>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Describe the changes you want... e.g. 'Change the header color to blue' or 'Add a login page'"
            style={{
              width: "100%",
              minHeight: "80px",
              padding: "10px 12px",
              borderRadius: "8px",
              border: "1px solid rgba(251, 191, 36, 0.2)",
              background: "rgba(0, 0, 0, 0.3)",
              color: "rgba(255, 255, 255, 0.8)",
              fontSize: "13px",
              fontFamily: "inherit",
              resize: "vertical",
              outline: "none",
            }}
            onFocus={(e) => {
              (e.target as HTMLTextAreaElement).style.borderColor = "rgba(251, 191, 36, 0.5)";
            }}
            onBlur={(e) => {
              (e.target as HTMLTextAreaElement).style.borderColor = "rgba(251, 191, 36, 0.2)";
            }}
          />
          <div
            style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "10px" }}
          >
            <button
              onClick={() => {
                setView("actions");
                setFeedback("");
              }}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                background: "transparent",
                color: "rgba(255, 255, 255, 0.6)",
                cursor: "pointer",
                fontSize: "12px",
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (feedback.trim()) {
                  onRequestChanges?.(feedback.trim());
                  setView("actions");
                  setFeedback("");
                }
              }}
              disabled={!feedback.trim()}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                border: "1px solid rgba(251, 191, 36, 0.3)",
                background: feedback.trim()
                  ? "rgba(251, 191, 36, 0.15)"
                  : "rgba(255, 255, 255, 0.03)",
                color: feedback.trim() ? "rgba(251, 191, 36, 0.9)" : "rgba(255, 255, 255, 0.3)",
                cursor: feedback.trim() ? "pointer" : "default",
                fontSize: "12px",
                fontWeight: 600,
              }}
            >
              Send to Team →
            </button>
          </div>
        </div>
      )}

      {/* Run Panel */}
      {view === "run" && (
        <div style={{ padding: "16px 20px" }}>
          <div style={{ fontSize: "13px", color: "rgba(255, 255, 255, 0.5)", marginBottom: "8px" }}>
            Run the project from the workspace directory:
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            {["npm run dev", "npm start", "python main.py", "cargo run"].map((cmd) => (
              <button
                key={cmd}
                onClick={() => onRun?.(cmd)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: "1px solid rgba(34, 197, 94, 0.2)",
                  background: "rgba(34, 197, 94, 0.08)",
                  color: "rgba(34, 197, 94, 0.8)",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontFamily: "monospace",
                }}
              >
                {cmd}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Action Button ──────────────────────────────────────────────────────

function ActionButton({
  icon,
  label,
  color,
  primary,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  color: string;
  primary?: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: primary ? "8px 18px" : "6px 14px",
        borderRadius: "6px",
        border: `1px solid rgba(${color}, ${active ? 0.5 : 0.25})`,
        background: active
          ? `rgba(${color}, 0.2)`
          : primary
            ? `rgba(${color}, 0.15)`
            : `rgba(${color}, 0.05)`,
        color: `rgba(${color}, 0.9)`,
        cursor: "pointer",
        fontSize: primary ? "13px" : "12px",
        fontWeight: primary ? 600 : 500,
        display: "flex",
        alignItems: "center",
        gap: "6px",
        transition: "all 0.15s",
      }}
    >
      <span>{icon}</span>
      {label}
    </button>
  );
}
