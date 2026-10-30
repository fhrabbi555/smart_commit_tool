import type { Provider } from "./runner";

/**
 * Fallback chain: pure logic — no vscode imports.
 *
 * Order:
 *   1. primary provider + primary model
 *   2. primary provider + fallback model   (if set)
 *   3. other providers + their default model (if fallbackProvider enabled)
 */

export interface ProviderInfo {
  provider: Provider;
  bin: string;
  version?: string;
}

export interface Attempt {
  provider: Provider;
  bin: string;
  model: string | undefined;
  label: string;
}

export interface BuildAttemptsOptions {
  providerSetting: "auto" | Provider;
  model?: string;
  fallbackModel?: string;
  fallbackProvider: boolean;
  available: ProviderInfo[];
  /** Last attempt that succeeded — sticky fast path. */
  lastSuccess?: { provider: Provider; model?: string } | null;
}

const AUTO_ORDER: Provider[] = ["opencode", "claude"];

export class NoProviderError extends Error {
  constructor() {
    super(
      "No AI CLI found. Install opencode (https://opencode.ai) or Claude Code (https://claude.com/claude-code) and log in, then run 'Smart Commit: Re-detect Providers'."
    );
    this.name = "NoProviderError";
  }
}

export function resolvePrimaryProvider(opts: BuildAttemptsOptions): ProviderInfo {
  if (opts.providerSetting !== "auto") {
    const found = opts.available.find((p) => p.provider === opts.providerSetting);
    if (!found) throw new NoProviderError();
    return found;
  }
  for (const name of AUTO_ORDER) {
    const found = opts.available.find((p) => p.provider === name);
    if (found) return found;
  }
  throw new NoProviderError();
}

export function buildAttempts(opts: BuildAttemptsOptions): Attempt[] {
  const primary = resolvePrimaryProvider(opts);
  const attempts: Attempt[] = [];
  const seen = new Set<string>();

  const push = (provider: ProviderInfo, model: string | undefined, label: string) => {
    const key = `${provider.provider}|${model ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    attempts.push({ provider: provider.provider, bin: provider.bin, model, label });
  };

  const stickyInfo = opts.lastSuccess
    ? opts.available.find((p) => p.provider === opts.lastSuccess!.provider)
    : undefined;

  if (opts.providerSetting !== "auto") {
    // Explicit user choice always goes first.
    push(primary, opts.model?.trim() || undefined, `${primary.provider} · ${opts.model?.trim() || "default"}`);
  }

  if (stickyInfo) {
    // Sticky fast path: what worked last time runs first (auto) or second (explicit).
    const stickyModel = opts.lastSuccess!.model?.trim() || undefined;
    push(stickyInfo, stickyModel, `${stickyInfo.provider} · ${stickyModel || "default"} (last used)`);
  }

  if (opts.providerSetting === "auto") {
    push(primary, opts.model?.trim() || undefined, `${primary.provider} · ${opts.model?.trim() || "default"}`);
  }

  if (opts.fallbackModel?.trim()) {
    push(primary, opts.fallbackModel.trim(), `${primary.provider} · ${opts.fallbackModel.trim()} (fallback model)`);
  }

  if (opts.fallbackProvider) {
    for (const name of AUTO_ORDER) {
      const other = opts.available.find((p) => p.provider === name);
      if (other && other.provider !== primary.provider) {
        push(other, undefined, `${other.provider} · default (fallback provider)`);
      }
    }
  }

  return attempts;
}
