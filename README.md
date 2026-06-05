# Codex Token Usage Dashboard

Local dashboard for viewing Codex token usage from session JSONL logs.

## Run

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

The API runs on `http://127.0.0.1:5174` and reads:

- `%USERPROFILE%\.codex\sessions`
- `%USERPROFILE%\.codex\archived_sessions`

## Configuration

- `CODEX_HOME`: override the Codex home directory.
- `CODEX_USAGE_TZ`: override the timezone. Defaults to `America/Denver`.
- `CODEX_USAGE_PORT`: override the API port. Defaults to `5174`.

## Notes

The scanner streams rollout files and only parses session metadata, model context, and `token_count` events. Usage is counted from `last_token_usage` when present, with cumulative delta fallback for older records.
