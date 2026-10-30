import { homedir, platform } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import type { Provider, ExecResult } from "./runner";
import type { ProviderInfo } from "./fallback";

/**
 * Provider detection: PATH lookup + known install locations.
 * Pure child_process use — no vscode imports, so it stays unit-testable.
 *
 * Env overrides (mainly for tests / exotic installs):
 *   SMART_COMMIT_OPENCODE_BIN, SMART_COMMIT_CLAUDE_BIN
 */

const ENV_OVERRIDE: Record<Provider, string> = {
  opencode: "SMART_COMMIT_OPENCODE_BIN",
  claude: "SMART_COMMIT_CLAUDE_BIN",
};

function knownPaths(provider: Provider): string[] {
  const home = homedir();
  if (provider === "opencode") {
    return [join(home, ".opencode", "bin", "opencode"), join(home, ".local", "bin", "opencode")];
  }
  return [
    join(home, ".claude", "local", "claude"),
    join(home, ".claude", "bin", "claude"),
    join(home, ".local", "bin", "claude"),
  ];
}

function pathCandidates(provider: Provider): string[] {
  const candidates: string[] = [];
  const override = process.env[ENV_OVERRIDE[provider]];
  if (override) {
    candidates.push(override);
  }
  // Delegate to shell lookup first; filled in asynchronously by which().
  candidates.push(...knownPaths(provider));
  return candidates;
}

function which(bin: string): Promise<string | undefined> {
  const finder = platform() === "win32" ? "where" : "which";
  return new Promise((resolve) => {
    execFile(finder, [bin], { timeout: 5000 }, (error, stdout) => {
      if (error) {
        resolve(undefined);
        return;
      }
      const first = String(stdout).split("\n").map((l) => l.trim()).filter(Boolean)[0];
      resolve(first);
    });
  });
}

function probe(bin: string): Promise<ExecResult | undefined> {
  return new Promise((resolve) => {
    execFile(bin, ["--version"], { timeout: 8000, windowsHide: true }, (error, stdout) => {
      if (error) {
        resolve(undefined);
        return;
      }
      resolve({ stdout: String(stdout ?? ""), stderr: "", code: 0 });
    });
  });
}

export async function detectProviders(): Promise<ProviderInfo[]> {
  const found: ProviderInfo[] = [];

  for (const provider of ["opencode", "claude"] as Provider[]) {
    const candidates: string[] = [];
    const onPath = await which(provider);
    if (onPath) candidates.push(onPath);
    candidates.push(...pathCandidates(provider));

    for (const bin of candidates) {
      const version = await probe(bin);
      if (version) {
        found.push({
          provider,
          bin,
          version: version.stdout.trim().split("\n")[0] || undefined,
        });
        break;
      }
    }
  }

  return found;
}
