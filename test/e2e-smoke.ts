/**
 * Manual end-to-end smoke test: real CLI calls through the full pipeline
 * (buildPrompt → exec → parse → extractCommitMessage).
 * Run: npx tsx test/e2e-smoke.ts
 * Not part of `npm test` — costs real tokens.
 */
import { buildPrompt, extractCommitMessage } from "../src/prompt";
import { buildOpencodeArgs, parseOpencodeOutput } from "../src/runners/opencode";
import { buildClaudeArgs, parseClaudeOutput } from "../src/runners/claude";
import { exec } from "../src/runner";
import { detectProviders } from "../src/detect";

const diff = `diff --git a/src/auth.ts b/src/auth.ts
index 1234567..89abcde 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -10,6 +10,9 @@ export function login(user: string) {
   const token = getToken(user);
+  if (!token) {
+    throw new Error("missing token");
+  }
   return token;
 }`;

const prompt = buildPrompt({
  diff,
  files: ["src/auth.ts"],
  recentSubjects: ["feat: add login flow", "fix: token refresh race"],
  branch: "feature/auth",
  style: "conventional",
  language: "en",
  includeBody: false,
});

async function attempt(provider: "opencode" | "claude", bin: string, model?: string) {
  const args =
    provider === "opencode"
      ? buildOpencodeArgs(prompt, model, true)
      : buildClaudeArgs(prompt, model);
  const t0 = Date.now();
  const result = await exec({ bin, args, cwd: process.cwd(), timeoutMs: 90000 });
  const raw =
    provider === "opencode" ? parseOpencodeOutput(result.stdout) : parseClaudeOutput(result.stdout);
  const message = extractCommitMessage(raw);
  console.log(`[${provider} ${model ?? "default"}] ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  raw reply: ${JSON.stringify(raw.slice(0, 200))}`);
  console.log(`  message:   ${JSON.stringify(message)}`);
  return message;
}

async function main() {
  const providers = await detectProviders();
  console.log("detected:", providers.map((p) => `${p.provider}@${p.bin} (${p.version})`).join(", "));

  const results: string[] = [];
  for (const p of providers) {
    const model = p.provider === "opencode" ? "anthropic/claude-haiku-4-5" : undefined;
    try {
      results.push(await attempt(p.provider, p.bin, model));
    } catch (e) {
      console.error(`[${p.provider}] FAILED:`, e instanceof Error ? `${(e as any).kind ?? ""} ${e.message.slice(0, 200)}` : e);
    }
  }

  const ok = results.filter((m) => m.length > 0 && !/<commit>/i.test(m) && m.length < 200);
  console.log(`\n${ok.length}/${results.length} clean messages`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
