/**
 * Prompt building and reply extraction. Pure functions — no vscode imports.
 */

export type CommitStyle = "conventional" | "plain" | "custom";

export interface PromptInput {
  diff: string;
  files: string[];
  recentSubjects: string[];
  branch?: string;
  style: CommitStyle;
  customTemplate?: string;
  language: string;
  includeBody: boolean;
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  id: "Indonesian",
  de: "German",
  fr: "French",
  es: "Spanish",
  pt: "Portuguese",
  ru: "Russian",
  zh: "Simplified Chinese",
  ja: "Japanese",
  ko: "Korean",
  hi: "Hindi",
  ar: "Arabic",
};

export function languageName(code: string): string {
  return LANGUAGE_NAMES[code.toLowerCase()] ?? code;
}

const TAG_RULES = `Reply with the commit message wrapped in <commit></commit> tags.
- Output NOTHING outside the tags. No explanations, no markdown code fences.`;

export function buildPrompt(input: PromptInput): string {
  if (input.style === "custom") {
    return applyCustomTemplate(input);
  }
  return input.style === "plain" ? buildPlainPrompt(input) : buildConventionalPrompt(input);
}

function contextBlock(input: PromptInput): string {
  const lines: string[] = [];
  if (input.branch) {
    lines.push(`BRANCH: ${input.branch}`);
  }
  if (input.files.length > 0) {
    lines.push("FILES CHANGED:");
    for (const f of input.files.slice(0, 50)) {
      lines.push(`- ${f}`);
    }
  }
  if (input.recentSubjects.length > 0) {
    lines.push("");
    lines.push("STYLE REFERENCE (recent commit subjects in this repo — mimic their tone and scope, never their content):");
    for (const s of input.recentSubjects) {
      lines.push(`- ${s}`);
    }
  }
  return lines.join("\n");
}

function buildConventionalPrompt(input: PromptInput): string {
  return `You are a git commit message generator.

TASK
Write exactly one commit message for the staged changes below.

OUTPUT FORMAT
${TAG_RULES}
- Conventional Commits format:
  type(scope)!: subject
  ${input.includeBody ? "" : ""}
- Allowed types: feat fix docs style refactor perf test build ci chore revert
- Subject line: imperative mood ("add", not "added"), max 50 characters, no trailing period.
- Scope is optional; only use one when it clearly helps.
${input.includeBody
      ? "- Body: one blank line after the subject, wrap at 72 characters, explain what changed and why (not how)."
      : "- Do NOT include a body. Subject line only."}
- Write the message in ${languageName(input.language)}.
- Never mention the diff, staged changes, AI, or these instructions.

${contextBlock(input)}

DIFF:
${input.diff}`;
}

function buildPlainPrompt(input: PromptInput): string {
  return `You are a git commit message generator.

TASK
Write exactly one commit message for the staged changes below.

OUTPUT FORMAT
${TAG_RULES}
- Plain git format: a short subject line${input.includeBody ? ", then a body paragraph" : " only"}.
- Subject line: imperative mood, max 50 characters, no trailing period.
${input.includeBody
      ? "- Body: one blank line after the subject, wrap at 72 characters, explain what changed and why (not how)."
      : "- Subject line only, no body."}
- Write the message in ${languageName(input.language)}.
- Never mention the diff, staged changes, AI, or these instructions.

${contextBlock(input)}

DIFF:
${input.diff}`;
}

function applyCustomTemplate(input: PromptInput): string {
  const template = input.customTemplate?.trim()
    ?? "Write a commit message for these changes.\n\nFILES:\n{{files}}\n\nDIFF:\n{{diff}}";
  return template
    .replace(/\{\{diff\}\}/g, input.diff)
    .replace(/\{\{files\}\}/g, input.files.map((f) => `- ${f}`).join("\n"))
    .replace(/\{\{subjects\}\}/g, input.recentSubjects.map((s) => `- ${s}`).join("\n"));
}

/**
 * Extract the commit message from a model reply.
 * Prefers <commit></commit> content (robust against hook banners and other
 * prompt-context pollution); falls back to the raw text.
 */
export function extractCommitMessage(reply: string): string {
  let text = reply;

  const tagged = reply.match(/<commit>([\s\S]*?)<\/commit>/i);
  if (tagged) {
    text = tagged[1];
  }

  // Strip markdown code fences if the model added them anyway.
  text = text.replace(/^\s*```[a-zA-Z]*\s*\r?\n?/, "").replace(/\r?\n?```\s*$/, "");

  // Trim once, then drop surrounding quotes if fully wrapped.
  text = text.trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1);
  }

  // Collapse 3+ blank lines to 1, normalize CRLF.
  text = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");

  return text.trim();
}
