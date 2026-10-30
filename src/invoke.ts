import * as vscode from "vscode";
import { CliError, exec, type Provider } from "./runner";
import { buildClaudeArgs, parseClaudeOutput } from "./runners/claude";
import { buildOpencodeArgs, parseOpencodeOutput } from "./runners/opencode";

/**
 * Shared headless CLI invocation used by both the generate command and the
 * settings page test-connection button.
 */

export const OUTPUT = vscode.window.createOutputChannel("Smart Commit");

export interface InvokeOptions {
  provider: Provider;
  bin: string;
  prompt: string;
  model: string | undefined;
  cwd: string;
  timeoutMs: number;
  signal: AbortSignal;
}

export async function invokePrompt(opts: InvokeOptions): Promise<string> {
  const { provider, bin, prompt, model, cwd, timeoutMs, signal } = opts;
  const isOpencode = provider === "opencode";

  const call = (args: string[]) =>
    exec({ bin, args, cwd, timeoutMs, signal }).then((result) => {
      const raw = isOpencode ? parseOpencodeOutput(result.stdout) : parseClaudeOutput(result.stdout);
      OUTPUT.appendLine(`[ok] ${provider} returned ${raw.length} chars`);
      return raw;
    });

  if (!isOpencode) {
    return call(buildClaudeArgs(prompt, model));
  }

  // opencode shares a background service across calls; if it hangs, retry once
  // with --standalone (private server, immune to a stuck shared server).
  try {
    OUTPUT.appendLine(`[run] opencode run --format json model=${model ?? "default"}`);
    return await call(buildOpencodeArgs(prompt, model));
  } catch (e) {
    if (e instanceof CliError && e.kind === "timeout" && !signal.aborted) {
      OUTPUT.appendLine(`[retry] opencode timed out, retrying with --standalone`);
      return call(buildOpencodeArgs(prompt, model, true));
    }
    throw e;
  }
}
