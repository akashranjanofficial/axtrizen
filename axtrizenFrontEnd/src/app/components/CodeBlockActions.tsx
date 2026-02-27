/**
 * CodeBlockActions — Action buttons for Markdown code blocks in chat.
 *
 * Sprint 4, Epic 4: Every Markdown code block renders with action icons
 * in the top-right corner:
 *   • Copy — copies the code to the clipboard
 *   • Save to File — triggers a Tauri save-file dialog
 *   • Run in Terminal — pipes the code to the built-in Tauri PTY
 *
 * Used as a custom `components.code` override for ReactMarkdown.
 */

import { useState, useCallback, type ReactNode } from "react";
import { Copy, Check, Download, Play, FileCode2 } from "lucide-react";
import { isTauri, writePty, createPty } from "../tauri-api";

// ── Types ──────────────────────────────────────────────────────────────

export interface CodeBlockActionsProps {
  /** The raw code string inside the block */
  code: string;
  /** Language tag from the fenced block (e.g. "ts", "python") */
  language?: string;
  /** Optional callback after "Run in Terminal" is triggered */
  onRunInTerminal?: (code: string, language: string) => void;
  /** Optional callback after "Save to File" is triggered */
  onSaveToFile?: (code: string, language: string) => void;
}

// Language → file extension map for Save-to-File
const LANG_EXT: Record<string, string> = {
  typescript: "ts",
  ts: "ts",
  javascript: "js",
  js: "js",
  python: "py",
  py: "py",
  rust: "rs",
  rs: "rs",
  go: "go",
  java: "java",
  cpp: "cpp",
  c: "c",
  html: "html",
  css: "css",
  json: "json",
  yaml: "yaml",
  yml: "yml",
  bash: "sh",
  sh: "sh",
  shell: "sh",
  sql: "sql",
  toml: "toml",
  xml: "xml",
  markdown: "md",
  md: "md",
  dockerfile: "Dockerfile",
};

/**
 * Get a human-readable label for the language.
 */
export function getLanguageLabel(lang?: string): string {
  if (!lang) return "Code";
  const labels: Record<string, string> = {
    ts: "TypeScript",
    typescript: "TypeScript",
    js: "JavaScript",
    javascript: "JavaScript",
    py: "Python",
    python: "Python",
    rs: "Rust",
    rust: "Rust",
    bash: "Bash",
    sh: "Shell",
    shell: "Shell",
    json: "JSON",
    html: "HTML",
    css: "CSS",
    sql: "SQL",
    go: "Go",
    java: "Java",
    cpp: "C++",
    c: "C",
    yaml: "YAML",
    yml: "YAML",
    toml: "TOML",
  };
  return labels[lang.toLowerCase()] ?? lang;
}

/**
 * Get the file extension for a given language.
 */
export function getFileExtension(lang?: string): string {
  if (!lang) return "txt";
  return LANG_EXT[lang.toLowerCase()] ?? "txt";
}

// ── Copy to Clipboard ──────────────────────────────────────────────────

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for non-secure contexts
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  }
}

// ── Save to File ───────────────────────────────────────────────────────

async function saveToFile(code: string, lang?: string): Promise<void> {
  const ext = getFileExtension(lang);
  const filename = `snippet.${ext}`;

  if (isTauri()) {
    // Use Tauri's save dialog
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const path = await save({
        defaultPath: filename,
        filters: [{ name: "Code files", extensions: [ext] }],
      });
      if (path) {
        // Write via our system command (no plugin-fs dependency needed)
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("write_file_content", { path, content: code });
      }
    } catch (err) {
      console.warn("[CodeBlockActions] Save dialog error, falling back to download:", err);
      downloadAsFile(code, filename);
    }
  } else {
    downloadAsFile(code, filename);
  }
}

/** Browser fallback — trigger a download via <a> blob */
function downloadAsFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Run in Terminal ────────────────────────────────────────────────────

async function runInTerminal(code: string, _lang?: string): Promise<void> {
  if (!isTauri()) {
    console.warn("[CodeBlockActions] Run in Terminal requires Tauri environment");
    return;
  }
  try {
    // Use the existing PTY infrastructure — write code to active terminal
    const ptyId = `code-run-${Date.now()}`;
    await createPty(ptyId);
    // Send the code followed by enter
    await writePty(ptyId, code + "\n");
  } catch (err) {
    console.error("[CodeBlockActions] Run in terminal failed:", err);
  }
}

// ── Action Button ──────────────────────────────────────────────────────

function ActionButton({
  icon,
  label,
  onClick,
  activeIcon,
  activeLabel,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  activeIcon?: ReactNode;
  activeLabel?: string;
}) {
  const [active, setActive] = useState(false);

  const handleClick = useCallback(() => {
    onClick();
    if (activeIcon) {
      setActive(true);
      setTimeout(() => setActive(false), 2000);
    }
  }, [onClick, activeIcon]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex items-center gap-1 px-2 py-1 rounded text-xs
                 text-muted-foreground hover:text-foreground hover:bg-muted/80
                 transition-colors duration-150"
      title={active ? activeLabel ?? label : label}
      data-testid={`code-action-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      {active ? activeIcon : icon}
      <span className="hidden sm:inline">{active ? activeLabel ?? label : label}</span>
    </button>
  );
}

// ── CodeBlock Component ────────────────────────────────────────────────

/**
 * Enhanced code block with action buttons overlay.
 *
 * Drop this into ReactMarkdown's `components` prop:
 * ```tsx
 * <ReactMarkdown components={{ code: MarkdownCodeBlock }}>
 *   {content}
 * </ReactMarkdown>
 * ```
 */
export function MarkdownCodeBlock({
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLElement> & { children?: ReactNode }) {
  // Detect fenced (block) vs inline code
  // Fenced code blocks are wrapped in <pre><code>
  // react-markdown passes className="language-xxx" for fenced blocks
  const match = /language-(\w+)/.exec(className || "");
  const language = match?.[1];
  const isInline = !className && !match;

  // Extract text content from children
  const code = extractText(children);

  if (isInline) {
    // Inline code — no action buttons
    return (
      <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono" {...rest}>
        {children}
      </code>
    );
  }

  // Block code — render with action toolbar
  return (
    <div className="relative group my-3 rounded-lg border border-border bg-zinc-950 overflow-hidden"
         data-testid="code-block">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900/80 border-b border-border/50">
        <span className="text-[11px] text-muted-foreground font-mono">
          {getLanguageLabel(language)}
        </span>
        <div className="flex items-center gap-0.5" data-testid="code-block-actions">
          <ActionButton
            icon={<Copy className="h-3.5 w-3.5" />}
            label="Copy"
            activeIcon={<Check className="h-3.5 w-3.5 text-green-400" />}
            activeLabel="Copied!"
            onClick={() => copyToClipboard(code)}
          />
          <ActionButton
            icon={<Download className="h-3.5 w-3.5" />}
            label="Save"
            onClick={() => saveToFile(code, language)}
          />
          <ActionButton
            icon={<Play className="h-3.5 w-3.5" />}
            label="Run"
            onClick={() => runInTerminal(code, language)}
          />
        </div>
      </div>
      {/* Code content */}
      <pre className="p-4 overflow-x-auto text-sm">
        <code className={`${className ?? ""} font-mono text-zinc-200`} {...rest}>
          {children}
        </code>
      </pre>
    </div>
  );
}

/**
 * Extract plain text from React children (which may be nested elements).
 */
export function extractText(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(extractText).join("");
  if (children && typeof children === "object" && "props" in children) {
    return extractText((children as React.ReactElement).props.children);
  }
  return "";
}

/**
 * Pre-configured ReactMarkdown components override.
 * Import this in ChatWindow.tsx and pass to <ReactMarkdown components={markdownComponents}>
 */
export const markdownComponents = {
  code: MarkdownCodeBlock,
};

export default MarkdownCodeBlock;
