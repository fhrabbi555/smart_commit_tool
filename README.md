# Smart Commit (VS Code extension)

Generate commit messages from your staged changes using your existing
**opencode** or **Claude Code** CLI. No API keys. No extra accounts. It
auto-detects which CLI you have installed and logged in, and reuses it in
headless mode.

## Features

- ✨ One click in the Source Control view (or `⌘/Ctrl+Alt+C`) → commit message
  appears in the SCM input box for review. Nothing is committed automatically
  by default.
- 🔍 Auto-detects `opencode` and `claude` CLIs (PATH + common install paths).
- 🔀 Fallback chain: primary model → fallback model → other CLI.
- 🎛 Model picker: live `opencode models` list, Claude presets, or free text.
- 📐 Conventional Commits by default; plain or custom template styles.
- 🌐 Configurable output language; optional commit body.
- 🛡 Large diffs are truncated (`smartCommit.maxDiffChars`); prompts demand
  `<commit>`-tagged output so plugin/hook banner pollution never reaches your
  commit message.

## Requirements

One of:

- [opencode](https://opencode.ai/docs/) — installed and logged in
- [Claude Code](https://claude.com/claude-code) — installed and logged in

## Usage

1. Stage files (`git add`).
2. Click the ✨ button in the Source Control title bar, or run
   **Smart Commit: Generate Message**.
3. Review the message in the SCM input box → commit with `⌘/Ctrl+Enter`.

## Settings

| Setting | Default | Description |
|---|---|---|
| `smartCommit.provider` | `auto` | `auto`, `opencode`, or `claude` |
| `smartCommit.model` | `""` | Model for primary provider (`""` = CLI default) |
| `smartCommit.fallbackModel` | `""` | Retry model for same provider |
| `smartCommit.fallbackProvider` | `true` | Try the other CLI if primary fails |
| `smartCommit.style` | `conventional` | `conventional`, `plain`, or `custom` |
| `smartCommit.customTemplate` | `""` | Template with `{{diff}}`, `{{files}}`, `{{subjects}}` |
| `smartCommit.language` | `en` | Commit message language |
| `smartCommit.includeBody` | `false` | Include body paragraph |
| `smartCommit.autoCommit` | `false` | Commit without review |
| `smartCommit.maxDiffChars` | `8000` | Diff size cap sent to the model |
| `smartCommit.timeoutMs` | `60000` | Timeout per attempt |
| `smartCommit.mimicRepoStyle` | `true` | Feed recent commit subjects as style reference |

## Development

```sh
npm install
npm run compile      # esbuild → dist/extension.js
npm run typecheck
npm test             # unit tests (pure modules, no VS Code needed)
```

Press `F5` in VS Code to launch the Extension Development Host.

## License

MIT
