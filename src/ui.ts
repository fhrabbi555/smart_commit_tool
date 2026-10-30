import * as vscode from "vscode";
import type { Provider } from "./runner";

/**
 * Status bar + progress helpers.
 */

export class StatusBar {
  private item: vscode.StatusBarItem;

  constructor(command = "smartCommit.selectModel") {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 60);
    this.item.command = command;
    this.item.name = "Smart Commit";
    this.set("detecting…");
    this.item.show();
  }

  set(text: string, tooltip?: string): void {
    this.item.text = `$(sparkle) ${text}`;
    this.item.tooltip = tooltip ?? `Smart Commit — click to change model. ${text}`;
  }

  update(provider: Provider | undefined, model: string | undefined, available: number, fastPath = false): void {
    if (!provider || available === 0) {
      this.set("no CLI found", "Smart Commit: no opencode/Claude Code CLI detected. Click for options.");
      return;
    }
    const label = `${provider} · ${model?.trim() || "default"}`;
    this.set(
      fastPath ? `${label} ⚡` : label,
      fastPath
        ? `Smart Commit — fast path: this worked last time and runs first. Click to open settings. ${label}`
        : `Smart Commit — click to change model. ${label}`
    );
  }

  dispose(): void {
    this.item.dispose();
  }
}

export function humanError(kind: string, provider: string): string {
  switch (kind) {
    case "auth":
      return `${provider} is not logged in or its credentials were rejected. Run \`${provider}\` once in a terminal to log in, then retry.`;
    case "quota":
      return `${provider} hit a quota/credit limit (plan or provider credits exhausted).`;
    case "timeout":
      return `${provider} timed out.`;
    case "notfound":
      return `${provider} binary disappeared mid-run.`;
    default:
      return `${provider} failed.`;
  }
}
