"use client";

/**
 * Global Cmd+K / Ctrl+K command palette.
 * - Navigate to any section
 * - Quick actions (create task, generate standup)
 * - Fuzzy-search tasks (fetches grouped tasks once on mount)
 *
 * Accessibility:
 * - role="dialog" aria-modal
 * - Focus trap (Tab/Shift+Tab stay inside)
 * - Focus restored to trigger on close
 * - prefers-reduced-motion respected
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  CheckSquare,
  Users,
  BarChart3,
  Plug,
  Settings,
  Plus,
  Zap,
  Search,
  ArrowRight,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppContext } from "@/lib/app-context";
import { getTasks } from "@/lib/api";
import type { Task } from "@aicrm/shared";

// ── Command definitions ───────────────────────────────────────────────────

type CommandKind = "navigate" | "action" | "task";

interface CommandItem {
  id: string;
  kind: CommandKind;
  label: string;
  description?: string;
  icon: React.ReactNode;
  onExecute: () => void;
}

// ── Palette ───────────────────────────────────────────────────────────────

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  /** Open the create-task modal */
  onCreateTask: () => void;
  /** Open the standup modal */
  onStandup: () => void;
}

const ICON_CLS = "h-4 w-4 shrink-0";

export function CommandPalette({
  open,
  onClose,
  onCreateTask,
  onStandup,
}: CommandPaletteProps) {
  const router = useRouter();
  const { currentWorkspace } = useAppContext();

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [tasks, setTasks] = useState<Task[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const triggerRef = useRef<Element | null>(null);

  // ── Fetch tasks once on mount for search ───────────────────────────────

  useEffect(() => {
    if (!open || !currentWorkspace) return;
    getTasks(currentWorkspace.id)
      .then((list) => setTasks(list as Task[]))
      .catch(() => {/* silent — tasks search is best-effort */});
  }, [open, currentWorkspace]);

  // ── Focus management ───────────────────────────────────────────────────

  useEffect(() => {
    if (open) {
      // Save trigger so we can restore focus on close
      triggerRef.current = document.activeElement;
      // Small rAF so the DOM is visible before focusing
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [open]);

  // Restore focus on close
  const handleClose = useCallback(() => {
    onClose();
    requestAnimationFrame(() => {
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus();
      }
    });
  }, [onClose]);

  // ── Build command list ─────────────────────────────────────────────────

  const navigate = useCallback(
    (href: string) => {
      router.push(href);
      handleClose();
    },
    [router, handleClose],
  );

  const navCommands: CommandItem[] = [
    {
      id: "nav-dashboard",
      kind: "navigate",
      label: "Dashboard",
      icon: <LayoutDashboard className={ICON_CLS} strokeWidth={1.5} aria-hidden="true" />,
      onExecute: () => navigate("/dashboard"),
    },
    {
      id: "nav-tasks",
      kind: "navigate",
      label: "Tasks",
      icon: <CheckSquare className={ICON_CLS} strokeWidth={1.5} aria-hidden="true" />,
      onExecute: () => navigate("/tasks"),
    },
    {
      id: "nav-team",
      kind: "navigate",
      label: "Team",
      icon: <Users className={ICON_CLS} strokeWidth={1.5} aria-hidden="true" />,
      onExecute: () => navigate("/team"),
    },
    {
      id: "nav-analytics",
      kind: "navigate",
      label: "Analytics",
      icon: <BarChart3 className={ICON_CLS} strokeWidth={1.5} aria-hidden="true" />,
      onExecute: () => navigate("/analytics"),
    },
    {
      id: "nav-integrations",
      kind: "navigate",
      label: "Integrations",
      icon: <Plug className={ICON_CLS} strokeWidth={1.5} aria-hidden="true" />,
      onExecute: () => navigate("/integrations"),
    },
    {
      id: "nav-settings",
      kind: "navigate",
      label: "Settings",
      icon: <Settings className={ICON_CLS} strokeWidth={1.5} aria-hidden="true" />,
      onExecute: () => navigate("/settings"),
    },
  ];

  const actionCommands: CommandItem[] = [
    {
      id: "action-create-task",
      kind: "action",
      label: "Create task",
      icon: <Plus className={ICON_CLS} strokeWidth={1.5} aria-hidden="true" />,
      onExecute: () => {
        handleClose();
        onCreateTask();
      },
    },
    {
      id: "action-standup",
      kind: "action",
      label: "Generate standup",
      icon: <Zap className={ICON_CLS} strokeWidth={1.5} aria-hidden="true" />,
      onExecute: () => {
        handleClose();
        onStandup();
      },
    },
  ];

  // ── Filtered commands ──────────────────────────────────────────────────

  const q = query.trim().toLowerCase();

  const matchedNav = navCommands.filter(
    (c) => !q || c.label.toLowerCase().includes(q),
  );

  const matchedActions = actionCommands.filter(
    (c) => !q || c.label.toLowerCase().includes(q),
  );

  const matchedTasks: CommandItem[] = q
    ? tasks
        .filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            (t.description?.toLowerCase().includes(q) ?? false),
        )
        .slice(0, 5)
        .map((t) => ({
          id: `task-${t.id}`,
          kind: "task" as CommandKind,
          label: t.title,
          description: t.status,
          icon: <FileText className={ICON_CLS} strokeWidth={1.5} aria-hidden="true" />,
          onExecute: () => {
            navigate("/tasks");
          },
        }))
    : [];

  // Flat list for keyboard navigation
  const allCommands: CommandItem[] = [
    ...matchedNav,
    ...matchedActions,
    ...matchedTasks,
  ];

  const total = allCommands.length;

  // Reset selection when list changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [q]);

  // ── Keyboard handler ───────────────────────────────────────────────────

  function handleKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % Math.max(total, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + Math.max(total, 1)) % Math.max(total, 1));
        break;
      case "Enter":
        e.preventDefault();
        allCommands[selectedIndex]?.onExecute();
        break;
      case "Escape":
        e.preventDefault();
        handleClose();
        break;
      case "Tab": {
        // Basic focus trap: cycle within the modal
        const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button, input, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
        break;
      }
    }
  }

  const dialogRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    const item = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // ── Section helpers ────────────────────────────────────────────────────

  function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
      <li className="px-3 pt-3 pb-1" role="presentation">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {children}
        </span>
      </li>
    );
  }

  interface ItemProps {
    item: CommandItem;
    index: number;
  }

  function CommandListItem({ item, index }: ItemProps) {
    const isSelected = selectedIndex === index;
    return (
      <li role="option" aria-selected={isSelected}>
        <button
          className={cn(
            "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm",
            "transition-colors duration-100",
            "focus-visible:outline-none",
            isSelected
              ? "bg-primary/10 text-primary"
              : "text-foreground hover:bg-muted",
          )}
          onMouseEnter={() => setSelectedIndex(index)}
          onClick={item.onExecute}
          tabIndex={-1}
        >
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded",
              isSelected ? "text-primary" : "text-muted-foreground",
            )}
          >
            {item.icon}
          </span>
          <span className="flex-1 truncate">{item.label}</span>
          {item.description && (
            <span className="shrink-0 text-xs text-muted-foreground capitalize">
              {item.description}
            </span>
          )}
          {item.kind === "navigate" && (
            <ArrowRight
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden="true"
              strokeWidth={1.5}
            />
          )}
        </button>
      </li>
    );
  }

  // Build the indexed list
  let cursor = 0;
  const sections: React.ReactNode[] = [];

  if (matchedNav.length > 0) {
    sections.push(<SectionLabel key="nav-label">Navigate</SectionLabel>);
    matchedNav.forEach((item) => {
      sections.push(<CommandListItem key={item.id} item={item} index={cursor++} />);
    });
  }
  if (matchedActions.length > 0) {
    sections.push(<SectionLabel key="action-label">Actions</SectionLabel>);
    matchedActions.forEach((item) => {
      sections.push(<CommandListItem key={item.id} item={item} index={cursor++} />);
    });
  }
  if (matchedTasks.length > 0) {
    sections.push(<SectionLabel key="task-label">Tasks</SectionLabel>);
    matchedTasks.forEach((item) => {
      sections.push(<CommandListItem key={item.id} item={item} index={cursor++} />);
    });
  }

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!open) return null;

  return (
    // Backdrop
    <div
      className={cn(
        "fixed inset-0 z-[500] flex items-start justify-center",
        "bg-black/50 backdrop-blur-sm",
        "px-4 pt-[10vh]",
        !prefersReducedMotion && "animate-in fade-in duration-150",
      )}
      onClick={handleClose}
      aria-hidden="true"
    >
      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className={cn(
          "relative w-full max-w-lg",
          "rounded-xl border border-border bg-card shadow-2xl",
          "flex flex-col overflow-hidden",
          !prefersReducedMotion && "animate-in slide-in-from-top-4 duration-200 ease-out",
        )}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
            strokeWidth={1.5}
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commands or tasks…"
            className={cn(
              "flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground",
              "focus:outline-none",
            )}
            aria-label="Command search"
            aria-controls="command-list"
            aria-activedescendant={
              allCommands[selectedIndex]
                ? `cmd-item-${allCommands[selectedIndex].id}`
                : undefined
            }
            autoComplete="off"
            spellCheck={false}
          />
          <kbd
            className="hidden sm:inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
            aria-label="Press Escape to close"
          >
            Esc
          </kbd>
        </div>

        {/* Command list */}
        <div className="max-h-[360px] overflow-y-auto overscroll-contain">
          {allCommands.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No commands match &ldquo;{query}&rdquo;
            </div>
          ) : (
            <ul
              id="command-list"
              ref={listRef}
              role="listbox"
              aria-label="Commands"
              className="p-2 pb-3"
            >
              {sections}
            </ul>
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 border-t border-border px-4 py-2">
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <kbd className="rounded border border-border px-1">↑↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <kbd className="rounded border border-border px-1">↵</kbd>
            select
          </span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <kbd className="rounded border border-border px-1">Esc</kbd>
            close
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Global hook for Cmd+K / Ctrl+K ────────────────────────────────────────

export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return { open, setOpen };
}
