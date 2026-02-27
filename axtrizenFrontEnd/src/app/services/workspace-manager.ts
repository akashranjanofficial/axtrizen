/**
 * Workspace Manager — File system operations for agent project workspaces.
 *
 * Uses Tauri's invoke API to run shell commands for FS operations.
 */

// Local invoke helper — uses Tauri 2.0 window.__TAURI__ directly
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (typeof window === "undefined" || !w.__TAURI__) {
    throw new Error("Not running in Tauri environment");
  }
  const tauriInvoke = w.__TAURI__?.core?.invoke ?? w.__TAURI__?.invoke;
  if (!tauriInvoke) throw new Error("Tauri invoke not available");
  return tauriInvoke(cmd, args) as Promise<T>;
}

// ── Types ──────────────────────────────────────────────────────────────

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modifiedAt?: string;
  children?: FileEntry[];
}

export interface FilePreview {
  path: string;
  content: string;
  language: string;
  size: number;
}

// ── Language Detection ─────────────────────────────────────────────────

const EXTENSION_LANGUAGES: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  py: "python",
  rs: "rust",
  go: "go",
  rb: "ruby",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  cpp: "cpp",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  html: "html",
  css: "css",
  scss: "scss",
  less: "less",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  xml: "xml",
  md: "markdown",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  sql: "sql",
  graphql: "graphql",
  toml: "toml",
  ini: "ini",
  env: "plaintext",
  txt: "plaintext",
  log: "plaintext",
  dockerfile: "dockerfile",
  makefile: "makefile",
  gitignore: "plaintext",
};

function detectLanguage(filename: string): string {
  const lower = filename.toLowerCase();
  // Exact matches
  if (lower === "dockerfile") return "dockerfile";
  if (lower === "makefile") return "makefile";
  if (lower === ".gitignore" || lower === ".env") return "plaintext";

  const ext = lower.split(".").pop() || "";
  return EXTENSION_LANGUAGES[ext] || "plaintext";
}

// ── Binary detection ───────────────────────────────────────────────────

const BINARY_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "ico",
  "bmp",
  "mp4",
  "webm",
  "avi",
  "mov",
  "mkv",
  "mp3",
  "wav",
  "ogg",
  "flac",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "eot",
  "zip",
  "tar",
  "gz",
  "bz2",
  "7z",
  "rar",
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "exe",
  "dll",
  "so",
  "dylib",
  "wasm",
  "bin",
  "dat",
]);

function isBinaryFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return BINARY_EXTENSIONS.has(ext);
}

// ── Workspace Operations ───────────────────────────────────────────────

/**
 * List files and directories recursively in a workspace.
 * Uses Tauri invoke to call the Rust backend for directory listing.
 */
export async function listWorkspaceFiles(workspacePath: string): Promise<FileEntry[]> {
  try {
    // Try Tauri invoke first (for native app)
    const result = await invoke<FileEntry[]>("list_directory", { path: workspacePath });
    return result;
  } catch {
    // Fallback: Use a simplified approach with gateway bash
    // This runs `find` via the gateway to list files
    try {
      const result = await invoke<string>("run_shell_command", {
        command: `find "${workspacePath}" -maxdepth 4 -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/__pycache__/*' | head -200`,
      });
      return parseFileList(result, workspacePath);
    } catch {
      return [];
    }
  }
}

/**
 * Read a file's content for preview.
 */
export async function readFileContent(filePath: string): Promise<FilePreview> {
  const filename = filePath.split("/").pop() || filePath;

  if (isBinaryFile(filename)) {
    return {
      path: filePath,
      content: `[Binary file: ${filename}]`,
      language: "plaintext",
      size: 0,
    };
  }

  try {
    const result = await invoke<string>("read_file_content", { path: filePath });
    return {
      path: filePath,
      content: result,
      language: detectLanguage(filename),
      size: result.length,
    };
  } catch {
    // Fallback
    try {
      const result = await invoke<string>("run_shell_command", {
        command: `head -500 "${filePath}"`,
      });
      return {
        path: filePath,
        content: result,
        language: detectLanguage(filename),
        size: result.length,
      };
    } catch {
      return {
        path: filePath,
        content: `[Error reading file: ${filePath}]`,
        language: "plaintext",
        size: 0,
      };
    }
  }
}

/**
 * Create a ZIP archive of the workspace for download.
 * Returns the path to the created ZIP file.
 */
export async function createWorkspaceZip(workspacePath: string): Promise<string> {
  const projectName = workspacePath.split("/").pop() || "project";
  const zipPath = `/tmp/${projectName}-${Date.now()}.zip`;

  try {
    await invoke<string>("run_shell_command", {
      command: `cd "${workspacePath}" && zip -r "${zipPath}" . -x "node_modules/*" ".git/*" "dist/*" "__pycache__/*"`,
    });
    return zipPath;
  } catch (err) {
    throw new Error(`Failed to create ZIP: ${err}`);
  }
}

/**
 * Detect the project type and suggest a run command.
 */
export function detectProjectType(files: FileEntry[]): {
  type: string;
  runCommand: string;
  icon: string;
} | null {
  const fileNames = flattenFileNames(files);

  if (fileNames.includes("package.json")) {
    if (
      fileNames.includes("next.config.js") ||
      fileNames.includes("next.config.ts") ||
      fileNames.includes("next.config.mjs")
    ) {
      return { type: "Next.js", runCommand: "npm run dev", icon: "▲" };
    }
    if (fileNames.includes("vite.config.ts") || fileNames.includes("vite.config.js")) {
      return { type: "Vite", runCommand: "npm run dev", icon: "⚡" };
    }
    return { type: "Node.js", runCommand: "npm start", icon: "🟢" };
  }

  if (
    fileNames.includes("requirements.txt") ||
    fileNames.includes("setup.py") ||
    fileNames.includes("pyproject.toml")
  ) {
    if (fileNames.includes("manage.py")) {
      return { type: "Django", runCommand: "python manage.py runserver", icon: "🐍" };
    }
    if (fileNames.includes("app.py")) {
      return { type: "Flask", runCommand: "python app.py", icon: "🐍" };
    }
    const mainPy = fileNames.find((f) => f === "main.py");
    if (mainPy) {
      return { type: "Python", runCommand: "python main.py", icon: "🐍" };
    }
    return { type: "Python", runCommand: "python main.py", icon: "🐍" };
  }

  if (fileNames.includes("Cargo.toml")) {
    return { type: "Rust", runCommand: "cargo run", icon: "🦀" };
  }

  if (fileNames.includes("go.mod")) {
    return { type: "Go", runCommand: "go run .", icon: "🔵" };
  }

  if (fileNames.includes("Makefile") || fileNames.includes("makefile")) {
    return { type: "Make", runCommand: "make", icon: "⚙️" };
  }

  return null;
}

/**
 * Open a path in the native file manager (Finder on macOS).
 */
export async function openInFileManager(path: string): Promise<void> {
  try {
    // Use plugin-opener
    const opener = await import("@tauri-apps/plugin-opener");
    // plugin-opener v2 uses openPath or openUrl
    const openFn =
      (opener as Record<string, unknown>).openPath ??
      (opener as Record<string, unknown>).openUrl ??
      (opener as Record<string, unknown>).open;
    if (typeof openFn === "function") {
      await (openFn as (p: string) => Promise<void>)(path);
      return;
    }
  } catch {
    // Fallback below
  }
  // Fallback: invoke shell open
  try {
    await invoke<void>("run_shell_command", {
      command: `open "${path}"`,
    });
  } catch {
    console.warn("[workspace] Failed to open in file manager:", path);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function parseFileList(output: string, basePath: string): FileEntry[] {
  const lines = output.trim().split("\n").filter(Boolean);
  const root: FileEntry[] = [];
  const dirs = new Map<string, FileEntry>();

  for (const line of lines) {
    if (line === basePath) continue;

    const relativePath = line.replace(basePath, "").replace(/^\//, "");
    const parts = relativePath.split("/");
    const name = parts[parts.length - 1];
    const isDir = !name.includes(".");

    const entry: FileEntry = {
      name,
      path: line,
      isDir,
      size: 0,
    };

    if (parts.length === 1) {
      root.push(entry);
      if (isDir) dirs.set(relativePath, entry);
    } else {
      const parentPath = parts.slice(0, -1).join("/");
      const parent = dirs.get(parentPath);
      if (parent) {
        if (!parent.children) parent.children = [];
        parent.children.push(entry);
        if (isDir) dirs.set(relativePath, entry);
      }
    }
  }

  return sortFileEntries(root);
}

function sortFileEntries(entries: FileEntry[]): FileEntry[] {
  return entries
    .sort((a, b) => {
      // Directories first
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    })
    .map((entry) => ({
      ...entry,
      children: entry.children ? sortFileEntries(entry.children) : undefined,
    }));
}

function flattenFileNames(entries: FileEntry[]): string[] {
  const names: string[] = [];
  for (const entry of entries) {
    names.push(entry.name);
    if (entry.children) {
      names.push(...flattenFileNames(entry.children));
    }
  }
  return names;
}
