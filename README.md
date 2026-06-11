# AI Token Usage Dashboard

Local dashboard for viewing token usage from supported AI coding tools.

Supported sources:

- Codex session JSONL logs.
- GitHub Copilot Chat/agent debug JSONL logs from VS Code.
- Claude Code local `/usage` aggregates and session transcript JSONL logs.

The dashboard only shows sources that are present on the current machine. Developers who use one supported tool see one display. Developers with multiple supported tools installed see each detected source at the same time.

## Run

```bash
npm install
npm run dev
```

Open the dashboard URL printed by the `[WEB]` Vite process. By default that is `http://127.0.0.1:5173`, but Vite may choose another port if `5173` is already in use.

The API runs separately on `http://127.0.0.1:5174`. That URL is for backend endpoints and health checks; it is not the dashboard.

By default, the scanner reads Codex logs from:

- Windows: `%USERPROFILE%\.codex\sessions` and `%USERPROFILE%\.codex\archived_sessions`
- macOS/Linux: `~/.codex/sessions` and `~/.codex/archived_sessions`

It reads VS Code Copilot Chat debug logs from:

- Windows: `%APPDATA%\Code\User\workspaceStorage`, `%APPDATA%\Code - Insiders\User\workspaceStorage`, and `%APPDATA%\VSCodium\User\workspaceStorage`
- macOS: `~/Library/Application Support/Code/User/workspaceStorage`, `~/Library/Application Support/Code - Insiders/User/workspaceStorage`, and `~/Library/Application Support/VSCodium/User/workspaceStorage`
- Linux: `~/.config/Code/User/workspaceStorage`, `~/.config/Code - Insiders/User/workspaceStorage`, and `~/.config/VSCodium/User/workspaceStorage`

It reads Claude Code usage from:

- Windows: `%USERPROFILE%\.claude`
- macOS/Linux: `~/.claude`
- Any platform: `CLAUDE_CONFIG_DIR` when set

## Configuration

- `CODEX_HOME`: override the Codex home directory.
- `CODEX_USAGE_TZ`: override the timezone. Defaults to `America/Denver`.
- `CODEX_USAGE_PORT`: override the API port. Defaults to `5174`.
- `COPILOT_USAGE_ROOTS`: override GitHub Copilot workspace storage roots. Use the platform path delimiter (`;` on Windows, `:` on macOS/Linux) for multiple roots.
- `CLAUDE_CONFIG_DIR`: override Claude Code's config/data directory. This matches Claude Code's own environment variable.
- `CLAUDE_USAGE_ROOTS`: override Claude Code usage roots. Use the platform path delimiter (`;` on Windows, `:` on macOS/Linux) for multiple roots.

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
- Low for billing reconciliation because GitHub bills pooled overages in AI Credits with server-side pricing, entitlements, and adjustments.

## Claude Code tracking

Claude Code tracking is local and estimated. The scanner prefers `stats-cache.json`, the local aggregate cache used by Claude Code's `/usage` display, for daily totals. It also scans `projects/**/*.jsonl` transcript files for recent and session-level detail. When both sources cover the same Claude config root and date, aggregate `/usage` totals win so the dashboard does not double-count.

Claude transcript files are plaintext and may include prompts, file contents, command output, and secrets printed by tools. This dashboard only extracts timestamps, session IDs, model names, and token counts, but users should still treat the source directory as sensitive.

Accuracy guidance:

- Medium-high for local Claude Code `/usage` aggregates in `stats-cache.json` when present.
- Medium for a developer's total personal Claude Code usage because other machines, cloud sessions, disabled persistence, transcript cleanup, and alternate config directories can be missed.
- Low for billing reconciliation because local token and cost figures are estimates and provider billing uses server-side accounting.

## Notes

The Codex scanner streams rollout files and only parses session metadata, model context, and `token_count` events. Usage is counted from `last_token_usage` when present, with cumulative delta fallback for older records.

The GitHub Copilot scanner streams Copilot debug JSONL files and counts `llm_request` events with numeric token fields. These logs are unofficial/debug data, so field names and availability may change.

The Claude Code scanner reads `stats-cache.json` for aggregate daily totals and streams Claude transcript JSONL files for assistant messages with `message.usage` token fields. Transcript token fields are version-sensitive, so aggregate totals are preferred whenever both sources are available.
