import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { line } from "d3-shape";
import { scaleLinear, scaleLog } from "d3-scale";
import type { DayResponse, DayTotal, SummaryResponse, WeeklyTotal } from "../shared/types";
import "./styles.css";

const tokenFormat = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1
});

const fullFormat = new Intl.NumberFormat("en-US");

const formatTokens = (value: number): string => tokenFormat.format(value);

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
  if (value <= 0 || max <= 0) return "#ebedf0";
  const log = scaleLog<string>().domain([1, Math.max(2, max)]).range(["#c6e6ca", "#0b6b3a"]);
  return log(Math.max(1, value));
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
  const left = 34;
  const top = 20;
  const gridStart = days.length > 0 ? startOfWeek(days[0]) : "";
  const gridEnd = days.length > 0 ? days[days.length - 1] : "";
  const weeks = days.length > 0 ? Math.floor(dateDiffDays(gridStart, gridEnd) / 7) + 1 : 0;
  const width = left + weeks * (cell + gap) + 12;
  const height = top + 7 * (cell + gap) + 8;
  const max = Math.max(0, ...[...daily.values()].map((day) => day.totalTokens));

  return (
    <div className="heatmapWrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="heatmap" role="img" aria-label="Daily token usage heatmap">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label, index) => (
          <text className="weekday" key={label} x={0} y={top + index * (cell + gap) + 11}>
            {label}
          </text>
        ))}
        {days.map((date) => {
          const week = Math.floor(dateDiffDays(gridStart, date) / 7);
          const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
          const total = daily.get(date);
          const tokens = total?.totalTokens ?? 0;
          const x = left + week * (cell + gap);
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
  );
}

function DayDetails({ day }: { day: DayResponse | null }) {
  if (!day) return <aside className="details emptyPanel">No day selected.</aside>;
  if (!day.totals) return <aside className="details emptyPanel">No Codex token events for {day.date}.</aside>;

  return (
    <aside className="details">
      <div className="detailsHead">
        <span>{day.date}</span>
        <strong>{formatTokens(day.totals.totalTokens)}</strong>
      </div>
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

function App() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [day, setDay] = useState<DayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [rescanning, setRescanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = async () => {
    setError(null);
    const response = await fetch("/api/summary");
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json() as SummaryResponse;
    setSummary(data);
    setSelectedDate(data.today?.date ?? data.peakDay?.date ?? null);
    setLoading(false);
  };

  useEffect(() => {
    loadSummary().catch((err) => {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedDate) return;
    fetch(`/api/day/${selectedDate}`)
      .then((response) => response.json())
      .then((data: DayResponse) => setDay(data))
      .catch(() => setDay(null));
  }, [selectedDate]);

  const dailyMap = useMemo(() => new Map(summary?.daily.map((item) => [item.date, item]) ?? []), [summary]);
  const days = useMemo(() => summary ? rangeDays(summary.range.from, summary.range.to) : [], [summary]);

  const rescan = async () => {
    setRescanning(true);
    await fetch("/api/rescan", { method: "POST" });
    await loadSummary();
    setRescanning(false);
  };

  if (loading) return <main className="shell"><div className="emptyPanel">Scanning local Codex logs...</div></main>;

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>Codex Token Usage</h1>
          <p>Local daily token burn from Codex session logs.</p>
        </div>
        <button onClick={rescan} disabled={rescanning}>{rescanning ? "Rescanning" : "Rescan"}</button>
      </header>

      {error && <div className="error">{error}</div>}

      {summary ? (
        <>
          <section className="stats">
            <Stat label="Today" value={formatTokens(summary.today?.totalTokens ?? 0)} detail={summary.today ? `${summary.today.events} events` : "No events yet"} />
            <Stat label="Last hour" value={formatTokens(summary.lastHour.totalTokens)} detail="Recent local events" />
            <Stat label="Last 7 days" value={formatTokens(summary.lastSevenDays.totalTokens)} detail="Rolling total" />
            <Stat label="Peak day" value={summary.peakDay ? formatTokens(summary.peakDay.totalTokens) : "0"} detail={summary.peakDay?.date ?? "No peak"} />
            <Stat label="Visible total" value={formatTokens(summary.totals.totalTokens)} detail={`${summary.range.from} to ${summary.range.to}`} />
          </section>

          <section className="panel">
            <div className="panelHead">
              <div>
                <h2>Daily token burn</h2>
                <p>{summary.range.from} to {summary.range.to}</p>
              </div>
              <div className="legend"><span>Less</span><i /><i /><i /><i /><i /><span>More</span></div>
            </div>
            <WeeklyLine weekly={summary.weekly} />
            <div className="contentGrid">
              <Heatmap days={days} daily={dailyMap} selectedDate={selectedDate} onSelect={setSelectedDate} />
              <DayDetails day={day} />
            </div>
          </section>

          <section className="diagnostics">
            <div><strong>{summary.diagnostics.filesScanned}</strong><span>files</span></div>
            <div><strong>{summary.diagnostics.filesFromCache}</strong><span>cached</span></div>
            <div><strong>{summary.diagnostics.filesParsed}</strong><span>parsed</span></div>
            <div><strong>{summary.diagnostics.parseErrors}</strong><span>parse errors</span></div>
            <div><strong>{summary.latestRateLimit?.primary?.usedPercent ?? "n/a"}</strong><span>5h used %</span></div>
            <div><strong>{summary.latestRateLimit?.secondary?.usedPercent ?? "n/a"}</strong><span>weekly used %</span></div>
          </section>
        </>
      ) : (
        <div className="emptyPanel">No summary data available.</div>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
