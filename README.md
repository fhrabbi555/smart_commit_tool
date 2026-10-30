# Smart Commit Afri ✦

**Generate commit messages from your staged changes using your existing
[opencode](https://opencode.ai) or [Claude Code](https://claude.com/claude-code)
CLI — no API keys, no extra accounts, no setup.**

Smart Commit auto-detects which AI CLI you already have installed and logged in,
then reuses it in headless mode to write your commit messages. Install the
extension, click one button, get a clean Conventional Commit message.

![Smart Commit icon](https://github.com/fhrabbi555/smart_commit_tool/raw/main/media/icon.png)

---

## Table of contents

- [Why Smart Commit](#why-smart-commit)
- [Requirements](#requirements)
- [Installation](#installation)
- [Quick start (60 seconds)](#quick-start-60-seconds)
- [Full tutorial](#full-tutorial)
- [All settings explained](#all-settings-explained)
- [Commands & keybindings](#commands--keybindings)
- [How the fallback chain works](#how-the-fallback-chain-works)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [Development](#development)
- [License](#license)

---

## Why Smart Commit

| | Smart Commit | AI commit plugins with API keys |
|---|---|---|
| API key needed | ❌ none — reuses your CLI login | ✅ required |
| Extra account | ❌ none | ✅ usually |
| Cost | your existing plan/subscription | per-token billing |
| Setup time | zero after installing the CLI you already use | key + billing setup |
| Works offline-ish | same as your CLI | depends |

You already pay for opencode or Claude Code. Smart Commit simply reuses it.

## Requirements

One of these, installed **and logged in** (run it once in a terminal and sign
in):

- **opencode** — [install docs](https://opencode.ai/docs/)
- **Claude Code** — [install docs](https://claude.com/claude-code)

Plus VS Code 1.80+ and a git repository.

Detection covers PATH and the common install locations
(`~/.opencode/bin/opencode`, `~/.claude/local/claude`, `~/.claude/bin/claude`,
`~/.local/bin/…`). If both are installed, opencode is tried first under `auto`.

## Installation

**From the Marketplace:** open the Extensions view (`⌘⇧X` / `Ctrl+Shift+X`),
search **Smart Commit**, click Install.

**From a Marketplace-safe .vsix file:**

```sh
code --install-extension smart-commit-afri-<version>.vsix
```

or Extensions view → `···` menu → **Install from VSIX…** → pick the file.

Then **restart VS Code fully** (`⌘Q` on macOS, then reopen).

## Quick start (60 seconds)

1. Open a git project folder.
2. Look bottom-left: the status bar shows `✨ opencode · default` (or
   `claude`). If it says `no CLI found`, see [Troubleshooting](#troubleshooting).
3. Edit some files.
4. Click the **✨ button** in the Source Control panel (top right).
5. Wait a few seconds → the commit message appears in the SCM input box.
   Review it, edit if you like, press `⌘/Ctrl+Enter` to commit.

That's it. Nothing staged? No problem — by default Smart Commit stages
everything for you and generates the message. No popups, no questions.

## Full tutorial

### Step 1 — Check the connection

Click the `✨` item in the **bottom-left status bar**. The **Smart Commit
Settings** page opens. The Connection section shows one card per provider:

- 🟢 green dot + binary path + version → detected and ready
- 🔴 red dot → not detected (install it or press *Re-detect CLIs* after
  installing)

The card with the **active** badge is the one that will be used.

### Step 2 — Pick a model

In the Settings page, **Model** section:

1. The model list loads automatically (200+ live models from `opencode
   models`; presets for Claude). Type in the **filter box** — e.g. `haiku` —
   and click a chip like `anthropic/claude-haiku-4-5` to make it your primary
   model.
2. Or type a model ID manually in **Primary model**. Formats:
   - opencode: `provider/model` (e.g. `anthropic/claude-haiku-4-5`)
   - Claude: alias (`sonnet`, `opus`, `haiku`) or full ID
3. Leave it empty to use your CLI's default model.

**Tip:** pick a fast, cheap model (haiku-class) for commits — speed matters
more than brilliance here.

### Step 3 — Test the connection

Press **▶ Test opencode** or **▶ Test claude**. A tiny "reply OK" prompt runs
with your selected model. Green `✓ OK in 4.2s` = ready. Red box = exact error
(kind + message) — see [Troubleshooting](#troubleshooting).

### Step 4 — Understand the generate button

The **Generate button (✨)** section controls what happens when nothing is
staged yet:

| Mode | Behavior |
|---|---|
| ⚡ **Direct action** (default) | Silently runs `git add -A`, generates from the staged diff. Zero popups. |
| 💬 **Ask me each time** | Popup: *Stage all and generate* / *Generate from unstaged changes* / *Cancel*. |

Combine with **Auto-commit without review** (checkbox below it):

- Direct + auto-commit = **fully one-click commit**
- Ask + no auto-commit = **fully manual** (you always review the message first)

If files are already staged, the button always uses the staged diff directly —
no staging is touched.

### Step 5 — The fast path ⚡

After your first successful generation, Smart Commit remembers which
provider+model won and tries **that first** on every future generate:

- Status bar shows `✨ claude · sonnet ⚡` — the ⚡ means fast path is active.
- The Settings page shows "⚡ Fast path active: …" in the Model card.
- If the remembered winner ever fails, the normal fallback chain takes over
  and a new winner is saved.
- If you set the provider explicitly (not `auto`), your choice always runs
  first; the fast path runs second.

This removes the "one failed attempt" delay on every commit when your primary
model is unavailable (quota, network, etc.).

### Step 6 — Generate

Edit files → click ✨ in Source Control (or `⌘/Ctrl+Alt+C`) → message appears
in the input box → `⌘/Ctrl+Enter` to commit. With auto-commit on, the commit
happens the moment the message is generated.

### Optional — commit style & language

In the **Generation** section:

- **Style**: `Conventional Commits` (default), `Plain subject`, or `Custom
  template` (uses `smartCommit.customTemplate` with `{{diff}}`, `{{files}}`,
  `{{subjects}}` placeholders).
- **Message language**: any ISO code (`en`, `id`, `de`, …) — messages are
  written in that language.
- **Include body paragraph**: adds a what/why body after the subject line.
- **Mimic this repo's recent commit style**: feeds your last 5 commit subjects
  to the model so new messages match the repo's tone.

## All settings explained

Open with `⌘,` → search `smart commit`, or use the Smart Commit Settings page
(click status-bar ✨).

### Provider

| Setting | Values | Default | What it does |
|---|---|---|---|
| `smartCommit.provider` | `auto` / `opencode` / `claude` | `auto` | Which CLI to use. `auto` = first detected (opencode before claude). Explicit choice always runs first; `auto` lets the fast path lead. |

### Models & fallback

| Setting | Default | What it does |
|---|---|---|
| `smartCommit.model` | `""` | Primary model for the primary provider. Empty = CLI default. opencode format `provider/model`; Claude accepts aliases (`sonnet`). |
| `smartCommit.fallbackModel` | `""` | If the primary model fails, retry the same provider with this model before switching providers. |
| `smartCommit.fallbackProvider` | `true` | If the whole provider fails, try the other detected CLI with its default model. Turn off to pin strictly to one CLI. |

### Generate button behavior

| Setting | Values | Default | What it does |
|---|---|---|---|
| `smartCommit.stagingMode` | `auto` / `prompt` | `auto` | `auto` = direct action: stage everything and generate, no popup. `prompt` = ask each time with a popup. |
| `smartCommit.autoCommit` | `false` | Commit immediately instead of filling the SCM input box for review. |

### Message style

| Setting | Values | Default | What it does |
|---|---|---|---|
| `smartCommit.style` | `conventional` / `plain` / `custom` | `conventional` | `conventional`: `type(scope)!: subject` with types like feat/fix/chore. `plain`: short subject only. `custom`: your own template. |
| `smartCommit.customTemplate` | `""` | Template text used when style = `custom`. Placeholders: `{{diff}}`, `{{files}}`, `{{subjects}}`. |
| `smartCommit.language` | `en` | ISO code for the commit message language. |
| `smartCommit.includeBody` | `false` | Add a body paragraph (what/why, wrapped at 72 chars) under the subject. |
| `smartCommit.mimicRepoStyle` | `true` | Feed the last 5 commit subjects as a style reference. |

### Performance & safety

| Setting | Default | What it does |
|---|---|---|
| `smartCommit.maxDiffChars` | `8000` | Diff size cap sent to the model. Larger diffs are truncated with a note — keeps prompts small, fast, and cheap. |
| `smartCommit.timeoutMs` | `60000` | Timeout per CLI attempt. All attempts in the fallback chain get their own budget. |

## Commands & keybindings

| Command | Palette title | Keybinding |
|---|---|---|
| `smartCommit.generate` | Smart Commit: Generate Message | `⌘/Ctrl+Alt+C`, ✨ button in Source Control |
| `smartCommit.settings` | Smart Commit: Open Settings | click `✨` in the status bar |
| `smartCommit.selectModel` | Smart Commit: Select Model | — |
| `smartCommit.selectProvider` | Smart Commit: Select Provider (opencode / Claude Code) | — |
| `smartCommit.redetect` | Smart Commit: Re-detect Providers | — |

## How the fallback chain works

Every generate builds an ordered attempt list:

```
1. your explicit provider+model        (or the fast-path winner, under auto)
2. ⚡ fast-path winner                  (second, when provider is explicit)
3. configured provider+model           (when fast path led)
4. fallbackModel on the same provider  (if set)
5. the other CLI, default model        (if fallbackProvider = true)
```

Duplicates are removed. The first success wins and becomes the new fast-path
winner. Every attempt is logged with timing and error kind to the output
channel (**View → Output → Smart Commit**).

## Troubleshooting

**Status bar says `no CLI found`** — neither CLI is detected. Install opencode
or Claude Code, run it once in a terminal to log in, then command palette →
*Smart Commit: Re-detect Providers*.

**`✗ Failed (quota)`** — the model's account hit a credit/usage limit
(e.g. an opencode default model routed through OpenRouter with no credits).
Fix: pick a model on a plan you have (Settings page → model chips), or let the
fallback chain switch to the other CLI. The fast path will remember the
winner so this only costs you time once.

**`✗ Failed (auth)`** — the CLI lost its login. Run `opencode` or `claude` in
a terminal, log in, retry.

**`✗ Failed (timeout)`** — increase `smartCommit.timeoutMs`, or pick a faster
model. For opencode, Smart Commit automatically retries once with
`--standalone` when its shared background service hangs.

**Model chips don't load** — the model list comes from `opencode models`. If
empty, press *Re-detect CLIs*, check the CLI works in a terminal, or type a
model ID manually.

**Message looks polluted / contains odd text** — Smart Commit demands
`<commit></commit>`-tagged replies and extracts only tagged content, so plugin
hook banners (e.g. from memory plugins) can't reach your commit message. If
you still see junk, press *Test* and report the raw output.

**Nothing happens when clicking ✨ in Source Control** — make sure the folder
is a git repository and has at least one modified file. Check the output
channel for errors.

**General debugging** — `View → Output → dropdown → Smart Commit`. Every
attempt, timing, and error is logged there.

## FAQ

**Does this send my code anywhere beyond my CLI?**
No. Your diff goes to the exact same AI provider your opencode/Claude Code CLI
already uses, under your existing account. Smart Commit adds no third party
and has no telemetry.

**Does it commit automatically?**
Only if you enable `smartCommit.autoCommit`. Default: the message lands in the
Source Control input box and you commit with `⌘/Ctrl+Enter`.

**Will it stage files without asking?**
Only when nothing is staged and `stagingMode` = `auto` (default). Switch to
`prompt` to always be asked first. If something is already staged, your
staging is never touched.

**What does it cost?**
One small model call per generate (plus one tiny call per Test button press)
through your existing plan. With a haiku-class model it's a fraction of a
cent per commit.

**Which provider wins when both are installed?**
`auto` tries opencode first, then claude. The fast path may reorder this after
the first success — that's the speed feature, not a bug.

**Can I use a totally custom prompt?**
Yes: `style` = `custom` + `smartCommit.customTemplate`. Keep in mind the
extension expects the model's answer wrapped in `<commit></commit>` for
reliable extraction; add that instruction to your template.

## Development

```sh
npm install
npm run compile        # esbuild → dist/extension.js
npm run watch          # rebuild on change
npm run typecheck      # tsc --noEmit
npm test               # unit tests (pure modules, no VS Code needed)
npx tsx test/e2e-smoke.ts   # real CLI smoke test (costs a few cents)
npm run vsce:package   # build .vsix
```

Press `F5` to launch the Extension Development Host.

Architecture notes: `src/runner.ts` (child-process core — stdout goes to temp
files and resolves on `exit`, because opencode's background daemon inherits
the stdout pipe and `execFile` would hang), `src/detect.ts` (provider
detection), `src/fallback.ts` (attempt chain + sticky fast path),
`src/invoke.ts` (headless CLI calls), `src/prompt.ts` (prompt + tag
extraction), `src/settingsPage.ts` (webview UI), `src/extension.ts` (command
wiring).

## License

[MIT](LICENSE) © AfriNuad
