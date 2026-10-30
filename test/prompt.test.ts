import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPrompt, extractCommitMessage } from "../src/prompt";

const base = {
  diff: "diff --git a/src/a.ts b/src/a.ts\n+added line",
  files: ["src/a.ts"],
  recentSubjects: [],
  style: "conventional" as const,
  language: "en",
  includeBody: false,
};

test("conventional prompt contains tags rule and diff", () => {
  const p = buildPrompt(base);
  assert.ok(p.includes("<commit></commit>"), "must demand tagged output");
  assert.ok(p.includes("Conventional Commits"));
  assert.ok(p.includes(base.diff));
  assert.ok(p.includes("imperative"));
});

test("plain prompt has no conventional section", () => {
  const p = buildPrompt({ ...base, style: "plain" });
  assert.ok(!p.includes("Conventional Commits"));
  assert.ok(p.includes("<commit></commit>"));
});

test("custom template placeholders are replaced", () => {
  const p = buildPrompt({
    ...base,
    style: "custom",
    customTemplate: "FILES: {{files}}\nDIFF: {{diff}}\nSUBJECTS: {{subjects}}",
  });
  assert.ok(p.includes("FILES: - src/a.ts"));
  assert.ok(p.includes("DIFF: diff --git"));
  assert.ok(p.includes("SUBJECTS:"));
});

test("recent subjects and branch appear", () => {
  const p = buildPrompt({ ...base, recentSubjects: ["feat: x"], branch: "main" });
  assert.ok(p.includes("- feat: x"));
  assert.ok(p.includes("BRANCH: main"));
});

test("extract: tagged reply wins over pollution banner", () => {
  const reply =
    "Heads up: claude-mem can't save memories right now — allowance exhausted.\n\n<commit>feat: add login guard</commit>";
  assert.equal(extractCommitMessage(reply), "feat: add login guard");
});

test("extract: code fences stripped", () => {
  assert.equal(extractCommitMessage("<commit>\n```\nfix: null check\n```\n</commit>"), "fix: null check");
});

test("extract: fallback to raw text without tags", () => {
  assert.equal(extractCommitMessage("chore: bump deps"), "chore: bump deps");
});

test("extract: surrounding quotes stripped", () => {
  assert.equal(extractCommitMessage('<commit>"docs: update readme"</commit>'), "docs: update readme");
});

test("extract: multiline body preserved, CRLF normalized, triple blank lines collapsed", () => {
  const msg = extractCommitMessage(
    "<commit>feat: add search\r\n\r\n\r\n\r\nBody line.</commit>"
  );
  assert.equal(msg, "feat: add search\n\nBody line.");
});
