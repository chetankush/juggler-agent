"use client";

/**
 * Tasks page — /tasks
 * Full task list with filter tabs (All / Active / Blocked / Completed).
 * Optimistic status updates with rollback, premium skeletons, characterful
 * empty states, error state with retry, and task detail drawer on card click.
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
  Layers,
  RefreshCw,
  AlertCircle,
  ListTodo,
} from "lucide-react";
import { TaskCard } from "@/components/task-card";
import { TaskDetailDrawer } from "@/components/task-detail-drawer";
import { CreateTaskModal } from "@/components/create-task-modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAppContext } from "@/lib/app-context";
import { getTasks, updateTask, getErrorMessage } from "@/lib/api";

// ── Filter tabs ──────────────────────────────────────────────────────────────

type FilterTab = "all" | "active" | "blocked" | "completed";

const FILTER_TABS: { id: FilterTab; label: string; icon: React.ReactNode }[] = [
  {
    id: "all",
    label: "All",
    icon: <Layers className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />,
  },
  {
    id: "active",
    label: "Active",
    icon: <Clock className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />,
  },
  {
    id: "blocked",
    label: "Blocked",
    icon: <PauseCircle className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />,
  },
  {
    id: "completed",
    label: "Completed",
    icon: <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />,
  },
];

// ── Skeleton ─────────────────────────────────────────────────────────────────

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
      </div>
    </div>
  );
}

function TasksPageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading tasks">
      {/* Header skeleton */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="skeleton h-8 w-20 rounded-md" />
          <div className="skeleton h-4 w-56 rounded-md" />
        </div>
        <div className="skeleton h-9 w-24 rounded-md" />
      </div>

      {/* Filter tabs skeleton */}
      <div className="mb-6 flex gap-1">
        {[80, 64, 72, 96].map((w, i) => (
          <div key={i} className={`skeleton h-8 rounded-md`} style={{ width: w }} />
        ))}
      </div>

      {/* Task cards skeleton */}
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <TaskCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({
  filter,
  onNewTask,
}: {
  filter: FilterTab;
  onNewTask: () => void;
}) {
  const messages: Record<FilterTab, { heading: string; body: string; showCreate: boolean }> = {
    all: {
      heading: "No tasks yet",
      body: "Create your first task manually, or connect Discord and mention a teammate to auto-extract tasks.",
      showCreate: true,
    },
    active: {
      heading: "No active tasks",
      body: "You are all caught up. Pick a blocked task to unblock, or create a new one.",
      showCreate: true,
    },
    blocked: {
      heading: "Nothing blocked",
      body: "Great velocity — no tasks are waiting on anything right now.",
      showCreate: false,
    },
    completed: {
      heading: "No completed tasks yet",
      body: "Mark tasks complete as you finish them. Progress will show up here.",
      showCreate: false,
    },
  };

  const { heading, body, showCreate } = messages[filter];

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-xl py-16 text-center",
        "border border-dashed border-border",
      )}
      role="status"
      aria-live="polite"
    >
      <span className="text-muted-foreground/30" aria-hidden="true">
        <ListTodo className="h-10 w-10" strokeWidth={1.2} />
      </span>
      <div className="max-w-xs">
        <p className="text-base font-semibold text-foreground">{heading}</p>
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      </div>
      {showCreate && (
        <Button size="sm" onClick={onNewTask}>
          <Plus className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
          New task
        </Button>
      )}
    </div>
  );
}

// ── Error state ──────────────────────────────────────────────────────────────

function PageError({ message, onRetry }: { message: string; onRetry: () => void }) {
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
        <p className="text-sm font-medium text-foreground">Failed to load tasks</p>
        <p className="mt-1 text-xs text-muted-foreground">{message}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry} aria-label="Retry loading tasks">
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={1.5} />
        Retry
      </Button>
    </div>
  );
}

// ── Tasks Page ────────────────────────────────────────────────────────────────

export default function TasksPage() {
  const { currentWorkspace } = useAppContext();

  const [grouped, setGrouped] = useState<GroupedTasks | null>(null);
  const [loadingState, setLoadingState] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [filter, setFilter] = useState<FilterTab>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const loadStartRef = useRef<number>(Date.now());

  // ── Data fetching ────────────────────────────────────────────────────────

  const fetchTasks = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoadingState("loading");
    setErrorMsg(null);
    loadStartRef.current = Date.now();

    try {
      const data = await getTasks(currentWorkspace.id, { grouped: true });
      // Ensure skeleton shows for at least 300ms (design requirement)
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

  // ── Derived task list based on active filter ─────────────────────────────

  const filteredTasks = useMemo((): Task[] => {
    if (!grouped) return [];
    if (filter === "all") {
      return [...grouped.active, ...grouped.blocked, ...grouped.completed];
    }
    return grouped[filter];
  }, [grouped, filter]);

  // ── Tab count badges ─────────────────────────────────────────────────────

  const counts = useMemo(() => {
    if (!grouped) return { all: 0, active: 0, blocked: 0, completed: 0 };
    return {
      all: grouped.active.length + grouped.blocked.length + grouped.completed.length,
      active: grouped.active.length,
      blocked: grouped.blocked.length,
      completed: grouped.completed.length,
    };
  }, [grouped]);

  // ── Optimistic helpers ────────────────────────────────────────────────────

  function findTask(taskId: string): Task | undefined {
    if (!grouped) return undefined;
    return [
      ...grouped.active,
      ...grouped.blocked,
      ...grouped.completed,
    ].find((t) => t.id === taskId);
  }

  function applyOptimisticStatus(taskId: string, newStatus: TaskStatus) {
    setGrouped((prev) => {
      if (!prev) return prev;
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
    // Keep the selected task in sync
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
      if (!prev) return { active: [task], blocked: [], completed: [] };
      return { ...prev, active: [task, ...prev.active] };
    });
  }

  function handleCardClick(taskId: string) {
    const task = findTask(taskId);
    if (task) setSelectedTask(task);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loadingState === "loading") return <TasksPageSkeleton />;
  if (loadingState === "error") {
    return <PageError message={errorMsg ?? "Unknown error."} onRetry={fetchTasks} />;
  }

  return (
    <>
      {/* Page header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Tasks</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All tasks extracted from Discord and created manually.
          </p>
        </div>
        <Button
          size="sm"
          aria-label="Create a new task manually"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
          New task
        </Button>
      </div>

      {/* Filter tabs — segmented control */}
      <div
        className="mb-6 flex gap-1 rounded-lg border border-border bg-card p-1"
        role="tablist"
        aria-label="Filter tasks by status"
      >
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={filter === tab.id}
            aria-controls="tasks-list"
            onClick={() => setFilter(tab.id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5",
              "text-xs font-medium transition-all duration-150 ease-out",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              filter === tab.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
            )}
          >
            {tab.icon}
            {tab.label}
            <span
              className={cn(
                "ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                filter === tab.id
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
              aria-label={`${counts[tab.id]} tasks`}
            >
              {counts[tab.id]}
            </span>
          </button>
        ))}
      </div>

      {/* Task list */}
      <div
        id="tasks-list"
        role="tabpanel"
        aria-live="polite"
      >
        {filteredTasks.length === 0 ? (
          <EmptyState filter={filter} onNewTask={() => setCreateOpen(true)} />
        ) : (
          <ul className="flex flex-col gap-3" role="list">
            {filteredTasks.map((task) => (
              <li
                key={task.id}
                className="transition-all duration-200 ease-out"
              >
                <TaskCard
                  task={task}
                  assigneeName={null}
                  onMarkComplete={handleMarkComplete}
                  onMarkBlocked={handleMarkBlocked}
                  onSnooze={handleSnooze}
                  onClick={handleCardClick}
                />
              </li>
            ))}
          </ul>
        )}
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
    </>
  );
}
