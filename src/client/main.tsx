import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { line } from "d3-shape";
import { scaleLinear, scaleLog } from "d3-scale";
import type { DashboardResponse, DayResponse, DayTotal, HarnessId, SummaryResponse, WeeklyTotal } from "../shared/types";
import "./styles.css";

const tokenFormat = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1
});

const fullFormat = new Intl.NumberFormat("en-US");

const formatTokens = (value: number): string => tokenFormat.format(value);

const HEATMAP_EMPTY_COLOR = "#ebedf0";
const HEATMAP_COLORS = ["#d9f0dd", "#bde5c4", "#94d79f", "#63c17d", "#32a866", "#16834b", "#075f34"];
const HEATMAP_BUCKETS = [1 / 1000, 1 / 300, 1 / 100, 1 / 30, 1 / 10, 1 / 3, 1];

const formatPercent = (value: number | null | undefined): string => {
  if (typeof value !== "number") return "n/a";
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%`;
};

const formatTime = (timestamp: string | null | undefined): string => {
  if (!timestamp) return "No snapshot";
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
};

const addDays = (date: string, days: number): string => {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
};

const rangeDays = (from: string, to: string): string[] => {
  const days: string[] = [];
  for (let cursor = from; cursor <= to; cursor = addDays(cursor, 1)) {
    days.push(cursor);
  }
  return days;
};

const startOfWeek = (date: string): string => {
  const current = new Date(`${date}T00:00:00.000Z`);
  current.setUTCDate(current.getUTCDate() - current.getUTCDay());
  return current.toISOString().slice(0, 10);
};

const dateDiffDays = (from: string, to: string): number => {
  const start = new Date(`${from}T00:00:00.000Z`).getTime();
  const end = new Date(`${to}T00:00:00.000Z`).getTime();
  return Math.round((end - start) / 86_400_000);
};

const cellColor = (value: number, max: number): string => {
  if (value <= 0 || max <= 0) return HEATMAP_EMPTY_COLOR;
  const ratio = value / max;
  const bucket = HEATMAP_BUCKETS.findIndex((threshold) => ratio <= threshold);
  return HEATMAP_COLORS[bucket === -1 ? HEATMAP_COLORS.length - 1 : bucket];
};

const monthLabel = (date: string): string => {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return parsed.toLocaleDateString("en-US", { month: "short" });
};

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <section className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </section>
  );
}

function MiniStat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="miniStat">
      <strong>{value}</strong>
      <span>{label}</span>
      <small>{detail}</small>
    </div>
  );
}

function WeeklyLine({ weekly }: { weekly: WeeklyTotal[] }) {
  const width = 980;
  const height = 132;
  const pad = { left: 18, right: 12, top: 12, bottom: 24 };
  const max = Math.max(1, ...weekly.map((week) => week.totalTokens));
  const x = scaleLinear().domain([0, Math.max(1, weekly.length - 1)]).range([pad.left, width - pad.right]);
  const y = scaleLog().domain([1, Math.max(2, max)]).range([height - pad.bottom, pad.top]);
  const path = line<WeeklyTotal>()
    .x((_week, index) => x(index))
    .y((week) => y(Math.max(1, week.totalTokens)))(weekly) ?? "";

  return (
    <div className="lineChart" aria-label="Weekly total token line chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img">
        <line x1={pad.left} x2={width - pad.right} y1={height - pad.bottom} y2={height - pad.bottom} />
        <path d={path} />
        {weekly.map((week, index) => (
          <circle key={week.weekStart} cx={x(index)} cy={y(Math.max(1, week.totalTokens))} r={3}>
            <title>{`${week.weekStart}: ${fullFormat.format(week.totalTokens)} tokens`}</title>
          </circle>
        ))}
        {weekly.map((week, index) =>
          index % Math.max(1, Math.floor(weekly.length / 8)) === 0 ? (
            <text key={week.weekStart} x={x(index)} y={height - 6}>
              {monthLabel(week.weekStart)}
            </text>
          ) : null
        )}
      </svg>
    </div>
  );
}

function Heatmap({
  days,
  daily,
  selectedDate,
  onSelect
}: {
  days: string[];
  daily: Map<string, DayTotal>;
  selectedDate: string | null;
  onSelect: (date: string) => void;
}) {
  const cell = 14;
  const gap = 3;
  const top = 0;
  const gridStart = days.length > 0 ? startOfWeek(days[0]) : "";
  const gridEnd = days.length > 0 ? days[days.length - 1] : "";
  const rangeKey = days.length > 0 ? `${gridStart}:${gridEnd}` : "";
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const weeks = days.length > 0 ? Math.floor(dateDiffDays(gridStart, gridEnd) / 7) + 1 : 0;
  const width = weeks * (cell + gap) + 12;
  const height = top + 7 * (cell + gap) + 8;
  const max = Math.max(0, ...[...daily.values()].map((day) => day.totalTokens));

  useLayoutEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;
    scrollContainer.scrollLeft = scrollContainer.scrollWidth;
  }, [rangeKey]);

  return (
    <div className="heatmapGrid">
      <div className="weekdayLabels" aria-hidden="true">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="heatmapWrap" ref={scrollRef}>
        <svg viewBox={`0 0 ${width} ${height}`} className="heatmap" role="img" aria-label="Daily token usage heatmap">
          {days.map((date) => {
            const week = Math.floor(dateDiffDays(gridStart, date) / 7);
            const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
            const total = daily.get(date);
            const tokens = total?.totalTokens ?? 0;
            const x = week * (cell + gap);
            const y = top + weekday * (cell + gap);
            return (
              <rect
                key={date}
                className={selectedDate === date ? "selectedCell" : ""}
                x={x}
                y={y}
                width={cell}
                height={cell}
                rx={2}
                fill={cellColor(tokens, max)}
                onClick={() => onSelect(date)}
                tabIndex={0}
                role="button"
                aria-label={`${date}: ${tokens} tokens`}
              >
                <title>{`${date}: ${fullFormat.format(tokens)} tokens, ${total?.events ?? 0} events`}</title>
              </rect>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function ConfidencePanel({ summary }: { summary: SummaryResponse }) {
  if (!summary.harness.confidence) return null;
  return (
    <section className="confidencePanel" aria-label={`${summary.harness.name} accuracy guidance`}>
      <h3>Confidence</h3>
      <div className="confidenceGrid">
        <MiniStat label="Captured local requests" value="High" detail={summary.harness.confidence.captured} />
        <MiniStat label="Total personal usage" value="Medium" detail={summary.harness.confidence.total} />
        <MiniStat label="Billing reconciliation" value="Low" detail={summary.harness.confidence.billing} />
      </div>
    </section>
  );
}

function DayDetails({ day }: { day: DayResponse | null }) {
  if (!day) return <aside className="details emptyPanel">No day selected.</aside>;
  if (!day.totals) return <aside className="details emptyPanel">No {day.harness.name} token events for {day.date}.</aside>;
  const hasRateLimit = Boolean(day.rateLimit.latestForDay || day.harness.id === "codex");

  return (
    <aside className="details">
      <div className="detailsHead">
        <span>{day.date}</span>
        <strong>{formatTokens(day.totals.totalTokens)}</strong>
      </div>
      {hasRateLimit && (
        <section className="rateSummary">
          <h3>Selected day limit snapshot</h3>
          <div className="rateGrid">
            <MiniStat
              label="5h used %"
              value={formatPercent(day.rateLimit.latestForDay?.primary?.usedPercent)}
              detail={formatTime(day.rateLimit.latestForDay?.timestamp)}
            />
            <MiniStat
              label="Weekly used %"
              value={formatPercent(day.rateLimit.latestForDay?.secondary?.usedPercent)}
              detail="Latest observed that day"
            />
            <MiniStat
              label="Week-to-date"
              value={formatTokens(day.rateLimit.weekToDate.totalTokens)}
              detail={`${day.rateLimit.weekToDate.weekStart} to ${day.rateLimit.weekToDate.through}`}
            />
          </div>
        </section>
      )}
      <table>
        <thead>
          <tr>
            <th>Session</th>
            <th>Model</th>
            <th>Tokens</th>
            <th>Cached</th>
          </tr>
        </thead>
        <tbody>
          {day.sessions.map((session) => (
            <tr key={`${session.sessionId}-${session.model}`}>
              <td title={session.cwd ?? session.sessionId}>{session.cwd ? session.cwd.split(/[\\/]/).slice(-2).join("/") : session.sessionId.slice(0, 8)}</td>
              <td>{session.model}</td>
              <td>{formatTokens(session.totalTokens)}</td>
              <td>{formatTokens(session.cachedInputTokens)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </aside>
  );
}

function HarnessDashboard({
  summary,
  selectedDate,
  day,
  onSelectDate
}: {
  summary: SummaryResponse;
  selectedDate: string | null;
  day: DayResponse | null;
  onSelectDate: (harness: HarnessId, date: string) => void;
}) {
  const dailyMap = useMemo(() => new Map(summary.daily.map((item) => [item.date, item])), [summary]);
  const days = useMemo(() => rangeDays(summary.range.from, summary.range.to), [summary]);

  return (
    <section className="harnessSection">
      <div className="harnessHead">
        <div>
          <span className="harnessBadge">{summary.harness.usageLabel}</span>
          <h2>{summary.harness.name}</h2>
          <p>{summary.harness.description}</p>
        </div>
      </div>

      <section className="stats">
        <Stat label="Today" value={formatTokens(summary.today?.totalTokens ?? 0)} detail={summary.today ? `${summary.today.events} events` : "No events yet"} />
        <Stat label="Last hour" value={formatTokens(summary.lastHour.totalTokens)} detail="Recent local events" />
        <Stat label="Last 7 days" value={formatTokens(summary.lastSevenDays.totalTokens)} detail="Rolling total" />
        <Stat label="Peak day" value={summary.peakDay ? formatTokens(summary.peakDay.totalTokens) : "0"} detail={summary.peakDay?.date ?? "No peak"} />
        <Stat label="Visible total" value={formatTokens(summary.totals.totalTokens)} detail={`${summary.range.from} to ${summary.range.to}`} />
      </section>

      <ConfidencePanel summary={summary} />

      <section className="panel">
        <div className="panelHead">
          <div>
            <h2>Daily token burn</h2>
            <p>{summary.range.from} to {summary.range.to}</p>
          </div>
          <div className="legend">
            <span>Less</span>
            <i style={{ background: HEATMAP_EMPTY_COLOR }} />
            {HEATMAP_COLORS.map((color) => <i key={color} style={{ background: color }} />)}
            <span>More</span>
          </div>
        </div>
        <WeeklyLine weekly={summary.weekly} />
        <div className="contentGrid">
          <Heatmap days={days} daily={dailyMap} selectedDate={selectedDate} onSelect={(date) => onSelectDate(summary.harness.id, date)} />
          <DayDetails day={day} />
        </div>
      </section>

      <section className="diagnosticsPanel">
        <div className="diagnosticsHead">
          <div>
            <h2>Scanner health</h2>
            <p>Local {summary.harness.name} log scan and cache status.</p>
          </div>
          <span>{summary.diagnostics.lastScanCompletedAt ? formatTime(summary.diagnostics.lastScanCompletedAt) : "Not scanned"}</span>
        </div>
        <div className="diagnostics">
          <MiniStat label="Files found" value={fullFormat.format(summary.diagnostics.filesScanned)} detail="Candidate logs" />
          <MiniStat label="Loaded from cache" value={fullFormat.format(summary.diagnostics.filesFromCache)} detail="Unchanged files" />
          <MiniStat label="Parsed this scan" value={fullFormat.format(summary.diagnostics.filesParsed)} detail="Changed or new files" />
          <MiniStat label="Skipped files" value={fullFormat.format(summary.diagnostics.skippedFiles)} detail="Unreadable files" />
          <MiniStat label="Parse errors" value={fullFormat.format(summary.diagnostics.parseErrors)} detail="Malformed JSONL lines" />
          <MiniStat label="Token events" value={fullFormat.format(summary.diagnostics.tokenEvents)} detail="Counted usage events" />
        </div>
      </section>
    </section>
  );
}

function App() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [selectedDates, setSelectedDates] = useState<Partial<Record<HarnessId, string>>>({});
  const [daysByHarness, setDaysByHarness] = useState<Partial<Record<HarnessId, DayResponse>>>({});
  const [loading, setLoading] = useState(true);
  const [rescanning, setRescanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = async () => {
    setError(null);
    const response = await fetch("/api/summary");
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json() as DashboardResponse;
    setDashboard(data);
    setSelectedDates(Object.fromEntries(data.harnesses.map((summary) => [
      summary.harness.id,
      summary.today?.date ?? summary.peakDay?.date ?? data.range.to
    ])) as Partial<Record<HarnessId, string>>);
    setLoading(false);
  };

  useEffect(() => {
    loadSummary().catch((err) => {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    for (const [harness, selectedDate] of Object.entries(selectedDates) as Array<[HarnessId, string]>) {
      if (!selectedDate) continue;
      fetch(`/api/day/${harness}/${selectedDate}`)
        .then((response) => response.json())
        .then((data: DayResponse) => setDaysByHarness((current) => ({ ...current, [harness]: data })))
        .catch(() => setDaysByHarness((current) => {
          const next = { ...current };
          delete next[harness];
          return next;
        }));
    }
  }, [selectedDates]);

  const selectDate = (harness: HarnessId, date: string) => {
    setSelectedDates((current) => ({ ...current, [harness]: date }));
  };

  const rescan = async () => {
    setRescanning(true);
    await fetch("/api/rescan", { method: "POST" });
    await loadSummary();
    setRescanning(false);
  };

  if (loading) return <main className="shell"><div className="emptyPanel">Scanning local AI usage logs...</div></main>;

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>AI Token Usage</h1>
          <p>Local token usage from detected AI coding harness logs.</p>
        </div>
        <button onClick={rescan} disabled={rescanning}>{rescanning ? "Rescanning" : "Rescan"}</button>
      </header>

      {error && <div className="error">{error}</div>}

      {dashboard && dashboard.harnesses.length > 0 ? (
        <>
          {dashboard.harnesses.map((summary) => (
            <HarnessDashboard
              key={summary.harness.id}
              summary={summary}
              selectedDate={selectedDates[summary.harness.id] ?? null}
              day={daysByHarness[summary.harness.id] ?? null}
              onSelectDate={selectDate}
            />
          ))}
        </>
      ) : (
        <div className="emptyPanel">No Codex or GitHub Copilot token logs were found on this machine.</div>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
