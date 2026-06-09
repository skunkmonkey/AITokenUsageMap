import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCopilotDebugFile } from "./copilotParser";

const writeFixture = async (lines: string[]): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "copilot-token-test-"));
  const filePath = path.join(dir, "main.jsonl");
  await fs.writeFile(filePath, lines.join("\n"), "utf8");
  return filePath;
};

describe("parseCopilotDebugFile", () => {
  it("sums chat span token fields from current Copilot debug logs", async () => {
    const file = await writeFixture([
      JSON.stringify({
        ts: Date.parse("2026-06-01T12:00:00.000Z"),
        sid: "session-chat",
        type: "request",
        name: "chat:gpt-5.4",
        status: "ok",
        attrs: {
          model: "gpt-5.4",
          debugName: "chat",
          inputTokens: 16464,
          outputTokens: 556,
          cachedTokens: 12416,
          maxTokens: 128000,
          copilotUsageNanoAiu: 2156400000
        }
      })
    ]);

    const parsed = await parseCopilotDebugFile(file, "UTC");
    const session = parsed.daily["2026-06-01"][0];
    expect(session.sessionId).toBe("session-chat");
    expect(session.model).toBe("gpt-5.4");
    expect(session.inputTokens).toBe(16464);
    expect(session.outputTokens).toBe(556);
    expect(session.cachedInputTokens).toBe(12416);
    expect(session.totalTokens).toBe(17020);
    expect(parsed.tokenEvents).toBe(1);
  });

  it("sums llm_request token fields", async () => {
    const file = await writeFixture([
      JSON.stringify({
        timestamp: "2026-06-01T12:00:00.000Z",
        name: "llm_request",
        attrs: {
          sid: "session-1",
          model: "gpt-5",
          inputTokens: 10,
          cachedTokens: 2,
          outputTokens: 5,
          totalTokens: 15
        }
      }),
      JSON.stringify({
        timestamp: "2026-06-01T12:02:00.000Z",
        name: "llm_request",
        attrs: {
          sid: "session-1",
          model: "gpt-5",
          inputTokens: 20,
          outputTokens: 7,
          totalTokens: 27
        }
      })
    ]);

    const parsed = await parseCopilotDebugFile(file, "UTC");
    const session = parsed.daily["2026-06-01"][0];
    expect(session.sessionId).toBe("session-1");
    expect(session.model).toBe("gpt-5");
    expect(session.inputTokens).toBe(30);
    expect(session.outputTokens).toBe(12);
    expect(session.cachedInputTokens).toBe(2);
    expect(session.totalTokens).toBe(42);
    expect(parsed.tokenEvents).toBe(2);
  });

  it("accepts nested usage token fields", async () => {
    const file = await writeFixture([
      JSON.stringify({
        time: "2026-06-01T12:00:00.000Z",
        eventName: "llm_request",
        data: {
          sessionId: "session-2",
          modelName: "claude-sonnet-4",
          usage: {
            prompt_tokens: 100,
            completion_tokens: 25,
            total_tokens: 125
          }
        }
      })
    ]);

    const parsed = await parseCopilotDebugFile(file, "UTC");
    const session = parsed.daily["2026-06-01"][0];
    expect(session.sessionId).toBe("session-2");
    expect(session.model).toBe("claude-sonnet-4");
    expect(session.totalTokens).toBe(125);
  });
});
