import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAttempts, NoProviderError } from "../src/fallback";

const opencode = { provider: "opencode" as const, bin: "/bin/opencode" };
const claude = { provider: "claude" as const, bin: "/bin/claude" };

test("auto with both: primary opencode + model, then claude fallback", () => {
  const attempts = buildAttempts({
    providerSetting: "auto",
    model: "anthropic/claude-haiku-4-5",
    fallbackModel: "",
    fallbackProvider: true,
    available: [opencode, claude],
  });
  assert.deepEqual(
    attempts.map((a) => `${a.provider}:${a.model ?? "default"}`),
    ["opencode:anthropic/claude-haiku-4-5", "claude:default"]
  );
});

test("explicit provider respected even if second in auto order", () => {
  const attempts = buildAttempts({
    providerSetting: "claude",
    model: "sonnet",
    fallbackModel: "haiku",
    fallbackProvider: true,
    available: [opencode, claude],
  });
  assert.deepEqual(
    attempts.map((a) => `${a.provider}:${a.model ?? "default"}`),
    ["claude:sonnet", "claude:haiku", "opencode:default"]
  );
});

test("fallbackProvider=false keeps single provider only", () => {
  const attempts = buildAttempts({
    providerSetting: "auto",
    model: "",
    fallbackModel: "",
    fallbackProvider: false,
    available: [opencode, claude],
  });
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].provider, "opencode");
});

test("no providers throws NoProviderError", () => {
  assert.throws(
    () => buildAttempts({ providerSetting: "auto", fallbackProvider: true, available: [] }),
    NoProviderError
  );
});

test("explicit provider not installed throws NoProviderError", () => {
  assert.throws(
    () => buildAttempts({ providerSetting: "claude", fallbackProvider: true, available: [opencode] }),
    NoProviderError
  );
});

test("duplicate attempt (same model as fallback) deduped", () => {
  const attempts = buildAttempts({
    providerSetting: "auto",
    model: "m1",
    fallbackModel: "m1",
    fallbackProvider: true,
    available: [claude],
  });
  assert.equal(attempts.length, 1);
});
