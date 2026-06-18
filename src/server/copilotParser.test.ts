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

  it("sums Copilot CLI shutdown model metrics from session-state events", async () => {
    const file = await writeFixture([
      JSON.stringify({
        type: "session.start",
        data: {
          sessionId: "cli-session",
          copilotVersion: "1.0.63",
          context: {
            cwd: "/work/project"
          }
        },
        id: "start",
        timestamp: "2026-06-02T10:00:00.000Z",
        parentId: null
      }),
      JSON.stringify({
        type: "assistant.message",
        data: {
          outputTokens: 999
        },
        id: "partial-output-only",
        timestamp: "2026-06-02T10:01:00.000Z",
        parentId: "start"
      }),
      JSON.stringify({
        type: "session.shutdown",
        data: {
          modelMetrics: {
            "claude-opus-4.6": {
              requests: { count: 2, cost: 3 },
              usage: {
                inputTokens: 46281,
                outputTokens: 316,
                cacheReadTokens: 20928,
                cacheWriteTokens: 11,
                reasoningTokens: 7
              }
            }
          }
        },
        id: "shutdown",
        timestamp: "2026-06-02T10:05:00.000Z",
        parentId: "partial-output-only"
      })
    ]);

    const cliPath = path.join(path.dirname(file), "session-state", "cli-session", "events.jsonl");
    await fs.mkdir(path.dirname(cliPath), { recursive: true });
    await fs.rename(file, cliPath);

    const parsed = await parseCopilotDebugFile(cliPath, "UTC");
    const session = parsed.daily["2026-06-02"][0];
    expect(session.sessionId).toBe("cli-session");
    expect(session.cwd).toBe("/work/project");
    expect(session.originator).toBe("github-copilot-cli");
    expect(session.model).toBe("claude-opus-4.6");
    expect(session.inputTokens).toBe(46281);
    expect(session.outputTokens).toBe(316);
    expect(session.cachedInputTokens).toBe(20939);
    expect(session.reasoningOutputTokens).toBe(7);
    expect(session.totalTokens).toBe(46604);
    expect(parsed.tokenEvents).toBe(1);
  });

  it("prefers Copilot CLI assistant usage events over shutdown aggregates when both exist", async () => {
    const file = await writeFixture([
      JSON.stringify({
        type: "session.start",
        data: {
          sessionId: "cli-session",
          context: { cwd: "/work/project" }
        },
        id: "start",
        timestamp: "2026-06-03T10:00:00.000Z",
        parentId: null
      }),
      JSON.stringify({
        type: "assistant.usage",
        data: {
          model: "gpt-5",
          inputTokens: 100,
          outputTokens: 25,
          cacheReadTokens: 10
        },
        id: "usage",
        timestamp: "2026-06-03T10:01:00.000Z",
        parentId: "start"
      }),
      JSON.stringify({
        type: "session.shutdown",
        data: {
          modelMetrics: {
            "gpt-5": {
              requests: { count: 1 },
              usage: {
                inputTokens: 1000,
                outputTokens: 250,
                cacheReadTokens: 100,
                cacheWriteTokens: 0
              }
            }
          }
        },
        id: "shutdown",
        timestamp: "2026-06-03T10:05:00.000Z",
        parentId: "usage"
      })
    ]);

    const cliPath = path.join(path.dirname(file), "session-state", "cli-session", "events.jsonl");
    await fs.mkdir(path.dirname(cliPath), { recursive: true });
    await fs.rename(file, cliPath);

    const parsed = await parseCopilotDebugFile(cliPath, "UTC");
    const session = parsed.daily["2026-06-03"][0];
    expect(session.inputTokens).toBe(100);
    expect(session.outputTokens).toBe(25);
    expect(session.cachedInputTokens).toBe(10);
    expect(session.totalTokens).toBe(125);
    expect(parsed.tokenEvents).toBe(1);
  });
});
