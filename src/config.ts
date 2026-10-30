import * as vscode from "vscode";
import type { CommitStyle } from "./prompt";

export interface SmartCommitConfig {
  provider: "auto" | "opencode" | "claude";
  model: string;
  fallbackModel: string;
  fallbackProvider: boolean;
  style: CommitStyle;
  customTemplate: string;
  language: string;
  includeBody: boolean;
  autoCommit: boolean;
  stagingMode: "auto" | "prompt";
  maxDiffChars: number;
  timeoutMs: number;
  mimicRepoStyle: boolean;
}

export function getConfig(): SmartCommitConfig {
  const cfg = vscode.workspace.getConfiguration("smartCommit");
  return {
    provider: cfg.get<"auto" | "opencode" | "claude">("provider", "auto"),
    model: cfg.get<string>("model", ""),
    fallbackModel: cfg.get<string>("fallbackModel", ""),
    fallbackProvider: cfg.get<boolean>("fallbackProvider", true),
    style: cfg.get<CommitStyle>("style", "conventional"),
    customTemplate: cfg.get<string>("customTemplate", ""),
    language: cfg.get<string>("language", "en"),
    includeBody: cfg.get<boolean>("includeBody", false),
    autoCommit: cfg.get<boolean>("autoCommit", false),
    stagingMode: cfg.get<"auto" | "prompt">("stagingMode", "auto"),
    maxDiffChars: cfg.get<number>("maxDiffChars", 8000),
    timeoutMs: cfg.get<number>("timeoutMs", 60000),
    mimicRepoStyle: cfg.get<boolean>("mimicRepoStyle", true),
  };
}
