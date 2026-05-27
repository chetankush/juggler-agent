"use client";

/**
 * Team page — /team
 * Shows all workspace members (via GET /workspaces/:id/members) with their tasks.
 * Owner-only invite section: send email invites, cancel pending invites.
 * Search bar filters by member name/email (client-side).
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  Users,
  MessageSquare,
  RefreshCw,
  AlertCircle,
  Search,
  Mail,
  UserPlus,
  X,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TaskCard } from "@/components/task-card";
import { TaskDetailDrawer } from "@/components/task-detail-drawer";
import { useAppContext } from "@/lib/app-context";
import {
  getMembers,
  getTasks,
  listInvites,
  createInvite,
  deleteInvite,
  getErrorMessage,
} from "@/lib/api";
import type { WorkspaceMember, WorkspaceInvite, Task, GroupedTasks } from "@aicrm/shared";
import { toast } from "sonner";

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
        <div key={i} className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="skeleton h-10 w-10 rounded-full" />
            <div className="flex flex-col gap-1.5">
              <div className="skeleton h-4 w-32 rounded" />
              <div className="skeleton h-3 w-20 rounded" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {Array.from({ length: Math.max(1, i - 1) }).map((_, j) => (
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
        <Users className="h-6 w-6 text-muted-foreground" aria-hidden="true" strokeWidth={1.5} />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">No team members yet</p>
        <p className="mt-1 text-xs text-muted-foreground max-w-xs">
          Invite developers to the workspace to see them here.
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
      <AlertCircle className="h-8 w-8 text-danger/60" aria-hidden="true" strokeWidth={1.5} />
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
  member: WorkspaceMember;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

function TeamMemberCard({ member, tasks, onTaskClick }: TeamMemberCardProps) {
  const { user } = member;
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
          <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
          {user.name && (
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          )}
        </div>

        {/* Role badge */}
        {member.role === "owner" && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            Owner
          </span>
        )}

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

// ── Invite Section ────────────────────────────────────────────────────────

interface InviteSectionProps {
  workspaceId: string;
  invites: WorkspaceInvite[];
  onInviteSent: (invite: WorkspaceInvite) => void;
  onInviteCancelled: (inviteId: string) => void;
}

function InviteSection({ workspaceId, invites, onInviteSent, onInviteCancelled }: InviteSectionProps) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const pendingInvites = invites.filter((i) => i.status === "pending");

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setSending(true);
    // Optimistic: we add the invite after confirmation
    try {
      const invite = await createInvite(workspaceId, trimmed);
      onInviteSent(invite);
      setEmail("");
      toast.success(`Invite sent to ${trimmed}`);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to send invite."));
    } finally {
      setSending(false);
    }
  }

  async function handleCancel(inviteId: string, inviteEmail: string) {
    setCancellingId(inviteId);
    // Optimistic remove
    onInviteCancelled(inviteId);
    try {
      await deleteInvite(workspaceId, inviteId);
      toast.success(`Invite to ${inviteEmail} cancelled.`);
    } catch (err) {
      // Can't easily rollback without re-fetching; just show error
      toast.error(getErrorMessage(err, "Failed to cancel invite."));
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <section
      className="rounded-xl border border-border bg-card p-5 mb-6"
      aria-label="Invite section"
    >
      <div className="flex items-center gap-2 mb-4">
        <UserPlus className="h-4 w-4 text-muted-foreground" aria-hidden="true" strokeWidth={1.5} />
        <h2 className="text-sm font-semibold text-foreground">Invite team members</h2>
      </div>

      {/* Send invite form */}
      <form onSubmit={handleSend} className="flex items-end gap-2 mb-5" noValidate>
        <div className="flex flex-col gap-1.5 flex-1 max-w-sm">
          <Label htmlFor="invite-email">Email address</Label>
          <Input
            id="invite-email"
            type="email"
            inputMode="email"
            placeholder="colleague@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-required="true"
            autoComplete="email"
          />
        </div>
        <Button
          type="submit"
          size="sm"
          loading={sending}
          disabled={!email.trim()}
          aria-label="Send invite"
        >
          <Mail className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={1.5} />
          Send invite
        </Button>
      </form>

      {/* Pending invites list */}
      {pendingInvites.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Pending invites ({pendingInvites.length})
          </p>
          <ul className="flex flex-col gap-2" role="list">
            {pendingInvites.map((invite) => (
              <li
                key={invite.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface-muted px-3 py-2"
              >
                <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" strokeWidth={1.5} />
                <span className="flex-1 text-sm text-foreground truncate">{invite.email}</span>
                <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                  {new Date(invite.createdAt).toLocaleDateString()}
                </span>
                <button
                  onClick={() => handleCancel(invite.id, invite.email)}
                  disabled={cancellingId === invite.id}
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground",
                    "hover:bg-danger/10 hover:text-danger",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                    "transition-colors duration-150",
                    "disabled:opacity-40",
                  )}
                  aria-label={`Cancel invite to ${invite.email}`}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={1.5} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {pendingInvites.length === 0 && (
        <p className="text-xs text-muted-foreground">No pending invites.</p>
      )}
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

type LoadState = "loading" | "ready" | "error";

export default function TeamPage() {
  const { currentWorkspace, meResponse } = useAppContext();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [tasksByUser, setTasksByUser] = useState<Record<string, Task[]>>({});
  const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const currentUserId = meResponse?.user?.id ?? null;
  const isOwner = currentWorkspace?.ownerId === currentUserId;

  const fetchAll = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoadState("loading");
    setErrorMsg(null);
    try {
      const [membersData, groupedData, invitesData] = await Promise.all([
        getMembers(currentWorkspace.id),
        getTasks(currentWorkspace.id, { grouped: true }) as Promise<GroupedTasks>,
        isOwner ? listInvites(currentWorkspace.id) : Promise.resolve([] as WorkspaceInvite[]),
      ]);

      // Build tasks-by-user map
      const allTasks = [...groupedData.active, ...groupedData.blocked, ...groupedData.completed];
      const byUser: Record<string, Task[]> = {};
      for (const t of allTasks) {
        if (t.assignedUserId) {
          if (!byUser[t.assignedUserId]) byUser[t.assignedUserId] = [];
          byUser[t.assignedUserId].push(t);
        }
      }

      setMembers(membersData);
      setTasksByUser(byUser);
      setInvites(invitesData);
      setLoadState("ready");
    } catch (err) {
      setErrorMsg(getErrorMessage(err, "Could not load team members."));
      setLoadState("error");
    }
  }, [currentWorkspace, isOwner]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ── Filtered members ─────────────────────────────────────────────────────

  const filteredMembers = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        (m.user.name?.toLowerCase().includes(q) ?? false) ||
        m.user.email.toLowerCase().includes(q),
    );
  }, [members, searchQuery]);

  return (
    <>
      {/* Page header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
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
            onClick={fetchAll}
            aria-label="Refresh team"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={1.5} />
            Refresh
          </Button>
        )}
      </div>

      {/* Owner-only invite section */}
      {loadState === "ready" && isOwner && (
        <InviteSection
          workspaceId={currentWorkspace!.id}
          invites={invites}
          onInviteSent={(invite) => setInvites((prev) => [invite, ...prev])}
          onInviteCancelled={(id) => setInvites((prev) => prev.filter((i) => i.id !== id))}
        />
      )}

      {/* Search bar */}
      {loadState === "ready" && members.length > 0 && (
        <div className="mb-4 relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
            aria-hidden="true"
            strokeWidth={1.5}
          />
          <Input
            type="search"
            placeholder="Search by name or email…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            aria-label="Search team members"
          />
        </div>
      )}

      {/* States */}
      {loadState === "loading" && <TeamSkeleton />}
      {loadState === "error" && (
        <TeamError message={errorMsg ?? "Something went wrong."} onRetry={fetchAll} />
      )}
      {loadState === "ready" && members.length === 0 && <TeamEmpty />}

      {loadState === "ready" && filteredMembers.length === 0 && searchQuery.trim() && (
        <div
          className="flex flex-col items-center justify-center gap-2 py-12 text-center"
          role="status"
          aria-live="polite"
        >
          <Search className="h-8 w-8 text-muted-foreground/40" strokeWidth={1.2} aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            No matches for{" "}
            <span className="font-medium text-foreground">&ldquo;{searchQuery}&rdquo;</span>
          </p>
        </div>
      )}

      {loadState === "ready" && filteredMembers.length > 0 && (
        <div className="flex flex-col gap-4">
          {filteredMembers.map((member) => (
            <TeamMemberCard
              key={member.userId}
              member={member}
              tasks={tasksByUser[member.userId] ?? []}
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
