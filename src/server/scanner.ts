import fs from "node:fs/promises";
import path from "node:path";
import type { DayTotal, Diagnostics, RateLimitSnapshot, SessionDayTotal, SummaryResponse, TokenUsage, WeeklyTotal } from "../shared/types";
import { addUsage, emptyUsage } from "../shared/tokenMath";
import { addDays, startOfWeek, todayInZone, toLocalDate } from "./dateUtils";
import { appConfig } from "./config";
import { parseRolloutFile, type ParsedFileSummary } from "./parser";

type CacheEntry = {
  key: string;
  summary: ParsedFileSummary;
};

type CacheFile = {
  version: 2;
  entries: Record<string, CacheEntry>;
};

type Store = {
  files: Record<string, ParsedFileSummary>;
  diagnostics: Diagnostics;
  scannedAt: string | null;
};

const emptyDiagnostics = (): Diagnostics => ({
  filesScanned: 0,
  filesFromCache: 0,
  filesParsed: 0,
  skippedFiles: 0,
  parseErrors: 0,
  tokenEvents: 0,
  lastScanStartedAt: null,
  lastScanCompletedAt: null
});

const store: Store = {
  files: {},
  diagnostics: emptyDiagnostics(),
  scannedAt: null
};

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const readCache = async (): Promise<CacheFile> => {
  try {
    const text = await fs.readFile(appConfig.cachePath, "utf8");
    const cache = JSON.parse(text) as CacheFile;
    return cache.version === 2 ? cache : { version: 2, entries: {} };
  } catch {
    return { version: 2, entries: {} };
  }
};

const writeCache = async (cache: CacheFile): Promise<void> => {
  await fs.mkdir(path.dirname(appConfig.cachePath), { recursive: true });
  await fs.writeFile(appConfig.cachePath, JSON.stringify(cache, null, 2), "utf8");
};

const collectRolloutFiles = async (roots: string[]): Promise<string[]> => {
  const files: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.startsWith("rollout-") && entry.name.endsWith(".jsonl")) {
        files.push(fullPath);
      }
    }
  };

  for (const root of roots) {
    await walk(root);
  }
  return files.sort();
};

const cacheKeyFor = async (filePath: string): Promise<string> => {
  const stat = await fs.stat(filePath);
  return `${stat.size}:${stat.mtimeMs}`;
};

export const scanCodexLogs = async (force = false): Promise<Diagnostics> => {
  const diagnostics = emptyDiagnostics();
  diagnostics.lastScanStartedAt = new Date().toISOString();
  const cache = force ? { version: 2, entries: {} } as CacheFile : await readCache();
  const files = await collectRolloutFiles(appConfig.codexRoots);
  diagnostics.filesScanned = files.length;
  const nextCache: CacheFile = { version: 2, entries: {} };
  const summaries: Record<string, ParsedFileSummary> = {};

  for (const filePath of files) {
    try {
      const key = await cacheKeyFor(filePath);
      const cached = cache.entries[filePath];
      if (cached?.key === key) {
        summaries[filePath] = cached.summary;
        nextCache.entries[filePath] = cached;
        diagnostics.filesFromCache += 1;
      } else {
        const summary = await parseRolloutFile(filePath, appConfig.timezone);
        summaries[filePath] = summary;
        nextCache.entries[filePath] = { key, summary };
        diagnostics.filesParsed += 1;
      }
    } catch {
      diagnostics.skippedFiles += 1;
    }
  }

  for (const summary of Object.values(summaries)) {
    diagnostics.parseErrors += summary.parseErrors;
    diagnostics.tokenEvents += summary.tokenEvents;
  }
  diagnostics.lastScanCompletedAt = new Date().toISOString();
  await writeCache(nextCache);

  store.files = summaries;
  store.diagnostics = diagnostics;
  store.scannedAt = diagnostics.lastScanCompletedAt;
  return diagnostics;
};

export const ensureScanned = async (): Promise<void> => {
  if (!store.scannedAt) {
    await scanCodexLogs(false);
  }
};

const buildDaily = (): Map<string, DayTotal> => {
  const daily = new Map<string, DayTotal>();
  for (const summary of Object.values(store.files)) {
    for (const [date, sessions] of Object.entries(summary.daily)) {
      let total = daily.get(date);
      if (!total) {
        total = { ...emptyUsage(), date, events: 0, sessions: 0 };
        daily.set(date, total);
      }
      const sessionIds = new Set<string>();
      for (const session of sessions) {
        addUsage(total, session);
        total.events += session.events;
        sessionIds.add(session.sessionId);
      }
      total.sessions += sessionIds.size;
    }
  }
  return daily;
};

const buildWeekly = (days: DayTotal[]): WeeklyTotal[] => {
  const weekly = new Map<string, WeeklyTotal>();
  for (const day of days) {
    const weekStart = startOfWeek(day.date);
    let total = weekly.get(weekStart);
    if (!total) {
      total = { ...emptyUsage(), weekStart, events: 0 };
      weekly.set(weekStart, total);
    }
    addUsage(total, day);
    total.events += day.events;
  }
  return [...weekly.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
};

const latestRateLimit = (): RateLimitSnapshot | null => {
  return Object.values(store.files)
    .map((summary) => summary.latestRateLimit)
    .filter((snapshot): snapshot is RateLimitSnapshot => Boolean(snapshot))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0] ?? null;
};

const latestRateLimitForDay = (date: string): RateLimitSnapshot | null => {
  return Object.values(store.files)
    .flatMap((summary) => summary.rateLimits ?? [])
    .filter((snapshot) => toLocalDate(snapshot.timestamp, appConfig.timezone) === date)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0] ?? null;
};

const lastHourUsage = (): TokenUsage => {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const total = emptyUsage();
  for (const summary of Object.values(store.files)) {
    for (const event of summary.events) {
      if (new Date(event.timestamp).getTime() >= oneHourAgo) {
        addUsage(total, event.usage);
      }
    }
  }
  return total;
};

export const getSummary = async (from?: string, to?: string): Promise<SummaryResponse> => {
  await ensureScanned();
  const today = todayInZone(appConfig.timezone);
  const rangeTo = to ?? today;
  const rangeFrom = from ?? addDays(rangeTo, -364);
  const allDaily = buildDaily();
  const daily = [...allDaily.values()]
    .filter((day) => day.date >= rangeFrom && day.date <= rangeTo)
    .sort((a, b) => a.date.localeCompare(b.date));
  const totals = daily.reduce((acc, day) => addUsage(acc, day), emptyUsage());
  const lastSevenDays = daily
    .filter((day) => day.date >= addDays(today, -6) && day.date <= today)
    .reduce((acc, day) => addUsage(acc, day), emptyUsage());

  return {
    range: { from: rangeFrom, to: rangeTo, timezone: appConfig.timezone },
    totals,
    today: allDaily.get(today) ?? null,
    lastHour: lastHourUsage(),
    lastSevenDays,
    peakDay: daily.reduce<DayTotal | null>((peak, day) => (!peak || day.totalTokens > peak.totalTokens ? day : peak), null),
    daily,
    weekly: buildWeekly(daily),
    latestRateLimit: latestRateLimit(),
    diagnostics: store.diagnostics
  };
};

export const getDay = async (date: string) => {
  await ensureScanned();
  const sessions: SessionDayTotal[] = [];
  for (const summary of Object.values(store.files)) {
    sessions.push(...(summary.daily[date] ?? []));
  }
  sessions.sort((a, b) => b.totalTokens - a.totalTokens);
  const daily = buildDaily();
  const totals = daily.get(date) ?? null;
  const weekStart = startOfWeek(date);
  const weekToDate = [...daily.values()]
    .filter((day) => day.date >= weekStart && day.date <= date)
    .reduce(
      (acc, day) => {
        addUsage(acc, day);
        acc.events += day.events;
        return acc;
      },
      { ...emptyUsage(), weekStart, through: date, events: 0 }
    );
  return {
    date,
    totals,
    sessions,
    rateLimit: {
      latestForDay: latestRateLimitForDay(date),
      weekToDate
    }
  };
};

export const getConfig = async () => {
  await ensureScanned();
  return {
    timezone: appConfig.timezone,
    codexRoots: appConfig.codexRoots,
    cachePath: appConfig.cachePath,
    cacheExists: await fileExists(appConfig.cachePath),
    diagnostics: store.diagnostics
  };
};
