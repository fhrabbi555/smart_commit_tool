import { spawn } from "node:child_process";
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type Provider = "opencode" | "claude";

export type ErrorKind =
  | "notfound"
  | "timeout"
  | "auth"
  | "quota"
  | "parse"
  | "unknown";

export class CliError extends Error {
  readonly kind: ErrorKind;
  readonly stderr: string;
  readonly stdout: string;
  readonly code: number | null;

  constructor(
    message: string,
    opts: { kind?: ErrorKind; stderr?: string; stdout?: string; code?: number | null } = {}
  ) {
    super(message);
    this.name = "CliError";
    this.kind = opts.kind ?? "unknown";
    this.stderr = opts.stderr ?? "";
    this.stdout = opts.stdout ?? "";
    this.code = opts.code ?? null;
  }
}

/** Classify raw CLI failure text into a coarse error kind. */
export function classifyFailure(text: string, code: number | null): ErrorKind {
  const t = text.toLowerCase();
  if (/insufficient credits|quota|402|billing|usage limit|rate limit/.test(t)) {
    return "quota";
  }
  if (/401|403|unauthorized|not logged in|login|log in|api key|authentication/.test(t)) {
    return "auth";
  }
  if (code !== null && code === 124) return "timeout";
  return "unknown";
}

export interface ExecOptions {
  bin: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

/**
 * Run a CLI binary safely: no shell, argv only, hard timeout, optional abort.
 *
 * stdout/stderr go to temp files and the promise resolves on the child's
 * `exit` event — NOT on pipe EOF. Reason: CLIs like opencode hand their
 * stdout fd to a background daemon; with pipes the fd stays open forever
 * and `execFile` never fires its callback even though the process exited.
 */
export function exec(opts: ExecOptions): Promise<ExecResult> {
  const { bin, args, cwd, timeoutMs, signal, env } = opts;

  return new Promise<ExecResult>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new CliError("Aborted before start", { kind: "timeout" }));
      return;
    }

    const dir = mkdtempSync(join(tmpdir(), "smartcommit-"));
    const outPath = join(dir, "out.log");
    const errPath = join(dir, "err.log");
    const outFd = openSync(outPath, "w");
    const errFd = openSync(errPath, "w");

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(bin, args, {
        cwd,
        stdio: ["ignore", outFd, errFd],
        env: env ?? process.env,
        windowsHide: true,
      });
    } catch (e) {
      cleanup();
      reject(new CliError(`Failed to spawn ${bin}: ${String(e)}`, { kind: "notfound" }));
      return;
    }

    let settled = false;
    let timedOut = false;
    let aborted = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    const onAbort = () => {
      aborted = true;
      child.kill("SIGKILL");
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    function cleanup() {
      closeSync(outFd);
      closeSync(errFd);
      rmSync(dir, { recursive: true, force: true });
    }

    function settle(fn: () => void) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      let stdout = "";
      let stderr = "";
      try {
        stdout = readFileSync(outPath, "utf8");
        stderr = readFileSync(errPath, "utf8");
      } catch {
        // best effort
      }
      cleanup();
      lastOutput = { stdout, stderr };
      fn();
    }

    let lastOutput: { stdout: string; stderr: string } = { stdout: "", stderr: "" };

    child.on("exit", (code) => {
      settle(() => {
        if (aborted) {
          reject(new CliError(`Aborted: ${bin}`, { kind: "timeout", stderr: lastOutput.stderr }));
        } else if (timedOut) {
          reject(
            new CliError(`Timed out after ${timeoutMs}ms: ${bin}`, {
              kind: "timeout",
              stderr: lastOutput.stderr,
            })
          );
        } else if (code === 0) {
          resolve({ stdout: lastOutput.stdout, stderr: lastOutput.stderr, code: 0 });
        } else {
          const kind = classifyFailure(
            lastOutput.stderr + " " + lastOutput.stdout,
            code
          );
          reject(
            new CliError(`${bin} exited with code ${code}: ${lastOutput.stderr.slice(0, 400)}`, {
              kind,
              stderr: lastOutput.stderr,
              stdout: lastOutput.stdout,
              code,
            })
          );
        }
      });
    });

    child.on("error", (err) => {
      settle(() => {
        const notfound = (err as NodeJS.ErrnoException).code === "ENOENT";
        reject(
          new CliError(notfound ? `Binary not found: ${bin}` : `Spawn error: ${String(err)}`, {
            kind: notfound ? "notfound" : "unknown",
          })
        );
      });
    });
  });
}
