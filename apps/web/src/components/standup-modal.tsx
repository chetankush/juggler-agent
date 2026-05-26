"use client";

/**
 * StandupModal — Daily Standup summary dialog.
 *
 * Calls GET /summary on open. Shows a premium skeleton during fetch,
 * then renders three sections: Completed, In Progress, Blockers.
 * Footer: Copy to clipboard (copies response.text) + Close.
 * Error state with Retry. Honors prefers-reduced-motion.
 * Styled to match create-task-modal.tsx (scrim, Escape, focus, role="dialog").
 */

import React, { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Clock,
  TriangleAlert,
  X,
  ClipboardCopy,
  RefreshCw,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getStandup, postStandupToDiscord, getErrorMessage } from "@/lib/api";
import type { StandupResponse } from "@/lib/api";
import type { Task } from "@aicrm/shared";

// ── Types ──────────────────────────────────────────────────────────────────

export interface StandupModalProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  userId?: string;
}

type LoadState = "loading" | "ready" | "error";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function StandupSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading standup" className="space-y-5">
      {/* Section skeleton × 3 */}
      {[3, 2, 1].map((count, sectionIdx) => (
        <div key={sectionIdx} className="space-y-2">
          {/* Section header */}
          <div className="flex items-center gap-2">
            <div className="skeleton h-4 w-4 rounded-full" />
            <div className="skeleton h-4 w-24 rounded" />
          </div>
          {/* Row skeletons */}
          {Array.from({ length: count }).map((_, i) => (
            <div
              key={i}
              className="skeleton h-5 rounded"
              style={{ width: `${65 + (i % 3) * 10}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Task row ───────────────────────────────────────────────────────────────

interface TaskRowProps {
  task: Task;
  strikethrough?: boolean;
  showMeta?: boolean;
}

function TaskRow({ task, strikethrough = false, showMeta = false }: TaskRowProps) {
  return (
    <li className="flex items-baseline gap-2 py-0.5">
      {showMeta && task.priority && (
        <span
          className={cn(
            "shrink-0 font-mono text-xs font-medium uppercase tracking-wide",
            task.priority === "high" && "text-danger",
            task.priority === "medium" && "text-warning",
            task.priority === "low" && "text-muted-foreground",
          )}
          aria-label={`Priority: ${task.priority}`}
        >
          [{task.priority}]
        </span>
      )}
      <span
        className={cn(
          "text-sm text-foreground",
          strikethrough && "line-through text-muted-foreground",
        )}
      >
        {task.title}
      </span>
      {showMeta && task.deadline && (
        <span
          className="ml-auto shrink-0 font-mono text-xs text-muted-foreground"
          aria-label={`Deadline: ${task.deadline}`}
        >
          {task.deadline}
        </span>
      )}
    </li>
  );
}

// ── Section ────────────────────────────────────────────────────────────────

interface StandupSectionProps {
  icon: React.ReactNode;
  iconColor: string;
  title: string;
  tasks: Task[];
  emptyMessage: string;
  strikethrough?: boolean;
  showMeta?: boolean;
}

function StandupSection({
  icon,
  iconColor,
  title,
  tasks,
  emptyMessage,
  strikethrough = false,
  showMeta = false,
}: StandupSectionProps) {
  return (
    <section aria-label={title}>
      <div className="mb-2 flex items-center gap-2">
        <span className={cn("shrink-0", iconColor)} aria-hidden="true">
          {icon}
        </span>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span
          className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground"
          aria-label={`${tasks.length} item${tasks.length !== 1 ? "s" : ""}`}
        >
          {tasks.length}
        </span>
      </div>

      {tasks.length === 0 ? (
        <p className="pl-6 text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <ul className="space-y-0.5 pl-6" role="list">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              strikethrough={strikethrough}
              showMeta={showMeta}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Main modal ─────────────────────────────────────────────────────────────

export function StandupModal({
  open,
  onClose,
  workspaceId,
  userId,
}: StandupModalProps) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [standup, setStandup] = useState<StandupResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [posting, setPosting] = useState(false);

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const today = formatDate(new Date());

  // Respect prefers-reduced-motion for transition duration
  const prefersReducedMotion =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  const transitionDuration = prefersReducedMotion ? "duration-0" : "duration-200";

  async function fetchStandup() {
    setLoadState("loading");
    setErrorMsg(null);
    setStandup(null);

    // Guarantee skeleton shows for at least 300ms (design requirement)
    const start = Date.now();
    try {
      const data = await getStandup(workspaceId, userId);
      const elapsed = Date.now() - start;
      if (elapsed < 300) {
        await new Promise((r) => setTimeout(r, 300 - elapsed));
      }
      setStandup(data);
      setLoadState("ready");
    } catch (err) {
      setErrorMsg(getErrorMessage(err, "Could not load standup."));
      setLoadState("error");
    }
  }

  // Fetch on open
  useEffect(() => {
    if (open) {
      fetchStandup();
      // Focus close button after a short tick
      setTimeout(() => closeButtonRef.current?.focus(), 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  async function handleCopy() {
    if (!standup?.text) return;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(standup.text);
      toast.success("Copied", { description: "Standup copied to clipboard." });
    } catch {
      toast.error("Failed to copy. Please copy manually.");
    } finally {
      setCopying(false);
    }
  }

  async function handlePostToDiscord() {
    setPosting(true);
    try {
      await postStandupToDiscord(workspaceId);
      toast.success("Posted to Discord", { description: "Standup summary sent to your Discord channel." });
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to post to Discord."));
    } finally {
      setPosting(false);
    }
  }

  if (!open) return null;

  return (
    <>
      {/* Scrim */}
      <div
        className={cn(
          "fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm",
          transitionDuration,
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="standup-modal-title"
        className={cn(
          "fixed left-1/2 top-1/2 z-[300] w-full max-w-lg -translate-x-1/2 -translate-y-1/2",
          "rounded-xl border border-border bg-card shadow-xl",
          "flex flex-col",
          "transition-all ease-out",
          transitionDuration,
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div>
            <h2
              id="standup-modal-title"
              className="text-base font-semibold text-foreground"
            >
              Daily Standup
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{today}</p>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground",
              "hover:bg-muted hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "transition-colors duration-150",
            )}
            aria-label="Close standup dialog"
          >
            <X className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Loading skeleton */}
          {loadState === "loading" && <StandupSkeleton />}

          {/* Error state */}
          {loadState === "error" && (
            <div
              className="flex flex-col items-center gap-4 rounded-lg border border-danger/20 bg-danger/5 py-10 text-center"
              role="alert"
              aria-live="assertive"
            >
              <TriangleAlert
                className="h-8 w-8 text-danger/60"
                aria-hidden="true"
                strokeWidth={1.5}
              />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Failed to load standup
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {errorMsg}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchStandup}
                aria-label="Retry loading standup"
              >
                <RefreshCw
                  className="h-3.5 w-3.5"
                  aria-hidden="true"
                  strokeWidth={1.5}
                />
                Retry
              </Button>
            </div>
          )}

          {/* Ready — three sections */}
          {loadState === "ready" && standup && (
            <div className="space-y-6">
              {/* Completed */}
              <StandupSection
                icon={
                  <CheckCircle2 className="h-4 w-4" strokeWidth={1.5} />
                }
                iconColor="text-success"
                title="Completed"
                tasks={standup.done}
                emptyMessage="Nothing completed yet."
                strikethrough
              />

              {/* In Progress */}
              <StandupSection
                icon={<Clock className="h-4 w-4" strokeWidth={1.5} />}
                iconColor="text-primary"
                title="In Progress"
                tasks={standup.pending}
                emptyMessage="No active tasks."
                showMeta
              />

              {/* Blockers */}
              <StandupSection
                icon={
                  <TriangleAlert className="h-4 w-4" strokeWidth={1.5} />
                }
                iconColor="text-warning"
                title="Blockers"
                tasks={standup.blockers}
                emptyMessage="No blockers 🎉"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              disabled={loadState !== "ready" || copying || !standup?.text}
              aria-label="Copy standup to clipboard"
            >
              <ClipboardCopy
                className="h-4 w-4"
                aria-hidden="true"
                strokeWidth={1.5}
              />
              Copy to clipboard
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePostToDiscord}
              disabled={loadState !== "ready" || posting}
              loading={posting}
              aria-label="Post standup to Discord"
            >
              <Send
                className="h-4 w-4"
                aria-hidden="true"
                strokeWidth={1.5}
              />
              Post to Discord
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </>
  );
}
