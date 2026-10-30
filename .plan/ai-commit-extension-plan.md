# AI Commit Tool — VS Code Extension Plan

> Working name: **Smart Commit** (marketplace ID suggestion: `smart-commit-ai`)
> Status: M0–M3 complete, code working end-to-end · Date: 2026-10-30

## 0. Status update (2026-10-30, after implementation session)

Milestones **M0–M3 done** (scaffold, opencode runner, claude runner + fallback
chain, settings + model picker + status bar). Verified with real CLIs:

- `npm run typecheck` clean, `npm run compile` clean, unit tests 27/27.
- End-to-end smoke (`npx tsx test/e2e-smoke.ts`, real CLI calls):
  - opencode 5.5s → `fix: validate token before return`
  - claude 16.3s → `fix: throw error on missing token`
- `opencode models` fetch live: 200 models listed.

Key implementation findings (not in original plan):

1. **Pipe-inheritance hang**: `opencode` hands its stdout fd to a background
   daemon. With Node `execFile` pipes, the fd never EOFs and the callback
   never fires even though the process exited in ~1s. Fix: spawn with
   stdout/stderr redirected to temp files and resolve on the `exit` event
   (`src/runner.ts`).
2. **Reply pollution**: Claude Code plugin hooks (claude-mem) inject banner
   text into `.result`. All prompts demand `<commit></commit>`-tagged output;
   `extractCommitMessage()` pulls tagged content and strips fences/quotes.
3. **opencode stuck background service**: retry once with `--standalone`
   (private server) when an opencode attempt times out.
4. **opencode default model may hit provider quota** (openrouter 402) —
   classified as `kind: "quota"` and surfaced with a human-readable message;
   fallback chain then tries the next attempt.

Remaining for M4/M5: marketplace publisher ID + `vsce package` dry run,
integration tests with fake CLI fixtures, optional per-repo settings.


## 1. One-liner

A VS Code extension that generates commit messages from your staged changes by
reusing a locally installed **opencode** or **Claude Code** CLI in headless
mode. No API keys, no extra accounts, no setup — it detects what you already
have and uses it.

## 2. Feasibility verdict

**Yes, fully possible.** Verified on this machine (2026-10-30):

| Requirement | Mechanism | Verified |
|---|---|---|
| Headless AI call via opencode | `opencode run --model <provider/model> --format json "<prompt>"` | ✅ `opencode run --help` |
| Headless AI call via Claude Code | `claude -p --model <model> "<prompt>"` | ✅ `claude --help` |
| Model selection | `--model` flag on both CLIs | ✅ |
| Model listing (opencode) | `opencode models` prints one model per line | ✅ |
| Staged diff inside VS Code | Built-in Git extension API (`vscode.extensions.getExtension('vscode.git')`) | Standard API |
| SCM input box fill | `scm.inputBox.value = ...` via Git extension API | Standard API |

Constraints (accepted):

- At least one CLI must be installed and logged in. The extension detects this
  and guides the user; it cannot provide AI without a CLI.
- Claude Code has no reliable headless model-list command → model picker uses a
  curated preset list plus free-text input for Claude, and live `opencode models`
  output for opencode.
- Each generation takes seconds → progress UI required.

## 3. Goals / Non-goals

### Goals

1. Install from marketplace, works immediately (auto-detect CLI).
2. Generate commit message from staged diff, place it in the SCM input box.
3. User picks provider (`auto` / `opencode` / `claude`), model, and fallback model.
4. Graceful fallback: primary model → fallback model → other provider.
5. Conventional Commits output by default; configurable.
6. Never commits automatically by default — user always reviews first.

### Non-goals (v1)

- Own AI provider / API-key management (no Anthropic/OpenAI key fields).
- Auto-push, history rewriting, PR creation.
- Committing unstaged or partial files.
- Ollama / other local runners (future).

## 4. Core flow

```
User stages files
   └─ clicks ✨ button in SCM title (or command "Smart Commit: Generate Message")
        └─ extension gets staged diff via built-in Git extension API
             └─ build prompt (style template + diff + file list + recent commit style)
                  └─ resolve provider+model (settings → detection)
                       └─ run CLI headless (spawn, timeout 60s)
                            ├─ ok → parse message → fill SCM input box → focus
                            ├─ model error → retry with fallback model
                            ├─ CLI error → retry with other provider (if auto)
                            └─ all fail → error toast with actionable message
```

Optional setting `smartCommit.autoCommit` (default `false`): when on, commits
immediately after generation using the generated message.

## 5. Provider & model resolution

### Detection order

1. Setting `smartCommit.provider`: `auto` (default) | `opencode` | `claude`.
2. If `auto`: probe in order —
   - `opencode` on PATH (`which opencode`), then `~/.opencode/bin/opencode`
   - `claude` on PATH, then `~/.claude/local/claude`, then `~/.claude/bin/claude` / native installer path
3. Cache result in memory + globalState; re-probe on settings change and on
   "Smart Commit: Re-detect Providers" command.
4. Status bar item shows active provider + model (e.g. `$(sparkle) opencode · anthropic/claude-haiku-5-5`). Click = model picker.

### Fallback chain (single generation attempt)

```
attempt 1: chosen provider + chosen model
attempt 2: chosen provider + fallback model        (if fallbackModel set)
attempt 3: other provider + its default model      (if provider = auto, or fallbackProvider enabled)
fail: actionable error
```

Each attempt gets a fresh timeout. Errors are logged to the output channel
("Smart Commit") with provider, model, exit code, stderr.

## 6. Headless invocation spec

### opencode

```sh
opencode run \
  --model anthropic/claude-haiku-5-5 \
  --format json \
  "<prompt>"
```

- Run in workspace root as cwd.
- Parse JSON output; extract assistant text.
- `--standalone` flag if the background server causes issues (fallback).
- Model list for picker: `opencode models` (one `provider/model` per line).

### Claude Code

```sh
claude -p \
  --model <model-alias-or-id> \
  --output-format text \
  "<prompt>"
```

- `-p` = print (non-interactive) mode. Never spawn TUI.
- `--bare`-class behavior preferred if available, to skip session hooks that
  can pollute stdout (verified: plugin hooks can inject text into output —
  filter or use `--bare` when supported).
- Model list for picker: curated presets
  (`sonnet`, `opus`, `haiku`, full IDs) + free-text entry. Claude has no
  dependable headless model-list subcommand (verified 2026-10-30).

### Shared runner rules

- `child_process.execFile`, never shell string interpolation (prompt contains
  user diff text — injection safety).
- Timeout from settings (default 60s), kill process tree on expiry.
- Cap diff payload (default 8,000 chars; configurable). Over cap: send file
  list + first N hunks + note "(diff truncated)".
- Detect auth failures from stderr/exit code → show "Run `opencode` (or `claude`)
  once to log in, then retry."

## 7. Prompt design

Inputs: staged diff (truncated), changed file list, merge-base branch name,
last 5 commit subjects (style mimicry), settings (style, language, body on/off).

System-style instruction baked into prompt:

```
You write git commit messages. Rules:
- Output ONLY the commit message. No explanations, no code fences.
- Format: Conventional Commits (type(scope): subject).
- Subject: imperative, ≤ 50 chars, no period.
- Body (if enabled): wrapped at 72, explain what/why, not how.
- Language: <setting, default English>.
```

Style options (`smartCommit.style`): `conventional` (default) | `plain` |
`custom` (user template with `{{diff}}`, `{{files}}` placeholders).

## 8. Settings schema (package.json contributes.configuration)

| Key | Type | Default | Notes |
|---|---|---|---|
| `smartCommit.provider` | enum `auto\|opencode\|claude` | `auto` | |
| `smartCommit.model` | string | `""` | empty = CLI default |
| `smartCommit.fallbackModel` | string | `""` | empty = skip model fallback step |
| `smartCommit.fallbackProvider` | boolean | `true` | allow other-CLI fallback |
| `smartCommit.style` | enum `conventional\|plain\|custom` | `conventional` | |
| `smartCommit.customTemplate` | string | `""` | used when style = custom |
| `smartCommit.language` | string | `"en"` | commit message language |
| `smartCommit.includeBody` | boolean | `false` | |
| `smartCommit.autoCommit` | boolean | `false` | safety default off |
| `smartCommit.maxDiffChars` | number | `8000` | |
| `smartCommit.timeoutMs` | number | `60000` | per attempt |
| `smartCommit.mimicRepoStyle` | boolean | `true` | feed recent commits |

## 9. Extension structure

```
smart_commit_tool/
├── package.json            # manifest: commands, scm/title menu, keybinding, config schema
├── tsconfig.json
├── esbuild.mjs             # bundle (fast, standard for VS Code ext)
├── src/
│   ├── extension.ts        # activation, command + menu registration
│   ├── detect.ts           # provider detection, path probing, cache
│   ├── config.ts           # typed settings access
│   ├── diff.ts             # staged diff + file list via vscode.git API, truncation
│   ├── prompt.ts           # style templates, prompt builder
│   ├── models.ts           # model presets, `opencode models` fetch, quick pick
│   ├── runner.ts           # spawn/timeout/parse core (shared)
│   ├── runners/opencode.ts # opencode arg building + output parsing
│   ├── runners/claude.ts   # claude arg building + output parsing
│   ├── fallback.ts         # attempt chain orchestration
│   └── ui.ts               # status bar item, progress, SCM input fill, error toasts
├── test/
│   ├── suite/              # unit: prompt, truncation, parse, fallback order
│   └── fixtures/fakeclis/  # fake `opencode`/`claude` shell scripts for integration
└── .vscodeignore
```

### Commands

- `smartCommit.generate` — generate message from staged diff (main action)
- `smartCommit.selectModel` — quick pick (live list for opencode, presets + free text for claude)
- `smartCommit.selectProvider` — quick pick: auto/opencode/claude
- `smartCommit.redetect` — re-probe CLIs

### Menus & keybinding

- `scm/title` button (sparkle icon) — primary entry point.
- Command palette entries for all commands.
- Keybinding: `ctrl+enter` in SCM input box is taken by VS Code; use
  `cmd/ctrl+alt+c` → generate.

## 10. UX details

1. **Generation**: progress notification "Smart Commit: generating… (opencode ·
   model)" with Cancel button (kills child process).
2. **Result**: message placed in SCM input box, box focused, box pre-selected
   for quick edit. Toast: "Review & ⌘+Enter to commit."
3. **Nothing staged**: toast "Stage changes first (git add)." + offer
   "Generate from all changes?" secondary action.
4. **No CLI found**: warning modal with two buttons — "Install opencode" /
   "Install Claude Code" (open docs URLs) + output channel details.
5. **Auth expired**: toast with exact CLI to re-login.
6. **Status bar**: `$(sparkle) provider · model`; click → model picker;
  right-click → provider picker.

## 11. Milestones

| # | Milestone | Done when |
|---|---|---|
| M0 | Scaffold | `F5` launches Extension Development Host; command stub logs; esbuild + package.json complete |
| M1 | opencode happy path | Stage files → button → message appears in SCM box (hardcoded provider) |
| M2 | Claude runner + fallback chain | Both CLIs work; kill opencode binary path → auto-falls to claude in tests |
| M3 | Settings + model picker + status bar | All settings live; picker lists `opencode models`; fallback model honored |
| M4 | Hardening | Truncation, timeouts, auth-error detection, fake-CLI integration tests, README, icon |
| M5 | Ship | `.vsix` builds (`vsce package`), published to marketplace |

Estimated effort: M0–M2 in one focused day; M3–M4 another day; M5 an hour.

## 12. Testing plan

- **Unit (vscode-test)**: prompt builder (styles, language, truncation note),
  diff truncation boundaries, JSON/text output parsing, fallback order state
  machine, detection probe parsing.
- **Integration**: fake CLI executables on PATH (shell scripts that emit canned
  output / exit 1 / hang) → verify fallback chain, timeout kill, auth-error
  message.
- **Manual matrix**: {opencode, claude, both, none} × {staged, empty stage,
  huge diff, binary files only, first commit in repo} × {conventional, plain}.

## 13. Risks & mitigations

| Risk | Mitigation |
|---|---|
| CLI flags change across versions | Version-sniff (`--version`) at detection; keep arg builders per provider isolated (`runners/*.ts`); output channel logs raw command for debugging |
| Claude stdout polluted by session hooks/plugins (observed) | Prefer `--bare` when available; strip known hook banners; parse after last delimiter; document "use bare mode" |
| Huge diffs blow context/cost | Cap chars (`maxDiffChars`), send file list + head of diff; suggest cheap model in README |
| Slow first call (server cold start) | Progress UI + cancel; optional "warm-up" call on activation (setting, default off) |
| User expects magic without any CLI | Clear onboarding modal with install links (goal is *reuse*, not ship an AI backend) |
| Injection via diff text into prompt | Prompt is passed as argv, not shell; instruct model to output message only; sanitize output (strip code fences) before filling input box |

## 14. Future enhancements (post-v1)

- PR description generator command (same runner, different prompt).
- Ollama / other local CLI runners as third provider.
- Per-repo settings override (`.smart-commit.json`).
- Commit history learning: embed repo's own conventions automatically.
- Optional inline "explain this diff" hover.

## 15. Open questions (decide at M0)

1. Extension display name: "Smart Commit" vs "AI Commit" — check marketplace collisions.
2. Publisher ID for `vsce` (needs Azure DevOps org).
3. Icon: simple sparkle/badge glyph v1.
