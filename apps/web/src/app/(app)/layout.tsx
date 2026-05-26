"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { Topbar } from "@/components/topbar";
import { AppProvider, useAppContext } from "@/lib/app-context";
import { CommandPalette, useCommandPalette } from "@/components/command-palette";
import { CreateTaskModal } from "@/components/create-task-modal";
import { StandupModal } from "@/components/standup-modal";
import { cn } from "@/lib/utils";
import type { Task } from "@aicrm/shared";

// ── App-shell skeleton ──────────────────────────────────────────────────────

function AppShellSkeleton() {
  return (
    <div
      className="flex min-h-dvh flex-col bg-background"
      aria-busy="true"
      aria-label="Loading application"
    >
      {/* Topbar skeleton */}
      <div className="flex h-14 items-center gap-3 border-b border-border bg-card px-4 sticky top-0 z-[40]">
        <div className="skeleton h-5 w-32" />
        <div className="flex-1" />
        <div className="skeleton h-8 w-8 rounded-full" />
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar skeleton — desktop only */}
        <aside className="hidden lg:flex lg:w-56 lg:flex-col h-full border-r border-border bg-card">
          <div className="flex flex-col gap-2 p-4 pt-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton h-9 w-full rounded-md" />
            ))}
          </div>
        </aside>

        {/* Content skeleton */}
        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <div className="skeleton mb-2 h-8 w-40 rounded-md" />
            <div className="skeleton mb-8 h-4 w-64 rounded-md" />
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-20 w-full rounded-lg" />
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

// ── Error shell ─────────────────────────────────────────────────────────────

function AppShellError({ message }: { message: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-sm text-center">
        <p className="text-sm font-medium text-danger" role="alert">
          {message}
        </p>
        <button
          onClick={() => window.location.reload()}
          className={cn(
            "mt-4 inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium",
            "text-foreground hover:bg-muted",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "transition-colors duration-150",
          )}
        >
          Retry
        </button>
      </div>
    </div>
  );
}

// ── Inner shell (consumes context) ──────────────────────────────────────────

function AppShellInner({ children }: { children: React.ReactNode }) {
  const { meResponse, currentWorkspace, loadingState, error } = useAppContext();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { open: paletteOpen, setOpen: setPaletteOpen } = useCommandPalette();
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [standupOpen, setStandupOpen] = useState(false);

  // Still bootstrapping — show skeleton
  if (loadingState === "loading") {
    return <AppShellSkeleton />;
  }

  // Bootstrap error
  if (loadingState === "error" || error) {
    return <AppShellError message={error ?? "Failed to load."} />;
  }

  // No workspace → send to onboarding
  if (loadingState === "ready" && !currentWorkspace) {
    router.push("/onboarding");
    return <AppShellSkeleton />;
  }

  const user = meResponse?.user ?? null;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* Topbar — sticky, full-width */}
      <Topbar
        onMenuOpen={() => setDrawerOpen(true)}
        workspaceName={currentWorkspace?.name ?? "My Workspace"}
        userName={user?.name ?? null}
        userEmail={user?.email ?? null}
        userAvatarUrl={null}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <AppSidebar />

        {/* Mobile drawer */}
        <AppSidebar
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />

        {/* Main content */}
        <main
          id="main-content"
          className="flex-1 overflow-auto"
          tabIndex={-1}
        >
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>

      {/* Global command palette */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onCreateTask={() => setCreateTaskOpen(true)}
        onStandup={() => setStandupOpen(true)}
      />

      {/* Global create task modal (opened from command palette) */}
      {currentWorkspace && (
        <CreateTaskModal
          open={createTaskOpen}
          onClose={() => setCreateTaskOpen(false)}
          workspaceId={currentWorkspace.id}
          onCreated={(_task: Task) => {
            setCreateTaskOpen(false);
          }}
        />
      )}

      {/* Global standup modal (opened from command palette) */}
      {currentWorkspace && (
        <StandupModal
          open={standupOpen}
          onClose={() => setStandupOpen(false)}
          workspaceId={currentWorkspace.id}
          userId={user?.id}
        />
      )}
    </div>
  );
}

// ── Exported layout ─────────────────────────────────────────────────────────

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <AppShellInner>{children}</AppShellInner>
    </AppProvider>
  );
}
