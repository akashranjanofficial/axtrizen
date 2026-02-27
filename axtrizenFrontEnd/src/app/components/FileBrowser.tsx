// FileBrowser component

import React, { useState, useEffect, useCallback } from "react";
import {
  listWorkspaceFiles,
  readFileContent,
  type FileEntry,
  type FilePreview,
} from "../services/workspace-manager";

// ── File Icons ─────────────────────────────────────────────────────────

const FILE_ICONS: Record<string, string> = {
  ts: "📘",
  tsx: "📘",
  js: "📒",
  jsx: "📒",
  py: "🐍",
  rs: "🦀",
  go: "🔵",
  html: "🌐",
  css: "🎨",
  scss: "🎨",
  json: "📋",
  yaml: "📋",
  yml: "📋",
  md: "📝",
  sh: "⚡",
  sql: "🗄️",
  toml: "⚙️",
  lock: "🔒",
  env: "🔐",
  gitignore: "👁️",
};

function getFileIcon(name: string, isDir: boolean): string {
  if (isDir) return "📁";
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const lower = name.toLowerCase();
  if (lower === "dockerfile") return "🐳";
  if (lower === "makefile") return "⚙️";
  if (lower === "readme.md") return "📖";
  if (lower === "package.json") return "📦";
  if (lower === "cargo.toml") return "🦀";
  return FILE_ICONS[ext] || "📄";
}

// ── File Size Formatter ────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes === 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── File Tree Node ─────────────────────────────────────────────────────

interface TreeNodeProps {
  entry: FileEntry;
  depth: number;
  selectedPath: string | null;
  onSelect: (entry: FileEntry) => void;
}

function TreeNode({ entry, depth, selectedPath, onSelect }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isSelected = entry.path === selectedPath;

  return (
    <div>
      <div
        onClick={() => {
          if (entry.isDir) {
            setExpanded(!expanded);
          } else {
            onSelect(entry);
          }
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "4px 8px",
          paddingLeft: `${12 + depth * 16}px`,
          cursor: "pointer",
          fontSize: "13px",
          color: isSelected ? "rgba(139, 92, 246, 1)" : "rgba(255, 255, 255, 0.75)",
          background: isSelected ? "rgba(139, 92, 246, 0.1)" : "transparent",
          borderLeft: isSelected ? "2px solid rgba(139, 92, 246, 0.8)" : "2px solid transparent",
          transition: "background 0.15s",
          userSelect: "none",
        }}
        onMouseEnter={(e) => {
          if (!isSelected) {
            (e.currentTarget as HTMLElement).style.background = "rgba(255, 255, 255, 0.04)";
          }
        }}
        onMouseLeave={(e) => {
          if (!isSelected) {
            (e.currentTarget as HTMLElement).style.background = "transparent";
          }
        }}
      >
        {entry.isDir && (
          <span style={{ fontSize: "10px", width: "12px", textAlign: "center", opacity: 0.5 }}>
            {expanded ? "▼" : "▶"}
          </span>
        )}
        {!entry.isDir && <span style={{ width: "12px" }} />}
        <span style={{ fontSize: "14px" }}>{getFileIcon(entry.name, entry.isDir)}</span>
        <span
          style={{
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontWeight: entry.isDir ? 500 : 400,
          }}
        >
          {entry.name}
        </span>
        {entry.size > 0 && (
          <span style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.3)" }}>
            {formatSize(entry.size)}
          </span>
        )}
      </div>
      {entry.isDir && expanded && entry.children && (
        <div>
          {entry.children.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Syntax Highlighting (lightweight) ──────────────────────────────────

function highlightCode(code: string, _language: string): React.ReactNode {
  // Lightweight highlighting: keywords, strings, comments
  // Full syntax highlighting would require a library like Prism.js
  const lines = code.split("\n");

  return (
    <pre
      style={{
        margin: 0,
        padding: "16px",
        fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
        fontSize: "12px",
        lineHeight: 1.6,
        color: "rgba(255, 255, 255, 0.8)",
        overflowX: "auto",
      }}
    >
      {lines.map((line, i) => (
        <div key={i} style={{ display: "flex", minHeight: "19px" }}>
          <span
            style={{
              display: "inline-block",
              width: "40px",
              textAlign: "right",
              paddingRight: "16px",
              color: "rgba(255, 255, 255, 0.2)",
              userSelect: "none",
              flexShrink: 0,
            }}
          >
            {i + 1}
          </span>
          <span style={{ whiteSpace: "pre" }}>{line}</span>
        </div>
      ))}
    </pre>
  );
}

// ── File Browser Component ─────────────────────────────────────────────

interface FileBrowserProps {
  workspacePath: string;
  onClose?: () => void;
}

export function FileBrowser({ workspacePath, onClose }: FileBrowserProps) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<FilePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const entries = await listWorkspaceFiles(workspacePath);
      setFiles(entries);
    } catch (err) {
      setError(`Failed to load files: ${err}`);
    } finally {
      setLoading(false);
    }
  }, [workspacePath]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleFileSelect = async (entry: FileEntry) => {
    if (entry.isDir) return;
    setLoadingFile(true);
    try {
      const preview = await readFileContent(entry.path);
      setSelectedFile(preview);
    } catch (err) {
      setSelectedFile({
        path: entry.path,
        content: `Error: ${err}`,
        language: "plaintext",
        size: 0,
      });
    } finally {
      setLoadingFile(false);
    }
  };

  const projectName = workspacePath.split("/").pop() || "Project";
  const fileCount = countFiles(files);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        maxHeight: "70vh",
        borderRadius: "12px",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        background: "rgba(15, 15, 20, 0.95)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "12px 16px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          background: "rgba(255, 255, 255, 0.03)",
        }}
      >
        <span style={{ fontSize: "18px" }}>📂</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "rgba(255, 255, 255, 0.9)" }}>
            {projectName}
          </div>
          <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.4)" }}>
            {fileCount} files • {workspacePath}
          </div>
        </div>
        <button
          onClick={loadFiles}
          style={{
            background: "none",
            border: "none",
            color: "rgba(255, 255, 255, 0.5)",
            cursor: "pointer",
            fontSize: "14px",
            padding: "4px 8px",
          }}
          title="Refresh"
        >
          🔄
        </button>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "rgba(255, 255, 255, 0.5)",
              cursor: "pointer",
              fontSize: "14px",
              padding: "4px 8px",
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* File Tree Panel */}
        <div
          style={{
            width: selectedFile ? "280px" : "100%",
            borderRight: selectedFile ? "1px solid rgba(255, 255, 255, 0.08)" : undefined,
            overflowY: "auto",
            overflowX: "hidden",
            flexShrink: 0,
          }}
        >
          {loading ? (
            <div
              style={{ padding: "20px", textAlign: "center", color: "rgba(255, 255, 255, 0.4)" }}
            >
              <div style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>
                ⏳
              </div>
              <div style={{ marginTop: "8px", fontSize: "13px" }}>Loading files...</div>
            </div>
          ) : error ? (
            <div
              style={{
                padding: "20px",
                textAlign: "center",
                color: "rgba(239, 68, 68, 0.8)",
                fontSize: "13px",
              }}
            >
              {error}
            </div>
          ) : files.length === 0 ? (
            <div
              style={{
                padding: "20px",
                textAlign: "center",
                color: "rgba(255, 255, 255, 0.4)",
                fontSize: "13px",
              }}
            >
              No files in workspace yet
            </div>
          ) : (
            <div style={{ padding: "4px 0" }}>
              {files.map((entry) => (
                <TreeNode
                  key={entry.path}
                  entry={entry}
                  depth={0}
                  selectedPath={selectedFile?.path || null}
                  onSelect={handleFileSelect}
                />
              ))}
            </div>
          )}
        </div>

        {/* File Preview Panel */}
        {selectedFile && (
          <div style={{ flex: 1, overflow: "auto", background: "rgba(10, 10, 15, 0.8)" }}>
            {/* File Preview Header */}
            <div
              style={{
                padding: "8px 16px",
                borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: "rgba(255, 255, 255, 0.02)",
                position: "sticky",
                top: 0,
                zIndex: 1,
              }}
            >
              <span style={{ fontSize: "12px" }}>
                {getFileIcon(selectedFile.path.split("/").pop() || "", false)}
              </span>
              <span
                style={{
                  fontSize: "12px",
                  color: "rgba(255, 255, 255, 0.7)",
                  fontFamily: "monospace",
                }}
              >
                {selectedFile.path.replace(workspacePath, ".")}
              </span>
              <span
                style={{ fontSize: "10px", color: "rgba(255, 255, 255, 0.3)", marginLeft: "auto" }}
              >
                {selectedFile.language} • {formatSize(selectedFile.size)}
              </span>
              <button
                onClick={() => setSelectedFile(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: "rgba(255, 255, 255, 0.4)",
                  cursor: "pointer",
                  fontSize: "12px",
                }}
              >
                ✕
              </button>
            </div>

            {/* File Content */}
            {loadingFile ? (
              <div
                style={{ padding: "40px", textAlign: "center", color: "rgba(255, 255, 255, 0.4)" }}
              >
                Loading...
              </div>
            ) : (
              highlightCode(selectedFile.content, selectedFile.language)
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

function countFiles(entries: FileEntry[]): number {
  let count = 0;
  for (const entry of entries) {
    if (!entry.isDir) count++;
    if (entry.children) count += countFiles(entry.children);
  }
  return count;
}
