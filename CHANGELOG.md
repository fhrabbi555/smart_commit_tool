# Changelog

All notable changes to Smart Commit are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/); versioning
follows [SemVer](https://semver.org/).

## [0.2.0] — 2026-10-30

### Changed

- Marketplace ID renamed `smart-commit-ai` → `smart-commit-afri`
  (`smart-commit-ai` was already taken on the Marketplace).
- Publisher: `afrinuad` (AfriNuad).

## [0.1.1] — 2026-10-30

### Added

- Settings page (webview): connection cards with detected binary path +
  version, live model list with filter, test-connection buttons, all options
  editable in-page. Opened from the status-bar ✨ item or command palette.
- Staging modes: `auto` (default — silently stage everything and generate, no
  popup) or `prompt` (popup: stage all / unstaged / cancel) via
  `smartCommit.stagingMode`.
- Sticky fast path: remembers the last successful provider+model across
  restarts and tries it first on every generate. Shown in the status bar
  (`⚡`) and the settings page.
- Auto-stage fallback when nothing is staged and files are modified.
- Clearer provider errors (auth / quota / timeout) with actionable messages.

### Fixed

- Webview CSP blocked all inline `onclick` handlers — settings-page buttons
  (load models, test connection) were dead. All events now wired via
  `addEventListener`.
- opencode hangs when its background daemon inherits the stdout pipe:
  child-process core now writes stdout/stderr to temp files and resolves on
  the `exit` event; opencode timeouts retry once with `--standalone`.
- Claude hook-plugin banners leaking into commit messages: prompts demand
  `<commit></commit>`-tagged output and the extractor pulls tagged content
  only.

## [0.1.0] — 2026-10-30

### Added

- Initial release.
- Generate commit messages from staged changes via opencode or Claude Code
  CLIs in headless mode — no API keys.
- Auto-detection of both CLIs (PATH + common install locations).
- Fallback chain: primary model → fallback model → other CLI.
- Conventional Commits / plain / custom template styles, configurable message
  language, optional body, repo-style mimicry.
- ✨ button in the Source Control title bar, `⌘/Ctrl+Alt+C` keybinding,
  status-bar indicator, model & provider pickers, re-detect command.
- Diff truncation, per-attempt timeout, output-channel diagnostics.
