/**
 * Git Integration Service — Autonomous Version Control for Agents.
 *
 * Sprint 5, Epic 5: Agents automatically commit code and create PRs.
 *
 * Features:
 *   • Detects git repository in workspace
 *   • Auto-commit with structured messages on task completion
 *   • Auto-PR creation via GitHub/GitLab REST API
 *   • Diff summary generation for PR descriptions
 *   • Branch management (feature branches per task)
 *
 * All git operations go through Tauri commands that shell out to `git`.
 * GitHub/GitLab API calls go through a dedicated Tauri command.
 */

import {
  gitStatus,
  gitCommit,
  gitCreateBranch,
  gitCheckout,
  gitDiff,
  gitPush,
  gitCreatePR,
  gitGetCurrentBranch,
  gitIsRepo,
  type GitStatusResult,
  type GitDiffResult,
  type GitPRResult,
} from "../tauri-api";

// ── Types ──────────────────────────────────────────────────────────────

export interface CommitResult {
  success: boolean;
  commitHash?: string;
  message: string;
  filesChanged: number;
}

export interface PRCreationResult {
  success: boolean;
  prUrl?: string;
  prNumber?: number;
  error?: string;
}

export interface GitWorkspaceInfo {
  isGitRepo: boolean;
  currentBranch: string;
  hasChanges: boolean;
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
}

// ── Commit Message Templates ───────────────────────────────────────────

/**
 * Generate a structured git commit message for agent work.
 */
export function buildCommitMessage(
  agentName: string,
  taskTitle: string,
  filesChanged: string[],
  options?: {
    taskId?: string;
    phase?: string;
    summary?: string;
  },
): string {
  const prefix = `[${agentName}]`;
  const subject = `${prefix} ${taskTitle}`;

  const bodyLines: string[] = [];

  if (options?.taskId) {
    bodyLines.push(`Task: ${options.taskId}`);
  }
  if (options?.phase) {
    bodyLines.push(`Phase: ${options.phase}`);
  }
  if (options?.summary) {
    bodyLines.push("");
    bodyLines.push(options.summary);
  }

  if (filesChanged.length > 0) {
    bodyLines.push("");
    bodyLines.push("Files changed:");
    for (const f of filesChanged.slice(0, 20)) {
      bodyLines.push(`  - ${f}`);
    }
    if (filesChanged.length > 20) {
      bodyLines.push(`  ... and ${filesChanged.length - 20} more`);
    }
  }

  bodyLines.push("");
  bodyLines.push("Co-authored-by: Axtrizen AI <ai@axtrizen.dev>");

  return bodyLines.length > 0 ? `${subject}\n\n${bodyLines.join("\n")}` : subject;
}

/**
 * Generate a feature branch name from a task.
 */
export function buildBranchName(agentName: string, taskId: string, taskTitle: string): string {
  const sanitized = taskTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `agent/${agentName.toLowerCase()}/${taskId}-${sanitized}`;
}

/**
 * Generate a PR title from agent work.
 */
export function buildPRTitle(agentName: string, taskTitle: string, phase?: string): string {
  const prefix = phase ? `[${phase}]` : "";
  return `${prefix} [${agentName}] ${taskTitle}`.trim();
}

/**
 * Generate a PR description with markdown summary.
 */
export function buildPRDescription(
  agentName: string,
  taskTitle: string,
  diffSummary: string,
  options?: {
    taskId?: string;
    phase?: string;
    acceptanceCriteria?: string;
    storyId?: string;
  },
): string {
  const lines: string[] = [
    `## 🤖 Automated PR by ${agentName}`,
    "",
    `### Task: ${taskTitle}`,
    "",
  ];

  if (options?.taskId) lines.push(`- **Task ID:** ${options.taskId}`);
  if (options?.storyId) lines.push(`- **Story:** ${options.storyId}`);
  if (options?.phase) lines.push(`- **Phase:** ${options.phase}`);

  lines.push("");
  lines.push("### Changes");
  lines.push("");
  lines.push(diffSummary || "_No changes detected._");

  if (options?.acceptanceCriteria) {
    lines.push("");
    lines.push("### Acceptance Criteria");
    lines.push("");
    lines.push(options.acceptanceCriteria);
  }

  lines.push("");
  lines.push("---");
  lines.push("_This PR was automatically created by Axtrizen AI._");

  return lines.join("\n");
}

// ── Core Git Operations ────────────────────────────────────────────────

/**
 * Get workspace git status information.
 */
export async function getWorkspaceGitInfo(workspacePath: string): Promise<GitWorkspaceInfo> {
  try {
    const isRepo = await gitIsRepo(workspacePath);
    if (!isRepo) {
      return {
        isGitRepo: false,
        currentBranch: "",
        hasChanges: false,
        stagedCount: 0,
        unstagedCount: 0,
        untrackedCount: 0,
      };
    }

    const [branch, status] = await Promise.all([
      gitGetCurrentBranch(workspacePath),
      gitStatus(workspacePath),
    ]);

    return {
      isGitRepo: true,
      currentBranch: branch,
      hasChanges: status.staged.length > 0 || status.unstaged.length > 0 || status.untracked.length > 0,
      stagedCount: status.staged.length,
      unstagedCount: status.unstaged.length,
      untrackedCount: status.untracked.length,
    };
  } catch (err) {
    console.error("[git-service] Failed to get workspace info:", err);
    return {
      isGitRepo: false,
      currentBranch: "",
      hasChanges: false,
      stagedCount: 0,
      unstagedCount: 0,
      untrackedCount: 0,
    };
  }
}

/**
 * Auto-commit all changes in the workspace.
 *
 * Called when an agent completes a task and moves it to "Review".
 */
export async function autoCommit(
  workspacePath: string,
  agentName: string,
  taskTitle: string,
  options?: {
    taskId?: string;
    phase?: string;
    summary?: string;
  },
): Promise<CommitResult> {
  try {
    // Get status to see what changed
    const status = await gitStatus(workspacePath);
    const allFiles = [...status.staged, ...status.unstaged, ...status.untracked];

    if (allFiles.length === 0) {
      return { success: true, message: "No changes to commit", filesChanged: 0 };
    }

    const commitMsg = buildCommitMessage(agentName, taskTitle, allFiles, options);

    // git add . && git commit
    const result = await gitCommit(workspacePath, commitMsg, true /* addAll */);

    return {
      success: true,
      commitHash: result.hash,
      message: commitMsg.split("\n")[0],
      filesChanged: allFiles.length,
    };
  } catch (err) {
    return {
      success: false,
      message: `Commit failed: ${err}`,
      filesChanged: 0,
    };
  }
}

/**
 * Full autonomous flow: branch → commit → push → PR.
 *
 * Called when a phase completes and the manager triggers the PR.
 */
export async function autoCreatePR(
  workspacePath: string,
  agentName: string,
  taskTitle: string,
  targetBranch: string = "main",
  options?: {
    taskId?: string;
    phase?: string;
    storyId?: string;
    acceptanceCriteria?: string;
    provider?: "github" | "gitlab";
    repoOwner?: string;
    repoName?: string;
    token?: string;
  },
): Promise<PRCreationResult> {
  try {
    // 1. Create feature branch
    const branchName = buildBranchName(agentName, options?.taskId ?? "task", taskTitle);
    await gitCreateBranch(workspacePath, branchName);
    await gitCheckout(workspacePath, branchName);

    // 2. Commit any pending changes
    const commitResult = await autoCommit(workspacePath, agentName, taskTitle, options);
    if (!commitResult.success && commitResult.filesChanged > 0) {
      return { success: false, error: commitResult.message };
    }

    // 3. Push branch
    await gitPush(workspacePath, branchName);

    // 4. Get diff for description
    const diff = await gitDiff(workspacePath, targetBranch, branchName);
    const diffSummary = formatDiffSummary(diff);

    // 5. Build PR description
    const prTitle = buildPRTitle(agentName, taskTitle, options?.phase);
    const prBody = buildPRDescription(agentName, taskTitle, diffSummary, options);

    // 6. Create PR via API
    const prResult = await gitCreatePR(workspacePath, {
      title: prTitle,
      body: prBody,
      head: branchName,
      base: targetBranch,
      provider: options?.provider ?? "github",
      owner: options?.repoOwner,
      repo: options?.repoName,
      token: options?.token,
    });

    return {
      success: true,
      prUrl: prResult.url,
      prNumber: prResult.number,
    };
  } catch (err) {
    return {
      success: false,
      error: `PR creation failed: ${err}`,
    };
  }
}

/**
 * Format a diff result into a human-readable summary.
 */
export function formatDiffSummary(diff: GitDiffResult): string {
  const lines: string[] = [];

  if (diff.filesChanged > 0) {
    lines.push(`**${diff.filesChanged}** file${diff.filesChanged !== 1 ? "s" : ""} changed`);
    lines.push(`- **+${diff.insertions}** insertions`);
    lines.push(`- **-${diff.deletions}** deletions`);
  }

  if (diff.files && diff.files.length > 0) {
    lines.push("");
    lines.push("| File | Changes |");
    lines.push("|------|---------|");
    for (const f of diff.files.slice(0, 30)) {
      lines.push(`| \`${f.path}\` | +${f.insertions} / -${f.deletions} |`);
    }
    if (diff.files.length > 30) {
      lines.push(`| ... | ${diff.files.length - 30} more files |`);
    }
  }

  return lines.join("\n");
}

export default {
  autoCommit,
  autoCreatePR,
  getWorkspaceGitInfo,
  buildCommitMessage,
  buildBranchName,
  buildPRTitle,
  buildPRDescription,
  formatDiffSummary,
};
