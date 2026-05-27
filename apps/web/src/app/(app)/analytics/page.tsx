"use client";

/**
 * Analytics page — /analytics
 * Shows workspace-level metrics: status summary, priority breakdown,
 * 14-day throughput chart, and per-member table.
 * All charts are inline SVG — no extra dependencies.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  RefreshCw,
  AlertCircle,
  Users,
  CheckCircle2,
  Clock,
  PauseCircle,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/lib/app-context";
import { getAnalytics, getErrorMessage } from "@/lib/api";
import type { WorkspaceAnalytics } from "@aicrm/shared";

// ── Helpers ───────────────────────────────────────────────────────────────

function getInitials(name: string | null, email: string): string {
  if (name) {
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  }
  return email.slice(0, 2).toUpperCase();
}

function fmt(n: number): string {
  return n.toLocaleString();
}

// ── Skeleton ──────────────────────────────────────────────────────────────

function AnalyticsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading analytics">
      {/* Header */}
      <div className="mb-8 space-y-2">
        <div className="skeleton h-8 w-32 rounded-md" />
        <div className="skeleton h-4 w-64 rounded-md" />
      </div>
      {/* Stat cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-5">
            <div className="skeleton mb-2 h-4 w-20 rounded" />
            <div className="skeleton h-7 w-12 rounded" />
          </div>
        ))}
      </div>
      {/* Charts */}
      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <div className="skeleton rounded-xl h-64" />
        <div className="skeleton rounded-xl h-64" />
      </div>
      <div className="skeleton rounded-xl h-64 mb-8" />
      <div className="skeleton rounded-xl h-48" />
    </div>
  );
}

// ── Error state ───────────────────────────────────────────────────────────

function AnalyticsError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 rounded-xl border border-danger/20 bg-danger/5 py-16 text-center"
      role="alert"
    >
      <AlertCircle className="h-8 w-8 text-danger/60" aria-hidden="true" strokeWidth={1.5} />
      <div>
        <p className="text-sm font-medium text-foreground">Failed to load analytics</p>
        <p className="mt-1 text-xs text-muted-foreground">{message}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={1.5} />
        Retry
      </Button>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────

function AnalyticsEmpty() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border bg-card py-20 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <BarChart3 className="h-6 w-6 text-muted-foreground" aria-hidden="true" strokeWidth={1.5} />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">No data yet</p>
        <p className="mt-1 text-xs text-muted-foreground max-w-xs">
          Create tasks and complete them to see analytics here.
        </p>
      </div>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  colorClass: string;
}

function StatCard({ label, value, icon, colorClass }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className={cn("mb-3 flex h-9 w-9 items-center justify-center rounded-lg", colorClass)}>
        {icon}
      </div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{fmt(value)}</p>
    </div>
  );
}

// ── Status Donut (inline SVG) ─────────────────────────────────────────────

interface DonutChartProps {
  active: number;
  blocked: number;
  completed: number;
}

function StatusDonut({ active, blocked, completed }: DonutChartProps) {
  const total = active + blocked + completed;

  // Segment colors using CSS custom properties for dark/light support
  const segments = [
    { label: "Active", value: active, color: "hsl(var(--primary))" },
    { label: "Blocked", value: blocked, color: "hsl(var(--warning))" },
    { label: "Completed", value: completed, color: "hsl(var(--success))" },
  ];

  const R = 60; // radius
  const cx = 80;
  const cy = 80;
  const strokeW = 22;
  const circumference = 2 * Math.PI * R;

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
        No tasks yet
      </div>
    );
  }

  // Build stroke-dasharray arcs
  let offset = 0;
  const arcs = segments.map((seg) => {
    const pct = seg.value / total;
    const dash = pct * circumference;
    const gap = circumference - dash;
    const rotation = (offset / total) * 360 - 90; // start at top
    offset += seg.value;
    return { ...seg, dash, gap, rotation, pct };
  });

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-4 text-sm font-semibold text-foreground">Status breakdown</h2>
      <div className="flex items-center gap-6 flex-wrap">
        {/* SVG donut */}
        <svg
          width="160"
          height="160"
          viewBox="0 0 160 160"
          role="img"
          aria-label={`Status donut: ${active} active, ${blocked} blocked, ${completed} completed`}
          className="shrink-0"
        >
          {/* Background ring */}
          <circle
            cx={cx}
            cy={cy}
            r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeW}
            className="text-border"
          />
          {arcs.map((arc) => (
            <circle
              key={arc.label}
              cx={cx}
              cy={cy}
              r={R}
              fill="none"
              stroke={arc.color}
              strokeWidth={strokeW}
              strokeDasharray={`${arc.dash} ${arc.gap}`}
              strokeDashoffset={circumference * 0.25} // start at top
              transform={`rotate(${arc.rotation}, ${cx}, ${cy})`}
              strokeLinecap="butt"
            />
          ))}
          {/* Center label */}
          <text
            x={cx}
            y={cy - 6}
            textAnchor="middle"
            className="fill-foreground"
            fontSize="20"
            fontWeight="600"
          >
            {fmt(total)}
          </text>
          <text
            x={cx}
            y={cy + 12}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize="11"
          >
            total
          </text>
        </svg>

        {/* Legend */}
        <ul className="flex flex-col gap-3" role="list" aria-label="Status legend">
          {arcs.map((arc) => (
            <li key={arc.label} className="flex items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: arc.color }}
                aria-hidden="true"
              />
              <span className="text-sm text-foreground">{arc.label}</span>
              <span className="ml-auto pl-4 text-sm tabular-nums text-muted-foreground">
                {fmt(arc.value)}
                <span className="ml-1 text-xs">({Math.round(arc.pct * 100)}%)</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── Priority Bars (inline SVG horizontal bars) ────────────────────────────

interface PriorityBarsProps {
  high: number;
  medium: number;
  low: number;
}

function PriorityBars({ high, medium, low }: PriorityBarsProps) {
  const bars = [
    { label: "High", value: high, color: "hsl(var(--danger))" },
    { label: "Medium", value: medium, color: "hsl(var(--warning))" },
    { label: "Low", value: low, color: "hsl(var(--muted-foreground))" },
  ];
  const max = Math.max(high, medium, low, 1);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-4 text-sm font-semibold text-foreground">Priority breakdown</h2>
      <ul className="flex flex-col gap-4" role="list" aria-label="Priority breakdown">
        {bars.map((bar) => {
          const pct = (bar.value / max) * 100;
          return (
            <li key={bar.label}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm text-foreground">{bar.label}</span>
                <span className="text-sm tabular-nums text-muted-foreground">{fmt(bar.value)}</span>
              </div>
              <div
                className="h-3 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={bar.value}
                aria-valuemin={0}
                aria-valuemax={max}
                aria-label={`${bar.label} priority: ${bar.value} tasks`}
              >
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: bar.color,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Throughput 14-day Bar Chart (inline SVG) ──────────────────────────────

interface ThroughputChartProps {
  data: Array<{ date: string; completed: number }>;
}

function ThroughputChart({ data }: ThroughputChartProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Throughput — last 14 days</h2>
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          No completions yet
        </div>
      </div>
    );
  }

  const maxVal = Math.max(...data.map((d) => d.completed), 1);
  const chartH = 120;
  const chartW = 640;
  const barGap = 4;
  const n = data.length;
  const barW = (chartW - barGap * (n - 1)) / n;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-4 text-sm font-semibold text-foreground">Throughput — last 14 days</h2>
      <div
        className="w-full overflow-x-auto"
        role="img"
        aria-label={`Throughput bar chart: daily completions over last ${data.length} days`}
      >
        <svg
          viewBox={`0 0 ${chartW} ${chartH + 32}`}
          className="w-full"
          style={{ minWidth: 280 }}
          preserveAspectRatio="none"
        >
          {/* Grid lines */}
          {[0.25, 0.5, 0.75, 1].map((f) => {
            const y = chartH - f * chartH;
            return (
              <line
                key={f}
                x1={0}
                y1={y}
                x2={chartW}
                y2={y}
                stroke="currentColor"
                strokeWidth="0.5"
                className="text-border"
                strokeDasharray="4 4"
              />
            );
          })}

          {/* Bars */}
          {data.map((d, i) => {
            const barH = (d.completed / maxVal) * chartH;
            const x = i * (barW + barGap);
            const y = chartH - barH;
            const isEven = i % 2 === 0;

            // Format date label (e.g. "May 22")
            const dateLabel = (() => {
              try {
                const dt = new Date(d.date);
                return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
              } catch {
                return d.date;
              }
            })();

            return (
              <g key={d.date}>
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={barH || 2}
                  rx={3}
                  fill="hsl(var(--primary))"
                  opacity={d.completed === 0 ? 0.25 : 0.85}
                />
                {/* Value label above bar */}
                {d.completed > 0 && (
                  <text
                    x={x + barW / 2}
                    y={y - 4}
                    textAnchor="middle"
                    fontSize="9"
                    className="fill-muted-foreground"
                  >
                    {d.completed}
                  </text>
                )}
                {/* Date label — skip every other on narrower viewports by conditional opacity */}
                {isEven && (
                  <text
                    x={x + barW / 2}
                    y={chartH + 20}
                    textAnchor="middle"
                    fontSize="9"
                    className="fill-muted-foreground"
                  >
                    {dateLabel}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      {/* Screen reader summary */}
      <p className="sr-only">
        {data.map((d) => `${d.date}: ${d.completed} completed`).join(", ")}
      </p>
    </div>
  );
}

// ── Per-member Table ──────────────────────────────────────────────────────

interface PerMemberTableProps {
  members: WorkspaceAnalytics["perMember"];
}

function PerMemberTable({ members }: PerMemberTableProps) {
  if (members.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Per-member summary</h2>
        <p className="text-sm text-muted-foreground">No members with tasks.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-4 text-sm font-semibold text-foreground">Per-member summary</h2>
      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full min-w-[480px] text-sm" aria-label="Per-member task summary">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="pb-2 pr-4 font-medium text-muted-foreground w-full" scope="col">
                Member
              </th>
              <th className="pb-2 px-3 font-medium text-muted-foreground tabular-nums text-right" scope="col">
                Total
              </th>
              <th className="pb-2 px-3 font-medium text-muted-foreground tabular-nums text-right" scope="col">
                Active
              </th>
              <th className="pb-2 pl-3 font-medium text-muted-foreground tabular-nums text-right" scope="col">
                Completed
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {members.map((m) => {
              const displayName = m.user.name ?? m.user.email;
              const initials = getInitials(m.user.name, m.user.email);
              return (
                <tr key={m.user.id} className="hover:bg-surface-muted transition-colors duration-100">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2.5">
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{displayName}</p>
                        {m.user.name && (
                          <p className="truncate text-xs text-muted-foreground">{m.user.email}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums text-foreground">
                    {fmt(m.total)}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums text-foreground">
                    {fmt(m.active)}
                  </td>
                  <td className="py-3 pl-3 text-right tabular-nums text-foreground">
                    {fmt(m.completed)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

type LoadState = "loading" | "ready" | "error";

export default function AnalyticsPage() {
  const { currentWorkspace } = useAppContext();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [analytics, setAnalytics] = useState<WorkspaceAnalytics | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoadState("loading");
    setErrorMsg(null);
    try {
      const data = await getAnalytics(currentWorkspace.id);
      setAnalytics(data);
      setLoadState("ready");
    } catch (err) {
      setErrorMsg(getErrorMessage(err, "Could not load analytics."));
      setLoadState("error");
    }
  }, [currentWorkspace]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const total = analytics
    ? analytics.tasksByStatus.active +
      analytics.tasksByStatus.blocked +
      analytics.tasksByStatus.completed
    : 0;

  const hasData = total > 0;

  if (loadState === "loading") return <AnalyticsSkeleton />;
  if (loadState === "error") {
    return <AnalyticsError message={errorMsg ?? "Unknown error."} onRetry={fetchAnalytics} />;
  }
  if (!analytics || !hasData) {
    return (
      <>
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Analytics</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Task velocity and team performance.
            </p>
          </div>
        </div>
        <AnalyticsEmpty />
      </>
    );
  }

  const { tasksByStatus, tasksByPriority, throughput14d, perMember } = analytics;

  return (
    <>
      {/* Page header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Task velocity and team performance for{" "}
            <span className="font-medium text-foreground">{currentWorkspace?.name}</span>.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAnalytics} aria-label="Refresh analytics">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={1.5} />
          Refresh
        </Button>
      </div>

      {/* Stat cards — top row */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Active"
          value={tasksByStatus.active}
          icon={<Clock className="h-4 w-4 text-primary" strokeWidth={1.5} aria-hidden="true" />}
          colorClass="bg-primary/10"
        />
        <StatCard
          label="Blocked"
          value={tasksByStatus.blocked}
          icon={<PauseCircle className="h-4 w-4 text-warning" strokeWidth={1.5} aria-hidden="true" />}
          colorClass="bg-warning/10"
        />
        <StatCard
          label="Completed"
          value={tasksByStatus.completed}
          icon={<CheckCircle2 className="h-4 w-4 text-success" strokeWidth={1.5} aria-hidden="true" />}
          colorClass="bg-success/10"
        />
        <StatCard
          label="Total"
          value={total}
          icon={<Layers className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />}
          colorClass="bg-muted"
        />
      </div>

      {/* 2-column charts row */}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <StatusDonut
          active={tasksByStatus.active}
          blocked={tasksByStatus.blocked}
          completed={tasksByStatus.completed}
        />
        <PriorityBars
          high={tasksByPriority.high}
          medium={tasksByPriority.medium}
          low={tasksByPriority.low}
        />
      </div>

      {/* Throughput full-width */}
      <div className="mb-6">
        <ThroughputChart data={throughput14d} />
      </div>

      {/* Per-member table */}
      <PerMemberTable members={perMember} />

      {/* Footer note */}
      <p className="mt-6 text-center text-xs text-muted-foreground">
        <Users className="inline h-3.5 w-3.5 mr-1" aria-hidden="true" strokeWidth={1.5} />
        Data reflects all tasks in this workspace. AI suggestions only — you decide.
      </p>
    </>
  );
}
