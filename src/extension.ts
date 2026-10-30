import * as vscode from "vscode";
import { getConfig } from "./config";
import { detectProviders } from "./detect";
import {
  getAllDiff,
  changedFiles,
  getGitApi,
  getStagedDiff,
  hasStagedChanges,
  recentSubjects,
  repoRoot,
  truncateDiff,
  type GitRepository,
} from "./diff";
import { buildAttempts, type ProviderInfo } from "./fallback";
import { buildPrompt, extractCommitMessage } from "./prompt";
import { CliError, exec, type Provider } from "./runner";
import { invokePrompt, OUTPUT } from "./invoke";
import { pickModel } from "./models";
import { SettingsPage } from "./settingsPage";
import { humanError, StatusBar } from "./ui";

let available: ProviderInfo[] = [];
let statusBar: StatusBar;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  statusBar = new StatusBar("smartCommit.settings");

  void refreshDetection(false);

  context.subscriptions.push(
    statusBar,
    vscode.commands.registerCommand("smartCommit.generate", generate),
    vscode.commands.registerCommand("smartCommit.settings", () => SettingsPage.open(context)),
    vscode.commands.registerCommand("smartCommit.selectModel", selectModel),
    vscode.commands.registerCommand("smartCommit.selectProvider", selectProvider),
    vscode.commands.registerCommand("smartCommit.redetect", () => refreshDetection(true))
  );
}

export function deactivate(): void {
  // handled via subscriptions
}

async function refreshDetection(userInitiated: boolean): Promise<void> {
  available = await detectProviders();
  const cfg = getConfig();
  const primary =
    cfg.provider === "auto"
      ? available[0]?.provider
      : available.find((p) => p.provider === cfg.provider)?.provider;
  statusBar.update(primary, cfg.model, available.length);

  if (userInitiated) {
    const names = available.map((p) => `${p.provider} (${p.version ?? "?"}) → ${p.bin}`).join("\n") || "none found";
    vscode.window.showInformationMessage(`Smart Commit providers detected:\n${names}`);
  }
}

async function pickRepository(repos: GitRepository[]): Promise<GitRepository | undefined> {
  if (repos.length === 0) {
    vscode.window.showWarningMessage("Smart Commit: open a folder containing a git repository first.");
    return undefined;
  }
  if (repos.length === 1) return repos[0];
  const picked = await vscode.window.showQuickPick(
    repos.map((r) => ({ label: r.state.HEAD?.name ?? "(no branch)", description: repoRoot(r), repo: r })),
    { title: "Smart Commit: pick repository", placeHolder: "Multiple git repositories open" }
  );
  return picked?.repo;
}

async function generate(): Promise<void> {
  const cfg = getConfig();

  const git = await getGitApi();
  if (!git) {
    vscode.window.showErrorMessage("Smart Commit: built-in Git extension unavailable.");
    return;
  }
  const repo = await pickRepository(git.repositories);
  if (!repo) return;

  // Source diff: staged if present. Otherwise follow stagingMode:
  // "auto" = direct action (stage all, no popup), "prompt" = ask each time.
  let diff: string;
  let files: string[];
  const stageAll = async (): Promise<void> => {
    await exec({
      bin: "git",
      args: ["add", "-A"],
      cwd: repoRoot(repo),
      timeoutMs: 15000,
      signal: new AbortController().signal,
    });
  };

  if (hasStagedChanges(repo)) {
    diff = await getStagedDiff(repo);
    files = changedFiles(repo, true);
  } else if (repo.state.workingTreeChanges.length > 0) {
    if (cfg.stagingMode === "prompt") {
      const pick = await vscode.window.showQuickPick(
        [
          {
            label: "$(plus) Stage all changes and generate",
            description: "git add -A, then generate from the staged diff",
            action: "stage",
          },
          {
            label: "$(diff) Generate from unstaged changes",
            description: "keep files unstaged, describe working-tree changes",
            action: "unstaged",
          },
          { label: "$(close) Cancel", action: "cancel" },
        ],
        {
          title: "Smart Commit: nothing is staged yet",
          placeHolder: "You have modified files — pick how to continue",
        }
      );
      if (!pick || pick.action === "cancel") return;
      if (pick.action === "stage") {
        try {
          await stageAll();
        } catch (e) {
          vscode.window.showErrorMessage(`Smart Commit: git add failed: ${String(e)}`);
          return;
        }
        diff = await getStagedDiff(repo);
        files = changedFiles(repo, true);
      } else {
        diff = await getAllDiff(repo);
        files = changedFiles(repo, false);
      }
    } else {
      // Direct action: auto-stage all, no popup.
      try {
        await stageAll();
      } catch (e) {
        vscode.window.showErrorMessage(`Smart Commit: git add failed: ${String(e)}`);
        return;
      }
      diff = await getStagedDiff(repo);
      files = changedFiles(repo, true);
    }
  } else {
    vscode.window.showInformationMessage(
      "Smart Commit: no changes found in this repository. Edit some files first."
    );
    return;
  }

  if (!diff.trim()) {
    vscode.window.showInformationMessage("Smart Commit: no changes to describe.");
    return;
  }

  const { text: boundedDiff } = truncateDiff(diff, cfg.maxDiffChars);
  const subjects = cfg.mimicRepoStyle ? await recentSubjects(repo, 5) : [];
  const prompt = buildPrompt({
    diff: boundedDiff,
    files,
    recentSubjects: subjects,
    branch: repo.state.HEAD?.name,
    style: cfg.style,
    customTemplate: cfg.customTemplate,
    language: cfg.language,
    includeBody: cfg.includeBody,
  });

  if (available.length === 0) {
    await refreshDetection(false);
  }

  let attempts;
  try {
    attempts = buildAttempts({
      providerSetting: cfg.provider,
      model: cfg.model,
      fallbackModel: cfg.fallbackModel,
      fallbackProvider: cfg.fallbackProvider,
      available,
    });
  } catch {
    if (cfg.provider !== "auto" && available.length > 0) {
      const switchPick = await vscode.window.showErrorMessage(
        `Smart Commit: provider "${cfg.provider}" is not detected, but ${available
          .map((p) => p.provider)
          .join(" and ")} ${available.length > 1 ? "are" : "is"}. Switch provider?`,
        "Switch"
      );
      if (switchPick === "Switch") {
        await vscode.workspace.getConfiguration("smartCommit").update("provider", available[0].provider, vscode.ConfigurationTarget.Global);
        statusBar.update(available[0].provider, cfg.model, available.length);
      }
      return;
    }
    const pick = await vscode.window.showErrorMessage(
      "Smart Commit: no opencode or Claude Code CLI detected. Install one, log in, then re-detect.",
      "Install opencode",
      "Install Claude Code"
    );
    if (pick === "Install opencode") {
      vscode.env.openExternal(vscode.Uri.parse("https://opencode.ai/docs/"));
    } else if (pick === "Install Claude Code") {
      vscode.env.openExternal(vscode.Uri.parse("https://claude.com/claude-code"));
    }
    return;
  }

  const controller = new AbortController();
  const failures: string[] = [];

  const reply = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Smart Commit: generating…",
      cancellable: true,
    },
    async (progress, token) => {
      token.onCancellationRequested(() => controller.abort());
      for (let i = 0; i < attempts.length; i++) {
        const attempt = attempts[i];
        progress.report({ message: `${attempt.label} (${i + 1}/${attempts.length})` });
        try {
          return await invokePrompt({
            provider: attempt.provider,
            bin: attempt.bin,
            prompt,
            model: attempt.model,
            cwd: repoRoot(repo),
            timeoutMs: cfg.timeoutMs,
            signal: controller.signal,
          });
        } catch (e) {
          if (controller.signal.aborted) return undefined;
          if (e instanceof CliError) {
            OUTPUT.appendLine(`[fail] ${attempt.label}: kind=${e.kind} ${e.message}`);
            failures.push(`${attempt.label}: ${humanError(e.kind, attempt.provider)}`);
          } else {
            OUTPUT.appendLine(`[fail] ${attempt.label}: ${String(e)}`);
            failures.push(`${attempt.label}: ${String(e)}`);
          }
        }
      }
      return undefined;
    }
  );

  if (reply === undefined) {
    if (!controller.signal.aborted && failures.length > 0) {
      const pick = await vscode.window.showErrorMessage(
        `Smart Commit: all attempts failed.\n${failures.join("\n")}`,
        "Show Output"
      );
      if (pick === "Show Output") OUTPUT.show();
    }
    return;
  }

  const message = extractCommitMessage(reply);
  if (!message) {
    vscode.window.showErrorMessage("Smart Commit: model returned an empty message.");
    return;
  }

  if (cfg.autoCommit) {
    try {
      await repo.commit(message);
      vscode.window.showInformationMessage(`Smart Commit: committed.\n${message.split("\n")[0]}`);
    } catch (e) {
      vscode.window.showErrorMessage(`Smart Commit: commit failed: ${String(e)}. Message was placed in the SCM input box.`);
      repo.inputBox.value = message;
    }
    return;
  }

  repo.inputBox.value = message;
  await vscode.commands.executeCommand("workbench.scm.focus");
  vscode.window.showInformationMessage("Smart Commit: message ready — review, edit if needed, then ⌘/Ctrl+Enter to commit.");
}

async function resolvedProvider(cfgProvider: "auto" | Provider): Promise<ProviderInfo | undefined> {
  if (available.length === 0) {
    available = await detectProviders();
  }
  if (cfgProvider === "auto") return available[0];
  return available.find((p) => p.provider === cfgProvider);
}

async function selectModel(): Promise<void> {
  const cfg = getConfig();
  const primary = await resolvedProvider(cfg.provider);
  if (!primary) {
    vscode.window.showWarningMessage("Smart Commit: no CLI detected. Run 'Smart Commit: Re-detect Providers' after installing.");
    return;
  }
  const model = await pickModel(primary.provider, primary.bin, cfg.model);
  if (model === undefined) return;
  await vscode.workspace.getConfiguration("smartCommit").update("model", model, vscode.ConfigurationTarget.Global);
  statusBar.update(primary.provider, model, available.length);
  vscode.window.showInformationMessage(
    `Smart Commit: model set to ${model || "CLI default"} for ${primary.provider}.`
  );
}

async function selectProvider(): Promise<void> {
  const cfg = getConfig();
  const detected = new Set(available.map((p) => p.provider));
  const items: (vscode.QuickPickItem & { value?: "auto" | Provider })[] = [
    { label: "$(zap) auto", description: "use first detected", value: "auto" },
    {
      label: "opencode",
      description: detected.has("opencode") ? "detected ✓" : "not detected",
      value: "opencode",
    },
    {
      label: "claude",
      description: detected.has("claude") ? "detected ✓" : "not detected",
      value: "claude",
    },
  ];
  const picked = await vscode.window.showQuickPick(items, { title: "Smart Commit: provider" });
  if (!picked?.value) return;
  await vscode.workspace.getConfiguration("smartCommit").update("provider", picked.value, vscode.ConfigurationTarget.Global);
  const primary = await resolvedProvider(picked.value);
  statusBar.update(primary?.provider, cfg.model, available.length);
  vscode.window.showInformationMessage(`Smart Commit: provider set to ${picked.value}.`);
}
