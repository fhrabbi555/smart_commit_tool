import { CliError, classifyFailure } from "../runner";

/**
 * opencode runner. Pure arg building + parsing — no vscode imports.
 *
 * Headless call: opencode run [--model provider/model] --format json "<prompt>"
 * Output: NDJSON stream, one JSON object per line:
 *   step lines: {"type":"step_start","part":{...}}
 *   text lines: {"type":"text","part":{"type":"text","text":"..."}}
 *   errors:     {"type":"error","error":{"type":"provider.quota","message":"...","status":402}}
 */

export function buildOpencodeArgs(prompt: string, model?: string, standalone = false): string[] {
  const args = ["run"];
  if (standalone) {
    // Private server per call — slower, but immune to a stuck background service.
    args.push("--standalone");
  }
  args.push("--format", "json");
  if (model && model.trim()) {
    args.push("--model", model.trim());
  }
  args.push(prompt);
  return args;
}

export function parseOpencodeOutput(stdout: string): string {
  const lines = stdout.split("\n").filter((l) => l.trim().length > 0);
  let text = "";

  for (const line of lines) {
    let obj: any;
    try {
      obj = JSON.parse(line);
    } catch {
      continue; // tolerate stray non-JSON lines
    }

    if (obj.type === "error") {
      const err = obj.error ?? {};
      const message = typeof err.message === "string" ? err.message : "opencode reported an error";
      throw new CliError(message, {
        kind: classifyFailure(`${err.type ?? ""} ${message}`, typeof err.status === "number" ? err.status : null),
        stdout,
      });
    }

    const part = obj.part;
    if (part && part.type === "text" && typeof part.text === "string") {
      text += part.text;
    }
  }

  if (!text.trim()) {
    throw new CliError("opencode returned no text output", { kind: "parse", stdout });
  }
  return text;
}
