import * as vscode from "vscode";
import { exec } from "./runner";
import type { Provider } from "./runner";

/**
 * Model listing + pickers.
 */

/** Curated presets for Claude Code (aliases work with --model). */
export const CLAUDE_MODEL_PRESETS: string[] = [
  "sonnet",
  "haiku",
  "opus",
  "claude-sonnet-4-5",
  "claude-haiku-5-5",
  "claude-opus-4-8",
];

/** Fetch live model list from opencode: `opencode models`, one per line. */
export async function fetchOpencodeModels(bin: string): Promise<string[]> {
  try {
    const result = await exec({
      bin,
      args: ["models"],
      cwd: process.env.HOME ?? process.cwd(),
      timeoutMs: 15000,
    });
    return result.stdout
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("DEV") && l.includes("/"))
      .slice(0, 200);
  } catch {
    return [];
  }
}

export async function pickModel(
  provider: Provider,
  bin: string,
  current: string
): Promise<string | undefined> {
  const items: (vscode.QuickPickItem & { model?: string })[] = [
    { label: "$(circle-filled) Default", description: "CLI default model", model: "" },
  ];

  const models =
    provider === "opencode"
      ? await fetchOpencodeModels(bin)
      : CLAUDE_MODEL_PRESETS;

  if (models.length > 0) {
    items.push({ label: "Models", kind: vscode.QuickPickItemKind.Separator });
    for (const m of models) {
      const isCurrent = m === current;
      items.push({
        label: (isCurrent ? "$(check) " : "") + m,
        model: m,
      });
    }
  }

  items.push({ label: "$(pencil) Enter custom model ID…", model: "__custom__" });

  const picked = await vscode.window.showQuickPick(items, {
    title: `Smart Commit: model for ${provider}`,
    placeHolder: current ? `Current: ${current}` : "Current: CLI default",
    matchOnDescription: true,
  });
  if (!picked || picked.model === undefined) return undefined;

  if (picked.model === "__custom__") {
    return await vscode.window.showInputBox({
      title: `Custom model for ${provider}`,
      placeHolder:
        provider === "opencode" ? "anthropic/claude-haiku-4-5" : "claude-haiku-5-5",
      value: current,
      prompt: provider === "opencode" ? "Format: provider/model" : "Alias or full model ID",
    });
  }
  return picked.model;
}
