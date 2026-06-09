# AI Token Usage Dashboard

Local dashboard for viewing token usage from supported AI coding tools.

Supported sources:

- Codex session JSONL logs.
- GitHub Copilot Chat/agent debug JSONL logs from VS Code.

The dashboard only shows sources that are present on the current machine. Developers who only use Codex see Codex. Developers who only have Copilot logs see GitHub Copilot. Developers with both see both displays.

## Run

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

The API runs on `http://127.0.0.1:5174` and reads:

- `%USERPROFILE%\.codex\sessions`
- `%USERPROFILE%\.codex\archived_sessions`
- `%APPDATA%\Code\User\workspaceStorage`
- `%APPDATA%\Code - Insiders\User\workspaceStorage`
- `%APPDATA%\VSCodium\User\workspaceStorage`

## Configuration

- `CODEX_HOME`: override the Codex home directory.
- `CODEX_USAGE_TZ`: override the timezone. Defaults to `America/Denver`.
- `CODEX_USAGE_PORT`: override the API port. Defaults to `5174`.
- `COPILOT_USAGE_ROOTS`: override GitHub Copilot workspace storage roots. Use the platform path delimiter (`;` on Windows, `:` on macOS/Linux) for multiple roots.

## GitHub Copilot tracking

Copilot tracking is local and estimated. It reads VS Code Copilot Chat debug logs after they have been written to disk; the dashboard does not need to be running while Copilot is used.

To produce logs with token fields, VS Code Copilot Chat debug file logging may need to be enabled:

1. Open VS Code.
2. Open the Command Palette with `Ctrl+Shift+P`.
3. Run `Preferences: Open Settings (UI)` or `Preferences: Open User Settings (JSON)`.
4. Add or update this setting:

```json
{
  "github.copilot.chat.agentDebugLog.fileLogging.enabled": true
}
```

5. Save the settings file and restart VS Code if Copilot logs do not appear after new chat or agent activity.

After enabling logging, use Copilot normally, then run or rescan this dashboard. If no Copilot display appears, the dashboard did not find Copilot debug JSONL files with countable `llm_request` token events.

Accuracy guidance:

- High for captured local VS Code Copilot Chat and agent requests when debug logs include token fields.
- Medium for a developer's total personal Copilot usage because completions, GitHub.com, CLI, other IDEs, remote environments, disabled logging, and log rotation can be missed.
- Low for Verisk billing reconciliation because GitHub bills pooled overages in AI Credits with server-side pricing, entitlements, and adjustments.

## Notes

The Codex scanner streams rollout files and only parses session metadata, model context, and `token_count` events. Usage is counted from `last_token_usage` when present, with cumulative delta fallback for older records.

The GitHub Copilot scanner streams Copilot debug JSONL files and counts `llm_request` events with numeric token fields. These logs are unofficial/debug data, so field names and availability may change.
