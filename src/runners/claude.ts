import { CliError } from "../runner";

/**
 * Claude Code runner. Pure arg building + parsing — no vscode imports.
 *
 * Headless call: claude -p --output-format json [--model <model>] "<prompt>"
 * Output: one JSON object; the answer is in .result. Hook banners (plugins
 * like claude-mem) can leak text into .result, so callers must extract the
 * message via <commit> tags (prompt.ts) rather than trusting .result verbatim.
 */

export function buildClaudeArgs(prompt: string, model?: string): string[] {
  const args = ["-p", "--output-format", "json"];
  if (model && model.trim()) {
    args.push("--model", model.trim());
  }
  args.push(prompt);
  return args;
}

export function parseClaudeOutput(stdout: string): string {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new CliError("claude output contained no JSON object", { kind: "parse", stdout });
  }

  let data: any;
  try {
    data = JSON.parse(stdout.slice(start, end + 1));
  } catch {
    throw new CliError("claude output was not valid JSON", { kind: "parse", stdout });
  }

  const isError =
    data.is_error === true ||
    (typeof data.subtype === "string" && data.subtype.startsWith("error"));

  if (isError) {
    const message =
      (typeof data.result === "string" && data.result) ||
      (typeof data.error_message === "string" && data.error_message) ||
      "claude reported an error";
    throw new CliError(message.slice(0, 400), { kind: "unknown", stdout });
  }

  if (typeof data.result !== "string" || !data.result.trim()) {
    throw new CliError("claude result field was empty", { kind: "parse", stdout });
  }
  return data.result;
}
