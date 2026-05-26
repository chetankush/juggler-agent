"use client";

import React from "react";
import type { Task, Priority, TaskStatus } from "@aicrm/shared";
import {
  CheckCircle2,
  PauseCircle,
  Clock,
  MoreHorizontal,
  AlarmClock,
  CheckCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ── Priority dot config ───────────────────────────────────────────────────
const priorityConfig: Record<
  Priority,
  { label: string; dotClass: string; badgeVariant: "high" | "medium" | "low" }
> = {
  high: {
    label: "High",
    dotClass: "bg-danger",
    badgeVariant: "high",
  },
  medium: {
    label: "Medium",
    dotClass: "bg-warning",
    badgeVariant: "medium",
  },
  low: {
    label: "Low",
    dotClass: "bg-muted-foreground",
    badgeVariant: "low",
  },
};

// ── Status badge config ───────────────────────────────────────────────────
const statusConfig: Record<
  TaskStatus,
  {
    label: string;
    icon: React.ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;
    badgeVariant: "active" | "blocked" | "completed";
  }
> = {
  active: {
    label: "Active",
    icon: Clock,
    badgeVariant: "active",
  },
  blocked: {
    label: "Blocked",
    icon: PauseCircle,
    badgeVariant: "blocked",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    badgeVariant: "completed",
  },
};

interface TaskCardProps {
  task: Task;
  /** Assignee display name for avatar initials */
  assigneeName?: string | null;
  /** Called when user marks the task complete */
  onMarkComplete?: (taskId: string) => void;
  /** Called when user marks the task blocked */
  onMarkBlocked?: (taskId: string) => void;
  /** Called when user snoozes the task */
  onSnooze?: (taskId: string) => void;
  /** Called when the card is clicked (navigate to detail) */
  onClick?: (taskId: string) => void;
  className?: string;
}

export function TaskCard({
  task,
  assigneeName,
  onMarkComplete,
  onMarkBlocked,
  onSnooze,
  onClick,
  className,
}: TaskCardProps) {
  const priority = priorityConfig[task.priority];
  const status = statusConfig[task.status];
  const StatusIcon = status.icon;

  const initials = assigneeName
    ? assigneeName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  function handleCardClick(e: React.MouseEvent) {
    // Don't trigger card click if the dropdown was clicked
    if ((e.target as HTMLElement).closest("[data-radix-collection-item]")) return;
    onClick?.(task.id);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.(task.id);
    }
  }

  return (
    <article
      className={cn(
        // Base card
        "group relative rounded-lg border border-border bg-card p-4",
        "transition-all duration-150",
        // Hover: subtle surface lift + quick-actions reveal
        "hover:border-primary/30 hover:bg-surface-muted hover:shadow-card",
        // Cursor if clickable
        onClick && "cursor-pointer",
        // Completed: slightly muted
        task.status === "completed" && "opacity-70",
        className,
      )}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      role={onClick ? "button" : "article"}
      tabIndex={onClick ? 0 : undefined}
      aria-label={`Task: ${task.title}. Priority: ${priority.label}. Status: ${status.label}.${task.deadline ? ` Deadline: ${task.deadline}.` : ""}`}
    >
      {/* ── Header row: priority dot + title + quick actions ──────────── */}
      <div className="flex items-start gap-3">
        {/* Priority dot — color-coded AND labeled (a11y: color-not-only) */}
        <div className="mt-1 flex shrink-0 flex-col items-center gap-1">
          <span
            className={cn(
              "h-2.5 w-2.5 rounded-full",
              priority.dotClass,
            )}
            aria-hidden="true"
          />
        </div>

        {/* Title + meta */}
        <div className="flex-1 min-w-0">
          <h3
            className={cn(
              "text-sm font-semibold leading-snug text-foreground",
              // Line clamp for clean cards
              "line-clamp-2",
              task.status === "completed" && "line-through text-muted-foreground",
            )}
          >
            {task.title}
          </h3>

          {task.description && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
              {task.description}
            </p>
          )}
        </div>

        {/* Quick-actions dropdown — visible on hover / focus-within */}
        <div
          className={cn(
            "shrink-0 opacity-0 transition-opacity duration-150",
            "group-hover:opacity-100 group-focus-within:opacity-100",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground",
                  "hover:bg-muted hover:text-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  "transition-colors duration-150",
                )}
                aria-label={`Actions for task: ${task.title}`}
              >
                <MoreHorizontal
                  className="h-4 w-4"
                  aria-hidden="true"
                  strokeWidth={1.5}
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              {task.status !== "completed" && (
                <DropdownMenuItem
                  onClick={() => onMarkComplete?.(task.id)}
                >
                  <CheckCheck
                    className="h-4 w-4"
                    aria-hidden="true"
                    strokeWidth={1.5}
                  />
                  Mark complete
                </DropdownMenuItem>
              )}
              {task.status !== "blocked" && (
                <DropdownMenuItem
                  onClick={() => onMarkBlocked?.(task.id)}
                >
                  <PauseCircle
                    className="h-4 w-4"
                    aria-hidden="true"
                    strokeWidth={1.5}
                  />
                  Mark blocked
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onSnooze?.(task.id)}
              >
                <AlarmClock
                  className="h-4 w-4"
                  aria-hidden="true"
                  strokeWidth={1.5}
                />
                Snooze
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Footer row: status badge + deadline + assignee avatar ─────── */}
      <div className="mt-3 flex items-center gap-2">
        {/* Status badge — icon + word (not color-only) */}
        <Badge variant={status.badgeVariant}>
          <StatusIcon
            className="h-3 w-3"
            aria-hidden={true}
            strokeWidth={1.5}
          />
          {status.label}
        </Badge>

        {/* Priority label (text, not just dot) */}
        <Badge variant={priority.badgeVariant}>
          {priority.label}
        </Badge>

        {/* Deadline — mono font, tabular nums */}
        {task.deadline && (
          <span
            className="mono text-xs text-muted-foreground tabular-nums ml-auto"
            aria-label={`Deadline: ${task.deadline}`}
          >
            {task.deadline}
          </span>
        )}

        {/* Assignee avatar — only when the task is actually assigned */}
        {assigneeName && (
          <Avatar className="h-6 w-6 shrink-0" aria-label={`Assigned to ${assigneeName}`}>
            <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
          </Avatar>
        )}
      </div>
    </article>
  );
}
