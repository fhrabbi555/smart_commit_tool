import * as vscode from "vscode";
import { relative } from "node:path";

/**
 * Minimal typings for the built-in Git extension API surface we use.
 */
export interface GitChange {
  uri: vscode.Uri;
  originalUri: vscode.Uri;
  renameUri: vscode.Uri | undefined;
  status: number;
}

export interface GitRepositoryState {
  indexChanges: GitChange[];
  workingTreeChanges: GitChange[];
  HEAD?: { name?: string };
}

export interface GitCommit {
  hash: string;
  message: string;
}

export interface GitRepository {
  rootUri: vscode.Uri;
  inputBox: { value: string };
  state: GitRepositoryState;
  diff(cached?: boolean): Promise<string>;
  diffWithHEAD(): Promise<string>;
  log(options?: { maxEntries?: number }): Promise<GitCommit[]>;
  commit(message: string, opts?: Record<string, unknown>): Promise<void>;
}

export interface GitAPI {
  repositories: GitRepository[];
}

interface GitExtensionExports {
  getAPI(version: 1): GitAPI;
  readonly enabled: boolean;
}

export async function getGitApi(): Promise<GitAPI | undefined> {
  const ext = vscode.extensions.getExtension<GitExtensionExports>("vscode.git");
  if (!ext) return undefined;
  const exports = ext.isActive ? ext.exports : await ext.activate();
  try {
    return exports.getAPI(1);
  } catch {
    return undefined;
  }
}

export function repoRoot(repo: GitRepository): string {
  return repo.rootUri.fsPath;
}

export function changedFiles(repo: GitRepository, staged: boolean): string[] {
  const changes = staged ? repo.state.indexChanges : repo.state.workingTreeChanges;
  const root = repoRoot(repo);
  return changes.map((c) => relative(root, c.uri.fsPath));
}

export function hasStagedChanges(repo: GitRepository): boolean {
  return repo.state.indexChanges.length > 0;
}

/** Staged diff (index vs HEAD). */
export async function getStagedDiff(repo: GitRepository): Promise<string> {
  return repo.diff(true);
}

/** All uncommitted changes (HEAD vs working tree), for the "nothing staged" fallback. */
export async function getAllDiff(repo: GitRepository): Promise<string> {
  try {
    return await repo.diffWithHEAD();
  } catch {
    const [staged, unstaged] = await Promise.all([repo.diff(true), repo.diff(false)]);
    return [staged, unstaged].filter(Boolean).join("\n");
  }
}

export async function recentSubjects(repo: GitRepository, n = 5): Promise<string[]> {
  try {
    const commits = await repo.log({ maxEntries: n });
    return commits.map((c) => c.message.split("\n")[0].trim()).filter(Boolean);
  } catch {
    return []; // first commit in repo, or API unavailable — fine
  }
}

export interface TruncatedDiff {
  text: string;
  truncated: boolean;
}

export function truncateDiff(diff: string, maxChars: number): TruncatedDiff {
  if (diff.length <= maxChars) {
    return { text: diff, truncated: false };
  }
  const cut = diff.slice(0, maxChars);
  const lastNewline = cut.lastIndexOf("\n");
  const head = lastNewline > 0 ? cut.slice(0, lastNewline) : cut;
  return {
    text: `${head}\n... (diff truncated: ${diff.length} chars total, sent first ${head.length})`,
    truncated: true,
  };
}
