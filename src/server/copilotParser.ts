import fs from "node:fs";
import path from "node:path";
import type { RateLimitSnapshot, SessionDayTotal, TokenUsage } from "../shared/types";
import { addUsage, emptyUsage } from "../shared/tokenMath";
import { toLocalDate } from "./dateUtils";

type ParsedCopilotRecord = {
  timestamp: string;
  sessionId: string;
  cwd: string | null;
  originator: string;
  model: string;
  name: string | null;
  usage: TokenUsage;
};

export type ParsedCopilotFileSummary = {
  path: string;
  daily: Record<string, SessionDayTotal[]>;
  events: Array<{
    timestamp: string;
    usage: TokenUsage;
  }>;
  rateLimits: RateLimitSnapshot[];
  latestRateLimit: RateLimitSnapshot | null;
  parseErrors: number;
  tokenEvents: number;
};

const numberFrom = (...values: unknown[]): number => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return 0;
};

const getNested = (source: unknown, pathParts: string[]): unknown => {
  let cursor = source;
  for (const part of pathParts) {
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
};

const firstString = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
};

const timestampFrom = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return new Date(value).toISOString();
  }
  return null;
};

const firstObject = (...values: unknown[]): Record<string, unknown> => {
  for (const value of values) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return {};
};

const usageFrom = (record: Record<string, unknown>, attrs: Record<string, unknown>): TokenUsage | null => {
  const usage = firstObject(attrs.usage, attrs.tokenUsage, attrs.tokens, record.usage, record.tokenUsage, getNested(attrs, ["response", "usage"]));
  const cacheReadTokens = numberFrom(attrs.cacheReadTokens, usage.cacheReadTokens);
  const cacheWriteTokens = numberFrom(attrs.cacheWriteTokens, usage.cacheWriteTokens);
  const combinedCacheTokens = cacheReadTokens + cacheWriteTokens;
  const inputTokens = numberFrom(
    attrs.inputTokens,
    attrs.input_tokens,
    attrs.promptTokens,
    attrs.prompt_tokens,
    usage.inputTokens,
    usage.input_tokens,
    usage.promptTokens,
    usage.prompt_tokens
  );
  const outputTokens = numberFrom(
    attrs.outputTokens,
    attrs.output_tokens,
    attrs.completionTokens,
    attrs.completion_tokens,
    usage.outputTokens,
    usage.output_tokens,
    usage.completionTokens,
    usage.completion_tokens
  );
  const cachedInputTokens = numberFrom(
    attrs.cachedInputTokens,
    attrs.cached_input_tokens,
    attrs.cacheReadInputTokens,
    attrs.cache_read_input_tokens,
    combinedCacheTokens > 0 ? combinedCacheTokens : undefined,
    attrs.cachedTokens,
    attrs.cached_tokens,
    usage.cachedInputTokens,
    usage.cached_input_tokens,
    usage.cacheReadInputTokens,
    usage.cache_read_input_tokens,
    usage.cachedTokens,
    usage.cached_tokens
  );
  const reasoningOutputTokens = numberFrom(
    attrs.reasoningOutputTokens,
    attrs.reasoning_output_tokens,
    attrs.reasoningTokens,
    usage.reasoningOutputTokens,
    usage.reasoning_output_tokens,
    usage.reasoningTokens
  );
  const totalTokens = numberFrom(attrs.totalTokens, attrs.total_tokens, usage.totalTokens, usage.total_tokens)
    || inputTokens + outputTokens + reasoningOutputTokens;

  if (totalTokens <= 0) return null;
  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningOutputTokens,
    totalTokens
  };
};

const parseRecord = (record: Record<string, unknown>, filePath: string): ParsedCopilotRecord | null => {
  const attrs = firstObject(record.attrs, record.attributes, record.data, record.payload, record);
  const eventName = firstString(record.name, record.eventName, record.type, attrs.name, attrs.eventName, attrs.type);

  const usage = usageFrom(record, attrs);
  if (!usage) return null;

  return {
    timestamp: timestampFrom(record.timestamp, record.ts, record.time, record.created_at, attrs.timestamp, attrs.ts, attrs.time) ?? new Date().toISOString(),
    sessionId: firstString(record.sid, record.sessionId, record.session_id, attrs.sid, attrs.sessionId, attrs.session_id) ?? path.basename(path.dirname(filePath)),
    cwd: null,
    originator: firstString(attrs.originator, record.originator) ?? "github-copilot-vscode",
    model: firstString(attrs.model, attrs.modelName, attrs.model_id, getNested(attrs, ["request", "model"]), getNested(record, ["request", "model"]))
      ?? (eventName?.startsWith("chat:") ? eventName.slice("chat:".length) : null)
      ?? "unknown",
    name: eventName,
    usage
  };
};

const cliRecordsFromShutdown = (
  record: Record<string, unknown>,
  filePath: string,
  sessionId: string,
  cwd: string | null
): ParsedCopilotRecord[] => {
  if (record.type !== "session.shutdown") return [];
  const data = firstObject(record.data);
  const modelMetrics = firstObject(data.modelMetrics);
  const timestamp = timestampFrom(record.timestamp, data.timestamp, data.sessionEndTime) ?? new Date().toISOString();
  return Object.entries(modelMetrics).flatMap(([model, value]) => {
    const metric = firstObject(value);
    const usage = usageFrom(record, firstObject(metric.usage));
    return usage ? [{
      timestamp,
      sessionId,
      cwd,
      originator: "github-copilot-cli",
      model,
      name: "session.shutdown",
      usage
    }] : [];
  });
};

const cliRecordFromAssistantUsage = (
  record: Record<string, unknown>,
  filePath: string,
  sessionId: string,
  cwd: string | null
): ParsedCopilotRecord | null => {
  if (record.type !== "assistant.usage") return null;
  const data = firstObject(record.data);
  const usage = usageFrom(record, data);
  if (!usage) return null;
  return {
    timestamp: timestampFrom(record.timestamp, data.timestamp) ?? new Date().toISOString(),
    sessionId: firstString(data.sessionId, getNested(record, ["data", "sessionId"])) ?? sessionId,
    cwd,
    originator: "github-copilot-cli",
    model: firstString(data.model) ?? "unknown",
    name: "assistant.usage",
    usage
  };
};

const createSessionTotal = (parsed: ParsedCopilotRecord, filePath: string): SessionDayTotal => ({
  ...emptyUsage(),
  sessionId: parsed.sessionId,
  cwd: parsed.cwd,
  source: filePath,
  originator: parsed.originator,
  cliVersion: null,
  model: parsed.model,
  events: 0,
  firstSeen: parsed.timestamp,
  lastSeen: parsed.timestamp
});

export const parseCopilotDebugFile = async (filePath: string, timezone: string): Promise<ParsedCopilotFileSummary> => {
  const text = await fs.promises.readFile(filePath, "utf8");
  const isCopilotCliSessionFile = path.basename(filePath) === "events.jsonl"
    && filePath.includes(`${path.sep}session-state${path.sep}`);
  const daily: Record<string, SessionDayTotal[]> = {};
  const sessionByDayAndModel = new Map<string, SessionDayTotal>();
  const seenEvents = new Set<string>();
  const events: ParsedCopilotFileSummary["events"] = [];
  let parseErrors = 0;
  let tokenEvents = 0;
  let cliSessionId = path.basename(path.dirname(filePath));
  let cliCwd: string | null = null;
  let hasCliAssistantUsage = false;
  const pendingCliShutdownRecords: ParsedCopilotRecord[] = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (!line) continue;
    if (!/tokens?|usage|session\.start|session\.shutdown/i.test(line)) continue;

    let record: Record<string, unknown>;
    try {
      record = JSON.parse(line) as Record<string, unknown>;
    } catch {
      parseErrors += 1;
      continue;
    }

    if (record.type === "session.start") {
      const data = firstObject(record.data);
      const context = firstObject(data.context);
      cliSessionId = firstString(data.sessionId, record.sessionId) ?? cliSessionId;
      cliCwd = firstString(context.cwd) ?? cliCwd;
      continue;
    }

    if (isCopilotCliSessionFile && record.type !== "assistant.usage" && record.type !== "session.shutdown") {
      continue;
    }

    let parsedRecords: ParsedCopilotRecord[];
    try {
      const cliUsageRecord = cliRecordFromAssistantUsage(record, filePath, cliSessionId, cliCwd);
      if (cliUsageRecord) {
        hasCliAssistantUsage = true;
        parsedRecords = [cliUsageRecord];
      } else {
        const shutdownRecords = cliRecordsFromShutdown(record, filePath, cliSessionId, cliCwd);
        if (shutdownRecords.length > 0) {
          pendingCliShutdownRecords.push(...shutdownRecords);
          continue;
        }
        const parsed = parseRecord(record, filePath);
        parsedRecords = parsed ? [parsed] : [];
      }
    } catch {
      continue;
    }

    for (const parsed of parsedRecords) {
      const dedupKey = `${parsed.timestamp}:${parsed.sessionId}:${parsed.model}:${parsed.usage.inputTokens}:${parsed.usage.outputTokens}:${parsed.usage.totalTokens}`;
      if (seenEvents.has(dedupKey)) continue;
      seenEvents.add(dedupKey);

      const date = toLocalDate(parsed.timestamp, timezone);
      const key = `${date}|${parsed.sessionId}|${parsed.model}`;
      let total = sessionByDayAndModel.get(key);
      if (!total) {
        total = createSessionTotal(parsed, filePath);
        sessionByDayAndModel.set(key, total);
        daily[date] ??= [];
        daily[date].push(total);
      }

      addUsage(total, parsed.usage);
      total.events += 1;
      total.lastSeen = parsed.timestamp;
      events.push({ timestamp: parsed.timestamp, usage: parsed.usage });
      tokenEvents += 1;
    }
  }

  const recordsToAdd = hasCliAssistantUsage ? [] : pendingCliShutdownRecords;
  for (const parsed of recordsToAdd) {
    const dedupKey = `${parsed.timestamp}:${parsed.sessionId}:${parsed.model}:${parsed.usage.inputTokens}:${parsed.usage.outputTokens}:${parsed.usage.totalTokens}`;
    if (seenEvents.has(dedupKey)) continue;
    seenEvents.add(dedupKey);

    const date = toLocalDate(parsed.timestamp, timezone);
    const key = `${date}|${parsed.sessionId}|${parsed.model}`;
    let total = sessionByDayAndModel.get(key);
    if (!total) {
      total = createSessionTotal(parsed, filePath);
      sessionByDayAndModel.set(key, total);
      daily[date] ??= [];
      daily[date].push(total);
    }

    addUsage(total, parsed.usage);
    total.events += 1;
    total.lastSeen = parsed.timestamp;
    events.push({ timestamp: parsed.timestamp, usage: parsed.usage });
    tokenEvents += 1;
  }

  return {
    path: filePath,
    daily,
    events,
    rateLimits: [],
    latestRateLimit: null,
    parseErrors,
    tokenEvents
  };
};
