"use client";

/**
 * Dashboard — real task data from GET /tasks?workspaceId=<id>&grouped=true.
 * Optimistic updates on every mutation; rolls back + toasts on failure.
 * Premium skeletons for loads >300ms; characterful empty states; full a11y.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { GroupedTasks, Task, TaskStatus } from "@aicrm/shared";
import {
  CheckCircle2,
  Clock,
  PauseCircle,
  Plus,
  Inbox,
  RefreshCw,
  AlertCircle,
  Sparkles,
  ClipboardList,
} from "lucide-react";
import { TaskCard } from "@/components/task-card";
import { TaskDetailDrawer } from "@/components/task-detail-drawer";
import { CreateTaskModal } from "@/components/create-task-modal";
import { StandupModal } from "@/components/standup-modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAppContext } from "@/lib/app-context";
import {
  getTasks,
  updateTask,
  getErrorMessage,
} from "@/lib/api";

// ── Skeleton components ─────────────────────────────────────────────────────

function TaskCardSkeleton() {
  return (
    <div
      className="rounded-lg border border-border bg-card p-4"
      aria-hidden="true"
    >
      <div className="flex items-start gap-3">
        <div className="skeleton mt-1 h-2.5 w-2.5 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-4 w-3/4 rounded" />
          <div className="skeleton h-3 w-1/2 rounded" />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="skeleton h-5 w-16 rounded-full" />
        <div className="skeleton h-5 w-14 rounded-full" />
        <div className="skeleton ml-auto h-3 w-20 rounded" />
        <div className="skeleton h-6 w-6 rounded-full" />
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading tasks">
      {/* Page header skeleton */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="skeleton h-8 w-32 rounded-md" />
          <div className="skeleton h-4 w-64 rounded-md" />
        </div>
        <div className="skeleton h-9 w-24 rounded-md" />
      </div>

      {/* Task group skeletons */}
      {[
        { label: "Active", count: 3 },
        { label: "Blocked", count: 1 },
      ].map(({ label, count }) => (
        <div key={label} className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <div className="skeleton h-4 w-4 rounded" />
            <div className="skeleton h-4 w-16 rounded" />
            <div className="skeleton h-4 w-6 rounded-full" />
          </div>
          <div className="flex flex-col gap-3">
            {Array.from({ length: count }).map((_, i) => (
              <TaskCardSkeleton key={i} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────

function EmptyGroup({ message, icon }: { message: string; icon: React.ReactNode }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-8 text-center"
      role="status"
      aria-live="polite"
    >
      <span className="text-muted-foreground/40" aria-hidden="true">
        {icon}
      </span>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

// ── Error state ─────────────────────────────────────────────────────────────

function DashboardError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 rounded-xl border border-danger/20 bg-danger/5 py-16 text-center"
      role="alert"
      aria-live="assertive"
    >
      <AlertCircle
        className="h-8 w-8 text-danger/60"
        aria-hidden="true"
        strokeWidth={1.5}
      />
      <div>
        <p className="text-sm font-medium text-foreground">
          Failed to load tasks
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{message}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onRetry}
        aria-label="Retry loading tasks"
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={1.5} />
        Retry
      </Button>
    </div>
  );
}

// ── Task Group ──────────────────────────────────────────────────────────────

interface TaskGroupProps {
  title: string;
  icon: React.ReactNode;
  tasks: Task[];
  emptyMessage: string;
  emptyIcon: React.ReactNode;
  onMarkComplete: (id: string) => void;
  onMarkBlocked: (id: string) => void;
  onSnooze: (id: string) => void;
  onTaskClick: (id: string) => void;
}

function TaskGroup({
  title,
  icon,
  tasks,
  emptyMessage,
  emptyIcon,
  onMarkComplete,
  onMarkBlocked,
  onSnooze,
  onTaskClick,
}: TaskGroupProps) {
  return (
    <section aria-label={`${title} tasks`}>
      {/* Group header */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-muted-foreground" aria-hidden="true">
          {icon}
        </span>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <span
          className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground"
          aria-label={`${tasks.length} task${tasks.length !== 1 ? "s" : ""}`}
        >
          {tasks.length}
        </span>
      </div>

      {tasks.length === 0 ? (
        <EmptyGroup message={emptyMessage} icon={emptyIcon} />
      ) : (
        <ul className="flex flex-col gap-3" role="list">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="transition-all duration-200 ease-out"
            >
              <TaskCard
                task={task}
                assigneeName={null}
                onMarkComplete={onMarkComplete}
                onMarkBlocked={onMarkBlocked}
                onSnooze={onSnooze}
                onClick={onTaskClick}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Dashboard Page ─────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { currentWorkspace } = useAppContext();

  // Grouped task state — null while loading
  const [grouped, setGrouped] = useState<GroupedTasks | null>(null);
  const [loadingState, setLoadingState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [standupOpen, setStandupOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Show skeleton for at least 300ms to avoid flash
  const loadStartRef = useRef<number>(Date.now());

  const fetchTasks = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoadingState("loading");
    setErrorMsg(null);
    loadStartRef.current = Date.now();

    try {
      const data = await getTasks(currentWorkspace.id, { grouped: true });
      // Guarantee skeleton is shown for at least 300ms (design requirement)
      const elapsed = Date.now() - loadStartRef.current;
      if (elapsed < 300) {
        await new Promise((r) => setTimeout(r, 300 - elapsed));
      }
      setGrouped(data);
      setLoadingState("ready");
    } catch (err) {
      setErrorMsg(getErrorMessage(err, "Could not load tasks."));
      setLoadingState("error");
    }
  }, [currentWorkspace]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // ── Optimistic helpers ────────────────────────────────────────────────────

  function applyOptimisticStatus(
    taskId: string,
    newStatus: TaskStatus,
  ) {
    setGrouped((prev) => {
      if (!prev) return prev;
      // Remove from all groups, re-insert in correct group
      const all = [...prev.active, ...prev.blocked, ...prev.completed];
      const updated = all.map((t) =>
        t.id === taskId ? { ...t, status: newStatus, updatedAt: new Date().toISOString() } : t,
      );
      return {
        active: updated.filter((t) => t.status === "active"),
        blocked: updated.filter((t) => t.status === "blocked"),
        completed: updated.filter((t) => t.status === "completed"),
      };
    });
    // Keep the selected task in sync with optimistic status
    setSelectedTask((prev) =>
      prev?.id === taskId ? { ...prev, status: newStatus } : prev,
    );
  }

  function rollbackTask(taskId: string, original: Task) {
    setGrouped((prev) => {
      if (!prev) return prev;
      const all = [...prev.active, ...prev.blocked, ...prev.completed].map(
        (t) => (t.id === taskId ? original : t),
      );
      return {
        active: all.filter((t) => t.status === "active"),
        blocked: all.filter((t) => t.status === "blocked"),
        completed: all.filter((t) => t.status === "completed"),
      };
    });
    setSelectedTask((prev) => (prev?.id === taskId ? original : prev));
  }

  function findTask(taskId: string): Task | undefined {
    if (!grouped) return undefined;
    return [
      ...grouped.active,
      ...grouped.blocked,
      ...grouped.completed,
    ].find((t) => t.id === taskId);
  }

  async function handleMarkComplete(taskId: string) {
    const original = findTask(taskId);
    if (!original || original.status === "completed") return;
    applyOptimisticStatus(taskId, "completed");
    try {
      await updateTask(taskId, { status: "completed" });
      toast.success("Task marked complete.");
    } catch (err) {
      if (original) rollbackTask(taskId, original);
      toast.error(getErrorMessage(err, "Failed to update task."));
    }
  }

  async function handleMarkBlocked(taskId: string) {
    const original = findTask(taskId);
    if (!original || original.status === "blocked") return;
    applyOptimisticStatus(taskId, "blocked");
    try {
      await updateTask(taskId, { status: "blocked" });
      toast.warning("Task marked blocked.");
    } catch (err) {
      if (original) rollbackTask(taskId, original);
      toast.error(getErrorMessage(err, "Failed to update task."));
    }
  }

  async function handleSnooze(taskId: string) {
    // Snooze = mark active (unblocks or moves to active)
    const original = findTask(taskId);
    if (!original) return;
    applyOptimisticStatus(taskId, "active");
    try {
      await updateTask(taskId, { status: "active" });
      toast.info("Task snoozed — moved back to active.");
    } catch (err) {
      if (original) rollbackTask(taskId, original);
      toast.error(getErrorMessage(err, "Failed to snooze task."));
    }
  }

  function handleTaskCreated(task: Task) {
    setGrouped((prev) => {
      if (!prev) {
        return { active: [task], blocked: [], completed: [] };
      }
      return { ...prev, active: [task, ...prev.active] };
    });
  }

  function handleTaskClick(taskId: string) {
    const task = findTask(taskId);
    if (task) setSelectedTask(task);
  }

  // ── Total tasks for empty-workspace state ─────────────────────────────────
  const totalTasks = useMemo(
    () =>
      grouped
        ? grouped.active.length +
          grouped.blocked.length +
          grouped.completed.length
        : 0,
    [grouped],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  if (loadingState === "loading") {
    return <DashboardSkeleton />;
  }

  if (loadingState === "error") {
    return (
      <DashboardError message={errorMsg ?? "Unknown error."} onRetry={fetchTasks} />
    );
  }

  return (
    <>
      {/* Page header — primary CTA + standup action */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your tasks, extracted from Discord — stay in control.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            aria-label="Generate daily standup"
            onClick={() => setStandupOpen(true)}
          >
            <ClipboardList
              className="h-4 w-4"
              aria-hidden="true"
              strokeWidth={1.5}
            />
            Generate Standup
          </Button>
          <Button
            size="sm"
            aria-label="Create a new task manually"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
            New task
          </Button>
        </div>
      </div>

      {/* Empty workspace prompt */}
      {totalTasks === 0 && (
        <div
          className={cn(
            "mb-8 flex flex-col items-center justify-center gap-4 rounded-xl",
            "border border-dashed border-primary/30 bg-primary/5 py-16 text-center",
          )}
        >
          <Sparkles
            className="h-10 w-10 text-primary/50"
            aria-hidden="true"
            strokeWidth={1.5}
          />
          <div>
            <p className="text-base font-semibold text-foreground">
              No tasks yet
            </p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Connect Discord and mention a teammate — or create a task manually
              to get started.
            </p>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
            Create your first task
          </Button>
        </div>
      )}

      {/* Task groups */}
      <div className="flex flex-col gap-8">
        <TaskGroup
          title="Active"
          icon={
            <Clock className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          }
          tasks={grouped?.active ?? []}
          emptyMessage="No active tasks — you're all caught up."
          emptyIcon={
            <Inbox className="h-8 w-8" strokeWidth={1.5} />
          }
          onMarkComplete={handleMarkComplete}
          onMarkBlocked={handleMarkBlocked}
          onSnooze={handleSnooze}
          onTaskClick={handleTaskClick}
        />
        <TaskGroup
          title="Blocked"
          icon={
            <PauseCircle
              className="h-4 w-4"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          }
          tasks={grouped?.blocked ?? []}
          emptyMessage="Nothing blocked. Great velocity!"
          emptyIcon={
            <CheckCircle2 className="h-8 w-8" strokeWidth={1.5} />
          }
          onMarkComplete={handleMarkComplete}
          onMarkBlocked={handleMarkBlocked}
          onSnooze={handleSnooze}
          onTaskClick={handleTaskClick}
        />
        <TaskGroup
          title="Completed"
          icon={
            <CheckCircle2
              className="h-4 w-4"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          }
          tasks={grouped?.completed ?? []}
          emptyMessage="No completed tasks yet."
          emptyIcon={
            <Clock className="h-8 w-8" strokeWidth={1.5} />
          }
          onMarkComplete={handleMarkComplete}
          onMarkBlocked={handleMarkBlocked}
          onSnooze={handleSnooze}
          onTaskClick={handleTaskClick}
        />
      </div>

      {/* AI footnote */}
      <p className="mt-8 text-center text-xs text-muted-foreground">
        Tasks are extracted by AI from Discord mentions. Review before acting.
      </p>

      {/* Task detail drawer */}
      <TaskDetailDrawer
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
      />

      {/* Create task modal */}
      {currentWorkspace && (
        <CreateTaskModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          workspaceId={currentWorkspace.id}
          onCreated={handleTaskCreated}
        />
      )}

      {/* Daily standup modal */}
      {currentWorkspace && (
        <StandupModal
          open={standupOpen}
          onClose={() => setStandupOpen(false)}
          workspaceId={currentWorkspace.id}
        />
      )}
    </>
  );
}
