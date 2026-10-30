import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOpencodeOutput, buildOpencodeArgs } from "../src/runners/opencode";
import { parseClaudeOutput, buildClaudeArgs } from "../src/runners/claude";
import { CliError } from "../src/runner";

// Fixtures below are REAL outputs captured from the CLIs on 2026-10-30.

test("opencode: text parts are joined", () => {
  const ndjson = [
    '{"type":"step_start","timestamp":1,"sessionID":"ses_1","part":{"id":"p1","type":"step-start"}}',
    '{"type":"text","timestamp":2,"sessionID":"ses_1","part":{"id":"p2","type":"text","text":"feat: "}}',
    '{"type":"text","timestamp":3,"sessionID":"ses_1","part":{"id":"p3","type":"text","text":"add guard"}}',
  ].join("\n");
  assert.equal(parseOpencodeOutput(ndjson), "feat: add guard");
});

test("opencode: quota error line throws CliError kind=quota", () => {
  const ndjson =
    '{"type":"error","timestamp":1793348568581,"sessionID":"ses_x","error":{"type":"provider.quota","message":"Insufficient credits. This account never purchased credits.","status":402}}';
  assert.throws(
    () => parseOpencodeOutput(ndjson),
    (e: unknown) => e instanceof CliError && e.kind === "quota"
  );
});

test("opencode: non-JSON stray lines tolerated", () => {
  const ndjson = 'some banner line\n{"type":"text","part":{"type":"text","text":"fix: x"}}';
  assert.equal(parseOpencodeOutput(ndjson), "fix: x");
});

test("opencode: empty output throws parse error", () => {
  assert.throws(
    () => parseOpencodeOutput(""),
    (e: unknown) => e instanceof CliError && e.kind === "parse"
  );
});

test("opencode: args include model and json format", () => {
  const args = buildOpencodeArgs("PROMPT", "anthropic/claude-haiku-4-5");
  assert.deepEqual(args, ["run", "--format", "json", "--model", "anthropic/claude-haiku-4-5", "PROMPT"]);
});

test("opencode: standalone args", () => {
  const args = buildOpencodeArgs("PROMPT", undefined, true);
  assert.deepEqual(args, ["run", "--standalone", "--format", "json", "PROMPT"]);
});

test("opencode: no model flag when model empty", () => {
  const args = buildOpencodeArgs("PROMPT", "");
  assert.deepEqual(args, ["run", "--format", "json", "PROMPT"]);
});

test("claude: result extracted from full JSON (real shape)", () => {
  const json = JSON.stringify({
    subtype: "success",
    is_error: false,
    num_turns: 1,
    result: "banner text\n\n<commit>feat: x</commit>",
    type: "result",
  });
  assert.equal(parseClaudeOutput(json), "banner text\n\n<commit>feat: x</commit>");
});

test("claude: leading noise before JSON tolerated", () => {
  const json = `hook banner\n{"subtype":"success","is_error":false,"result":"OK"}`;
  assert.equal(parseClaudeOutput(json), "OK");
});

test("claude: is_error true throws", () => {
  const json = JSON.stringify({ subtype: "error_during_execution", is_error: true, result: "boom" });
  assert.throws(
    () => parseClaudeOutput(json),
    (e: unknown) => e instanceof CliError && /boom/.test(e.message)
  );
});

test("claude: empty result throws parse", () => {
  const json = JSON.stringify({ subtype: "success", is_error: false, result: "" });
  assert.throws(
    () => parseClaudeOutput(json),
    (e: unknown) => e instanceof CliError && e.kind === "parse"
  );
});

test("claude: args order", () => {
  assert.deepEqual(buildClaudeArgs("P", "sonnet"), ["-p", "--output-format", "json", "--model", "sonnet", "P"]);
  assert.deepEqual(buildClaudeArgs("P"), ["-p", "--output-format", "json", "P"]);
});
