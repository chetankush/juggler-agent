"use client";

/**
 * Team page — /team
 * Shows all workspace members with their linked Discord status and tasks.
 * Clicking a task opens TaskDetailDrawer (reused from tasks page).
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  Users,
  MessageSquare,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { TaskCard } from "@/components/task-card";
import { TaskDetailDrawer } from "@/components/task-detail-drawer";
import { useAppContext } from "@/lib/app-context";
import { getTeam, getErrorMessage } from "@/lib/api";
import type { TeamMember } from "@/lib/api";
import type { Task } from "@aicrm/shared";

// ── Helpers ───────────────────────────────────────────────────────────────

function getInitials(name: string | null, email: string): string {
  if (name) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  return email.slice(0, 2).toUpperCase();
}

// ── Skeleton ──────────────────────────────────────────────────────────────

function TeamSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading team members" className="flex flex-col gap-4">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="rounded-xl border border-border bg-card p-5"
        >
          {/* Header row */}
          <div className="flex items-center gap-3 mb-4">
            <div className="skeleton h-10 w-10 rounded-full" />
            <div className="flex flex-col gap-1.5">
              <div className="skeleton h-4 w-32 rounded" />
              <div className="skeleton h-3 w-20 rounded" />
            </div>
          </div>
          {/* Task rows */}
          <div className="flex flex-col gap-2">
            {Array.from({ length: Math.max(1, i) }).map((_, j) => (
              <div key={j} className="skeleton h-[72px] rounded-lg" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────

function TeamEmpty() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border bg-card py-20 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Users
          className="h-6 w-6 text-muted-foreground"
          aria-hidden="true"
          strokeWidth={1.5}
        />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">No team members yet</p>
        <p className="mt-1 text-xs text-muted-foreground max-w-xs">
          Share your workspace with developers to see their tasks here.
        </p>
      </div>
    </div>
  );
}

// ── Error state ───────────────────────────────────────────────────────────

function TeamError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 rounded-xl border border-danger/20 bg-danger/5 py-16 text-center"
      role="alert"
    >
      <AlertCircle
        className="h-8 w-8 text-danger/60"
        aria-hidden="true"
        strokeWidth={1.5}
      />
      <div>
        <p className="text-sm font-medium text-foreground">Failed to load team</p>
        <p className="mt-1 text-xs text-muted-foreground">{message}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={1.5} />
        Retry
      </Button>
    </div>
  );
}

// ── TeamMemberCard ────────────────────────────────────────────────────────

interface TeamMemberCardProps {
  member: TeamMember;
  onTaskClick: (task: Task) => void;
}

function TeamMemberCard({ member, onTaskClick }: TeamMemberCardProps) {
  const { user, tasks } = member;
  const displayName = user.name ?? user.email;
  const initials = getInitials(user.name, user.email);

  return (
    <article
      className="rounded-xl border border-border bg-card p-5 transition-colors duration-150"
      aria-label={`Team member: ${displayName}`}
    >
      {/* Member header */}
      <div className="mb-4 flex items-center gap-3">
        <Avatar className="h-10 w-10 shrink-0" aria-label={`${displayName}'s avatar`}>
          <AvatarFallback className="text-sm font-medium">{initials}</AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {displayName}
          </p>
          {user.name && (
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          )}
        </div>

        {/* Discord chip */}
        {user.discordId ? (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1",
              "border border-primary/20 bg-primary/10 text-xs font-medium text-primary",
            )}
            title={`Discord ID: ${user.discordId}`}
            aria-label="Discord linked"
          >
            <MessageSquare className="h-3 w-3" aria-hidden="true" strokeWidth={1.5} />
            Linked
          </span>
        ) : (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1",
              "border border-border text-xs text-muted-foreground",
            )}
            aria-label="Discord not linked"
          >
            Not linked
          </span>
        )}
      </div>

      {/* Tasks */}
      {tasks.length === 0 ? (
        <p className="text-xs text-muted-foreground pl-[52px]">No tasks assigned.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              assigneeName={user.name ?? user.email}
              onClick={() => onTaskClick(task)}
            />
          ))}
        </div>
      )}
    </article>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

type LoadState = "loading" | "ready" | "error";

export default function TeamPage() {
  const { currentWorkspace } = useAppContext();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const fetchTeam = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoadState("loading");
    setErrorMsg(null);
    try {
      const data = await getTeam(currentWorkspace.id);
      setTeam(data);
      setLoadState("ready");
    } catch (err) {
      setErrorMsg(getErrorMessage(err, "Could not load team members."));
      setLoadState("error");
    }
  }, [currentWorkspace]);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  return (
    <>
      {/* Page header */}
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Team</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All workspace members and their current tasks.
          </p>
        </div>

        {loadState === "ready" && (
          <Button
            variant="outline"
            size="sm"
            onClick={fetchTeam}
            aria-label="Refresh team"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={1.5} />
            Refresh
          </Button>
        )}
      </div>

      {/* States */}
      {loadState === "loading" && <TeamSkeleton />}

      {loadState === "error" && (
        <TeamError message={errorMsg ?? "Something went wrong."} onRetry={fetchTeam} />
      )}

      {loadState === "ready" && team.length === 0 && <TeamEmpty />}

      {loadState === "ready" && team.length > 0 && (
        <div className="flex flex-col gap-4">
          {team.map((member) => (
            <TeamMemberCard
              key={member.user.id}
              member={member}
              onTaskClick={setSelectedTask}
            />
          ))}
        </div>
      )}

      {/* Task detail drawer (reused) */}
      <TaskDetailDrawer
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
      />
    </>
  );
}
