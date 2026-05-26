"use client";

/**
 * TaskDetailDrawer — right-side drawer (desktop) / bottom sheet (mobile).
 * Opens when a task card is clicked.
 *
 * Features:
 * - Full task detail: title, description, priority, status, deadline, sourceMessage
 * - "Explain Task" button (Sparkles icon) — calls explainTask(id), renders TaskExplanation
 * - Scrim + focus trap + Escape to close + role="dialog" aria-modal
 * - Respects prefers-reduced-motion
 * - Premium loading skeleton for explain; error state with retry
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Task, TaskExplanation } from "@aicrm/shared";
import {
  X,
  Sparkles,
  Clock,
  CheckCircle2,
  PauseCircle,
  RefreshCw,
  MessageSquare,
  FileCode,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { explainTask, getErrorMessage } from "@/lib/api";

// ── Priority config ──────────────────────────────────────────────────────────

const priorityConfig = {
  high: { label: "High", dotClass: "bg-danger", badgeVariant: "high" as const },
  medium: { label: "Medium", dotClass: "bg-warning", badgeVariant: "medium" as const },
  low: { label: "Low", dotClass: "bg-muted-foreground", badgeVariant: "low" as const },
};

const statusConfig = {
  active: {
    label: "Active",
    icon: Clock,
    badgeVariant: "active" as const,
  },
  blocked: {
    label: "Blocked",
    icon: PauseCircle,
    badgeVariant: "blocked" as const,
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    badgeVariant: "completed" as const,
  },
};

// ── Explain skeleton ─────────────────────────────────────────────────────────

function ExplainSkeleton() {
  return (
    <div aria-busy="true" aria-label="Generating explanation" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="skeleton h-3.5 w-28 rounded" />
        <div className="skeleton h-3 w-full rounded" />
        <div className="skeleton h-3 w-5/6 rounded" />
        <div className="skeleton h-3 w-4/6 rounded" />
      </div>
      <div className="flex flex-col gap-2">
        <div className="skeleton h-3.5 w-32 rounded" />
        <div className="skeleton h-6 w-48 rounded-md" />
        <div className="skeleton h-6 w-40 rounded-md" />
        <div className="skeleton h-6 w-52 rounded-md" />
      </div>
      <div className="flex flex-col gap-2">
        <div className="skeleton h-3.5 w-36 rounded" />
        <div className="skeleton h-3 w-full rounded" />
        <div className="skeleton h-3 w-5/6 rounded" />
        <div className="skeleton h-3 w-3/4 rounded" />
        <div className="skeleton h-3 w-4/5 rounded" />
      </div>
    </div>
  );
}

// ── Explain result ───────────────────────────────────────────────────────────

function ExplainResult({ explanation }: { explanation: TaskExplanation }) {
  return (
    <div className="flex flex-col gap-5" aria-live="polite">
      {/* Likely issue */}
      <section aria-labelledby="explain-likely-issue">
        <h3
          id="explain-likely-issue"
          className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Likely issue
        </h3>
        <p className="text-sm leading-relaxed text-foreground">
          {explanation.likelyIssue}
        </p>
      </section>

      {/* Relevant files */}
      {explanation.relevantFiles.length > 0 && (
        <section aria-labelledby="explain-relevant-files">
          <h3
            id="explain-relevant-files"
            className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Relevant files
          </h3>
          <ul className="flex flex-wrap gap-2" role="list">
            {explanation.relevantFiles.map((filePath) => (
              <li key={filePath}>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border border-border",
                    "bg-surface-muted px-2.5 py-1",
                    "font-mono text-xs text-foreground",
                  )}
                  title={filePath}
                >
                  <FileCode
                    className="h-3 w-3 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                    strokeWidth={1.5}
                  />
                  {filePath}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Suggested approach */}
      <section aria-labelledby="explain-suggested-approach">
        <h3
          id="explain-suggested-approach"
          className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Suggested approach
        </h3>
        <p
          className="whitespace-pre-wrap text-sm leading-relaxed text-foreground"
        >
          {explanation.suggestedApproach}
        </p>
      </section>

      {/* AI disclaimer footer */}
      <p className="border-t border-border pt-3 text-xs text-muted-foreground">
        AI suggestion — review before acting.
      </p>
    </div>
  );
}

// ── Explain error ────────────────────────────────────────────────────────────

function ExplainError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-lg border border-danger/20 bg-danger/5 py-8 text-center"
      role="alert"
    >
      <AlertCircle
        className="h-6 w-6 text-danger/60"
        aria-hidden="true"
        strokeWidth={1.5}
      />
      <div>
        <p className="text-sm font-medium text-foreground">Explanation failed</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{message}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={1.5} />
        Retry
      </Button>
    </div>
  );
}

// ── Main drawer ──────────────────────────────────────────────────────────────

export interface TaskDetailDrawerProps {
  task: Task | null;
  onClose: () => void;
}

export function TaskDetailDrawer({ task, onClose }: TaskDetailDrawerProps) {
  const open = task !== null;

  // Explain state
  type ExplainState = "idle" | "loading" | "ready" | "error";
  const [explainState, setExplainState] = useState<ExplainState>("idle");
  const [explanation, setExplanation] = useState<TaskExplanation | null>(null);
  const [explainError, setExplainError] = useState<string | null>(null);

  // Focus management
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const prevActiveElementRef = useRef<Element | null>(null);

  // Reset explain state when task changes
  useEffect(() => {
    if (task) {
      setExplainState("idle");
      setExplanation(null);
      setExplainError(null);
    }
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus management: trap focus inside drawer when open
  useEffect(() => {
    if (open) {
      prevActiveElementRef.current = document.activeElement;
      // Delay to let the drawer animate in before focusing
      setTimeout(() => closeButtonRef.current?.focus(), 50);
    } else {
      // Restore focus to the previously focused element
      if (prevActiveElementRef.current instanceof HTMLElement) {
        prevActiveElementRef.current.focus();
      }
    }
  }, [open]);

  // Escape to close + focus trap
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      // Basic focus trap: wrap Tab within the drawer
      if (e.key === "Tab" && drawerRef.current) {
        const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const handleExplain = useCallback(async () => {
    if (!task) return;
    setExplainState("loading");
    setExplainError(null);
    try {
      const result = await explainTask(task.id);
      setExplanation(result);
      setExplainState("ready");
    } catch (err) {
      const msg = getErrorMessage(err, "Failed to explain task.");
      setExplainError(msg);
      setExplainState("error");
      toast.error(msg);
    }
  }, [task]);

  if (!task) return null;

  const priority = priorityConfig[task.priority];
  const status = statusConfig[task.status];
  const StatusIcon = status.icon;

  const prefersReducedMotion =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  return (
    <>
      {/* Scrim */}
      <div
        className={cn(
          "fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm",
          prefersReducedMotion
            ? "opacity-100"
            : "transition-opacity duration-200 ease-out",
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-drawer-title"
        className={cn(
          // Position: right-side drawer desktop, bottom sheet mobile
          "fixed z-[200] bg-card border-border",
          // Mobile: bottom sheet
          "bottom-0 left-0 right-0 max-h-[85dvh] rounded-t-2xl border-t",
          // Desktop: right drawer
          "lg:bottom-0 lg:left-auto lg:right-0 lg:top-0 lg:w-[440px] lg:max-h-none lg:rounded-none lg:rounded-l-2xl lg:border-l lg:border-t-0",
          "flex flex-col overflow-hidden",
          // Animation
          prefersReducedMotion
            ? ""
            : "transition-transform duration-250 ease-out",
        )}
      >
        {/* ── Drawer header ────────────────────────────────────────────────── */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border p-5">
          <div className="flex items-start gap-3 min-w-0">
            {/* Priority dot */}
            <span
              className={cn(
                "mt-1 h-2.5 w-2.5 shrink-0 rounded-full",
                priority.dotClass,
              )}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <h2
                id="task-drawer-title"
                className="text-base font-semibold leading-snug text-foreground"
              >
                {task.title}
              </h2>
            </div>
          </div>

          <button
            ref={closeButtonRef}
            onClick={onClose}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground",
              "hover:bg-muted hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "transition-colors duration-150",
            )}
            aria-label="Close task detail"
          >
            <X className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
          </button>
        </div>

        {/* ── Scrollable body ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex flex-col gap-5">

            {/* Status + Priority badges */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={status.badgeVariant}>
                <StatusIcon
                  className="h-3 w-3"
                  aria-hidden={true}
                  strokeWidth={1.5}
                />
                {status.label}
              </Badge>
              <Badge variant={priority.badgeVariant}>
                {priority.label} priority
              </Badge>
            </div>

            {/* Deadline */}
            {task.deadline && (
              <div className="flex items-center gap-2">
                <Clock
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                  strokeWidth={1.5}
                />
                <span className="text-xs text-muted-foreground">Deadline</span>
                <span
                  className="font-mono text-xs text-foreground tabular-nums"
                  aria-label={`Deadline: ${task.deadline}`}
                >
                  {task.deadline}
                </span>
              </div>
            )}

            {/* Description */}
            {task.description && (
              <div>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Description
                </h3>
                <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                  {task.description}
                </p>
              </div>
            )}

            {/* Source message */}
            {task.sourceMessage && (
              <div>
                <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <MessageSquare
                    className="h-3 w-3"
                    aria-hidden="true"
                    strokeWidth={1.5}
                  />
                  Original message
                </h3>
                <blockquote
                  className={cn(
                    "rounded-md border-l-2 border-primary/40 bg-surface-muted",
                    "px-3 py-2.5 text-sm italic text-muted-foreground",
                  )}
                >
                  {task.sourceMessage}
                </blockquote>
              </div>
            )}

            {/* ── Explain Task section ─────────────────────────────────────── */}
            <div className="border-t border-border pt-4">
              {explainState === "idle" && (
                <Button
                  onClick={handleExplain}
                  className="w-full"
                  aria-label="Generate AI explanation for this task"
                >
                  <Sparkles
                    className="h-4 w-4"
                    aria-hidden="true"
                    strokeWidth={1.5}
                  />
                  Explain Task
                </Button>
              )}

              {explainState === "loading" && (
                <div>
                  <div className="mb-4 flex items-center gap-2">
                    <Sparkles
                      className="h-4 w-4 animate-pulse text-primary"
                      aria-hidden="true"
                      strokeWidth={1.5}
                    />
                    <p className="text-sm font-medium text-foreground">
                      Analysing task…
                    </p>
                  </div>
                  <ExplainSkeleton />
                </div>
              )}

              {explainState === "ready" && explanation && (
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles
                        className="h-4 w-4 text-primary"
                        aria-hidden="true"
                        strokeWidth={1.5}
                      />
                      <p className="text-sm font-semibold text-foreground">
                        AI Explanation
                      </p>
                    </div>
                    <button
                      onClick={handleExplain}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground",
                        "hover:bg-muted hover:text-foreground",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        "transition-colors duration-150",
                      )}
                      aria-label="Regenerate explanation"
                    >
                      <RefreshCw
                        className="h-3 w-3"
                        aria-hidden="true"
                        strokeWidth={1.5}
                      />
                      Regenerate
                    </button>
                  </div>
                  <ExplainResult explanation={explanation} />
                </div>
              )}

              {explainState === "error" && (
                <div>
                  <ExplainError
                    message={explainError ?? "Something went wrong."}
                    onRetry={handleExplain}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
