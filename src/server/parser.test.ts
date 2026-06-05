import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseRolloutFile } from "./parser";

const writeFixture = async (lines: string[]): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-token-test-"));
  const filePath = path.join(dir, "rollout-test.jsonl");
  await fs.writeFile(filePath, lines.join("\n"), "utf8");
  return filePath;
};

const record = (timestamp: string, payload: unknown) => JSON.stringify({ timestamp, type: "event_msg", payload });

describe("parseRolloutFile", () => {
  it("sums last_token_usage without double-counting cumulative totals", async () => {
    const file = await writeFixture([
      JSON.stringify({ timestamp: "2026-06-01T00:00:00.000Z", type: "session_meta", payload: { id: "s1", cwd: "repo", originator: "codex_vscode" } }),
      record("2026-06-01T12:00:00.000Z", {
        type: "token_count",
        info: {
          last_token_usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 3, reasoning_output_tokens: 1, total_tokens: 13 },
          total_token_usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 3, reasoning_output_tokens: 1, total_tokens: 13 }
        }
      }),
      record("2026-06-01T12:01:00.000Z", {
        type: "token_count",
        info: {
          last_token_usage: { input_tokens: 20, cached_input_tokens: 4, output_tokens: 5, reasoning_output_tokens: 2, total_tokens: 25 },
          total_token_usage: { input_tokens: 30, cached_input_tokens: 6, output_tokens: 8, reasoning_output_tokens: 3, total_tokens: 38 }
        }
      })
    ]);
    const parsed = await parseRolloutFile(file, "UTC");
    const session = parsed.daily["2026-06-01"][0];
    expect(session.totalTokens).toBe(38);
    expect(session.cachedInputTokens).toBe(6);
    expect(session.events).toBe(2);
  });

  it("falls back to cumulative deltas when last_token_usage is missing", async () => {
    const file = await writeFixture([
      JSON.stringify({ timestamp: "2026-06-01T00:00:00.000Z", type: "session_meta", payload: { id: "s1" } }),
      record("2026-06-01T12:00:00.000Z", {
        type: "token_count",
        info: { total_token_usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 } }
      }),
      record("2026-06-01T12:01:00.000Z", {
        type: "token_count",
        info: { total_token_usage: { input_tokens: 25, output_tokens: 5, total_tokens: 30 } }
      })
    ]);
    const parsed = await parseRolloutFile(file, "UTC");
    expect(parsed.daily["2026-06-01"][0].totalTokens).toBe(30);
  });

  it("ignores null info events and reports malformed json lines", async () => {
    const file = await writeFixture([
      JSON.stringify({ timestamp: "2026-06-01T00:00:00.000Z", type: "session_meta", payload: { id: "s1" } }),
      record("2026-06-01T12:00:00.000Z", { type: "token_count", info: null }),
      "{\"type\":\"event_msg\",\"payload\":{\"type\":\"token_count\"",
      record("2026-06-01T12:01:00.000Z", {
        type: "token_count",
        info: { last_token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }
      })
    ]);
    const parsed = await parseRolloutFile(file, "UTC");
    expect(parsed.parseErrors).toBe(1);
    expect(parsed.tokenEvents).toBe(1);
    expect(parsed.daily["2026-06-01"][0].totalTokens).toBe(2);
  });

  it("deduplicates repeated token events", async () => {
    const event = record("2026-06-01T12:00:00.000Z", {
      type: "token_count",
      info: {
        last_token_usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 },
        total_token_usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 }
      }
    });
    const file = await writeFixture([
      JSON.stringify({ timestamp: "2026-06-01T00:00:00.000Z", type: "session_meta", payload: { id: "s1" } }),
      event,
      event
    ]);
    const parsed = await parseRolloutFile(file, "UTC");
    expect(parsed.daily["2026-06-01"][0].totalTokens).toBe(12);
    expect(parsed.tokenEvents).toBe(1);
  });
});
