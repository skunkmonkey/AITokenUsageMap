# Claude Code Token Usage Research

Research date: 2026-06-11

## Short answer

Claude Code can be added to this app with a local scanner, but the safest implementation is **hybrid**:

1. Prefer `~/.claude/stats-cache.json` for aggregate historical usage because Anthropic documents it as the file backing `/usage`.
2. Optionally scan `~/.claude/projects/**/*.jsonl` for per-session/project drill-down, but label those numbers as estimated and version-sensitive.
3. Treat costs as estimates only. For authoritative billing, Anthropic points users to the Claude Console Usage page or the Usage and Cost API.

## Local data sources

### 1. Claude config directory

Claude Code's default config/data directory is `~/.claude`; on Windows this resolves to `%USERPROFILE%\.claude`. If `CLAUDE_CONFIG_DIR` is set, Anthropic says every `~/.claude` path should be interpreted under that directory instead.

Implementation default:

```ts
const claudeHome = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
```

Recommended override for this app:

```text
CLAUDE_USAGE_ROOTS
```

Use the platform path delimiter, matching the existing `COPILOT_USAGE_ROOTS` pattern.

Source: https://code.claude.com/docs/en/claude-directory

### 2. `stats-cache.json`

Anthropic documents `~/.claude/stats-cache.json` as "Aggregated token and cost counts shown by `/usage`" and says it is kept until the user deletes it. This makes it the best first source for a dashboard that wants historical local Claude Code usage.

Known/observed fields from public issue/source discussions:

```ts
type ClaudeStatsCache = {
  version: number;
  lastComputedDate?: string | null;
  dailyActivity?: Array<{
    date: string;
    messageCount?: number;
    sessionCount?: number;
    toolCallCount?: number;
  }>;
  dailyModelTokens?: Array<{
    date: string;
    tokensByModel: Record<string, number>;
  }>;
  modelUsage?: Record<string, {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadInputTokens?: number;
    cacheCreationInputTokens?: number;
    webSearchRequests?: number;
    costUSD?: number;
    contextWindow?: number;
  }>;
  totalSessions?: number;
  totalMessages?: number;
  firstSessionDate?: string | null;
};
```

How to use it in this repo:

- Build daily totals from `dailyModelTokens[].tokensByModel`.
- Build all-time model totals from `modelUsage`.
- Build pseudo session rows per `date + model` when only aggregate data is available.
- Count `dailyActivity[].sessionCount` as sessions where present.
- Be tolerant of missing/renamed fields and cache version changes.

Important limitation: `dailyModelTokens` appears to provide daily total tokens by model, not a daily per-category breakdown. If the dashboard needs daily input/output/cache split, supplement with JSONL logs, but see the accuracy caveats below.

Sources:

- https://code.claude.com/docs/en/claude-directory
- https://github.com/anthropics/claude-code/issues/22537
- https://github.com/ccusage/ccusage/discussions/754

### 3. `projects/<project>/<session>.jsonl`

Anthropic documents transcript files at:

```text
~/.claude/projects/<project>/<session>.jsonl
~/.claude/projects/<project>/<session>/subagents/
```

These are plaintext full conversation transcripts and are deleted on startup once older than `cleanupPeriodDays`; the default is 30 days. Users can also disable transcript writes with `CLAUDE_CODE_SKIP_PROMPT_HISTORY`, `--no-session-persistence`, or Agent SDK `persistSession: false`.

Community Claude Code usage tools parse assistant records in these JSONL files. The commonly reported usage fields are:

```text
message.usage.input_tokens
message.usage.output_tokens
message.usage.cache_creation_input_tokens
message.usage.cache_read_input_tokens
message.model
```

How to use it in this repo:

- Collect `*.jsonl` under `claudeHome/projects`.
- Parse only records where `type === "assistant"` and `message.usage` exists.
- Extract timestamp from the record timestamp or message timestamp.
- Extract session id from record `sessionId`/`session_id` or filename.
- Extract model from `message.model`.
- Deduplicate aggressively, ideally by request id when present; otherwise use timestamp/session/model/token fields.
- Include subagent transcript files if the app wants complete local activity.

Sources:

- https://code.claude.com/docs/en/claude-directory
- https://code.claude.com/docs/en/agent-sdk/session-storage
- https://github.com/phuryn/claude-usage

## Accuracy cautions

### Metric parity with Codex and Copilot

Claude Code can support the same broad dashboard shape as Codex and GitHub Copilot, but not every metric has the same reliability:

| Metric | Can support? | Best source | Confidence | Notes |
| --- | --- | --- | --- | --- |
| Daily totals | Yes | `stats-cache.json` `dailyModelTokens` | Medium-high | Best headline source. It is the local aggregate behind `/usage`, but schema is internal/cache-like rather than a stable public API. |
| Weekly totals | Yes | Derived from daily totals | Medium-high | Same confidence as daily totals. |
| Today | Yes | `stats-cache.json`; optionally JSONL for fresher recent detail | Medium | Cache freshness is the main uncertainty. JSONL may be fresher but less accurate for some token fields. |
| Last seven days | Yes | `stats-cache.json` | Medium-high | Good fit for available aggregate data. |
| Peak day | Yes | Derived from daily totals | Medium-high | Good if daily totals are present. |
| Per-model totals | Yes | `stats-cache.json` `modelUsage` | Medium-high | Usually includes `inputTokens`, `outputTokens`, `cacheReadInputTokens`, and `cacheCreationInputTokens`. |
| Per-session rows | Partially | `projects/**/*.jsonl` | Low-medium | Session attribution is available, but transcript token fields may undercount on some Claude Code versions. |
| Last hour usage | Partially | JSONL or optional statusline/hook capture | Low-medium without hook; medium with hook | `stats-cache.json` is aggregate-oriented. JSONL can provide timestamps but may have token fidelity issues. |
| Token event count | Partially | JSONL assistant records or synthetic aggregate rows | Low-medium | Not directly comparable to Codex `token_count` events. For stats-cache-only mode, events may need to be synthetic. |
| Cache read/write split | Yes for all-time; partial daily | `modelUsage`; JSONL for session/day detail | Medium | Claude distinguishes cache read and cache creation. This app currently has only `cachedInputTokens`, so exact display would benefit from splitting cache fields in `TokenUsage`. |
| Rate limit snapshots | Optional only | Statusline JSON live capture | Medium if captured; unavailable otherwise | Claude exposes `rate_limits` in statusline JSON for Claude.ai subscribers after first API response, but it is not a historical local log like Codex rate events. |
| Billing/cost reconciliation | No, estimates only | `stats-cache.json` `costUSD` or local pricing table | Low | Anthropic says local cost figures are client-side estimates; authoritative billing is Console/API. |

Implementation guidance:

- Treat Claude Code as "summary parity, partial precision parity."
- Use `stats-cache.json` for headline daily/weekly/last-seven/peak/model totals.
- Use JSONL transcripts only for drill-down, freshness, and per-session attribution, with a visible confidence note.
- Do not compare Claude transcript-derived event counts directly with Codex `token_count` event counts; name them as "counted transcript records" or similar if exposed.
- If the app later wants higher-confidence last-hour and rate-limit metrics, add an optional Claude statusline or hook capture file controlled by the user. Do not require this for the basic scanner.

### JSONL token fields may be unreliable

There are recent reports that Claude Code JSONL transcript token fields can undercount input/output tokens because the transcript is written during streaming and placeholder values are not always updated. One report found cache read/write fields were much closer to the live statusline totals, while `input_tokens` and `output_tokens` were badly low. A public Anthropic issue also reports placeholder `output_tokens` in JSONL logs for Claude Code 2.1.42.

Recommendation: do not make JSONL-derived totals the main headline number unless validated against `stats-cache.json` for the installed Claude Code version. Use JSONL primarily for per-session/project attribution and label it as estimated.

Sources:

- https://gille.ai/en/blog/claude-code-jsonl-logs-undercount-tokens/
- https://github.com/anthropics/claude-code/issues/25941

### `stats-cache.json` is internal/cache data

`stats-cache.json` is documented by Anthropic, but its exact schema is not presented as a stable public API. There are also GitHub issues about historical data bugs in the stats cache. Parse it defensively and keep fixtures for multiple versions.

Source: https://github.com/anthropics/claude-code/issues/22123

### Local-only coverage

This app should describe Claude Code support as local observed/estimated usage. Local files may miss:

- cloud-executed Claude Code on the web sessions,
- server-side cowork sessions,
- usage from another machine or a different `CLAUDE_CONFIG_DIR`,
- transcript history older than `cleanupPeriodDays`,
- sessions created with persistence disabled,
- billing adjustments and plan-specific quota accounting.

Anthropic says `/usage` local figures for Pro/Max/Team/Enterprise are approximate and computed from local session history on this machine, so usage from other devices or claude.ai is not included.

Source: https://code.claude.com/docs/en/costs

## Token field mapping

Claude has both cache read and cache creation tokens. This repo currently has:

```ts
type TokenUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
};
```

For a quick MVP, map:

```text
inputTokens = input_tokens or inputTokens
cachedInputTokens = cache_read_input_tokens + cache_creation_input_tokens
outputTokens = output_tokens or outputTokens
reasoningOutputTokens = 0 unless a future field appears
totalTokens = input + cache_read + cache_creation + output
```

Better long-term change:

```ts
type TokenUsage = {
  inputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
};
```

That would let the dashboard display Claude cache behavior accurately without losing compatibility with Codex/Copilot. Existing `cachedInputTokens` could be migrated or treated as cache-read tokens.

## Recommended implementation plan

1. Add `"claude-code"` to `HarnessId`.
2. Add `claudeRoots` to config:
   - default: `CLAUDE_CONFIG_DIR || ~/.claude`
   - override: `CLAUDE_USAGE_ROOTS`
3. Add a Claude harness in `scanner.ts`.
4. Implement `claudeStatsParser.ts`:
   - read `stats-cache.json`,
   - produce daily pseudo sessions from `dailyModelTokens`,
   - produce all-time model/category diagnostics from `modelUsage` where useful,
   - confidence label: "Observed local `/usage` aggregates".
5. Optionally implement `claudeTranscriptParser.ts`:
   - scan `projects/**/*.jsonl`,
   - parse assistant `message.usage`,
   - use for per-session drill-down and recent session details,
   - avoid overriding stats-cache headline totals unless validated.
6. Update README with privacy warnings: Claude transcripts are plaintext and may contain prompts, file contents, command output, and secrets printed by tools.
7. Add fixtures for:
   - stats cache with `dailyModelTokens` and `modelUsage`,
   - transcript assistant message with cache read/write fields,
   - duplicate streaming JSONL records,
   - missing/invalid cache fields.

## Confidence labels to use in the UI

Suggested Claude Code confidence text:

```text
Captured: Medium-high for local Claude Code `/usage` aggregates in stats-cache.json when present; lower for per-session transcript-derived drill-down because JSONL token fields can be version-sensitive.
Total personal usage: Medium because other machines, cloud sessions, disabled persistence, transcript cleanup, and alternate config dirs can be missed.
Billing: Low for billing reconciliation because local costs are estimates and subscription plans/Console billing use server-side accounting.
```

Suggested per-metric UI copy:

```text
Daily and weekly totals use Claude Code's local `/usage` aggregate cache when available.
Session detail is estimated from local transcript records and may undercount on some Claude Code versions.
Last-hour and rate-limit metrics require recent transcript/statusline data and may be unavailable.
Billing totals are local estimates, not authoritative Claude Console billing.
```

## Bottom line

Add Claude Code support by reading `stats-cache.json` first. It fits this app's local-dashboard design and is the only source Anthropic explicitly documents as backing `/usage` aggregates. Add JSONL transcript parsing as a second layer for per-session detail, freshness, and approximate last-hour usage, but keep the UI honest that those transcript-derived numbers are estimated and may undercount on some Claude Code versions.
