import * as vscode from "vscode";
import { getConfig, type SmartCommitConfig } from "./config";
import { detectProviders } from "./detect";
import type { ProviderInfo } from "./fallback";
import { fetchOpencodeModels, CLAUDE_MODEL_PRESETS } from "./models";
import { invokePrompt, OUTPUT } from "./invoke";
import type { Provider } from "./runner";

/**
 * Settings webview: connection status, provider/model selection, test button,
 * generation options. One panel per window.
 *
 * CSP note: script-src is nonce-only, so inline onclick= attributes are
 * BLOCKED. All events must be wired with addEventListener inside the script.
 */

interface PanelState {
  providers: ProviderInfo[];
  settings: SmartCommitConfig;
  primary: Provider | undefined;
}

export class SettingsPage {
  private static current: SettingsPage | undefined;

  static open(context: vscode.ExtensionContext): void {
    if (SettingsPage.current) {
      SettingsPage.current.panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "smartCommitSettings",
      "Smart Commit Settings",
      vscode.ViewColumn.Active,
      { enableScripts: true }
    );
    SettingsPage.current = new SettingsPage(panel, context);
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext
  ) {
    panel.onDidDispose(() => (SettingsPage.current = undefined), null, context.subscriptions);
    panel.webview.onDidReceiveMessage((m) => this.onMessage(m), null, context.subscriptions);
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("smartCommit")) void this.pushState();
    }, null, context.subscriptions);
    panel.webview.html = this.html();
    void this.pushState();
  }

  private cachedProviders: ProviderInfo[] | undefined;

  private async state(): Promise<PanelState> {
    const settings = getConfig();
    if (!this.cachedProviders) {
      this.cachedProviders = await detectProviders();
    }
    const providers = this.cachedProviders;
    const primary =
      settings.provider === "auto"
        ? providers[0]?.provider
        : providers.find((p) => p.provider === settings.provider)?.provider;
    return { providers, settings, primary };
  }

  private async pushState(): Promise<void> {
    const state = await this.state();
    void this.panel.webview.postMessage({ type: "state", ...state });
  }

  private async onMessage(m: any): Promise<void> {
    switch (m.type) {
      case "refreshProviders": {
        this.cachedProviders = await detectProviders();
        await this.pushState();
        return;
      }
      case "setSetting": {
        const cfg = vscode.workspace.getConfiguration("smartCommit");
        await cfg.update(m.key, m.value, vscode.ConfigurationTarget.Global);
        await this.pushState();
        return;
      }
      case "testConnection": {
        const provider = m.provider as Provider;
        const info = this.cachedProviders?.find((p) => p.provider === provider);
        if (!info) {
          void this.panel.webview.postMessage({
            type: "testResult",
            provider,
            ok: false,
            message: "not detected on this machine",
          });
          return;
        }
        const model = m.model || undefined;
        void this.panel.webview.postMessage({ type: "testResult", provider, running: true, model });
        const t0 = Date.now();
        try {
          const reply = await invokePrompt({
            provider,
            bin: info.bin,
            prompt: "Reply with exactly the word OK, wrapped in <commit></commit> tags.",
            model,
            cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.env.HOME ?? "/",
            timeoutMs: 90000,
            signal: new AbortController().signal,
          });
          void this.panel.webview.postMessage({
            type: "testResult",
            provider,
            ok: true,
            model,
            ms: Date.now() - t0,
            message: reply.replace(/<[^>]+>/g, "").trim().slice(0, 60) || "(empty)",
          });
        } catch (e) {
          void this.panel.webview.postMessage({
            type: "testResult",
            provider,
            ok: false,
            model,
            ms: Date.now() - t0,
            message: e instanceof Error ? e.message.slice(0, 200) : String(e),
            kind: (e as any)?.kind,
          });
          OUTPUT.appendLine(`[test:${provider}] ${String(e)}`);
        }
        return;
      }
      case "fetchModels": {
        const provider = m.provider as Provider;
        const info = this.cachedProviders?.find((p) => p.provider === provider);
        const models =
          provider === "opencode" && info
            ? await fetchOpencodeModels(info.bin)
            : provider === "claude"
              ? CLAUDE_MODEL_PRESETS
              : [];
        void this.panel.webview.postMessage({ type: "models", provider, models });
        return;
      }
    }
  }

  private html(): string {
    const nonce = Math.random().toString(36).slice(2);
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 16px 24px 60px; max-width: 800px; margin: 0 auto; }
  h1 { font-size: 20px; display: flex; align-items: center; gap: 8px; }
  h1 .spark { color: var(--vscode-charts-purple); }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--vscode-descriptionForeground); margin: 28px 0 10px; }
  .card { background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 14px; margin-bottom: 10px; }
  .row { display: flex; gap: 10px; flex-wrap: wrap; }
  .prov { flex: 1; min-width: 280px; border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 12px; }
  .prov.active { border-color: var(--vscode-focusBorder); box-shadow: 0 0 0 1px var(--vscode-focusBorder); }
  .prov-head { display: flex; align-items: center; gap: 8px; font-weight: 600; }
  .dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
  .dot.on { background: var(--vscode-testing-iconPassed, #3fb950); }
  .dot.off { background: var(--vscode-testing-iconFailed, #f85149); }
  .badge { font-size: 10px; padding: 1px 7px; border-radius: 9px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
  .path { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 6px; word-break: break-all; }
  .ver { font-size: 11px; color: var(--vscode-descriptionForeground); }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; padding: 5px 12px; font-size: 12px; cursor: pointer; margin-top: 8px; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.sec { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button:disabled { opacity: 0.5; cursor: wait; }
  input[type=text], input[type=number], select { width: 100%; box-sizing: border-box; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent); border-radius: 3px; padding: 5px 8px; font-size: 12px; font-family: var(--vscode-editor-font-family); }
  input:focus, select:focus { outline: 1px solid var(--vscode-focusBorder); }
  label { display: block; font-size: 12px; margin: 10px 0 4px; }
  .field { margin-bottom: 6px; }
  .chk { display: flex; align-items: center; gap: 8px; font-size: 12px; margin: 8px 0; cursor: pointer; }
  .chk input { margin: 0; }
  .hint { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 2px; }
  .result { font-size: 12px; margin-top: 8px; padding: 8px 10px; border-radius: 4px; display: none; }
  .result.ok { display: block; background: rgba(63,185,80,0.14); }
  .result.err { display: block; background: rgba(248,81,73,0.14); }
  .result.run { display: block; background: rgba(227,179,65,0.14); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; max-height: 180px; overflow-y: auto; }
  .chip { font-size: 11px; padding: 2px 9px; border-radius: 10px; border: 1px solid var(--vscode-panel-border); cursor: pointer; }
  .chip:hover { border-color: var(--vscode-focusBorder); }
  .chip.sel { border-color: var(--vscode-focusBorder); background: color-mix(in srgb, var(--vscode-focusBorder) 20%, transparent); }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
  .actions { margin-top: 12px; display: flex; gap: 10px; }
</style>
</head>
<body>
<h1><span class="spark">✦</span> Smart Commit</h1>
<div class="hint">Generate commit messages with your existing opencode / Claude Code CLI — no API keys.</div>

<h2>Connection</h2>
<div class="row" id="providers"></div>
<div class="actions">
  <button class="sec" id="btnRefresh">↻ Re-detect CLIs</button>
</div>

<h2>Model</h2>
<div class="card">
  <div class="grid">
    <div class="field">
      <label>Primary model <span class="hint">(empty = CLI default)</span></label>
      <input type="text" id="model" placeholder="e.g. anthropic/claude-haiku-4-5 or sonnet">
      <div class="hint">opencode format: provider/model · Claude: alias or full ID</div>
    </div>
    <div class="field">
      <label>Fallback model <span class="hint">(retry on primary failure)</span></label>
      <input type="text" id="fallbackModel" placeholder="optional">
      <label class="chk"><input type="checkbox" id="fallbackProvider"> Fall back to the other CLI if this one fails</label>
    </div>
  </div>
  <label>Model list <span class="hint">(click one to apply)</span></label>
  <div class="row">
    <input type="text" id="modelFilter" placeholder="filter models… e.g. haiku" style="max-width:220px">
    <button class="sec" id="btnLoadOc">Load opencode models</button>
    <button class="sec" id="btnShowClaude">Show Claude presets</button>
  </div>
  <div class="chips" id="modelChips"><span class="hint">No list loaded yet.</span></div>
</div>

<h2>Test connection</h2>
<div class="card">
  <div class="row">
    <button id="btnTestOc">▶ Test opencode</button>
    <button id="btnTestCla">▶ Test claude</button>
  </div>
  <div class="hint" style="margin-top:6px">Runs a tiny "reply OK" prompt with the primary model above.</div>
  <div class="result" id="testOpencode"></div>
  <div class="result" id="testClaude"></div>
</div>

<h2>Generation</h2>
<div class="card">
  <div class="grid">
    <div class="field">
      <label>Style</label>
      <select id="style">
        <option value="conventional">Conventional Commits (type(scope): subject)</option>
        <option value="plain">Plain subject</option>
        <option value="custom">Custom template</option>
      </select>
      <label>Message language</label>
      <input type="text" id="language" placeholder="en">
    </div>
    <div class="field">
      <label>Max diff characters</label>
      <input type="number" id="maxDiffChars">
      <label>Timeout per attempt (ms)</label>
      <input type="number" id="timeoutMs">
    </div>
  </div>
  <label class="chk"><input type="checkbox" id="includeBody"> Include body paragraph</label>
  <label class="chk"><input type="checkbox" id="mimicRepoStyle"> Mimic this repo's recent commit style</label>
  <label class="chk"><input type="checkbox" id="autoCommit"> Auto-commit without review (off by default)</label>
</div>

<div class="hint" style="margin-top:24px">Usage: stage files in Source Control → click the ✦ button → message appears in the input box. Status-bar ✦ opens this page.</div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  let debounceTimers = {};
  let allModels = [];
  let firstState = true;

  function debounceSetting(key, value) {
    clearTimeout(debounceTimers[key]);
    debounceTimers[key] = setTimeout(() => vscode.postMessage({ type: 'setSetting', key, value }), 400);
  }

  // Wire events (CSP blocks inline onclick).
  $('btnRefresh').addEventListener('click', () => vscode.postMessage({ type: 'refreshProviders' }));
  $('btnLoadOc').addEventListener('click', () => {
    $('modelChips').innerHTML = '<span class="hint">Loading…</span>';
    vscode.postMessage({ type: 'fetchModels', provider: 'opencode' });
  });
  $('btnShowClaude').addEventListener('click', () => vscode.postMessage({ type: 'fetchModels', provider: 'claude' }));
  $('btnTestOc').addEventListener('click', () => test('opencode'));
  $('btnTestCla').addEventListener('click', () => test('claude'));

  $('model').addEventListener('input', (e) => debounceSetting('model', e.target.value.trim()));
  $('fallbackModel').addEventListener('input', (e) => debounceSetting('fallbackModel', e.target.value.trim()));
  $('fallbackProvider').addEventListener('change', (e) => vscode.postMessage({ type: 'setSetting', key: 'fallbackProvider', value: e.target.checked }));
  $('style').addEventListener('change', (e) => vscode.postMessage({ type: 'setSetting', key: 'style', value: e.target.value }));
  $('language').addEventListener('input', (e) => debounceSetting('language', e.target.value.trim() || 'en'));
  $('maxDiffChars').addEventListener('input', (e) => debounceSetting('maxDiffChars', Number(e.target.value) || 8000));
  $('timeoutMs').addEventListener('input', (e) => debounceSetting('timeoutMs', Number(e.target.value) || 60000));
  $('includeBody').addEventListener('change', (e) => vscode.postMessage({ type: 'setSetting', key: 'includeBody', value: e.target.checked }));
  $('mimicRepoStyle').addEventListener('change', (e) => vscode.postMessage({ type: 'setSetting', key: 'mimicRepoStyle', value: e.target.checked }));
  $('autoCommit').addEventListener('change', (e) => vscode.postMessage({ type: 'setSetting', key: 'autoCommit', value: e.target.checked }));
  $('modelFilter').addEventListener('input', () => renderChips());

  // Provider cards: "Use this provider" buttons + test from cards.
  $('providers').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-use]');
    if (btn) vscode.postMessage({ type: 'setSetting', key: 'provider', value: btn.getAttribute('data-use') });
  });
  // Chips: apply model on click.
  $('modelChips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-model]');
    if (!chip) return;
    const m = chip.getAttribute('data-model');
    $('model').value = m;
    vscode.postMessage({ type: 'setSetting', key: 'model', value: m });
  });

  function test(provider) {
    const el = $(provider === 'opencode' ? 'testOpencode' : 'testClaude');
    el.className = 'result run';
    el.textContent = 'Running… (5–25s)';
    const btn = $(provider === 'opencode' ? 'btnTestOc' : 'btnTestCla');
    btn.disabled = true;
    vscode.postMessage({ type: 'testConnection', provider, model: $('model').value.trim() });
  }

  function renderChips() {
    const f = $('modelFilter').value.trim().toLowerCase();
    const list = allModels.filter((m) => !f || m.toLowerCase().includes(f)).slice(0, 100);
    const cur = $('model').value.trim();
    $('modelChips').innerHTML = list.length
      ? list.map((m) => '<span class="chip' + (m === cur ? ' sel' : '') + '" data-model="' + m + '">' + m + '</span>').join('')
      : '<span class="hint">No models match.</span>';
  }

  function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  window.addEventListener('message', (event) => {
    const m = event.data;
    if (m.type === 'state') {
      renderState(m);
      if (firstState) {
        firstState = false;
        if (m.providers.some((p) => p.provider === 'opencode')) {
          vscode.postMessage({ type: 'fetchModels', provider: 'opencode' });
        }
      }
    }
    if (m.type === 'models') {
      allModels = m.models || [];
      $('modelFilter').value = '';
      renderChips();
    }
    if (m.type === 'testResult') {
      const isOc = m.provider === 'opencode';
      const el = $(isOc ? 'testOpencode' : 'testClaude');
      const btn = $(isOc ? 'btnTestOc' : 'btnTestCla');
      btn.disabled = false;
      if (m.running) { el.className = 'result run'; el.textContent = 'Running…'; return; }
      if (m.ok) {
        el.className = 'result ok';
        el.textContent = '✓ OK in ' + (m.ms / 1000).toFixed(1) + 's' + (m.model ? ' · model ' + m.model : '') + ' — replied: ' + m.message;
      } else {
        el.className = 'result err';
        el.textContent = '✗ Failed (' + (m.kind || 'error') + '): ' + m.message;
      }
    }
  });

  function renderState(s) {
    const box = $('providers');
    box.innerHTML = ['opencode', 'claude'].map((name) => {
      const p = s.providers.find((x) => x.provider === name);
      const active = s.primary === name;
      return '<div class="prov' + (active ? ' active' : '') + '">' +
        '<div class="prov-head"><span class="dot ' + (p ? 'on' : 'off') + '"></span>' + name +
        (active ? ' <span class="badge">active</span>' : '') +
        (p && p.version ? ' <span class="ver">' + esc(p.version) + '</span>' : '') + '</div>' +
        (p ? '<div class="path">' + esc(p.bin) + '</div>' : '<div class="path">not detected — install & log in, then Re-detect</div>') +
        (p && !active ? '<button class="sec" data-use="' + name + '">Use this provider</button>' : '') +
        '</div>';
    }).join('');

    const set = s.settings;
    $('model').value = set.model || '';
    $('fallbackModel').value = set.fallbackModel || '';
    $('fallbackProvider').checked = !!set.fallbackProvider;
    $('style').value = set.style;
    $('language').value = set.language || 'en';
    $('maxDiffChars').value = set.maxDiffChars;
    $('timeoutMs').value = set.timeoutMs;
    $('includeBody').checked = !!set.includeBody;
    $('mimicRepoStyle').checked = !!set.mimicRepoStyle;
    $('autoCommit').checked = !!set.autoCommit;
    renderChips();
  }

  vscode.postMessage({ type: 'refreshProviders' });
</script>
</body>
</html>`;
  }
}
